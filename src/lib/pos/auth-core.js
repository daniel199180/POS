import { ID, Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import {
  createAdminClient,
  createSessionAccount,
  toPublicUser,
} from "../appwrite/admin.js";
import { getActiveInventoryGrant } from "./inventory.js";

const { databaseId, collections } = appwriteConfig;
export const USER_ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  CASHIER: "cashier",
});

export function normalizeUserRole(value) {
  if (value === USER_ROLES.SUPER_ADMIN) return USER_ROLES.SUPER_ADMIN;
  if (value === USER_ROLES.ADMIN) return USER_ROLES.ADMIN;
  return USER_ROLES.CASHIER;
}

export function isAdministratorRole(value) {
  const role = normalizeUserRole(value);
  return role === USER_ROLES.SUPER_ADMIN || role === USER_ROLES.ADMIN;
}

export class UnauthorizedError extends Error {
  constructor(message = "No autorizado.") {
    super(message);
    this.status = 401;
  }
}

export class ForbiddenError extends Error {
  constructor(message = "No tienes permisos para esta accion.") {
    super(message);
    this.status = 403;
  }
}

function normalizeProfile(profile, user) {
  const branchId = profile?.branchId || "";
  const allowedBranchIds = Array.isArray(profile?.allowedBranchIds)
    ? profile.allowedBranchIds
    : [];
  const role = normalizeUserRole(profile?.role);

  return {
    id: profile?.$id || "",
    userId: profile?.userId || user.id,
    name: profile?.name || user.name || user.email,
    email: profile?.email || user.email,
    role,
    branchId,
    allowedBranchIds:
      allowedBranchIds.length > 0
        ? allowedBranchIds
        : branchId
          ? [branchId]
          : [],
    isActive: profile?.isActive !== false,
    canCreateProducts: profile?.canCreateProducts === true,
  };
}

async function getBootstrapBranchId(databases) {
  const branches = await databases.listDocuments({
    databaseId,
    collectionId: collections.branches,
    queries: [Query.equal("isActive", true), Query.limit(1)],
  });

  return branches.documents[0]?.$id || "bootstrap";
}

async function getOrCreateProfile(databases, user) {
  const existing = await databases.listDocuments({
    databaseId,
    collectionId: collections.userProfiles,
    queries: [Query.equal("userId", user.id), Query.limit(1)],
  });

  if (existing.documents[0]) {
    return normalizeProfile(existing.documents[0], user);
  }

  const profileCount = await databases.listDocuments({
    databaseId,
    collectionId: collections.userProfiles,
    queries: [Query.limit(1)],
  });

  if (profileCount.total === 0) {
    const branchId = await getBootstrapBranchId(databases);
    const profile = await databases.createDocument({
      databaseId,
      collectionId: collections.userProfiles,
      documentId: ID.unique(),
      data: {
        userId: user.id,
        name: user.name || user.email,
        email: user.email,
        role: USER_ROLES.SUPER_ADMIN,
        branchId,
        allowedBranchIds: [branchId],
        isActive: true,
        createdByUserId: user.id,
      },
      permissions: [],
    });

    return normalizeProfile(profile, user);
  }

  throw new ForbiddenError(
    "Tu cuenta no tiene un perfil autorizado en el POS.",
  );
}

export async function getCurrentUserContextFromSession({
  sessionSecret,
  userAgent,
}) {
  if (!sessionSecret) {
    throw new UnauthorizedError();
  }

  let accountUser;

  try {
    const account = createSessionAccount(sessionSecret, userAgent);
    accountUser = await account.get();
  } catch {
    throw new UnauthorizedError("Sesion expirada. Vuelve a iniciar sesion.");
  }

  const publicUser = toPublicUser(accountUser);
  const { databases } = createAdminClient(userAgent);
  const profile = await getOrCreateProfile(databases, publicUser);

  if (!profile.isActive) {
    throw new ForbiddenError("Tu usuario esta inactivo.");
  }

  const inventoryGrant =
    profile.role === "cashier"
      ? await getActiveInventoryGrant(databases, publicUser.id)
      : null;
  const inventoryGrantBranchIds = inventoryGrant
    ? inventoryGrant.branchIds.filter((branchId) =>
        profile.allowedBranchIds.includes(branchId),
      )
    : [];
  const isAdmin = isAdministratorRole(profile.role);
  const isSuperAdmin = profile.role === USER_ROLES.SUPER_ADMIN;
  const canIncreaseInventory = isAdmin || inventoryGrantBranchIds.length > 0;
  const canCreateProducts = isAdmin || profile.canCreateProducts;
  const contextProfile = {
    ...profile,
    canIncreaseInventory,
    inventoryGrantBranchIds,
    canCreateProducts,
  };

  return {
    user: publicUser,
    profile: contextProfile,
    userAgent,
    isAdmin,
    isSuperAdmin,
    canViewAnalytics: isSuperAdmin,
    canManageCatalog: isAdmin,
    canManagePayments: isAdmin,
    canManageUsers: isAdmin,
    canIncreaseInventory,
    canCreateProducts,
    inventoryGrant,
    inventoryGrantBranchIds,
    allowedBranchIds: profile.allowedBranchIds,
  };
}

export function assertCanManageCatalog(context) {
  if (!context.canManageCatalog) {
    throw new ForbiddenError();
  }
}

export function assertCanCreateProducts(context) {
  if (!context.canCreateProducts) {
    throw new ForbiddenError("No tienes permisos para crear productos.");
  }
}

export function assertCanManagePayments(context) {
  if (!context.canManagePayments) {
    throw new ForbiddenError("Solo un administrador puede gestionar pagos.");
  }
}

export function assertCanManageUsers(context) {
  if (!context.canManageUsers) {
    throw new ForbiddenError("Solo un administrador puede gestionar usuarios.");
  }
}

export function assertCanViewAnalytics(context) {
  if (!context.canViewAnalytics) {
    throw new ForbiddenError(
      "Solo un super administrador puede consultar las analíticas.",
    );
  }
}

export function canAccessBranch(context, branchId) {
  return context.isAdmin || context.allowedBranchIds.includes(branchId);
}
