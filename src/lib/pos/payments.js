import crypto from "crypto";
import { ID, Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { assertCanManagePayments, canAccessBranch } from "./auth-core.js";
import { getBanecoPublicConfig, testBanecoCredentials } from "./baneco.js";

const { databaseId, collections } = appwriteConfig;
const paymentTypes = new Set(["cash", "qr", "card"]);
const qrProviders = new Set(["manual", "baneco"]);
const connectionStatuses = new Set(["unchecked", "online", "failed"]);

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function getEncryptionKey() {
  const secret =
    process.env.PAYMENT_CREDENTIALS_SECRET || process.env.APPWRITE_API_KEY;

  if (!secret) {
    throw new Error(
      "PAYMENT_CREDENTIALS_SECRET or APPWRITE_API_KEY is required.",
    );
  }

  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptCredentials(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptCredentials(encryptedPayload) {
  const [version, ivValue, tagValue, encryptedValue] =
    text(encryptedPayload).split(":");

  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Credenciales cifradas invalidas.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}

function maskValue(value, visible = 3) {
  const safeValue = text(value);

  if (!safeValue) {
    return "";
  }

  if (safeValue.length <= visible * 2) {
    return `${safeValue[0] || ""}***${safeValue.at(-1) || ""}`;
  }

  return `${safeValue.slice(0, visible)}***${safeValue.slice(-visible)}`;
}

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

function getDefaultConfig(type) {
  if (type === "qr") {
    return {
      provider: "manual",
      environment: "production",
      currency: "BOB",
      dueDays: 1,
      singleUse: true,
      modifyAmount: false,
      descriptionPrefix: "POS V1",
      requireOnlineConfirmation: false,
    };
  }

  return {};
}

function sanitizeConfig(type, inputConfig) {
  const config = {
    ...getDefaultConfig(type),
    ...parseConfig(inputConfig),
  };

  if (type !== "qr") {
    return {};
  }

  const provider = qrProviders.has(config.provider)
    ? config.provider
    : "manual";

  return {
    provider,
    environment: "production",
    currency: "BOB",
    dueDays: 1,
    singleUse: bool(config.singleUse, true),
    modifyAmount: false,
    descriptionPrefix: text(config.descriptionPrefix, "POS V1").slice(0, 80),
    requireOnlineConfirmation: bool(config.requireOnlineConfirmation, false),
  };
}

function toPaymentMethod(document) {
  const type = paymentTypes.has(document.type) ? document.type : "cash";
  const config = {
    ...getDefaultConfig(type),
    ...sanitizeConfig(type, document.config),
  };

  return {
    id: document.$id,
    branchId: document.branchId,
    type,
    isEnabled: document.isEnabled,
    label: document.label,
    sortOrder: document.sortOrder || 0,
    config,
    credentials: {
      configured: false,
      apiUsernameMasked: "",
      accountCreditMasked: "",
      connectionStatus: "unchecked",
      connectionCheckedAt: "",
      connectionMessage: "",
      lastRotatedAt: "",
    },
  };
}

function toCredentialStatus(document) {
  return {
    id: document.$id,
    methodId: document.methodId,
    branchId: document.branchId,
    provider: document.provider,
    configured: document.isActive !== false,
    apiUsernameMasked: document.apiUsernameMasked || "",
    accountCreditMasked: document.accountCreditMasked || "",
    connectionStatus: connectionStatuses.has(document.connectionStatus)
      ? document.connectionStatus
      : "unchecked",
    connectionCheckedAt: document.connectionCheckedAt || "",
    connectionMessage: document.connectionMessage || "",
    updatedByUserId: document.updatedByUserId || "",
    lastRotatedAt: document.lastRotatedAt || document.$updatedAt,
  };
}

function sanitizePaymentInput(current, input) {
  const label = text(input.label, current.label);
  const isEnabled = bool(input.isEnabled, current.isEnabled);
  const sortOrder = Math.min(
    Math.max(Math.trunc(number(input.sortOrder, current.sortOrder || 0)), 0),
    99,
  );

  if (!label) {
    throw inputError("El nombre del metodo de pago es obligatorio.");
  }

  return {
    label: label.slice(0, 80),
    isEnabled,
    sortOrder,
    config: JSON.stringify(sanitizeConfig(current.type, input.config)),
  };
}

function sanitizeBanecoCredentialsInput(input) {
  const apiUsername = text(input.apiUsername);
  const apiPassword = text(input.apiPassword);
  const aesKey = text(input.aesKey);
  const accountCredit = text(input.accountCredit);

  if (!apiUsername || !apiPassword || !aesKey || !accountCredit) {
    throw inputError(
      "Usuario API, Password API, AES key y cuenta de abono son obligatorios.",
    );
  }

  if (aesKey.length !== 32) {
    throw inputError("El AES key de Baneco debe tener 32 caracteres.");
  }

  return {
    apiUsername,
    apiPassword,
    aesKey,
    accountCredit,
  };
}

async function listCredentialStatuses(databases, methods) {
  if (methods.length === 0) {
    return new Map();
  }

  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.branchPaymentCredentials,
    queries: [
      Query.equal(
        "methodId",
        methods.map((method) => method.id),
      ),
      Query.equal("isActive", true),
      Query.limit(500),
    ],
  });

  return new Map(
    result.documents.map((document) => [
      document.methodId,
      toCredentialStatus(document),
    ]),
  );
}

async function getPaymentMethod(databases, methodId) {
  const document = await databases.getDocument({
    databaseId,
    collectionId: collections.branchPaymentMethods,
    documentId: methodId,
  });

  return toPaymentMethod(document);
}

export async function listPaymentSettings(context, { branchId = "" } = {}) {
  assertCanManagePayments(context);

  const requestedBranchId = text(branchId);

  if (requestedBranchId && !canAccessBranch(context, requestedBranchId)) {
    throw inputError("No tienes acceso a esta sucursal.");
  }

  const { databases } = createAdminClient(context.userAgent);
  const queries = [Query.limit(500)];

  if (requestedBranchId) {
    queries.unshift(Query.equal("branchId", requestedBranchId));
  }

  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.branchPaymentMethods,
    queries,
  });

  const methods = result.documents
    .map(toPaymentMethod)
    .filter(
      (method) => context.isAdmin || canAccessBranch(context, method.branchId),
    )
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const credentialStatuses = await listCredentialStatuses(databases, methods);

  return {
    methods: methods.map((method) => ({
      ...method,
      credentials: credentialStatuses.get(method.id) || method.credentials,
    })),
    baneco: getBanecoPublicConfig(),
  };
}

export async function updatePaymentSetting(context, methodId, input) {
  assertCanManagePayments(context);

  const { databases } = createAdminClient(context.userAgent);
  const current = await getPaymentMethod(databases, methodId);

  if (!canAccessBranch(context, current.branchId)) {
    throw inputError("No tienes acceso a esta sucursal.");
  }

  const method = await databases.updateDocument({
    databaseId,
    collectionId: collections.branchPaymentMethods,
    documentId: methodId,
    data: sanitizePaymentInput(current, input),
  });

  return toPaymentMethod(method);
}

export async function updateBanecoCredentials(context, methodId, input) {
  assertCanManagePayments(context);

  const { databases } = createAdminClient(context.userAgent);
  const method = await getPaymentMethod(databases, methodId);

  if (method.type !== "qr") {
    throw inputError("Las credenciales Baneco solo aplican a metodos QR.");
  }

  if (method.config?.provider !== "baneco") {
    throw inputError("Este metodo QR no usa proveedor Baneco.");
  }

  if (!canAccessBranch(context, method.branchId)) {
    throw inputError("No tienes acceso a esta sucursal.");
  }

  const credentials = sanitizeBanecoCredentialsInput(input);
  const connection = await testBanecoCredentials(credentials, method.config);
  const credentialsForStorage = connection.credentials || credentials;
  const existing = await databases.listDocuments({
    databaseId,
    collectionId: collections.branchPaymentCredentials,
    queries: [Query.equal("methodId", methodId), Query.limit(1)],
  });
  const data = {
    branchId: method.branchId,
    methodId,
    provider: "baneco",
    encryptedPayload: encryptCredentials(credentialsForStorage),
    apiUsernameMasked: maskValue(credentials.apiUsername),
    accountCreditMasked: maskValue(credentials.accountCredit, 4),
    updatedByUserId: context.user.id,
    isActive: true,
    connectionStatus: connection.status,
    connectionCheckedAt: connection.checkedAt,
    connectionMessage: connection.message.slice(0, 300),
    lastRotatedAt: new Date().toISOString(),
  };
  const document = existing.documents[0]
    ? await databases.updateDocument({
        databaseId,
        collectionId: collections.branchPaymentCredentials,
        documentId: existing.documents[0].$id,
        data,
      })
    : await databases.createDocument({
        databaseId,
        collectionId: collections.branchPaymentCredentials,
        documentId: ID.unique(),
        data,
        permissions: [],
      });

  return toCredentialStatus(document);
}

export async function testStoredBanecoCredentials(context, methodId) {
  assertCanManagePayments(context);

  const { databases } = createAdminClient(context.userAgent);
  const method = await getPaymentMethod(databases, methodId);

  if (method.type !== "qr") {
    throw inputError("Las credenciales Baneco solo aplican a metodos QR.");
  }

  if (method.config?.provider !== "baneco") {
    throw inputError("Este metodo QR no usa proveedor Baneco.");
  }

  if (!canAccessBranch(context, method.branchId)) {
    throw inputError("No tienes acceso a esta sucursal.");
  }

  const existing = await databases.listDocuments({
    databaseId,
    collectionId: collections.branchPaymentCredentials,
    queries: [
      Query.equal("methodId", methodId),
      Query.equal("isActive", true),
      Query.limit(1),
    ],
  });
  const current = existing.documents[0];

  if (!current) {
    throw inputError(
      "Primero guarda las credenciales Baneco de esta sucursal.",
    );
  }

  const credentials = decryptCredentials(current.encryptedPayload);
  const connection = await testBanecoCredentials(credentials, method.config);
  const document = await databases.updateDocument({
    databaseId,
    collectionId: collections.branchPaymentCredentials,
    documentId: current.$id,
    data: {
      connectionStatus: connection.status,
      connectionCheckedAt: connection.checkedAt,
      connectionMessage: connection.message.slice(0, 300),
    },
  });

  return toCredentialStatus(document);
}
