// Private server-side collection. No client may read or write these documents.
export function getAuditCollectionSchema(id = "audit_events") {
  return {
    id,
    name: "Audit Events",
    attributes: [
      { type: "string", key: "actorId", size: 36, required: true },
      { type: "string", key: "actorName", size: 200, required: true },
      { type: "string", key: "actorRole", size: 20, required: true },
      { type: "string", key: "entityType", size: 30, required: true },
      { type: "string", key: "entityId", size: 36, required: true },
      { type: "string", key: "entityName", size: 200, required: true },
      { type: "string", key: "action", size: 40, required: true },
      { type: "string", key: "branchId", size: 36, required: false },
      { type: "string", key: "branchName", size: 120, required: false },
      { type: "string", key: "status", size: 20, required: true },
      { type: "string", key: "changes", size: 30000, required: true },
    ],
    indexes: ["actorId", "entityType", "entityId", "branchId", "status"].map(
      (key) => ({
        key: `idx_${key}`,
        type: "key",
        attributes: [key],
      }),
    ),
  };
}
