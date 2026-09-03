import { Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { ForbiddenError } from "./auth-core.js";

export function assertReportAdmin(context) {
  if (!context?.isAdmin)
    throw new ForbiddenError(
      "Solo los administradores pueden consultar este reporte.",
    );
}

// No silent summary truncation. Query every page or ask for a smaller period.
export async function readReportDocuments(
  databases,
  collectionId,
  queries = [],
  maxRecords = 50000,
) {
  const documents = [];
  let cursor;
  while (true) {
    const result = await databases.listDocuments({
      databaseId: appwriteConfig.databaseId,
      collectionId,
      queries: [
        ...queries,
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    if (
      result.total > maxRecords ||
      documents.length + result.documents.length > maxRecords
    ) {
      const error = new Error(
        "Hay demasiados registros. Reduce el período o selecciona una sucursal.",
      );
      error.status = 422;
      throw error;
    }
    documents.push(...result.documents);
    if (result.documents.length < 100) return documents;
    cursor = result.documents.at(-1).$id;
  }
}

export async function getAdminReportOptions(context) {
  assertReportAdmin(context);
  const { databases } = createAdminClient(context.userAgent);
  const { collections } = appwriteConfig;
  const [branches, users] = await Promise.all([
    readReportDocuments(databases, collections.branches, [
      Query.orderAsc("$id"),
      Query.select(["$id", "name", "isActive"]),
    ]),
    readReportDocuments(databases, collections.userProfiles, [
      Query.orderAsc("$id"),
      Query.select(["$id", "userId", "name", "isActive", "role"]),
    ]),
  ]);
  return {
    branches: branches
      .map((branch) => ({
        id: branch.$id,
        name: branch.name,
        isActive: branch.isActive,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    users: users
      .map((user) => ({
        id: user.userId,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
