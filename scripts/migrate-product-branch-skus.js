/**
 * Completa la sucursal de origen de productos existentes y prepara las
 * secuencias de SKU sin modificar SKU, stock ni referencias históricas.
 *
 * Ejecutar después de `npm run setup:db`.
 */
import dotenv from "dotenv";
import { Client, Databases, Query } from "node-appwrite";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
};

const databaseId = required("APPWRITE_DATABASE_ID");
const collections = {
  branches: process.env.NEXT_PUBLIC_COL_BRANCHES || "branches",
  products: process.env.NEXT_PUBLIC_COL_PRODUCTS || "products",
  skuSequences: process.env.COL_SKU_SEQUENCES || "sku_sequences",
};
const client = new Client()
  .setEndpoint(required("APPWRITE_ENDPOINT"))
  .setProject(required("APPWRITE_PROJECT_ID"))
  .setKey(required("APPWRITE_API_KEY"));
const databases = new Databases(client);
const prefixByCode = new Map([
  ["CBB", "CB"],
  ["SCZ", "SC"],
  ["LPZ", "LP"],
]);

async function listAll(collectionId) {
  const documents = [];
  let cursor = "";

  do {
    const result = await databases.listDocuments({
      databaseId,
      collectionId,
      queries: [
        Query.orderAsc("$id"),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    documents.push(...result.documents);
    cursor = result.documents.at(-1)?.$id || "";
  } while (cursor);

  return documents;
}

function prefixForSku(sku) {
  const normalized = String(sku || "")
    .trim()
    .toUpperCase();
  if (normalized.startsWith("SC")) return "SC";
  if (normalized.startsWith("CB")) return "CB";
  if (normalized.startsWith("LP")) return "LP";
  return "";
}

function maxNumber(products, prefix) {
  return products.reduce((max, product) => {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(
      String(product.sku || "").toUpperCase(),
    );
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0);
}

const branches = await listAll(collections.branches);
const products = await listAll(collections.products);
const branchByPrefix = new Map(
  branches.flatMap((branch) => {
    const prefix = prefixByCode.get(String(branch.code || "").toUpperCase());
    return prefix ? [[prefix, branch]] : [];
  }),
);

let updatedProducts = 0;
let skippedProducts = 0;
const productUpdates = [];
for (const product of products) {
  const prefix = prefixForSku(product.sku);
  const branch = branchByPrefix.get(prefix);

  if (!branch) {
    skippedProducts += 1;
    console.warn(
      `No se pudo inferir sucursal para ${product.$id} (${product.sku}).`,
    );
    continue;
  }

  if (product.originBranchId === branch.$id) {
    continue;
  }

  productUpdates.push({ product, branch });
}

for (let offset = 0; offset < productUpdates.length; offset += 10) {
  await Promise.all(
    productUpdates.slice(offset, offset + 10).map(({ product, branch }) =>
      databases
        .updateDocument({
          databaseId,
          collectionId: collections.products,
          documentId: product.$id,
          data: { originBranchId: branch.$id },
        })
        .then(() => {
          updatedProducts += 1;
        }),
    ),
  );
  console.log(
    `Productos actualizados: ${updatedProducts}/${productUpdates.length}.`,
  );
}

for (const [prefix, branch] of branchByPrefix) {
  const minimumNextNumber = maxNumber(products, prefix) + 1;
  let sequence;

  try {
    sequence = await databases.getDocument({
      databaseId,
      collectionId: collections.skuSequences,
      documentId: branch.$id,
    });
  } catch (error) {
    if (error?.code !== 404) throw error;
  }

  if (!sequence) {
    await databases.createDocument({
      databaseId,
      collectionId: collections.skuSequences,
      documentId: branch.$id,
      data: {
        branchId: branch.$id,
        prefix,
        nextNumber: minimumNextNumber,
      },
      permissions: [],
    });
    console.log(`Secuencia creada: ${branch.code} -> ${minimumNextNumber}.`);
  } else if (
    sequence.nextNumber < minimumNextNumber ||
    sequence.prefix !== prefix
  ) {
    await databases.updateDocument({
      databaseId,
      collectionId: collections.skuSequences,
      documentId: branch.$id,
      data: {
        branchId: branch.$id,
        prefix,
        nextNumber: Math.max(sequence.nextNumber, minimumNextNumber),
      },
    });
    console.log(`Secuencia actualizada: ${branch.code}.`);
  }
}

console.log(
  JSON.stringify(
    {
      products: products.length,
      updatedProducts,
      skippedProducts,
      sequences: branchByPrefix.size,
    },
    null,
    2,
  ),
);
