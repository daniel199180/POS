import { AppwriteException, ID, Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { withAudit } from "./audit-writer.js";

const { databaseId, collections } = appwriteConfig;
const documentPermissions = [];
const privateDocumentPermissions = [];
export const STOCK_INCREASE_PERMISSION = "stock_increase";

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundStock(value) {
  return Math.round(number(value, 0) * 100) / 100;
}

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function forbidden(message = "No tienes permisos para subir inventario.") {
  const error = new Error(message);
  error.status = 403;
  return error;
}

function isNotFound(error) {
  return error instanceof AppwriteException && error.code === 404;
}

function normalizeBranchIds(input) {
  return Array.from(
    new Set(
      (Array.isArray(input) ? input : []).map((branchId) => text(branchId)),
    ),
  ).filter(Boolean);
}

export function toInventoryGrant(document) {
  if (!document) {
    return null;
  }

  return {
    id: document.$id,
    profileId: document.profileId || "",
    userId: document.userId || "",
    permission: document.permission || STOCK_INCREASE_PERMISSION,
    branchIds: normalizeBranchIds(document.branchIds),
    isActive: document.isActive !== false,
    grantedByUserId: document.grantedByUserId || "",
    revokedByUserId: document.revokedByUserId || "",
    revokedAt: document.revokedAt || "",
    expiresAt: document.expiresAt || "",
    reason: document.reason || "",
    createdAt: document.$createdAt || "",
    updatedAt: document.$updatedAt || "",
  };
}

export function isInventoryGrantActive(grant, now = new Date()) {
  if (!grant || !grant.isActive || grant.revokedAt) {
    return false;
  }

  if (grant.expiresAt && new Date(grant.expiresAt) <= now) {
    return false;
  }

  return grant.permission === STOCK_INCREASE_PERMISSION;
}

export async function getActiveInventoryGrant(databases, userId) {
  if (!collections.inventoryGrants || !userId) {
    return null;
  }

  try {
    const result = await databases.listDocuments({
      databaseId,
      collectionId: collections.inventoryGrants,
      queries: [
        Query.equal("userId", userId),
        Query.equal("permission", STOCK_INCREASE_PERMISSION),
        Query.equal("isActive", true),
        Query.orderDesc("$createdAt"),
        Query.limit(25),
      ],
    });

    return (
      result.documents
        .map(toInventoryGrant)
        .find((grant) => isInventoryGrantActive(grant)) || null
    );
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }

    throw error;
  }
}

export async function getActiveInventoryGrantMap(databases) {
  if (!collections.inventoryGrants) {
    return new Map();
  }

  try {
    const result = await databases.listDocuments({
      databaseId,
      collectionId: collections.inventoryGrants,
      queries: [
        Query.equal("permission", STOCK_INCREASE_PERMISSION),
        Query.equal("isActive", true),
        Query.orderDesc("$createdAt"),
        Query.limit(500),
      ],
    });
    const byUserId = new Map();

    for (const grant of result.documents.map(toInventoryGrant)) {
      if (isInventoryGrantActive(grant) && !byUserId.has(grant.userId)) {
        byUserId.set(grant.userId, grant);
      }
    }

    return byUserId;
  } catch (error) {
    if (isNotFound(error)) {
      return new Map();
    }

    throw error;
  }
}

export async function createInventoryGrant(
  databases,
  context,
  profile,
  input = {},
) {
  const branchIds = normalizeBranchIds(profile.allowedBranchIds);

  if (profile.role !== "cashier") {
    throw inputError("Solo se puede habilitar inventario a cajeros.");
  }

  if (branchIds.length === 0) {
    throw inputError("El cajero debe tener al menos una sucursal asignada.");
  }

  const existing = await getActiveInventoryGrant(databases, profile.userId);

  if (existing) {
    return syncInventoryGrantBranches(databases, profile);
  }

  const document = await databases.createDocument({
    databaseId,
    collectionId: collections.inventoryGrants,
    documentId: ID.unique(),
    data: {
      profileId: profile.id,
      userId: profile.userId,
      permission: STOCK_INCREASE_PERMISSION,
      branchIds,
      isActive: true,
      grantedByUserId: context.user.id,
      reason: text(input.reason),
    },
    permissions: privateDocumentPermissions,
  });

  return toInventoryGrant(document);
}

export async function syncInventoryGrantBranches(databases, profile) {
  const activeGrant = await getActiveInventoryGrant(databases, profile.userId);

  if (!activeGrant || profile.role !== "cashier") {
    return activeGrant;
  }

  const branchIds = normalizeBranchIds(profile.allowedBranchIds);
  const currentBranchIds = activeGrant.branchIds.join("|");
  const nextBranchIds = branchIds.join("|");

  if (currentBranchIds === nextBranchIds) {
    return activeGrant;
  }

  const document = await databases.updateDocument({
    databaseId,
    collectionId: collections.inventoryGrants,
    documentId: activeGrant.id,
    data: { branchIds },
  });

  return toInventoryGrant(document);
}

export async function revokeInventoryGrants(databases, context, userId) {
  const activeGrant = await getActiveInventoryGrant(databases, userId);

  if (!activeGrant) {
    return null;
  }

  const document = await databases.updateDocument({
    databaseId,
    collectionId: collections.inventoryGrants,
    documentId: activeGrant.id,
    data: {
      isActive: false,
      revokedByUserId: context.user.id,
      revokedAt: new Date().toISOString(),
    },
  });

  return toInventoryGrant(document);
}

function assertCanIncreaseInventory(context, branchId) {
  if (context.isAdmin) {
    return;
  }

  if (!context.canIncreaseInventory) {
    throw forbidden();
  }

  if (!context.allowedBranchIds.includes(branchId)) {
    throw forbidden(
      "Solo puedes subir inventario de tus sucursales asignadas.",
    );
  }

  if (!context.inventoryGrantBranchIds.includes(branchId)) {
    throw forbidden("El permiso de inventario no cubre esta sucursal.");
  }
}

async function getStockDocument(databases, productId, branchId) {
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.stock,
    queries: [
      Query.equal("productId", productId),
      Query.equal("branchId", branchId),
      Query.limit(1),
    ],
  });

  return result.documents[0] || null;
}

export async function increaseProductStock(context, input = {}) {
  const productId = text(input.productId);
  const branchId = text(input.branchId);
  const quantity = roundStock(input.quantity);
  const reason = text(input.reason);

  if (!productId || !branchId) {
    throw inputError("Producto y sucursal son obligatorios.");
  }

  if (quantity <= 0) {
    throw inputError("La cantidad a subir debe ser mayor a cero.");
  }

  assertCanIncreaseInventory(context, branchId);

  const { databases } = createAdminClient(context.userAgent);
  const product = await databases.getDocument({
    databaseId,
    collectionId: collections.products,
    documentId: productId,
  });

  if (product.isActive === false) {
    throw inputError("Solo se puede subir inventario de productos activos.");
  }

  const stock = await getStockDocument(databases, productId, branchId);
  const previousQty = roundStock(stock?.quantity || 0);
  const newQty = roundStock(previousQty + quantity);

  const branch = await databases.getDocument({
    databaseId,
    collectionId: collections.branches,
    documentId: branchId,
  });
  return withAudit(
    databases,
    context,
    {
      entityType: "stock",
      entityId: productId,
      entityName: product.name,
      action: "stock.increase",
      branchId,
      branchName: branch.name,
      before: { quantity: previousQty },
      after: { quantity: newQty, reason: reason || "Subida de inventario" },
    },
    async () => {
      if (stock) {
        await databases.updateDocument({
          databaseId,
          collectionId: collections.stock,
          documentId: stock.$id,
          data: { quantity: newQty },
        });
      } else {
        await databases.createDocument({
          databaseId,
          collectionId: collections.stock,
          documentId: ID.unique(),
          data: {
            productId,
            branchId,
            quantity: newQty,
            minStock: 0,
          },
          permissions: documentPermissions,
        });
      }

      const movement = await databases.createDocument({
        databaseId,
        collectionId: collections.stockMovements,
        documentId: ID.unique(),
        data: {
          productId,
          branchId,
          type: "in",
          quantity,
          previousQty,
          newQty,
          reason: reason || "Subida de inventario",
          userId: context.user.id,
          profileId: context.profile.id,
          grantId: context.inventoryGrant?.id || "",
        },
        permissions: documentPermissions,
      });

      return {
        productId,
        branchId,
        previousQty,
        newQty,
        movementId: movement.$id,
      };
    },
  );
}

function toStockMovement(document, indexes) {
  const product = indexes.products.get(document.productId);
  const branch = indexes.branches.get(document.branchId);
  const user = indexes.users.get(document.userId);

  return {
    id: document.$id,
    productId: document.productId,
    productName: product?.name || "Producto sin nombre",
    productSku: product?.sku || "",
    branchId: document.branchId,
    branchName: branch?.name || "Sucursal sin nombre",
    type: document.type,
    quantity: document.quantity,
    previousQty: document.previousQty,
    newQty: document.newQty,
    reason: document.reason || "",
    saleId: document.saleId || "",
    userId: document.userId,
    userName: user?.name || user?.email || document.userId,
    profileId: document.profileId || "",
    grantId: document.grantId || "",
    createdAt: document.$createdAt,
  };
}

export async function listStockMovements(context) {
  if (!context.isAdmin) {
    throw forbidden("Solo un administrador puede revisar movimientos.");
  }

  const { databases } = createAdminClient(context.userAgent);
  const [movementsResult, productsResult, branchesResult, usersResult] =
    await Promise.all([
      databases.listDocuments({
        databaseId,
        collectionId: collections.stockMovements,
        queries: [Query.orderDesc("$createdAt"), Query.limit(100)],
      }),
      databases.listDocuments({
        databaseId,
        collectionId: collections.products,
        queries: [Query.limit(500)],
      }),
      databases.listDocuments({
        databaseId,
        collectionId: collections.branches,
        queries: [Query.limit(500)],
      }),
      databases.listDocuments({
        databaseId,
        collectionId: collections.userProfiles,
        queries: [Query.limit(500)],
      }),
    ]);

  const indexes = {
    products: new Map(productsResult.documents.map((item) => [item.$id, item])),
    branches: new Map(branchesResult.documents.map((item) => [item.$id, item])),
    users: new Map(usersResult.documents.map((item) => [item.userId, item])),
  };

  return movementsResult.documents.map((movement) =>
    toStockMovement(movement, indexes),
  );
}
