/**
 * Bootstrap idempotente de la base de datos POS en Appwrite.
 *
 * Crea la database `APPWRITE_DATABASE_ID`, sus colecciones, atributos,
 * indices y el bucket de imagenes segun el esquema del proyecto. El script se puede ejecutar varias
 * veces: si un recurso ya existe, lo salta sin duplicarlo.
 *
 * Uso:
 *   1. Copia `.env.example` a `.env`.
 *   2. Completa `APPWRITE_API_KEY` con una API key server-side.
 *   3. Ejecuta `npm run setup:db`.
 *
 * Variables requeridas:
 *   APPWRITE_ENDPOINT
 *   APPWRITE_PROJECT_ID
 *   APPWRITE_API_KEY
 *   APPWRITE_DATABASE_ID
 */

import dotenv from "dotenv";
import { getAuditCollectionSchema } from "../src/lib/pos/audit-schema.js";
import {
  AppwriteException,
  Client,
  Databases,
  IndexType,
  Storage,
} from "node-appwrite";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const REQUIRED_ENV = [
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
  "APPWRITE_DATABASE_ID",
];

const ATTRIBUTE_TIMEOUT_MS = 60_000;
const ATTRIBUTE_POLL_MS = 1_500;
const OPERATION_DELAY_MS = 250;
const STORAGE_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_STORAGE_BUCKET ||
  process.env.APPWRITE_STORAGE_BUCKET ||
  "pos_images";
const STORAGE_LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024;
const STORAGE_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
const PRIVATE_COLLECTION_IDS = new Set([
  "branches",
  "categories",
  "user_profiles",
  "branch_payment_methods",
  "branch_payment_credentials",
  "products",
  "stock",
  "stock_movements",
  "inventory_grants",
  "institute_api_settings",
  "sales",
  "sale_items",
  process.env.COL_PAYMENT_LINKS || "payment_links",
  process.env.COL_AUDIT_EVENTS || "audit_events",
  process.env.COL_POS_UI_SETTINGS || "pos_ui_settings",
]);

const stats = {
  created: 0,
  updated: 0,
  skipped: 0,
  errors: 0,
};

function requireEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `Faltan variables requeridas: ${missing.join(", ")}. Revisa .env.`,
    );
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logCreated(label) {
  stats.created += 1;
  console.log(`[create] ${label}`);
}

function logSkipped(label) {
  stats.skipped += 1;
  console.log(`[skip] ${label} ya existe`);
}

function logUpdated(label) {
  stats.updated += 1;
  console.log(`[update] ${label}`);
}

function logWarning(label, message) {
  stats.skipped += 1;
  console.log(`[skip] ${label} omitido: ${message}`);
}

function logError(label, error) {
  stats.errors += 1;
  const code = error?.code ? ` (${error.code})` : "";
  const message = error?.message || String(error);
  console.error(`[error] ${label}${code}: ${message}`);
}

function isNotFound(error) {
  return error instanceof AppwriteException && error.code === 404;
}

function isConflict(error) {
  return error instanceof AppwriteException && error.code === 409;
}

function requiredDefaultNote(attribute) {
  return (
    attribute.required &&
    Object.prototype.hasOwnProperty.call(attribute, "default")
  );
}

function collectionPermissions() {
  return [];
}

function normalizeIndexType(type) {
  if (type === "unique") return IndexType.Unique;
  if (type === "fulltext") return IndexType.Fulltext;
  return IndexType.Key;
}

const collections = [
  getAuditCollectionSchema(process.env.COL_AUDIT_EVENTS || "audit_events"),
  {
    id: "branches",
    name: "Branches",
    attributes: [
      { type: "string", key: "name", size: 120, required: true },
      { type: "string", key: "code", size: 10, required: true },
      { type: "string", key: "address", size: 250, required: false },
      { type: "string", key: "city", size: 80, required: true },
      { type: "string", key: "phone", size: 20, required: false },
      { type: "boolean", key: "isActive", required: true, default: true },
    ],
    indexes: [
      { key: "idx_code", type: "unique", attributes: ["code"] },
      { key: "idx_isActive", type: "key", attributes: ["isActive"] },
    ],
  },
  {
    id: "categories",
    name: "Categories",
    attributes: [
      { type: "string", key: "name", size: 80, required: true },
      { type: "string", key: "color", size: 7, required: false },
      { type: "string", key: "icon", size: 40, required: false },
      { type: "boolean", key: "isActive", required: true, default: true },
    ],
    indexes: [
      { key: "idx_name", type: "key", attributes: ["name"] },
      { key: "idx_isActive", type: "key", attributes: ["isActive"] },
    ],
  },
  {
    id: "user_profiles",
    name: "User Profiles",
    attributes: [
      { type: "string", key: "userId", size: 36, required: true },
      { type: "string", key: "name", size: 120, required: true },
      { type: "string", key: "email", size: 200, required: true },
      {
        type: "enum",
        key: "role",
        elements: ["admin", "cashier"],
        required: true,
        default: "cashier",
      },
      { type: "string", key: "branchId", size: 36, required: true },
      {
        type: "string",
        key: "allowedBranchIds",
        size: 36,
        required: true,
        array: true,
      },
      { type: "boolean", key: "isActive", required: true, default: true },
      {
        type: "boolean",
        key: "canCreateProducts",
        required: false,
        default: false,
      },
      { type: "string", key: "createdByUserId", size: 36, required: true },
      { type: "datetime", key: "lastLoginAt", required: false },
    ],
    indexes: [
      { key: "idx_userId", type: "unique", attributes: ["userId"] },
      { key: "idx_branchId", type: "key", attributes: ["branchId"] },
      { key: "idx_role", type: "key", attributes: ["role"] },
      { key: "idx_isActive", type: "key", attributes: ["isActive"] },
    ],
  },
  {
    id: "branch_payment_methods",
    name: "Branch Payment Methods",
    attributes: [
      { type: "string", key: "branchId", size: 36, required: true },
      {
        type: "enum",
        key: "type",
        elements: ["cash", "qr", "card"],
        required: true,
      },
      { type: "boolean", key: "isEnabled", required: true, default: true },
      { type: "string", key: "label", size: 80, required: true },
      { type: "string", key: "config", size: 5000, required: false },
      { type: "integer", key: "sortOrder", required: true, default: 0 },
    ],
    indexes: [
      { key: "idx_branchId", type: "key", attributes: ["branchId"] },
      {
        key: "idx_branch_type",
        type: "key",
        attributes: ["branchId", "type"],
      },
      { key: "idx_isEnabled", type: "key", attributes: ["isEnabled"] },
    ],
  },
  {
    id: "branch_payment_credentials",
    name: "Branch Payment Credentials",
    attributes: [
      { type: "string", key: "branchId", size: 36, required: true },
      { type: "string", key: "methodId", size: 36, required: true },
      {
        type: "enum",
        key: "provider",
        elements: ["baneco"],
        required: true,
      },
      { type: "string", key: "encryptedPayload", size: 10000, required: true },
      { type: "string", key: "apiUsernameMasked", size: 120, required: false },
      { type: "string", key: "accountCreditMasked", size: 80, required: false },
      { type: "string", key: "updatedByUserId", size: 36, required: true },
      { type: "boolean", key: "isActive", required: true, default: true },
      {
        type: "enum",
        key: "connectionStatus",
        elements: ["unchecked", "online", "failed"],
        required: false,
      },
      { type: "datetime", key: "connectionCheckedAt", required: false },
      { type: "string", key: "connectionMessage", size: 300, required: false },
      { type: "datetime", key: "lastRotatedAt", required: false },
    ],
    indexes: [
      { key: "idx_methodId", type: "unique", attributes: ["methodId"] },
      { key: "idx_branchId", type: "key", attributes: ["branchId"] },
      {
        key: "idx_branch_provider",
        type: "key",
        attributes: ["branchId", "provider"],
      },
      { key: "idx_isActive", type: "key", attributes: ["isActive"] },
    ],
  },
  {
    id: "institute_api_settings",
    name: "Institute API Settings",
    attributes: [
      { type: "string", key: "baseUrl", size: 512, required: true },
      { type: "string", key: "encryptedPayload", size: 10000, required: true },
      { type: "string", key: "tokenPrefix", size: 32, required: false },
      { type: "boolean", key: "isEnabled", required: true, default: true },
      { type: "string", key: "updatedByUserId", size: 36, required: true },
    ],
    indexes: [],
  },
  {
    id: "products",
    name: "Products",
    attributes: [
      { type: "string", key: "name", size: 200, required: true },
      { type: "string", key: "description", size: 500, required: false },
      { type: "string", key: "sku", size: 50, required: true },
      { type: "string", key: "barcode", size: 50, required: false },
      { type: "string", key: "categoryId", size: 36, required: false },
      { type: "float", key: "price", required: true },
      { type: "float", key: "cost", required: false },
      {
        type: "enum",
        key: "unit",
        elements: ["unit", "kg", "liter", "meter"],
        required: true,
        default: "unit",
      },
      { type: "string", key: "imageFileId", size: 36, required: false },
      { type: "boolean", key: "isActive", required: true, default: true },
    ],
    indexes: [
      { key: "idx_sku", type: "unique", attributes: ["sku"] },
      { key: "idx_barcode", type: "key", attributes: ["barcode"] },
      { key: "idx_categoryId", type: "key", attributes: ["categoryId"] },
      { key: "idx_isActive", type: "key", attributes: ["isActive"] },
      { key: "idx_name_fulltext", type: "fulltext", attributes: ["name"] },
    ],
  },
  {
    id: "stock",
    name: "Stock",
    attributes: [
      { type: "string", key: "productId", size: 36, required: true },
      { type: "string", key: "branchId", size: 36, required: true },
      { type: "float", key: "quantity", required: true, default: 0 },
      { type: "float", key: "minStock", required: true, default: 0 },
      { type: "float", key: "maxStock", required: false },
    ],
    indexes: [
      {
        key: "idx_product_branch",
        type: "unique",
        attributes: ["productId", "branchId"],
      },
      { key: "idx_branchId", type: "key", attributes: ["branchId"] },
      { key: "idx_quantity", type: "key", attributes: ["quantity"] },
    ],
  },
  {
    id: "stock_movements",
    name: "Stock Movements",
    attributes: [
      { type: "string", key: "productId", size: 36, required: true },
      { type: "string", key: "branchId", size: 36, required: true },
      {
        type: "enum",
        key: "type",
        elements: ["in", "out", "adjustment", "transfer"],
        required: true,
      },
      { type: "float", key: "quantity", required: true },
      { type: "float", key: "previousQty", required: true },
      { type: "float", key: "newQty", required: true },
      { type: "string", key: "reason", size: 200, required: false },
      { type: "string", key: "saleId", size: 36, required: false },
      { type: "string", key: "userId", size: 36, required: true },
      { type: "string", key: "profileId", size: 36, required: false },
      { type: "string", key: "grantId", size: 36, required: false },
    ],
    indexes: [
      { key: "idx_productId", type: "key", attributes: ["productId"] },
      { key: "idx_branchId", type: "key", attributes: ["branchId"] },
      { key: "idx_saleId", type: "key", attributes: ["saleId"] },
      { key: "idx_userId", type: "key", attributes: ["userId"] },
      { key: "idx_grantId", type: "key", attributes: ["grantId"] },
      {
        key: "idx_createdAt",
        type: "key",
        attributes: ["$createdAt"],
        orders: ["DESC"],
      },
    ],
  },
  {
    id: "inventory_grants",
    name: "Inventory Grants",
    attributes: [
      { type: "string", key: "profileId", size: 36, required: true },
      { type: "string", key: "userId", size: 36, required: true },
      {
        type: "enum",
        key: "permission",
        elements: ["stock_increase"],
        required: true,
        default: "stock_increase",
      },
      {
        type: "string",
        key: "branchIds",
        size: 36,
        required: true,
        array: true,
      },
      { type: "boolean", key: "isActive", required: true, default: true },
      { type: "string", key: "grantedByUserId", size: 36, required: true },
      { type: "string", key: "revokedByUserId", size: 36, required: false },
      { type: "datetime", key: "revokedAt", required: false },
      { type: "datetime", key: "expiresAt", required: false },
      { type: "string", key: "reason", size: 200, required: false },
    ],
    indexes: [
      { key: "idx_profileId", type: "key", attributes: ["profileId"] },
      { key: "idx_userId", type: "key", attributes: ["userId"] },
      { key: "idx_permission", type: "key", attributes: ["permission"] },
      { key: "idx_isActive", type: "key", attributes: ["isActive"] },
      {
        key: "idx_createdAt",
        type: "key",
        attributes: ["$createdAt"],
        orders: ["DESC"],
      },
    ],
  },
  {
    id: "sales",
    name: "Sales",
    attributes: [
      { type: "string", key: "saleNumber", size: 30, required: true },
      { type: "string", key: "branchId", size: 36, required: true },
      { type: "string", key: "branchName", size: 120, required: true },
      { type: "string", key: "cashierId", size: 36, required: true },
      { type: "string", key: "cashierName", size: 120, required: true },
      {
        type: "enum",
        key: "status",
        elements: ["completed", "cancelled", "refunded"],
        required: true,
        default: "completed",
      },
      { type: "float", key: "subtotal", required: true },
      { type: "float", key: "discount", required: true, default: 0 },
      { type: "float", key: "total", required: true },
      { type: "string", key: "paymentMethodId", size: 36, required: true },
      {
        type: "enum",
        key: "paymentMethodType",
        elements: ["cash", "qr", "card"],
        required: true,
      },
      { type: "string", key: "paymentMethodLabel", size: 80, required: true },
      { type: "float", key: "amountPaid", required: true },
      { type: "float", key: "change", required: true, default: 0 },
      { type: "string", key: "senderName", size: 160, required: false },
      { type: "string", key: "paymentLinkId", size: 36, required: false },
      { type: "string", key: "notes", size: 300, required: false },
      { type: "datetime", key: "completedAt", required: false },
    ],
    indexes: [
      { key: "idx_saleNumber", type: "unique", attributes: ["saleNumber"] },
      {
        key: "idx_paymentLinkId",
        type: "unique",
        attributes: ["paymentLinkId"],
      },
      { key: "idx_branchId", type: "key", attributes: ["branchId"] },
      { key: "idx_cashierId", type: "key", attributes: ["cashierId"] },
      { key: "idx_status", type: "key", attributes: ["status"] },
      {
        key: "idx_completedAt",
        type: "key",
        attributes: ["completedAt"],
        orders: ["DESC"],
      },
      {
        key: "idx_paymentType",
        type: "key",
        attributes: ["paymentMethodType"],
      },
    ],
  },
  {
    id: "sale_items",
    name: "Sale Items",
    attributes: [
      { type: "string", key: "saleId", size: 36, required: true },
      { type: "string", key: "productId", size: 36, required: true },
      { type: "string", key: "productName", size: 200, required: true },
      { type: "string", key: "productSku", size: 50, required: true },
      { type: "float", key: "quantity", required: true },
      { type: "float", key: "unitPrice", required: true },
      { type: "float", key: "discount", required: true, default: 0 },
      { type: "float", key: "subtotal", required: true },
    ],
    indexes: [
      { key: "idx_saleId", type: "key", attributes: ["saleId"] },
      { key: "idx_productId", type: "key", attributes: ["productId"] },
    ],
  },
  {
    id: process.env.COL_POS_UI_SETTINGS || "pos_ui_settings",
    name: "POS UI Settings",
    attributes: [
      { type: "string", key: "branchId", size: 36, required: false },
      { type: "boolean", key: "products", required: true },
      { type: "boolean", key: "monthly", required: true },
      { type: "boolean", key: "custom", required: true },
      { type: "boolean", key: "links", required: true },
      { type: "boolean", key: "daily", required: true },
      {
        type: "string",
        key: "updatedByUserId",
        size: 36,
        required: false,
      },
    ],
    indexes: [
      { key: "idx_branchId", type: "unique", attributes: ["branchId"] },
    ],
  },
  {
    id: process.env.COL_PAYMENT_LINKS || "payment_links",
    name: "Payment Links",
    attributes: [
      { type: "string", key: "tokenHash", size: 64, required: true },
      { type: "string", key: "encryptedToken", size: 1000, required: true },
      { type: "string", key: "createdByUserId", size: 36, required: true },
      { type: "string", key: "createdByName", size: 120, required: true },
      { type: "string", key: "createdByEmail", size: 200, required: false },
      { type: "string", key: "createdByProfileId", size: 36, required: false },
      {
        type: "enum",
        key: "createdByRole",
        elements: ["admin", "cashier"],
        required: true,
      },
      { type: "string", key: "branchId", size: 36, required: true },
      { type: "string", key: "branchName", size: 120, required: true },
      { type: "string", key: "paymentMethodId", size: 36, required: true },
      { type: "string", key: "paymentMethodLabel", size: 80, required: true },
      {
        type: "enum",
        key: "status",
        elements: [
          "open",
          "qr_pending",
          "processing",
          "payment_received",
          "paid",
          "expired",
          "cancelled",
          "failed",
        ],
        required: true,
      },
      { type: "string", key: "items", size: 30000, required: true },
      { type: "integer", key: "itemCount", required: true },
      { type: "float", key: "total", required: true },
      { type: "datetime", key: "expiresAt", required: true },
      { type: "string", key: "qrId", size: 100, required: false },
      { type: "string", key: "qrImage", size: 50000, required: false },
      { type: "string", key: "qrPaymentToken", size: 5000, required: false },
      { type: "string", key: "transactionId", size: 50, required: false },
      { type: "string", key: "senderName", size: 160, required: false },
      { type: "string", key: "saleId", size: 36, required: false },
      { type: "string", key: "saleNumber", size: 30, required: false },
      { type: "datetime", key: "paidAt", required: false },
      { type: "string", key: "lastError", size: 500, required: false },
    ],
    indexes: [
      { key: "idx_tokenHash", type: "unique", attributes: ["tokenHash"] },
      {
        key: "idx_createdByUserId",
        type: "key",
        attributes: ["createdByUserId"],
      },
      { key: "idx_branchId", type: "key", attributes: ["branchId"] },
      { key: "idx_status", type: "key", attributes: ["status"] },
      { key: "idx_expiresAt", type: "key", attributes: ["expiresAt"] },
    ],
  },
];

function getClient() {
  return new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
}

function getAttributePayload(databaseId, collectionId, attribute) {
  const base = {
    databaseId,
    collectionId,
    key: attribute.key,
    required: attribute.required,
    array: attribute.array,
  };

  // NOTA: node-appwrite@18 indica que `xdefault` no puede setearse cuando
  // `required` es true. En esos casos se omite el default y la app/functions
  // deben enviar el valor explicitamente al crear documentos.
  if (
    !attribute.required &&
    Object.prototype.hasOwnProperty.call(attribute, "default")
  ) {
    base.xdefault = attribute.default;
  }

  if (attribute.type === "string") {
    return { ...base, size: attribute.size, encrypt: attribute.encrypt };
  }

  if (attribute.type === "enum") {
    return { ...base, elements: attribute.elements };
  }

  return base;
}

async function ensureDatabase(databases, databaseId) {
  try {
    await databases.get({ databaseId });
    logSkipped(`database ${databaseId}`);
  } catch (error) {
    if (!isNotFound(error)) {
      logError(`database ${databaseId}`, error);
      throw error;
    }

    try {
      await databases.create({
        databaseId,
        name: "POS Database",
        enabled: true,
      });
      logCreated(`database ${databaseId}`);
      await sleep(OPERATION_DELAY_MS);
    } catch (createError) {
      if (isConflict(createError)) {
        logSkipped(`database ${databaseId}`);
        return;
      }

      logError(`database ${databaseId}`, createError);
      throw createError;
    }
  }
}

async function ensureStorageBucket(storage, bucketId) {
  try {
    const bucket = await storage.getBucket({ bucketId });
    await storage.updateBucket({
      bucketId,
      name: bucket.name,
      permissions: [],
      fileSecurity: true,
      enabled: bucket.enabled !== false,
      maximumFileSize: bucket.maximumFileSize,
      allowedFileExtensions: bucket.allowedFileExtensions,
      compression: bucket.compression,
      encryption: bucket.encryption,
      antivirus: bucket.antivirus,
    });
    logSkipped(`bucket ${bucketId}`);
    return;
  } catch (error) {
    if (!isNotFound(error)) {
      logError(`bucket ${bucketId}`, error);
      throw error;
    }
  }

  try {
    await storage.createBucket({
      bucketId,
      name: "POS Images",
      permissions: [],
      fileSecurity: true,
      enabled: true,
      maximumFileSize: STORAGE_LOGO_MAX_SIZE_BYTES,
      allowedFileExtensions: STORAGE_IMAGE_EXTENSIONS,
      encryption: true,
      antivirus: true,
    });
    logCreated(`bucket ${bucketId}`);
    await sleep(OPERATION_DELAY_MS);
  } catch (error) {
    if (isConflict(error)) {
      logSkipped(`bucket ${bucketId}`);
      return;
    }

    logError(`bucket ${bucketId}`, error);
    throw error;
  }
}

async function ensureCollection(databases, databaseId, collection) {
  try {
    const existing = await databases.getCollection({
      databaseId,
      collectionId: collection.id,
    });
    await ensureCollectionSettings(databases, databaseId, collection, existing);
    logSkipped(`collection ${collection.id}`);
  } catch (error) {
    if (!isNotFound(error)) {
      logError(`collection ${collection.id}`, error);
      throw error;
    }

    try {
      await databases.createCollection({
        databaseId,
        collectionId: collection.id,
        name: collection.name,
        permissions: collectionPermissions(collection.id),
        documentSecurity: true,
        enabled: true,
      });
      logCreated(`collection ${collection.id}`);
      await sleep(OPERATION_DELAY_MS);
    } catch (createError) {
      if (isConflict(createError)) {
        logSkipped(`collection ${collection.id}`);
        return;
      }

      logError(`collection ${collection.id}`, createError);
      throw createError;
    }
  }
}

async function ensureCollectionSettings(
  databases,
  databaseId,
  collection,
  existing,
) {
  if (!PRIVATE_COLLECTION_IDS.has(collection.id)) {
    return;
  }

  const hasPublicPermissions = (existing.$permissions || []).length > 0;

  if (existing.documentSecurity === true && !hasPublicPermissions) {
    return;
  }

  await databases.updateCollection({
    databaseId,
    collectionId: collection.id,
    name: collection.name,
    permissions: collectionPermissions(collection.id),
    documentSecurity: true,
    enabled: existing.enabled !== false,
  });
  logUpdated(`collection ${collection.id} security`);
}

async function ensureAttribute(databases, databaseId, collectionId, attribute) {
  const label = `attribute ${collectionId}.${attribute.key}`;

  try {
    await databases.getAttribute({
      databaseId,
      collectionId,
      key: attribute.key,
    });
    logSkipped(label);
    return;
  } catch (error) {
    if (!isNotFound(error)) {
      logError(label, error);
      throw error;
    }
  }

  if (requiredDefaultNote(attribute)) {
    console.log(
      `  // NOTA: ${label} es required; se omite default=${JSON.stringify(
        attribute.default,
      )} por restriccion del SDK v18.`,
    );
  }

  const payload = getAttributePayload(databaseId, collectionId, attribute);

  try {
    if (attribute.type === "string") {
      await databases.createStringAttribute(payload);
    } else if (attribute.type === "enum") {
      await databases.createEnumAttribute(payload);
    } else if (attribute.type === "boolean") {
      await databases.createBooleanAttribute(payload);
    } else if (attribute.type === "float") {
      await databases.createFloatAttribute(payload);
    } else if (attribute.type === "integer") {
      await databases.createIntegerAttribute(payload);
    } else if (attribute.type === "datetime") {
      await databases.createDatetimeAttribute(payload);
    } else {
      throw new Error(`Tipo de atributo no soportado: ${attribute.type}`);
    }

    logCreated(label);
    await sleep(OPERATION_DELAY_MS);
  } catch (error) {
    if (isConflict(error)) {
      logSkipped(label);
      return;
    }

    logError(label, error);
    throw error;
  }
}

async function waitForAttributesAvailable(
  databases,
  databaseId,
  collectionId,
  attributeKeys,
) {
  const keysToWait = attributeKeys.filter((key) => !key.startsWith("$"));
  const deadline = Date.now() + ATTRIBUTE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const result = await databases.listAttributes({
      databaseId,
      collectionId,
    });

    const statusByKey = new Map(
      result.attributes.map((attribute) => [attribute.key, attribute.status]),
    );

    const pending = keysToWait.filter(
      (key) => statusByKey.get(key) !== "available",
    );
    const failed = keysToWait.filter(
      (key) => statusByKey.get(key) === "failed",
    );

    if (failed.length > 0) {
      throw new Error(
        `Atributos fallaron en ${collectionId}: ${failed.join(", ")}`,
      );
    }

    if (pending.length === 0) {
      console.log(`[ready] attributes ${collectionId}`);
      return;
    }

    console.log(
      `... [wait] ${collectionId}: esperando atributos ${pending.join(", ")}`,
    );
    await sleep(ATTRIBUTE_POLL_MS);
  }

  throw new Error(
    `Timeout esperando atributos disponibles en ${collectionId}: ${keysToWait.join(
      ", ",
    )}`,
  );
}

async function ensureIndex(databases, databaseId, collectionId, index) {
  const label = `index ${collectionId}.${index.key}`;

  try {
    const existing = await databases.listIndexes({
      databaseId,
      collectionId,
    });

    if (existing.indexes.some((candidate) => candidate.key === index.key)) {
      logSkipped(label);
      return;
    }
  } catch (error) {
    logError(`list indexes ${collectionId}`, error);
    throw error;
  }

  try {
    await databases.createIndex({
      databaseId,
      collectionId,
      key: index.key,
      type: normalizeIndexType(index.type),
      attributes: index.attributes,
      orders:
        index.orders ||
        (index.type === "fulltext"
          ? undefined
          : index.attributes.map(() => "ASC")),
      lengths: index.lengths,
    });

    logCreated(label);
    await sleep(OPERATION_DELAY_MS);
  } catch (error) {
    if (isConflict(error)) {
      logSkipped(label);
      return;
    }

    if (index.attributes.some((attribute) => attribute.startsWith("$"))) {
      // NOTA: Appwrite 1.8 puede rechazar indices sobre atributos de sistema
      // como $createdAt en la API Databases clasica. Si ocurre, se omite.
      logWarning(label, "la API rechazo indexar atributo de sistema");
      return;
    }

    logError(label, error);
    throw error;
  }
}

async function setupCollection(databases, databaseId, collection) {
  console.log(`\n# ${collection.id}`);
  await ensureCollection(databases, databaseId, collection);

  for (const attribute of collection.attributes) {
    await ensureAttribute(databases, databaseId, collection.id, attribute);
  }

  await waitForAttributesAvailable(
    databases,
    databaseId,
    collection.id,
    collection.attributes.map((attribute) => attribute.key),
  );

  for (const index of collection.indexes) {
    await ensureIndex(databases, databaseId, collection.id, index);
  }
}

async function main() {
  requireEnv();

  const only = process.argv
    .find((argument) => argument.startsWith("--only="))
    ?.slice(7);
  const selectedCollections = only
    ? collections.filter((collection) => collection.id === only)
    : collections;
  if (only && selectedCollections.length === 0)
    throw new Error(`Coleccion desconocida: ${only}`);

  const databaseId = process.env.APPWRITE_DATABASE_ID;
  const client = getClient();
  const databases = new Databases(client);
  const storage = new Storage(client);

  console.log("POS Appwrite database setup");
  console.log(`Endpoint: ${process.env.APPWRITE_ENDPOINT}`);
  console.log(`Project: ${process.env.APPWRITE_PROJECT_ID}`);
  console.log(`Database: ${databaseId}`);
  console.log("");
  console.log(
    "// NOTA: node-appwrite@18 mantiene Databases/createCollection/create*Attribute/createIndex, aunque la API esta deprecada desde Appwrite 1.8 a favor de TablesDB.",
  );

  if (!only) {
    await ensureDatabase(databases, databaseId);
    await ensureStorageBucket(storage, STORAGE_BUCKET_ID);
  }

  for (const collection of selectedCollections) {
    await setupCollection(databases, databaseId, collection);
  }

  console.log("\nResumen");
  console.log(`Creados: ${stats.created}`);
  console.log(`Actualizados: ${stats.updated}`);
  console.log(`Saltados: ${stats.skipped}`);
  console.log(`Errores: ${stats.errors}`);

  if (stats.errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  logError("setup", error);
  console.log("\nResumen");
  console.log(`Creados: ${stats.created}`);
  console.log(`Actualizados: ${stats.updated}`);
  console.log(`Saltados: ${stats.skipped}`);
  console.log(`Errores: ${stats.errors}`);
  process.exit(1);
});
