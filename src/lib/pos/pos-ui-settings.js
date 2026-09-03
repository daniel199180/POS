import { AppwriteException, ID, Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { canAccessBranch, ForbiddenError } from "./auth-core.js";
import { withAudit } from "./audit-writer.js";

const { databaseId, collections } = appwriteConfig;

export const POS_TAB_KEYS = ["products", "monthly", "custom", "links", "daily"];

export const DEFAULT_POS_TAB_SETTINGS = Object.freeze({
  products: true,
  monthly: true,
  custom: true,
  links: true,
  daily: true,
});

function isNotFound(error) {
  return error instanceof AppwriteException
    ? error.code === 404
    : error?.code === 404;
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function normalizePosTabSettings(value = {}) {
  return Object.fromEntries(
    POS_TAB_KEYS.map((key) => [
      key,
      typeof value?.[key] === "boolean"
        ? value[key]
        : DEFAULT_POS_TAB_SETTINGS[key],
    ]),
  );
}

export function validatePosTabSettings(value = {}) {
  const tabs = normalizePosTabSettings(value);

  if (!POS_TAB_KEYS.some((key) => tabs[key])) {
    throw badRequest("Debes mantener al menos una pestaña del POS activa.");
  }

  return tabs;
}

function toPublicSettings(document) {
  return {
    branchId: document?.branchId || "",
    tabs: normalizePosTabSettings(document),
    updatedAt: document?.$updatedAt || "",
    updatedByUserId: document?.updatedByUserId || "",
  };
}

function assertBranchAccess(context, branchId) {
  if (!context?.user?.id) {
    throw new ForbiddenError();
  }
  if (!branchId) {
    throw badRequest("Selecciona una sucursal.");
  }
  if (!canAccessBranch(context, branchId)) {
    throw new ForbiddenError("No tienes acceso a esta sucursal.");
  }
}

async function readPosTabSettings(databases, branchId) {
  try {
    const document = await databases.getDocument({
      databaseId,
      collectionId: collections.posUiSettings,
      documentId: branchId,
    });
    return toPublicSettings(document);
  } catch (error) {
    if (isNotFound(error)) {
      return {
        ...toPublicSettings(DEFAULT_POS_TAB_SETTINGS),
        branchId,
      };
    }
    throw error;
  }
}

export async function getPosTabSettings(context, branchId) {
  assertBranchAccess(context, branchId);

  const { databases } = createAdminClient(context.userAgent);
  return readPosTabSettings(databases, branchId);
}

export async function assertPosTabEnabled(
  context,
  branchId,
  tabId,
  databasesOverride,
) {
  assertBranchAccess(context, branchId);
  if (!POS_TAB_KEYS.includes(tabId)) {
    throw badRequest("La sección solicitada no es válida.");
  }
  const databases =
    databasesOverride || createAdminClient(context.userAgent).databases;
  const settings = await readPosTabSettings(databases, branchId);

  if (!settings.tabs[tabId]) {
    throw new ForbiddenError(
      "Esta función está desactivada para la sucursal seleccionada.",
    );
  }
}

export async function assertPosSaleTabsEnabled(
  context,
  branchId,
  items,
  databasesOverride,
) {
  assertBranchAccess(context, branchId);
  const requiredTabs = new Set(
    (items || []).map((item) => {
      const productId = String(item.productId || item.id || "");
      if (
        item.category === "monthly" ||
        item.productSku === "MENSUALIDAD" ||
        productId.startsWith("custom-inst-")
      ) {
        return "monthly";
      }
      return item.isCustom === true || productId.startsWith("custom-")
        ? "custom"
        : "products";
    }),
  );
  const databases =
    databasesOverride || createAdminClient(context.userAgent).databases;
  const settings = await readPosTabSettings(databases, branchId);

  for (const tabId of requiredTabs) {
    if (!settings.tabs[tabId]) {
      throw new ForbiddenError(
        "Una función necesaria para este cobro está desactivada en la sucursal.",
      );
    }
  }
}

export async function getPosTabSettingsByBranch(context, branchIds = []) {
  const uniqueBranchIds = [...new Set(branchIds.filter(Boolean))];
  for (const branchId of uniqueBranchIds) {
    assertBranchAccess(context, branchId);
  }

  const { databases } = createAdminClient(context.userAgent);
  const entries = await Promise.all(
    uniqueBranchIds.map(async (branchId) => [
      branchId,
      await readPosTabSettings(databases, branchId),
    ]),
  );
  return Object.fromEntries(entries);
}

export async function listStoredPosTabSettings(context) {
  if (!context?.user?.id) throw new ForbiddenError();
  const allowedBranchIds = context.isAdmin
    ? []
    : context.allowedBranchIds || [];
  if (!context.isAdmin && allowedBranchIds.length === 0) return {};

  const { databases } = createAdminClient(context.userAgent);
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.posUiSettings,
    queries: [
      ...(!context.isAdmin ? [Query.equal("branchId", allowedBranchIds)] : []),
      Query.limit(100),
    ],
  });

  return Object.fromEntries(
    result.documents
      .filter((document) => document.branchId)
      .map((document) => [document.branchId, toPublicSettings(document)]),
  );
}

export async function updatePosTabSettings(context, input) {
  if (!context?.isAdmin) {
    throw new ForbiddenError(
      "Solo un administrador puede configurar las pestañas del POS.",
    );
  }

  const branchId = String(input?.branchId || "").trim();
  assertBranchAccess(context, branchId);
  const tabs = validatePosTabSettings(input?.tabs || input);
  const { databases } = createAdminClient(context.userAgent);
  const branch = await databases.getDocument({
    databaseId,
    collectionId: collections.branches,
    documentId: branchId,
  });
  let existing = null;

  try {
    existing = await databases.getDocument({
      databaseId,
      collectionId: collections.posUiSettings,
      documentId: branchId,
    });
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  const data = { ...tabs, branchId, updatedByUserId: context.user.id };
  const document = await withAudit(
    databases,
    context,
    {
      entityType: "pos_settings",
      entityId: branchId,
      entityName: `Pestañas del POS · ${branch.name}`,
      action: "pos.tabs.update",
      branchId,
      branchName: branch.name,
      before: existing || DEFAULT_POS_TAB_SETTINGS,
      after: tabs,
    },
    async () => {
      if (existing) {
        return databases.updateDocument({
          databaseId,
          collectionId: collections.posUiSettings,
          documentId: branchId,
          data,
        });
      }

      try {
        return await databases.createDocument({
          databaseId,
          collectionId: collections.posUiSettings,
          documentId: ID.custom(branchId),
          data,
          permissions: [],
        });
      } catch (error) {
        if (error?.code !== 409) throw error;
        return databases.updateDocument({
          databaseId,
          collectionId: collections.posUiSettings,
          documentId: branchId,
          data,
        });
      }
    },
  );

  return toPublicSettings(document);
}
