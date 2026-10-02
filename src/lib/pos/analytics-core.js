import { localReportDate, shiftReportDate } from "./report-dates.js";
import { DEFAULT_TIME_ZONE, localHour } from "./time-zone.js";
import { saleChannel } from "./sale-origin.js";

const categoryKeys = ["products", "monthly", "custom", "unclassified"];
const cents = (value) => Math.round((Number(value) || 0) * 100);
const decimal = (value) => Math.round(value) / 100;
const categoryTotals = () =>
  Object.fromEntries(categoryKeys.map((key) => [key, 0]));

export function incomeCategory(item) {
  if (
    item.productSku === "MENSUALIDAD" ||
    String(item.productName || "")
      .trim()
      .toLowerCase()
      .startsWith("mensualidad:")
  )
    return "monthly";
  if (
    item.productSku === "CUSTOM" ||
    String(item.productId || "").startsWith("custom-")
  )
    return "custom";
  return "products";
}

// Allocate the net amount once across mixed-sale items, using integer cents.
// Largest remainders ensure the category totals match the sale total exactly.
export function allocateSaleIncome(sale, items) {
  const total = Math.max(0, cents(sale.total));
  const weighted = items.map((item) => ({
    item,
    category: incomeCategory(item),
    weight: Math.max(
      0,
      cents(item.subtotal ?? Number(item.quantity) * Number(item.unitPrice)),
    ),
  }));
  const itemSum = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  const expected = cents(sale.subtotal ?? sale.total);
  const missing = Math.max(0, expected - itemSum);
  if (missing || !weighted.length)
    weighted.push({
      item: null,
      category: "unclassified",
      weight: missing || total,
    });
  const weightSum = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (!weightSum)
    return [{ item: null, category: "unclassified", amount: total }];
  const allocations = weighted.map((entry, index) => {
    const proportional = (total * entry.weight) / weightSum;
    return {
      ...entry,
      index,
      amount: Math.floor(proportional),
      fraction: proportional - Math.floor(proportional),
    };
  });
  const remainder =
    total - allocations.reduce((sum, entry) => sum + entry.amount, 0);
  const priority = [...allocations].sort(
    (a, b) => b.fraction - a.fraction || a.index - b.index,
  );
  for (let i = 0; i < remainder; i++) priority[i].amount += 1;
  return allocations;
}

function newBucket(extra = {}) {
  return {
    ...extra,
    total: 0,
    count: 0,
    reversals: 0,
    categories: categoryTotals(),
    payments: { cash: 0, qr: 0, card: 0, other: 0 },
    channels: { pos: 0, paymentLink: 0 },
  };
}

function finishBucket(bucket) {
  return {
    ...bucket,
    total: decimal(bucket.total),
    averageTicket: bucket.count ? decimal(bucket.total / bucket.count) : 0,
    categories: Object.fromEntries(
      Object.entries(bucket.categories).map(([key, value]) => [
        key,
        decimal(value),
      ]),
    ),
    payments: Object.fromEntries(
      Object.entries(bucket.payments).map(([key, value]) => [
        key,
        decimal(value),
      ]),
    ),
    channels: Object.fromEntries(
      Object.entries(bucket.channels).map(([key, value]) => [
        key,
        decimal(value),
      ]),
    ),
  };
}

function addSale(bucket, sale, allocations) {
  bucket.total += cents(sale.total);
  bucket.count += 1;
  const type = Object.hasOwn(bucket.payments, sale.paymentMethodType)
    ? sale.paymentMethodType
    : "other";
  bucket.payments[type] += cents(sale.total);
  bucket.channels[saleChannel(sale)] += cents(sale.total);
  for (const allocation of allocations)
    bucket.categories[allocation.category] += allocation.amount;
}

export function buildSalesAnalytics({
  sales,
  previousSales,
  items,
  range,
  branches = [],
  timeZone = DEFAULT_TIME_ZONE,
}) {
  const itemsBySale = new Map();
  for (const item of items) {
    if (!itemsBySale.has(item.saleId)) itemsBySale.set(item.saleId, []);
    itemsBySale.get(item.saleId).push(item);
  }
  const daily = new Map(
    Array.from({ length: range.days }, (_, i) => {
      const date = shiftReportDate(range.dateFrom, i);
      return [date, newBucket({ date })];
    }),
  );
  const byBranch = new Map(
    branches.map((branch) => [
      branch.id,
      newBucket({ id: branch.id, name: branch.name }),
    ]),
  );
  const byCashier = new Map();
  const byProduct = new Map();
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    total: 0,
    count: 0,
  }));
  const summary = newBucket();
  let reversedTotal = 0;
  let incompleteSales = 0;

  for (const sale of sales) {
    if (!byBranch.has(sale.branchId))
      byBranch.set(
        sale.branchId,
        newBucket({
          id: sale.branchId,
          name: sale.branchName || sale.branchId,
        }),
      );
    const branch = byBranch.get(sale.branchId);
    if (["cancelled", "refunded"].includes(sale.status)) {
      summary.reversals++;
      branch.reversals++;
      reversedTotal += cents(sale.total);
      continue;
    }
    if (sale.status !== "completed") continue;
    const saleId = sale.$id || sale.id;
    const saleItems = itemsBySale.get(saleId) || [];
    if (
      !saleItems.length ||
      Math.abs(
        saleItems.reduce((sum, item) => sum + cents(item.subtotal), 0) -
          cents(sale.subtotal ?? sale.total),
      ) > 1
    )
      incompleteSales++;
    const allocations = allocateSaleIncome(sale, saleItems);
    addSale(summary, sale, allocations);
    addSale(branch, sale, allocations);
    const day = daily.get(localReportDate(sale.completedAt, timeZone));
    if (day) addSale(day, sale, allocations);
    if (!byCashier.has(sale.cashierId))
      byCashier.set(
        sale.cashierId,
        newBucket({
          id: sale.cashierId,
          name: sale.cashierName || sale.cashierId,
        }),
      );
    addSale(byCashier.get(sale.cashierId), sale, allocations);
    const hour = localHour(sale.completedAt, timeZone);
    hourly[hour].total += cents(sale.total);
    hourly[hour].count++;
    for (const allocation of allocations) {
      if (allocation.category !== "products" || !allocation.item) continue;
      const item = allocation.item;
      const key = item.productId || item.productSku || item.productName;
      if (!byProduct.has(key))
        byProduct.set(key, {
          id: key,
          name: item.productName || item.productSku,
          sku: item.productSku,
          quantity: 0,
          total: 0,
        });
      const product = byProduct.get(key);
      product.quantity += Number(item.quantity) || 0;
      product.total += allocation.amount;
    }
  }
  const previous = previousSales.filter((sale) => sale.status === "completed");
  const previousTotal = previous.reduce(
    (sum, sale) => sum + cents(sale.total),
    0,
  );
  const previousAverage = previous.length ? previousTotal / previous.length : 0;
  const change = (current, prior) =>
    prior > 0 ? Math.round(((current - prior) / prior) * 1000) / 10 : null;
  return {
    range,
    summary: {
      ...finishBucket(summary),
      reversedTotal: decimal(reversedTotal),
      incompleteSales,
      reversalRate:
        summary.count + summary.reversals
          ? Math.round(
              (summary.reversals / (summary.count + summary.reversals)) * 1000,
            ) / 10
          : 0,
      previousTotal: decimal(previousTotal),
      previousCount: previous.length,
      previousAverage: decimal(previousAverage),
      revenueChange: change(summary.total, previousTotal),
      countChange: change(summary.count, previous.length),
      ticketChange: change(
        summary.count ? summary.total / summary.count : 0,
        previousAverage,
      ),
    },
    daily: [...daily.values()].map(finishBucket),
    branches: [...byBranch.values()]
      .map(finishBucket)
      .sort((a, b) => b.total - a.total),
    cashiers: [...byCashier.values()]
      .map(finishBucket)
      .sort((a, b) => b.total - a.total),
    products: [...byProduct.values()]
      .map((product) => ({
        ...product,
        total: decimal(product.total),
        quantity: Math.round(product.quantity * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10),
    hourly: hourly.map((hour) => ({ ...hour, total: decimal(hour.total) })),
  };
}
