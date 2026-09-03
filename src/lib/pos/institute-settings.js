import { ID } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { assertCanManagePayments } from "./auth-core.js";
import { decryptCredentials, encryptCredentials } from "./payments.js";

const { databaseId, collections } = appwriteConfig;
const SETTINGS_DOCUMENT_ID = "control_instituto";

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function serviceUnavailable(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function maskToken(value) {
  if (!value) return "";
  return `${value.slice(0, 7)}…${value.slice(-4)}`;
}

function normalizeBaseUrl(value) {
  const raw = text(value);

  if (!raw) {
    throw inputError("Ingresa la URL base de Control Instituto.");
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw inputError("La URL de Control Instituto no es válida.");
  }

  if (url.username || url.password) {
    throw inputError("La URL no debe incluir usuario ni contraseña.");
  }

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw inputError("En producción la URL debe usar HTTPS.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw inputError("La URL debe empezar con http:// o https://.");
  }

  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

async function getStoredSettings(userAgent) {
  const { databases } = createAdminClient(userAgent);

  try {
    return await databases.getDocument({
      databaseId,
      collectionId: collections.instituteApiSettings,
      documentId: SETTINGS_DOCUMENT_ID,
    });
  } catch (error) {
    if (error?.code === 404) return null;
    throw error;
  }
}

function publicSettings(document) {
  if (!document) {
    const baseUrl = text(process.env.INSTITUTE_PAYMENTS_API_BASE_URL);
    const token = text(process.env.INSTITUTE_PAYMENTS_API_TOKEN);
    return {
      baseUrl,
      configured: Boolean(baseUrl && token),
      enabled: Boolean(baseUrl && token),
      source: baseUrl && token ? "entorno" : "sin_configurar",
      tokenPrefix: token ? maskToken(token) : "",
      updatedAt: null,
    };
  }

  return {
    baseUrl: document.baseUrl || "",
    configured: Boolean(document.baseUrl && document.encryptedPayload),
    enabled: document.isEnabled !== false,
    source: "manual",
    tokenPrefix: document.tokenPrefix || "",
    updatedAt: document.$updatedAt || document.$createdAt || null,
  };
}

function readStoredToken(document) {
  const payload = decryptCredentials(document?.encryptedPayload || "");
  return text(payload?.token);
}

export async function getInstituteConnectionSettings(context) {
  assertCanManagePayments(context);
  return publicSettings(await getStoredSettings(context.userAgent));
}

export async function saveInstituteConnectionSettings(context, input = {}) {
  assertCanManagePayments(context);
  const current = await getStoredSettings(context.userAgent);
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const newToken = text(input.token);
  const encryptedPayload = newToken
    ? encryptCredentials({ token: newToken })
    : current?.encryptedPayload || "";

  if (!encryptedPayload) {
    throw inputError("Pega el token generado en Control Instituto.");
  }

  const data = {
    baseUrl,
    encryptedPayload,
    isEnabled: true,
    tokenPrefix: newToken ? maskToken(newToken) : current?.tokenPrefix || "",
    updatedByUserId: context.user.id,
  };
  const { databases } = createAdminClient(context.userAgent);
  const document = current
    ? await databases.updateDocument({
        databaseId,
        collectionId: collections.instituteApiSettings,
        documentId: SETTINGS_DOCUMENT_ID,
        data,
      })
    : await databases.createDocument({
        databaseId,
        collectionId: collections.instituteApiSettings,
        documentId: ID.custom(SETTINGS_DOCUMENT_ID),
        data,
        permissions: [],
      });

  return publicSettings(document);
}

async function getConnectionForRequest(userAgent, input = null) {
  const baseUrl = input?.baseUrl ? normalizeBaseUrl(input.baseUrl) : "";
  const submittedToken = text(input?.token);

  if (baseUrl && submittedToken) return { baseUrl, token: submittedToken };

  const document = await getStoredSettings(userAgent);
  if (document) {
    if (document.isEnabled === false) {
      throw serviceUnavailable(
        "La conexión con Control Instituto está desactivada en el POS.",
      );
    }
    const token = readStoredToken(document);
    if (!document.baseUrl || !token) {
      throw serviceUnavailable(
        "La conexión con Control Instituto no está completa.",
      );
    }
    return { baseUrl: document.baseUrl, token };
  }

  const legacyBaseUrl = text(process.env.INSTITUTE_PAYMENTS_API_BASE_URL);
  const legacyToken = text(process.env.INSTITUTE_PAYMENTS_API_TOKEN);
  if (!legacyBaseUrl || !legacyToken) {
    throw serviceUnavailable(
      "La conexión con Control Instituto no está configurada en este POS.",
    );
  }
  return { baseUrl: normalizeBaseUrl(legacyBaseUrl), token: legacyToken };
}

export async function getInstituteApiRequestConfig(userAgent) {
  return getConnectionForRequest(userAgent);
}

export async function testInstituteConnection(context, input = {}) {
  assertCanManagePayments(context);
  const { baseUrl, token } = await getConnectionForRequest(
    context.userAgent,
    input,
  );
  let response;

  try {
    response = await fetch(`${baseUrl}/api/registro-pagos?ci=conexion-pos`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw serviceUnavailable(
      "No se pudo conectar con Control Instituto. Revisa la URL y que el servidor esté disponible.",
    );
  }

  if (response.status === 200 || response.status === 404) {
    return { ok: true, message: "Conexión verificada con Control Instituto." };
  }

  const body = await response.json().catch(() => ({}));
  throw inputError(
    body.error || "Control Instituto rechazó la conexión. Revisa el token.",
  );
}
