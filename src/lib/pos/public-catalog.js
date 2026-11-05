import { Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { readReportDocuments } from "./report-data.js";
import {
  buildPublicCatalogProducts,
  CATALOG_BRANCH_CODES,
  isPublicCatalogImageAllowed,
  paginatePublicCatalogProducts,
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
    whatsappNumber: document.whatsappNumber || "",
  };
}

export async function getPublicCatalog(code, userAgent = "", filters = {}) {
  const normalizedCode = normalizeCode(code);
  const { databases } = createAdminClient(userAgent);
  const branchDocument = await findActiveBranch(databases, normalizedCode);
  if (!branchDocument) throw notFound();
  const branch = toPublicBranch(branchDocument);
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
  const products = await readReportDocuments(databases, collections.products, [
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
  ]);
  const publicProducts = buildPublicCatalogProducts({
    branch,
    products,
    stocks,
    categories,
  });
  return {
    branch,
    ...paginatePublicCatalogProducts(publicProducts, filters),
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

async function findActiveBranch(databases, code) {
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.branches,
    queries: [
      Query.equal("code", code),
      Query.equal("isActive", true),
      Query.limit(1),
    ],
  });
  return result.documents[0] || null;
}

export async function getPublicCatalogImage(code, productId, userAgent = "") {
  const normalizedCode = normalizeCode(code);
  if (!/^[A-Za-z0-9._-]{1,36}$/.test(String(productId || ""))) throw notFound();
  const { databases, storage } = createAdminClient(userAgent);
  const branch = await findActiveBranch(databases, normalizedCode);
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
  if (!isPublicCatalogImageAllowed(branch, product)) throw notFound();
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
