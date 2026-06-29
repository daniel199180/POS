import { ID, Permission, Query, Role } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { assertCanManageUsers } from "./auth-core.js";

const { databaseId, collections } = appwriteConfig;
const documentPermissions = [Permission.read(Role.users())];
const roles = new Set(["admin", "cashier"]);

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeEmail(value) {
  return text(value).toLowerCase();
}

function normalizeBranchIds(input) {
  const rawIds = Array.isArray(input) ? input : [];
  return Array.from(
    new Set(rawIds.map((branchId) => text(branchId)).filter(Boolean)),
  );
}

function toUserProfile(document) {
  const branchId = document.branchId || "";
  const allowedBranchIds = Array.isArray(document.allowedBranchIds)
    ? document.allowedBranchIds
    : [];

  return {
    id: document.$id,
    userId: document.userId,
    name: document.name,
    email: document.email,
    role: document.role === "admin" ? "admin" : "cashier",
    branchId,
    allowedBranchIds:
      allowedBranchIds.length > 0
        ? allowedBranchIds
        : branchId
          ? [branchId]
          : [],
    isActive: document.isActive !== false,
    createdByUserId: document.createdByUserId || "",
    lastLoginAt: document.lastLoginAt || "",
  };
}

function matchesUserSearch(user, search) {
  const term = text(search).toLowerCase();

  if (!term) {
    return true;
  }

  return `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(term);
}

async function getActiveBranchIds(databases) {
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.branches,
    queries: [Query.equal("isActive", true), Query.limit(500)],
  });

  return new Set(result.documents.map((branch) => branch.$id));
}

async function sanitizeUserInput(
  databases,
  input,
  { requirePassword = false } = {},
) {
  const name = text(input.name);
  const email = normalizeEmail(input.email);
  const password = text(input.password);
  const role = roles.has(input.role) ? input.role : "cashier";
  const allowedBranchIds = normalizeBranchIds(
    input.allowedBranchIds || input.branchIds || [input.branchId],
  );
  const isActive = typeof input.isActive === "boolean" ? input.isActive : true;

  if (!name || !email) {
    throw inputError("Nombre y correo son obligatorios.");
  }

  if (!email.includes("@") || email.length > 200) {
    throw inputError("Ingresa un correo valido.");
  }

  if (name.length > 120) {
    throw inputError("El nombre no puede superar 120 caracteres.");
  }

  if (requirePassword && password.length < 8) {
    throw inputError("La contrasena debe tener al menos 8 caracteres.");
  }

  if (password && password.length < 8) {
    throw inputError("La contrasena debe tener al menos 8 caracteres.");
  }

  if (allowedBranchIds.length === 0) {
    throw inputError("Selecciona al menos una sucursal.");
  }

  const activeBranchIds = await getActiveBranchIds(databases);
  const invalidBranchIds = allowedBranchIds.filter(
    (branchId) => !activeBranchIds.has(branchId),
  );

  if (invalidBranchIds.length > 0) {
    throw inputError("Selecciona solo sucursales activas y validas.");
  }

  return {
    account: {
      name,
      email,
      password,
    },
    profile: {
      name,
      email,
      role,
      branchId: allowedBranchIds[0],
      allowedBranchIds,
      isActive,
    },
  };
}

async function getProfileDocument(databases, profileId) {
  return databases.getDocument({
    databaseId,
    collectionId: collections.userProfiles,
    documentId: profileId,
  });
}

async function deleteUserSessions(users, userId) {
  try {
    await users.deleteSessions({ userId });
  } catch {
    // The profile remains the source of truth for app access.
  }
}

export async function listManagedUsers(context, { search = "" } = {}) {
  assertCanManageUsers(context);

  const { databases } = createAdminClient(context.userAgent);
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.userProfiles,
    queries: [Query.limit(500)],
  });

  return result.documents
    .map(toUserProfile)
    .filter((user) => matchesUserSearch(user, search))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function createManagedUser(context, input) {
  assertCanManageUsers(context);

  const { databases, users } = createAdminClient(context.userAgent);
  const { account, profile } = await sanitizeUserInput(databases, input, {
    requirePassword: true,
  });
  const createdUser = await users.create({
    userId: ID.unique(),
    email: account.email,
    password: account.password,
    name: account.name,
  });

  try {
    const document = await databases.createDocument({
      databaseId,
      collectionId: collections.userProfiles,
      documentId: ID.unique(),
      data: {
        userId: createdUser.$id,
        ...profile,
        createdByUserId: context.user.id,
      },
      permissions: documentPermissions,
    });

    return toUserProfile(document);
  } catch (error) {
    try {
      await users.delete({ userId: createdUser.$id });
    } catch {
      // Best effort rollback if profile creation fails.
    }

    throw error;
  }
}

export async function updateManagedUser(context, profileId, input) {
  assertCanManageUsers(context);

  const { databases, users } = createAdminClient(context.userAgent);
  const currentDocument = await getProfileDocument(databases, profileId);
  const currentProfile = toUserProfile(currentDocument);
  const { account, profile } = await sanitizeUserInput(databases, input);

  if (
    currentProfile.userId === context.user.id &&
    (!profile.isActive || profile.role !== "admin")
  ) {
    throw inputError("No puedes quitarte tu propio acceso administrador.");
  }

  if (currentProfile.name !== account.name) {
    await users.updateName({
      userId: currentProfile.userId,
      name: account.name,
    });
  }

  if (normalizeEmail(currentProfile.email) !== account.email) {
    await users.updateEmail({
      userId: currentProfile.userId,
      email: account.email,
    });
  }

  if (account.password) {
    await users.updatePassword({
      userId: currentProfile.userId,
      password: account.password,
    });

    if (currentProfile.userId !== context.user.id) {
      await deleteUserSessions(users, currentProfile.userId);
    }
  }

  if (currentProfile.isActive !== profile.isActive) {
    await users.updateStatus({
      userId: currentProfile.userId,
      status: profile.isActive,
    });

    if (!profile.isActive) {
      await deleteUserSessions(users, currentProfile.userId);
    }
  }

  const document = await databases.updateDocument({
    databaseId,
    collectionId: collections.userProfiles,
    documentId: profileId,
    data: profile,
  });

  return toUserProfile(document);
}

export async function deactivateManagedUser(context, profileId) {
  assertCanManageUsers(context);

  const { databases, users } = createAdminClient(context.userAgent);
  const currentDocument = await getProfileDocument(databases, profileId);
  const currentProfile = toUserProfile(currentDocument);

  if (currentProfile.userId === context.user.id) {
    throw inputError("No puedes desactivar tu propio usuario.");
  }

  await users.updateStatus({
    userId: currentProfile.userId,
    status: false,
  });
  await deleteUserSessions(users, currentProfile.userId);

  const document = await databases.updateDocument({
    databaseId,
    collectionId: collections.userProfiles,
    documentId: profileId,
    data: { isActive: false },
  });

  return toUserProfile(document);
}
