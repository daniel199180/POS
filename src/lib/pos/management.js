import { ID, Permission, Query, Role } from "node-appwrite";
import { createAdminClient } from "../appwrite/admin.js";
import { appwriteConfig } from "../appwrite/config.js";
import { assertCanManageCatalog, canAccessBranch } from "./auth-core.js";

const { databaseId, collections } = appwriteConfig;
const documentPermissions = [Permission.read(Role.users())];
const productUnits = new Set(["unit", "kg", "liter", "meter"]);

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function bool(value, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBranch(document) {
  return {
    id: document.$id,
    name: document.name,
    code: document.code,
    address: document.address || "",
    city: document.city,
    phone: document.phone || "",
    isActive: document.isActive,
  };
}

function toStockByProduct(stocks) {
  return stocks.reduce((index, stock) => {
    const productStock = index[stock.productId] || {};
    productStock[stock.branchId] = {
      id: stock.$id,
      quantity: stock.quantity,
      minStock: stock.minStock,
      maxStock: stock.maxStock,
    };

    return {
      ...index,
      [stock.productId]: productStock,
    };
  }, {});
}

function toProduct(document, stockIndex) {
  return {
    id: document.$id,
    name: document.name,
    description: document.description || "",
    sku: document.sku,
    barcode: document.barcode || "",
    categoryId: document.categoryId || "",
    price: document.price,
    cost: document.cost || 0,
    unit: document.unit,
    imageFileId: document.imageFileId || "",
    isActive: document.isActive,
    stockByBranch: stockIndex[document.$id] || {},
  };
}

function sanitizeBranchInput(input) {
  const name = text(input.name);
  const code = text(input.code).toUpperCase();
  const city = text(input.city);

  if (!name || !code || !city) {
    throw new Error("Nombre, codigo y ciudad son obligatorios.");
  }

  return {
    name,
    code,
    address: text(input.address),
    city,
    phone: text(input.phone),
    isActive: bool(input.isActive, true),
  };
}

function sanitizeProductInput(input) {
  const name = text(input.name);
  const sku = text(input.sku).toUpperCase();
  const price = number(input.price, NaN);
  const unit = productUnits.has(input.unit) ? input.unit : "unit";

  if (!name || !sku || !Number.isFinite(price) || price < 0) {
    throw new Error("Nombre, SKU y precio valido son obligatorios.");
  }

  return {
    product: {
      name,
      description: text(input.description),
      sku,
      barcode: text(input.barcode),
      categoryId: text(input.categoryId),
      price,
      cost: number(input.cost, 0),
      unit,
      imageFileId: text(input.imageFileId),
      isActive: bool(input.isActive, true),
    },
    stockByBranch:
      input.stockByBranch && typeof input.stockByBranch === "object"
        ? input.stockByBranch
        : {},
  };
}

function filterBranchesForContext(branches, context) {
  if (context.isAdmin) {
    return branches;
  }

  return branches.filter(
    (branch) => branch.isActive && canAccessBranch(context, branch.id),
  );
}

function filterProductsForContext(products, context) {
  if (context.isAdmin) {
    return products;
  }

  if (context.canIncreaseInventory) {
    return products.filter((product) => product.isActive);
  }

  return products.filter(
    (product) =>
      product.isActive &&
      context.allowedBranchIds.some(
        (branchId) => (product.stockByBranch[branchId]?.quantity || 0) > 0,
      ),
  );
}

function matchesProductSearch(product, search) {
  const term = text(search).toLowerCase();

  if (!term) {
    return true;
  }

  return `${product.name} ${product.sku} ${product.barcode}`
    .toLowerCase()
    .includes(term);
}

function matchesBranchSearch(branch, search) {
  const term = text(search).toLowerCase();

  if (!term) {
    return true;
  }

  return `${branch.name} ${branch.code} ${branch.city}`
    .toLowerCase()
    .includes(term);
}

async function getExistingStock(databases, productId, branchId) {
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.stock,
    queries: [
      Query.equal("productId", productId),
      Query.equal("branchId", branchId),
      Query.limit(1),
    ],
  });

  return result.documents[0];
}

async function upsertProductStock(databases, productId, stockByBranch) {
  const entries = Object.entries(stockByBranch);

  for (const [branchId, stock] of entries) {
    const data = {
      productId,
      branchId,
      quantity: number(stock.quantity, 0),
      minStock: number(stock.minStock, 0),
    };

    const existing = await getExistingStock(databases, productId, branchId);

    if (existing) {
      await databases.updateDocument({
        databaseId,
        collectionId: collections.stock,
        documentId: existing.$id,
        data,
      });
      continue;
    }

    await databases.createDocument({
      databaseId,
      collectionId: collections.stock,
      documentId: ID.unique(),
      data,
      permissions: documentPermissions,
    });
  }
}

async function createDefaultPaymentMethods(databases, branchId) {
  const defaults = [
    ["cash", "Efectivo", 1],
    ["qr", "QR", 2],
    ["card", "Tarjeta", 3],
  ];

  for (const [type, label, sortOrder] of defaults) {
    await databases.createDocument({
      databaseId,
      collectionId: collections.branchPaymentMethods,
      documentId: ID.unique(),
      data: {
        branchId,
        type,
        isEnabled: true,
        label,
        sortOrder,
      },
      permissions: documentPermissions,
    });
  }
}

export async function listBranches(context, { search = "" } = {}) {
  const { databases } = createAdminClient(context.userAgent);
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.branches,
    queries: [Query.limit(100)],
  });

  return filterBranchesForContext(
    result.documents
      .map(toBranch)
      .filter((branch) => matchesBranchSearch(branch, search))
      .sort((left, right) => left.name.localeCompare(right.name)),
    context,
  );
}

export async function createBranch(context, input) {
  assertCanManageCatalog(context);

  const { databases } = createAdminClient(context.userAgent);
  const branch = await databases.createDocument({
    databaseId,
    collectionId: collections.branches,
    documentId: ID.unique(),
    data: sanitizeBranchInput(input),
    permissions: documentPermissions,
  });

  await createDefaultPaymentMethods(databases, branch.$id);

  return toBranch(branch);
}

export async function updateBranch(context, branchId, input) {
  assertCanManageCatalog(context);

  const { databases } = createAdminClient(context.userAgent);
  const branch = await databases.updateDocument({
    databaseId,
    collectionId: collections.branches,
    documentId: branchId,
    data: sanitizeBranchInput(input),
  });

  return toBranch(branch);
}

export async function deactivateBranch(context, branchId) {
  assertCanManageCatalog(context);

  const { databases } = createAdminClient(context.userAgent);
  const branch = await databases.updateDocument({
    databaseId,
    collectionId: collections.branches,
    documentId: branchId,
    data: { isActive: false },
  });

  return toBranch(branch);
}

export async function listProducts(context, { search = "" } = {}) {
  const { databases } = createAdminClient(context.userAgent);
  const [productsResult, stockResult] = await Promise.all([
    databases.listDocuments({
      databaseId,
      collectionId: collections.products,
      queries: [Query.limit(500)],
    }),
    databases.listDocuments({
      databaseId,
      collectionId: collections.stock,
      queries: [Query.limit(500)],
    }),
  ]);

  const stockIndex = toStockByProduct(stockResult.documents);

  return filterProductsForContext(
    productsResult.documents
      .map((product) => toProduct(product, stockIndex))
      .filter((product) => matchesProductSearch(product, search))
      .sort((left, right) => left.name.localeCompare(right.name)),
    context,
  );
}

export async function createProduct(context, input) {
  assertCanManageCatalog(context);

  const { databases } = createAdminClient(context.userAgent);
  const { product, stockByBranch } = sanitizeProductInput(input);
  const document = await databases.createDocument({
    databaseId,
    collectionId: collections.products,
    documentId: ID.unique(),
    data: product,
    permissions: documentPermissions,
  });

  await upsertProductStock(databases, document.$id, stockByBranch);

  return document.$id;
}

export async function updateProduct(context, productId, input) {
  assertCanManageCatalog(context);

  const { databases } = createAdminClient(context.userAgent);
  const { product, stockByBranch } = sanitizeProductInput(input);
  await databases.updateDocument({
    databaseId,
    collectionId: collections.products,
    documentId: productId,
    data: product,
  });

  await upsertProductStock(databases, productId, stockByBranch);

  return productId;
}

export async function deactivateProduct(context, productId) {
  assertCanManageCatalog(context);

  const { databases } = createAdminClient(context.userAgent);
  await databases.updateDocument({
    databaseId,
    collectionId: collections.products,
    documentId: productId,
    data: { isActive: false },
  });

  return productId;
}
