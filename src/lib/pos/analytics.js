import { Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import {
  assertReportAdmin,
  getAdminReportOptions,
  readReportDocuments,
} from "./report-data.js";
import { parseReportRange } from "./report-dates.js";
import { buildSalesAnalytics } from "./analytics-core.js";

export async function getSalesAnalytics(context, filters = {}) {
  assertReportAdmin(context);
  const range = parseReportRange(filters);
  const { databases } = createAdminClient(context.userAgent);
  const { collections } = appwriteConfig;
  const common = [Query.orderAsc("$id")];
  if (filters.branchId) common.push(Query.equal("branchId", filters.branchId));
  if (filters.cashierId)
    common.push(Query.equal("cashierId", filters.cashierId));
  const [sales, previousSales, options] = await Promise.all([
    readReportDocuments(databases, collections.sales, [
      ...common,
      Query.greaterThanEqual("completedAt", range.from),
      Query.lessThanEqual("completedAt", range.to),
    ]),
    readReportDocuments(databases, collections.sales, [
      ...common,
      Query.greaterThanEqual(
        "completedAt",
        `${range.previousFrom}T00:00:00-04:00`,
      ),
      Query.lessThanEqual(
        "completedAt",
        `${range.previousTo}T23:59:59.999-04:00`,
      ),
    ]),
    getAdminReportOptions(context),
  ]);
  const saleIds = sales
    .filter((sale) => sale.status === "completed")
    .map((sale) => sale.$id);
  const items = [];
  for (let offset = 0; offset < saleIds.length; offset += 100) {
    items.push(
      ...(await readReportDocuments(databases, collections.saleItems, [
        Query.equal("saleId", saleIds.slice(offset, offset + 100)),
        Query.orderAsc("$id"),
      ])),
    );
  }
  return {
    ...buildSalesAnalytics({
      sales,
      previousSales,
      items,
      range,
      branches: options.branches.filter(
        (branch) => !filters.branchId || branch.id === filters.branchId,
      ),
    }),
    generatedAt: new Date().toISOString(),
  };
}
