import { ID } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";

// Explicit allowlist: credentials, sessions and passwords never enter the log.
const fields = {
  product: [
    "name",
    "sku",
    "barcode",
    "description",
    "categoryId",
    "price",
    "cost",
    "unit",
    "imageFileId",
    "isActive",
  ],
  stock: ["quantity", "minStock", "maxStock", "reason"],
  branch: ["name", "code", "address", "city", "phone", "isActive"],
  permission: ["canIncreaseInventory", "canCreateProducts", "allowedBranchIds"],
  user: ["name", "email", "role", "allowedBranchIds", "isActive"],
  pos_settings: ["products", "monthly", "custom", "links", "daily"],
};

export function getAuditChanges(entityType, before = {}, after = {}) {
  return (fields[entityType] || []).flatMap((field) => {
    if (!Object.hasOwn(after, field)) return [];
    const previous = before?.[field] ?? null;
    const next = after[field] ?? null;
    return JSON.stringify(previous) === JSON.stringify(next)
      ? []
      : [{ field, before: previous, after: next }];
  });
}

export async function withAudit(databases, context, event, mutate) {
  const changes = getAuditChanges(event.entityType, event.before, event.after);
  if (!changes.length) return mutate();

  // Reserve the record before mutation: an unavailable log must not silently
  // allow an unaudited catalogue change. Pending records remain visible if the
  // process exits or the final status cannot be saved.
  const documentId = ID.unique();
  const target = {
    databaseId: appwriteConfig.databaseId,
    collectionId: appwriteConfig.collections.auditEvents,
    documentId,
  };
  await databases.createDocument({
    ...target,
    permissions: [],
    data: {
      actorId: context.user.id,
      actorName: String(
        context.profile?.name ||
          context.user.name ||
          context.user.email ||
          context.user.id,
      ).slice(0, 200),
      actorRole:
        context.profile?.role || (context.isAdmin ? "admin" : "cashier"),
      entityType: event.entityType,
      entityId: event.entityId,
      entityName: String(event.entityName || event.entityId).slice(0, 200),
      action: event.action,
      branchId: event.branchId || "",
      branchName: String(event.branchName || "").slice(0, 120),
      changes: JSON.stringify(changes),
      status: "pending",
    },
  });

  async function finalize(status) {
    try {
      await databases.updateDocument({ ...target, data: { status } });
    } catch {
      // The durable pending record lets administrators reconcile the outcome.
      console.error(
        `No se pudo finalizar el registro de auditoria ${documentId}.`,
      );
    }
  }

  let result;
  try {
    result = await mutate();
  } catch (error) {
    await finalize("failed");
    throw error;
  }
  await finalize("completed");
  return result;
}
