import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateSaleIncome,
  buildSalesAnalytics,
  incomeCategory,
} from "../src/lib/pos/analytics-core.js";
import { getSaleOrigin, saleCategory } from "../src/lib/pos/sale-origin.js";
import { getAuditChanges, withAudit } from "../src/lib/pos/audit-writer.js";
import { getSalesAnalytics } from "../src/lib/pos/analytics.js";
import { getIncomeCategoryTotals } from "../src/lib/pos/sales.js";
import { buildDailyIncomePdf } from "../src/lib/pos/daily-income-pdf.js";
import { listAuditHistory } from "../src/lib/pos/audit.js";
import { readReportDocuments } from "../src/lib/pos/report-data.js";
import {
  parseReportRange,
  localReportDate,
} from "../src/lib/pos/report-dates.js";

const range = parseReportRange({
  dateFrom: "2026-09-01",
  dateTo: "2026-09-03",
});
const sale = (id, total, extra = {}) => ({
  $id: id,
  total,
  subtotal: total,
  status: "completed",
  branchId: "b1",
  branchName: "Santa Cruz",
  cashierId: "c1",
  cashierName: "Cajero",
  paymentMethodType: "cash",
  completedAt: "2026-09-01T15:00:00Z",
  ...extra,
});
const item = (saleId, subtotal, extra = {}) => ({
  saleId,
  subtotal,
  productId: "p1",
  productName: "Producto",
  productSku: "P1",
  quantity: 1,
  unitPrice: subtotal,
  ...extra,
});

test("mixed sales count once, reconcile categories and exclude cancelled/refunded sales", () => {
  const report = buildSalesAnalytics({
    range,
    branches: [
      { id: "b1", name: "Santa Cruz" },
      { id: "b2", name: "Sin ventas" },
    ],
    sales: [
      sale("s1", 40),
      sale("s2", 5, { paymentMethodType: "qr", paymentLinkId: "link-1" }),
      sale("s3", 50, { status: "cancelled" }),
      sale("s4", 10, { status: "refunded" }),
    ],
    previousSales: [sale("old", 30)],
    items: [
      item("s1", 25),
      item("s1", 15, { productId: "custom-inst-1", productSku: "MENSUALIDAD" }),
      item("s2", 5, { productId: "custom-1", productSku: "CUSTOM" }),
    ],
  });
  assert.equal(report.summary.total, 45);
  assert.equal(report.summary.count, 2);
  assert.equal(report.summary.averageTicket, 22.5);
  assert.equal(report.summary.revenueChange, 50);
  assert.equal(report.summary.reversals, 2);
  assert.equal(report.summary.reversedTotal, 60);
  assert.deepEqual(report.summary.categories, {
    products: 25,
    monthly: 15,
    custom: 5,
    unclassified: 0,
  });
  assert.deepEqual(report.summary.payments, {
    cash: 40,
    qr: 5,
    card: 0,
    other: 0,
  });
  assert.deepEqual(report.summary.channels, { pos: 40, paymentLink: 5 });
  assert.equal(report.branches[1].total, 0);
  assert.equal(report.products.length, 1);
  assert.equal(report.products[0].total, 25);
  assert.equal(report.daily.length, 3);
  assert.equal(report.daily[1].total, 0);
  assert.equal(report.cashiers[0].count, 2);
  assert.equal(report.hourly[11].count, 2);
});

test("daily report separates custom income and link channel, including PDF labels", () => {
  const sales = [
    { ...sale("p", 10), items: [item("p", 10)] },
    {
      ...sale("m", 20, { paymentMethodType: "qr" }),
      items: [item("m", 20, { productSku: "MENSUALIDAD" })],
    },
    {
      ...sale("c", 30, { paymentMethodType: "qr", paymentLinkId: "link" }),
      items: [item("c", 30, { productSku: "CUSTOM", productId: "custom-1" })],
    },
  ];
  const totals = getIncomeCategoryTotals(sales);
  assert.equal(totals.products.total, 10);
  assert.equal(totals.monthly.total, 20);
  assert.equal(totals.custom.total, 30);
  assert.deepEqual(totals.channels, { pos: 30, paymentLink: 30 });
  const pdf = buildDailyIncomePdf({
    date: "2026-09-03",
    generatedAt: new Date().toISOString(),
    branch: { name: "Santa Cruz" },
    cashier: { name: "Cajero" },
    summary: { incomeTotals: totals },
    sales,
  });
  const decoded = [...pdf.toString("ascii").matchAll(/<([0-9A-F]+)>/g)]
    .map((match) => Buffer.from(match[1], "hex").toString("ascii"))
    .join(" ");
  assert.match(decoded, /Personalizados QR/);
  assert.match(decoded, /Enlaces de pago/);
  assert.match(decoded, /Enlace de pago - Cobro personalizado/);
});

test("payment origin distinguishes channel and charge category", () => {
  const product = item("s", 10);
  const monthly = item("s", 10, { productSku: "MENSUALIDAD" });
  const custom = item("s", 10, { productSku: "CUSTOM", productId: "custom-1" });
  assert.equal(saleCategory([product]), "products");
  assert.equal(saleCategory([monthly]), "monthly");
  assert.equal(saleCategory([custom]), "custom");
  assert.equal(saleCategory([product, custom]), "mixed");
  assert.deepEqual(getSaleOrigin({ paymentLinkId: "link" }, [product]), {
    category: "products",
    categoryLabel: "Productos",
    channel: "paymentLink",
    channelLabel: "Enlace de pago",
    label: "Enlace de pago · Productos",
  });
});

test("net discounts and rounding allocate every cent exactly once", () => {
  for (const total of [0.01, 0.02, 0.1, 2.99, 19.9]) {
    const allocations = allocateSaleIncome({ total, subtotal: 30 }, [
      item("s", 10),
      item("s", 10, { productSku: "MENSUALIDAD" }),
      item("s", 10, { productSku: "CUSTOM" }),
    ]);
    assert.equal(
      allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
      Math.round(total * 100),
    );
  }
});

test("missing line items are unclassified and legacy monthly charges remain monthly", () => {
  assert.equal(
    incomeCategory({
      productSku: "CUSTOM",
      productName: "Mensualidad: Curso · 2026-09",
    }),
    "monthly",
  );
  const report = buildSalesAnalytics({
    range,
    sales: [sale("s", 50)],
    previousSales: [],
    items: [item("s", 20)],
  });
  assert.equal(report.summary.categories.products, 20);
  assert.equal(report.summary.categories.unclassified, 30);
  assert.equal(report.summary.incompleteSales, 1);
  assert.equal(report.summary.revenueChange, null);
});

test("Bolivia date boundaries, equal-length prior period and invalid ranges", () => {
  assert.equal(localReportDate("2026-09-02T03:59:59Z"), "2026-09-01");
  assert.equal(localReportDate("2026-09-02T04:00:00Z"), "2026-09-02");
  assert.equal(range.previousFrom, "2026-08-29");
  assert.equal(range.previousTo, "2026-08-31");
  assert.throws(
    () => parseReportRange({ dateFrom: "2026-02-30", dateTo: "2026-03-02" }),
    /válidas/,
  );
  assert.throws(
    () => parseReportRange({ dateFrom: "2026-10-01", dateTo: "2026-09-01" }),
    /período/,
  );
  assert.throws(
    () => parseReportRange({ dateFrom: "2020-01-01", dateTo: "2026-09-01" }),
    /período/,
  );
});

test("analytics require super admin while history rejects cashiers", async () => {
  await assert.rejects(
    getSalesAnalytics({ isAdmin: true, canViewAnalytics: false }),
    (error) => error.status === 403,
  );
  await assert.rejects(
    listAuditHistory({ isAdmin: false }),
    (error) => error.status === 403,
  );
});

test("report pagination reads beyond 100 rows and refuses silent truncation", async () => {
  let calls = 0;
  const database = {
    listDocuments: async ({ queries }) => {
      calls++;
      if (calls === 2)
        assert.ok(
          queries.some((query) => JSON.parse(query).method === "cursorAfter"),
        );
      return {
        total: 101,
        documents:
          calls === 1
            ? Array.from({ length: 100 }, (_, i) => ({ $id: String(i) }))
            : [{ $id: "100" }],
      };
    },
  };
  assert.equal((await readReportDocuments(database, "sales")).length, 101);
  await assert.rejects(
    readReportDocuments(
      { listDocuments: async () => ({ total: 101, documents: [] }) },
      "sales",
      [],
      100,
    ),
    /Reduce el período/,
  );
});

const context = {
  user: { id: "u1", name: "Test" },
  profile: { role: "cashier" },
};
const auditEvent = {
  entityType: "product",
  entityId: "p1",
  entityName: "Producto",
  action: "product.update",
  before: { price: 10 },
  after: { price: 15, password: "never-log", secret: "never-log" },
};

test("audit reserves a private event, keeps before/after and never stores secrets", async () => {
  const calls = [];
  const database = {
    createDocument: async (args) => {
      calls.push("reserve");
      assert.deepEqual(args.permissions, []);
      assert.equal(args.data.status, "pending");
      assert.equal(args.data.actorId, "u1");
      assert.deepEqual(JSON.parse(args.data.changes), [
        { field: "price", before: 10, after: 15 },
      ]);
    },
    updateDocument: async (args) => {
      calls.push(args.data.status);
    },
  };
  assert.equal(
    await withAudit(database, context, auditEvent, async () => {
      calls.push("mutate");
      return "ok";
    }),
    "ok",
  );
  assert.deepEqual(calls, ["reserve", "mutate", "completed"]);
  assert.deepEqual(
    getAuditChanges("product", { price: 10 }, { price: 10 }),
    [],
  );
});

test("audit storage failure prevents mutation; mutation failure is marked incomplete", async () => {
  let mutated = false;
  await assert.rejects(
    withAudit(
      {
        createDocument: async () => {
          throw new Error("offline");
        },
      },
      context,
      auditEvent,
      async () => {
        mutated = true;
      },
    ),
  );
  assert.equal(mutated, false);
  let status;
  await assert.rejects(
    withAudit(
      {
        createDocument: async () => {},
        updateDocument: async (args) => {
          status = args.data.status;
        },
      },
      context,
      auditEvent,
      async () => {
        throw new Error("mutation failed");
      },
    ),
    /mutation failed/,
  );
  assert.equal(status, "failed");
});

test("a failed finalization retains the pending audit without retrying a successful mutation", async (t) => {
  t.mock.method(console, "error", () => {});
  let mutations = 0;
  const value = await withAudit(
    {
      createDocument: async () => {},
      updateDocument: async () => {
        throw new Error("offline");
      },
    },
    context,
    auditEvent,
    async () => {
      mutations++;
      return 123;
    },
  );
  assert.equal(value, 123);
  assert.equal(mutations, 1);
});
