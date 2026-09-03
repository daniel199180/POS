import { Query } from "node-appwrite";
import { createAdminClient } from "../appwrite/admin.js";
import { appwriteConfig } from "../appwrite/config.js";
import { ForbiddenError, canAccessBranch } from "./auth-core.js";

const { databaseId, collections } = appwriteConfig;
export const PRODUCT_PAGE_SIZE = 20;

function parseConfig(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function getPaymentConfig(type, value) {
  if (type !== "qr") {
    return {};
  }

  const config = parseConfig(value);

  return {
    provider: config.provider === "baneco" ? "baneco" : "manual",
    currency: "BOB",
    dueDays: 1,
    singleUse: true,
    modifyAmount: false,
  };
}

function toBranch(document) {
  return {
    id: document.$id,
    name: document.name,
    code: document.code,
    city: document.city,
    isActive: document.isActive,
  };
}

function toPaymentMethod(document) {
  return {
    id: document.$id,
    branchId: document.branchId,
    type: document.type,
    label: document.label,
    isEnabled: document.isEnabled,
    sortOrder: document.sortOrder || 0,
    config: getPaymentConfig(document.type, document.config),
  };
}

function toStockByProduct(stocks) {
  return stocks.reduce((index, stock) => {
    const productStock = index[stock.productId] || {};
    productStock[stock.branchId] = {
      id: stock.$id,
      quantity: stock.quantity,
      minStock: stock.minStock,
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
    price: document.price,
    cost: document.cost || 0,
    unit: document.unit,
    imageFileId: document.imageFileId || "",
    isActive: document.isActive,
    stockByBranch: stockIndex[document.$id] || {},
  };
}

function matchesSearch(product, search) {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  return `${product.sku} ${product.name} ${product.barcode}`
    .toLowerCase()
    .includes(term);
}

async function getBranches(databases) {
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.branches,
    queries: [Query.equal("isActive", true), Query.limit(100)],
  });

  return result.documents
    .map(toBranch)
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function getPaymentMethods(databases) {
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.branchPaymentMethods,
    queries: [Query.equal("isEnabled", true), Query.limit(100)],
  });

  return result.documents
    .map(toPaymentMethod)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export async function getProductsPage({
  userAgent,
  context,
  branchId,
  search = "",
  offset = 0,
  limit = PRODUCT_PAGE_SIZE,
}) {
  if (context && !canAccessBranch(context, branchId)) {
    throw new ForbiddenError("No tienes acceso a esta sucursal.");
  }

  const { databases } = createAdminClient(userAgent);

  const [productsResult, stockResult] = await Promise.all([
    databases.listDocuments({
      databaseId,
      collectionId: collections.products,
      queries: [Query.equal("isActive", true), Query.limit(500)],
    }),
    databases.listDocuments({
      databaseId,
      collectionId: collections.stock,
      queries: [Query.equal("branchId", branchId), Query.limit(500)],
    }),
  ]);

  const stockIndex = toStockByProduct(stockResult.documents);
  const products = productsResult.documents
    .map((product) => toProduct(product, stockIndex))
    .filter((product) => {
      const stock = product.stockByBranch[branchId]?.quantity || 0;
      return stock > 0 && matchesSearch(product, search);
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const page = products.slice(offset, offset + limit);
  const nextOffset = offset + page.length;

  return {
    products: page,
    nextOffset,
    hasMore: nextOffset < products.length,
    total: products.length,
  };
}

export async function getPosCatalog(userAgent, context) {
  const { databases } = createAdminClient(userAgent);

  const [allBranches, allPaymentMethods] = await Promise.all([
    getBranches(databases),
    getPaymentMethods(databases),
  ]);
  const branches = context?.isAdmin
    ? allBranches
    : allBranches.filter((branch) => canAccessBranch(context, branch.id));
  const paymentMethods = context?.isAdmin
    ? allPaymentMethods
    : allPaymentMethods.filter((method) =>
        canAccessBranch(context, method.branchId),
      );
  const initialBranchId = branches[0]?.id || "";
  const productsPage = initialBranchId
    ? await getProductsPage({
        userAgent,
        context,
        branchId: initialBranchId,
      })
    : {
        products: [],
        nextOffset: 0,
        hasMore: false,
        total: 0,
      };

  return {
    branches,
    paymentMethods,
    productsPage,
  };
}
