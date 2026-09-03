import { Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { assertReportAdmin } from "./report-data.js";
import { parseReportRange, reportInputError } from "./report-dates.js";

export async function listAuditHistory(context, filters = {}) {
  assertReportAdmin(context);
  const range = parseReportRange(filters);
  const source = filters.source || "changes";
  if (!["changes", "inventory"].includes(source))
    throw reportInputError("Selecciona un historial válido.");
  const page = Math.max(
    1,
    Math.min(10000, Math.trunc(Number(filters.page) || 1)),
  );
  const pageSize = 25;
  const legacy = source === "inventory";
  const queries = [
    Query.greaterThanEqual("$createdAt", range.from),
    Query.lessThanEqual("$createdAt", range.to),
    Query.orderDesc("$createdAt"),
    Query.orderDesc("$id"),
    Query.limit(pageSize),
    Query.offset((page - 1) * pageSize),
  ];
  if (filters.branchId) queries.push(Query.equal("branchId", filters.branchId));
  if (filters.actorId)
    queries.push(Query.equal(legacy ? "userId" : "actorId", filters.actorId));
  if (!legacy && filters.entityType) {
    if (
      !["product", "stock", "branch", "permission", "pos_settings"].includes(
        filters.entityType,
      )
    )
      throw reportInputError("Tipo de cambio inválido.");
    queries.push(Query.equal("entityType", filters.entityType));
  }
  const { databases } = createAdminClient(context.userAgent);
  const { collections, databaseId } = appwriteConfig;
  const result = await databases.listDocuments({
    databaseId,
    collectionId: legacy ? collections.stockMovements : collections.auditEvents,
    queries,
  });
  let events;
  if (legacy) {
    const lookup = async (collectionId, field, ids) => {
      const values = [...new Set(ids.filter(Boolean))];
      if (!values.length) return [];
      return (
        await databases.listDocuments({
          databaseId,
          collectionId,
          queries: [Query.equal(field, values), Query.limit(100)],
        })
      ).documents;
    };
    const [products, branches, users] = await Promise.all([
      lookup(
        collections.products,
        "$id",
        result.documents.map((item) => item.productId),
      ),
      lookup(
        collections.branches,
        "$id",
        result.documents.map((item) => item.branchId),
      ),
      lookup(
        collections.userProfiles,
        "userId",
        result.documents.map((item) => item.userId),
      ),
    ]);
    events = result.documents.map((item) => ({
      id: item.$id,
      createdAt: item.$createdAt,
      entityType: "stock",
      entityId: item.productId,
      entityName:
        products.find((product) => product.$id === item.productId)?.name ||
        item.productId,
      actorName:
        users.find((user) => user.userId === item.userId)?.name || item.userId,
      actorId: item.userId,
      branchName:
        branches.find((branch) => branch.$id === item.branchId)?.name ||
        item.branchId,
      action: `movement.${item.type}`,
      status: "completed",
      reason: item.reason || "",
      saleId: item.saleId || "",
      quantity: item.quantity,
      changes: [
        { field: "quantity", before: item.previousQty, after: item.newQty },
      ],
    }));
  } else {
    events = result.documents.map((item) => ({
      id: item.$id,
      createdAt: item.$createdAt,
      entityType: item.entityType,
      entityId: item.entityId,
      entityName: item.entityName,
      actorId: item.actorId,
      actorName: item.actorName,
      actorRole: item.actorRole,
      branchName: item.branchName,
      action: item.action,
      status: item.status,
      changes: JSON.parse(item.changes),
    }));
  }
  return {
    events,
    page,
    pageSize,
    total: result.total,
    pages: Math.max(1, Math.ceil(result.total / pageSize)),
  };
}
