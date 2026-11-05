import { ID, Query } from "node-appwrite";
import { createAdminClient } from "../appwrite/admin.js";
import { appwriteConfig } from "../appwrite/config.js";
import { assertCanManageCatalog } from "./auth-core.js";
import { withAudit } from "./audit-writer.js";

const { databaseId, collections } = appwriteConfig;

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function toCategory(document) {
  return {
    id: document.$id,
    name: document.name,
    isActive: document.isActive !== false,
  };
}

export async function listCategories(context) {
  if (!context.canCreateProducts && !context.canManageCatalog)
    throw inputError("No tienes permiso para consultar categorías.");
  const { databases } = createAdminClient(context.userAgent);
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.categories,
    queries: [Query.limit(500)],
  });
  return result.documents
    .map(toCategory)
    .filter((item) => context.canManageCatalog || item.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function categoryData(input) {
  const name = String(input.name || "").trim();
  if (!name || name.length > 80)
    throw inputError("Escribe una categoría de hasta 80 caracteres.");
  return { name, isActive: input.isActive !== false };
}

export async function saveCategory(context, input, categoryId = "") {
  assertCanManageCatalog(context);
  const { databases } = createAdminClient(context.userAgent);
  const data = categoryData(input);
  const before = categoryId
    ? await databases.getDocument({
        databaseId,
        collectionId: collections.categories,
        documentId: categoryId,
      })
    : null;
  const id = categoryId || ID.unique();
  const document = await withAudit(
    databases,
    context,
    {
      entityType: "category",
      entityId: id,
      entityName: data.name,
      action: categoryId ? "category.update" : "category.create",
      before,
      after: data,
    },
    () =>
      categoryId
        ? databases.updateDocument({
            databaseId,
            collectionId: collections.categories,
            documentId: id,
            data,
          })
        : databases.createDocument({
            databaseId,
            collectionId: collections.categories,
            documentId: id,
            data,
            permissions: [],
          }),
  );
  return toCategory(document);
}
