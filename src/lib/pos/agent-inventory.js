import { Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { assertReportAdmin, readReportDocuments } from "./report-data.js";
import { parseReportRange, reportInputError } from "./report-dates.js";
import { getTimeZoneSettings } from "./settings.js";
import {
  buildInventoryRows,
  buildMovementSummary,
  filterInventoryRows,
  summarizeInventory,
} from "./inventory-report-core.js";

function pageOf(rows, page = 1, pageSize = 50) {
  const currentPage = Math.max(1, Math.trunc(page));
  const size = Math.max(1, Math.min(100, Math.trunc(pageSize)));
  return {
    page: currentPage,
    pageSize: size,
    total: rows.length,
    pages: Math.max(1, Math.ceil(rows.length / size)),
    items: rows.slice((currentPage - 1) * size, currentPage * size),
  };
}

function selectedBranches(branches, branchId) {
  if (!branchId) return branches;
  const branch = branches.find((item) => item.id === branchId);
  if (!branch) throw reportInputError("La sucursal no existe.");
  return [branch];
}

async function readBranches(databases) {
  const documents = await readReportDocuments(
    databases,
    appwriteConfig.collections.branches,
    [Query.orderAsc("$id"), Query.select(["$id", "name"])],
  );
  return documents.map((branch) => ({ id: branch.$id, name: branch.name }));
}

async function inventorySnapshot(context, branchId = "") {
  assertReportAdmin(context);
  const { databases } = createAdminClient(context.userAgent);
  const branches = selectedBranches(await readBranches(databases), branchId);
  const [products, stocks] = await Promise.all([
    readReportDocuments(databases, appwriteConfig.collections.products, [
      Query.equal("isActive", true),
      Query.orderAsc("$id"),
      Query.select([
        "$id",
        "name",
        "sku",
        "barcode",
        "categoryId",
        "originBranchId",
        "unit",
        "cost",
        "price",
      ]),
    ]),
    readReportDocuments(databases, appwriteConfig.collections.stock, [
      ...(branchId ? [Query.equal("branchId", branchId)] : []),
      Query.orderAsc("$id"),
      Query.select([
        "$id",
        "productId",
        "branchId",
        "quantity",
        "minStock",
        "maxStock",
      ]),
    ]),
  ]);
  const rows = buildInventoryRows(products, stocks, branches)
    .filter((row) => branches.some((branch) => branch.id === row.branchId))
    .sort(
      (a, b) =>
        a.branchName.localeCompare(b.branchName) ||
        a.productName.localeCompare(b.productName) ||
        a.productId.localeCompare(b.productId),
    );
  return { rows, branches };
}

export async function getAgentInventoryStock(context, filters = {}) {
  const { rows } = await inventorySnapshot(context, filters.branchId || "");
  const matching = filterInventoryRows(rows, filters);
  return {
    generatedAt: new Date().toISOString(),
    ...pageOf(matching, filters.page, filters.pageSize),
  };
}

export async function getAgentInventoryReport(context, filters = {}) {
  const { rows, branches } = await inventorySnapshot(
    context,
    filters.branchId || "",
  );
  const alerts = rows
    .filter((row) => row.status !== "in_stock")
    .sort(
      (a, b) =>
        a.quantity - b.quantity || a.productName.localeCompare(b.productName),
    );
  return {
    generatedAt: new Date().toISOString(),
    currency: "BOB",
    ...summarizeInventory(rows, branches),
    alerts: {
      total: alerts.length,
      items: alerts.slice(0, 100),
      truncated: alerts.length > 100,
    },
  };
}

export async function getAgentInventoryMovementsReport(context, filters = {}) {
  assertReportAdmin(context);
  const { timeZone } = await getTimeZoneSettings(context);
  const range = parseReportRange(filters, timeZone);
  const { databases } = createAdminClient(context.userAgent);
  const branches = selectedBranches(
    await readBranches(databases),
    filters.branchId || "",
  );
  const queries = [
    Query.greaterThanEqual("$createdAt", range.from),
    Query.lessThanEqual("$createdAt", range.to),
    ...(filters.branchId ? [Query.equal("branchId", filters.branchId)] : []),
    ...(filters.productId ? [Query.equal("productId", filters.productId)] : []),
    Query.orderDesc("$createdAt"),
    Query.select([
      "$id",
      "$createdAt",
      "productId",
      "branchId",
      "type",
      "quantity",
      "previousQty",
      "newQty",
      "reason",
      "saleId",
    ]),
  ];
  const [movements, products] = await Promise.all([
    readReportDocuments(
      databases,
      appwriteConfig.collections.stockMovements,
      queries,
    ),
    readReportDocuments(databases, appwriteConfig.collections.products, [
      Query.orderAsc("$id"),
      Query.select(["$id", "name", "sku", "unit"]),
    ]),
  ]);
  const productsById = new Map(
    products.map((product) => [product.$id, product]),
  );
  const branchNames = new Map(
    branches.map((branch) => [branch.id, branch.name]),
  );
  const items = movements.map((movement) => {
    const product = productsById.get(movement.productId);
    return {
      id: movement.$id,
      createdAt: movement.$createdAt,
      productId: movement.productId,
      productName: product?.name || movement.productId,
      sku: product?.sku || "",
      unit: product?.unit || "unit",
      branchId: movement.branchId,
      branchName: branchNames.get(movement.branchId) || movement.branchId,
      type: movement.type,
      quantity: Number(movement.quantity || 0),
      previousQty: Number(movement.previousQty || 0),
      newQty: Number(movement.newQty || 0),
      reason: movement.reason || "",
      saleId: movement.saleId || "",
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    timeZone,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    ...buildMovementSummary(items, branches),
    movements: pageOf(items, filters.page, filters.pageSize),
  };
}
