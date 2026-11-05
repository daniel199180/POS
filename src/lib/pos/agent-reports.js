import { Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { assertCanViewAnalytics } from "./auth-core.js";
import { getSalesAnalytics } from "./analytics.js";
import { getAdminReportOptions, readReportDocuments } from "./report-data.js";
import { parseReportRange } from "./report-dates.js";
import { getTimeZoneSettings } from "./settings.js";

function lowStockRows(products, stocks, branches) {
  const productsById = new Map(
    products.map((product) => [product.$id, product]),
  );
  const branchNames = new Map(
    branches.map((branch) => [branch.id, branch.name]),
  );

  return stocks
    .filter(
      (stock) => Number(stock.quantity || 0) <= Number(stock.minStock || 0),
    )
    .map((stock) => {
      const product = productsById.get(stock.productId);
      return {
        productId: stock.productId,
        productName: product?.name || stock.productId,
        sku: product?.sku || "",
        branchId: stock.branchId,
        branchName: branchNames.get(stock.branchId) || stock.branchId,
        quantity: Number(stock.quantity || 0),
        minimum: Number(stock.minStock || 0),
        unit: product?.unit || "unit",
      };
    })
    .sort(
      (left, right) =>
        left.quantity - right.quantity ||
        left.productName.localeCompare(right.productName),
    );
}

export async function getAgentDailyReport(context, filters = {}) {
  assertCanViewAnalytics(context);
  const { timeZone } = await getTimeZoneSettings(context);
  const date =
    filters.date || new Date().toLocaleDateString("en-CA", { timeZone });
  const range = parseReportRange({ dateFrom: date, dateTo: date }, timeZone);
  const analytics = await getSalesAnalytics(context, {
    dateFrom: date,
    dateTo: date,
  });
  const { databases } = createAdminClient(context.userAgent);
  const options = await getAdminReportOptions(context);
  const branchIds = options.branches.map((branch) => branch.id);
  const [products, stocks] = await Promise.all([
    readReportDocuments(databases, appwriteConfig.collections.products, [
      Query.equal("isActive", true),
      Query.select(["$id", "name", "sku", "unit"]),
    ]),
    branchIds.length
      ? readReportDocuments(databases, appwriteConfig.collections.stock, [
          Query.equal("branchId", branchIds),
          Query.select([
            "$id",
            "productId",
            "branchId",
            "quantity",
            "minStock",
          ]),
        ])
      : [],
  ]);

  return {
    date: range.dateFrom,
    timeZone,
    currency: "BOB",
    generatedAt: new Date().toISOString(),
    summary: {
      total: analytics.summary.total,
      salesCount: analytics.summary.count,
      cash: analytics.summary.payments.cash,
      qr: analytics.summary.payments.qr,
      card: analytics.summary.payments.card,
      products: analytics.summary.categories.products,
      monthly: analytics.summary.categories.monthly,
      custom: analytics.summary.categories.custom,
    },
    branches: analytics.branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      total: branch.total,
      salesCount: branch.count,
      cash: branch.payments.cash,
      qr: branch.payments.qr,
      card: branch.payments.card,
      products: branch.categories.products,
      monthly: branch.categories.monthly,
      custom: branch.categories.custom,
    })),
    lowStock: lowStockRows(products, stocks, options.branches),
  };
}
