import { Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { readReportDocuments } from "./report-data.js";
import {
  buildPublicCatalogProducts,
  CATALOG_BRANCH_CODES,
  isPublicCatalogImageAllowed,
} from "./public-catalog-core.js";

const { databaseId, collections, storageBucket } = appwriteConfig;
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function notFound() {
  const error = new Error("Catálogo no disponible.");
  error.status = 404;
  return error;
}

function normalizeCode(code) {
  const normalized = String(code || "").toUpperCase();
  if (
    !/^[A-Z0-9_-]{1,10}$/.test(normalized) ||
    !CATALOG_BRANCH_CODES.has(normalized)
  )
    throw notFound();
  return normalized;
}

function toPublicBranch(document) {
  return {
    id: document.$id,
    code: document.code,
    name: document.name,
    city: document.city || "",
  };
}

export async function listPublicCatalogBranches(userAgent = "") {
  const { databases } = createAdminClient(userAgent);
  const branches = await readReportDocuments(databases, collections.branches, [
    Query.equal("isActive", true),
    Query.orderAsc("$id"),
    Query.select(["$id", "code", "name", "city"]),
  ]);
  return branches
    .filter((branch) =>
      CATALOG_BRANCH_CODES.has(String(branch.code).toUpperCase()),
    )
    .map(toPublicBranch)
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}

export async function getPublicCatalog(code, userAgent = "") {
  const normalizedCode = normalizeCode(code);
  const branches = await listPublicCatalogBranches(userAgent);
  const branch = branches.find(
    (item) => item.code.toUpperCase() === normalizedCode,
  );
  if (!branch) throw notFound();

  const { databases } = createAdminClient(userAgent);
  const [stocks, categories] = await Promise.all([
    readReportDocuments(databases, collections.stock, [
      Query.equal("branchId", branch.id),
      Query.orderAsc("$id"),
      Query.select(["$id", "productId", "branchId", "quantity"]),
    ]),
    readReportDocuments(databases, collections.categories, [
      Query.equal("isActive", true),
      Query.orderAsc("$id"),
      Query.select(["$id", "name", "isActive"]),
    ]),
  ]);
  const availableIds = [
    ...new Set(
      stocks
        .filter((stock) => Number(stock.quantity) > 0)
        .map((stock) => stock.productId),
    ),
  ];
  const products = [];
  for (let offset = 0; offset < availableIds.length; offset += 100) {
    products.push(
      ...(await readReportDocuments(databases, collections.products, [
        Query.equal("$id", availableIds.slice(offset, offset + 100)),
        Query.equal("isActive", true),
        Query.orderAsc("$id"),
        Query.select([
          "$id",
          "name",
          "description",
          "sku",
          "price",
          "unit",
          "categoryId",
          "imageFileId",
          "isActive",
          "originBranchId",
        ]),
      ])),
    );
  }
  const publicProducts = buildPublicCatalogProducts({
    branch,
    products,
    stocks,
    categories,
  });
  return {
    branch,
    branches,
    products: publicProducts,
    categories: [
      ...new Map(
        publicProducts
          .filter((product) => product.categoryId)
          .map((product) => [
            product.categoryId,
            { id: product.categoryId, name: product.categoryName },
          ]),
      ).values(),
    ].sort((left, right) => left.name.localeCompare(right.name, "es")),
  };
}

export async function getPublicCatalogImage(code, productId, userAgent = "") {
  const normalizedCode = normalizeCode(code);
  if (!/^[A-Za-z0-9._-]{1,36}$/.test(String(productId || ""))) throw notFound();
  const { databases, storage } = createAdminClient(userAgent);
  const branchResult = await databases.listDocuments({
    databaseId,
    collectionId: collections.branches,
    queries: [
      Query.equal("code", normalizedCode),
      Query.equal("isActive", true),
      Query.limit(1),
    ],
  });
  const branch = branchResult.documents[0];
  if (!branch) throw notFound();
  let product;
  try {
    product = await databases.getDocument({
      databaseId,
      collectionId: collections.products,
      documentId: productId,
    });
  } catch (error) {
    if (error?.code === 404) throw notFound();
    throw error;
  }
  const stock = await databases.listDocuments({
    databaseId,
    collectionId: collections.stock,
    queries: [
      Query.equal("productId", productId),
      Query.equal("branchId", branch.$id),
      Query.limit(1),
    ],
  });
  if (!isPublicCatalogImageAllowed(branch, product, stock.documents[0]))
    throw notFound();
  const file = await storage.getFile({
    bucketId: storageBucket,
    fileId: product.imageFileId,
  });
  if (
    !IMAGE_MIME_TYPES.has(file.mimeType) ||
    Number(file.sizeOriginal || 0) > 2 * 1024 * 1024
  )
    throw notFound();
  const data = await storage.getFileView({
    bucketId: storageBucket,
    fileId: product.imageFileId,
  });
  return { data, mimeType: file.mimeType };
}
