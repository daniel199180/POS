import dotenv from "dotenv";
import { AppwriteException, Client, Databases } from "node-appwrite";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const databaseId = process.env.APPWRITE_DATABASE_ID || "pos_db";
const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

const collections = {
  branches: process.env.NEXT_PUBLIC_COL_BRANCHES || "branches",
  products: process.env.NEXT_PUBLIC_COL_PRODUCTS || "products",
  stock: process.env.NEXT_PUBLIC_COL_STOCK || "stock",
  branchPaymentMethods:
    process.env.NEXT_PUBLIC_COL_BRANCH_PAYMENT_METHODS ||
    "branch_payment_methods",
};

const documentPermissions = [];

const branches = [
  {
    id: "branch_cbb",
    data: {
      name: "Cochabamba",
      code: "CBB",
      address: "Av. America y Pando",
      city: "Cochabamba",
      phone: "70000001",
      isActive: true,
    },
  },
  {
    id: "branch_lpz",
    data: {
      name: "La Paz",
      code: "LPZ",
      address: "Av. Arce y Belisario Salinas",
      city: "La Paz",
      phone: "70000002",
      isActive: true,
    },
  },
  {
    id: "branch_scz",
    data: {
      name: "Santa Cruz",
      code: "SCZ",
      address: "Av. San Martin y 4to Anillo",
      city: "Santa Cruz",
      phone: "70000003",
      isActive: true,
    },
  },
];

const products = [
  {
    id: "p_cafe",
    data: {
      name: "Cafe premium 250g",
      description: "Cafe molido de tueste medio para venta por unidad.",
      sku: "CAF-250",
      barcode: "779000000001",
      price: 28,
      cost: 18,
      unit: "unit",
      isActive: true,
    },
  },
  {
    id: "p_arroz",
    data: {
      name: "Arroz grano largo 1kg",
      description: "Bolsa de arroz seleccionada para abarrotes.",
      sku: "ARR-1KG",
      barcode: "779000000002",
      price: 12.5,
      cost: 8.4,
      unit: "unit",
      isActive: true,
    },
  },
  {
    id: "p_aceite",
    data: {
      name: "Aceite vegetal 900ml",
      description: "Aceite de cocina en botella familiar.",
      sku: "ACE-900",
      barcode: "779000000003",
      price: 17,
      cost: 12,
      unit: "unit",
      isActive: true,
    },
  },
  {
    id: "p_azucar",
    data: {
      name: "Azucar blanca 1kg",
      description: "Azucar refinada empacada para consumo diario.",
      sku: "AZU-1KG",
      barcode: "779000000004",
      price: 9.5,
      cost: 6.1,
      unit: "unit",
      isActive: true,
    },
  },
  {
    id: "p_leche",
    data: {
      name: "Leche entera 1L",
      description: "Leche UHT entera lista para venta directa.",
      sku: "LEC-1L",
      barcode: "779000000005",
      price: 8,
      cost: 5.2,
      unit: "unit",
      isActive: true,
    },
  },
];

const paymentMethods = branches.flatMap((branch) => [
  {
    id: `pm_${branch.data.code.toLowerCase()}_cash`,
    data: {
      branchId: branch.id,
      type: "cash",
      isEnabled: true,
      label: "Efectivo",
      sortOrder: 1,
    },
  },
  {
    id: `pm_${branch.data.code.toLowerCase()}_qr`,
    data: {
      branchId: branch.id,
      type: "qr",
      isEnabled: true,
      label: "QR",
      sortOrder: 2,
    },
  },
  {
    id: `pm_${branch.data.code.toLowerCase()}_card`,
    data: {
      branchId: branch.id,
      type: "card",
      isEnabled: true,
      label: "Tarjeta",
      sortOrder: 3,
    },
  },
]);

const stock = branches.flatMap((branch, branchIndex) =>
  products.map((product, productIndex) => ({
    id: `stk_${branch.data.code.toLowerCase()}_${product.id.replace("p_", "")}`,
    data: {
      productId: product.id,
      branchId: branch.id,
      quantity: 18 + branchIndex * 7 + productIndex * 3,
      minStock: 4,
    },
  })),
);

function requireEnv() {
  const missing = [];

  if (!endpoint) missing.push("APPWRITE_ENDPOINT");
  if (!projectId) missing.push("APPWRITE_PROJECT_ID");
  if (!apiKey) missing.push("APPWRITE_API_KEY");

  if (missing.length > 0) {
    throw new Error(`Faltan variables requeridas: ${missing.join(", ")}`);
  }
}

function getDatabases() {
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

  return new Databases(client);
}

function isMissingScope(error) {
  return error instanceof AppwriteException && error.code === 401;
}

async function upsert(databases, collectionId, document) {
  try {
    await databases.upsertDocument({
      databaseId,
      collectionId,
      documentId: document.id,
      data: document.data,
      permissions: documentPermissions,
    });
    console.log(`[seed] ${collectionId}.${document.id}`);
  } catch (error) {
    if (isMissingScope(error)) {
      throw new Error(
        `${error.message}. La API key necesita documents.read y documents.write para seed de datos.`,
      );
    }

    throw error;
  }
}

async function main() {
  requireEnv();

  const databases = getDatabases();
  const tasks = [
    [collections.branches, branches],
    [collections.products, products],
    [collections.stock, stock],
    [collections.branchPaymentMethods, paymentMethods],
  ];

  console.log("POS demo seed");
  console.log(`Database: ${databaseId}`);

  for (const [collectionId, documents] of tasks) {
    for (const document of documents) {
      await upsert(databases, collectionId, document);
    }
  }

  console.log("Seed terminado");
}

main().catch((error) => {
  console.error(`[seed:error] ${error.message || error}`);
  process.exit(1);
});
