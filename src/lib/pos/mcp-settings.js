import crypto from "node:crypto";
import { ID } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { ForbiddenError } from "./auth-core.js";
import { decryptCredentials, encryptCredentials } from "./payments.js";
import { withAudit } from "./audit-writer.js";

const SETTINGS_DOCUMENT_ID = "global";
const MCP_ENDPOINT_PATH = "/api/mcp";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function assertCanManageMcp(context) {
  if (!context.isSuperAdmin) {
    throw new ForbiddenError(
      "Solo un superadministrador puede configurar el MCP.",
    );
  }
}

function maskToken(value) {
  const token = text(value);
  if (!token) return "";
  return `${token.slice(0, 7)}…${token.slice(-4)}`;
}

async function getStoredSettings(userAgent = "") {
  const { databases } = createAdminClient(userAgent);

  try {
    return await databases.getDocument({
      databaseId: appwriteConfig.databaseId,
      collectionId: appwriteConfig.collections.mcpSettings,
      documentId: SETTINGS_DOCUMENT_ID,
    });
  } catch (error) {
    if (error?.code === 404) return null;
    throw error;
  }
}

function getEnvironmentToken() {
  return text(process.env.AGENT_REPORT_TOKEN);
}

function toPublicSettings(document) {
  const environmentToken = getEnvironmentToken();
  const hasStoredToken = Boolean(document?.encryptedPayload);
  const configured = hasStoredToken || Boolean(environmentToken);

  return {
    endpointPath: MCP_ENDPOINT_PATH,
    configured,
    enabled: document
      ? document.isEnabled !== false
      : Boolean(environmentToken),
    active:
      configured &&
      (document ? document.isEnabled !== false : Boolean(environmentToken)),
    source: hasStoredToken
      ? "manual"
      : environmentToken
        ? "entorno"
        : "sin_configurar",
    tokenPrefix:
      document?.tokenPrefix ||
      (environmentToken ? maskToken(environmentToken) : ""),
    updatedAt: document?.$updatedAt || document?.$createdAt || null,
  };
}

export async function getMcpSettings(context) {
  assertCanManageMcp(context);
  return toPublicSettings(await getStoredSettings(context.userAgent));
}

export async function updateMcpSettings(context, input = {}) {
  assertCanManageMcp(context);

  const current = await getStoredSettings(context.userAgent);
  const rotateToken = input.rotateToken === true;
  const enabled = input.enabled !== false;
  const newToken = rotateToken
    ? crypto.randomBytes(32).toString("base64url")
    : "";
  const encryptedPayload = newToken
    ? encryptCredentials({ token: newToken })
    : current?.encryptedPayload || "";
  const hasEnvironmentToken = Boolean(getEnvironmentToken());

  if (enabled && !encryptedPayload && !hasEnvironmentToken) {
    throw inputError("Genera un token antes de activar el MCP.");
  }

  const data = {
    isEnabled: enabled,
    tokenPrefix: newToken
      ? maskToken(newToken)
      : current?.tokenPrefix ||
        (hasEnvironmentToken ? maskToken(getEnvironmentToken()) : ""),
    updatedByUserId: context.user.id,
  };

  if (encryptedPayload) {
    data.encryptedPayload = encryptedPayload;
  }

  const { databases } = createAdminClient(context.userAgent);
  const document = await withAudit(
    databases,
    context,
    {
      entityType: "mcp_settings",
      entityId: SETTINGS_DOCUMENT_ID,
      entityName: "MCP del POS",
      action: "mcp.settings.update",
      before: current || {},
      after: {
        isEnabled: data.isEnabled,
        tokenPrefix: data.tokenPrefix,
      },
    },
    () =>
      current
        ? databases.updateDocument({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.collections.mcpSettings,
            documentId: SETTINGS_DOCUMENT_ID,
            data,
          })
        : databases.createDocument({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.collections.mcpSettings,
            documentId: ID.custom(SETTINGS_DOCUMENT_ID),
            data,
            permissions: [],
          }),
  );

  return {
    settings: toPublicSettings(document),
    token: newToken,
  };
}

export async function getMcpAccessToken(userAgent = "") {
  const document = await getStoredSettings(userAgent);

  if (document?.isEnabled === false) {
    return "";
  }

  if (document?.encryptedPayload) {
    return text(decryptCredentials(document.encryptedPayload)?.token);
  }

  return getEnvironmentToken();
}
