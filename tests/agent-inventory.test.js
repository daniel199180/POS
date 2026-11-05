import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInventoryRows,
  buildMovementSummary,
  filterInventoryRows,
  summarizeInventory,
} from "../src/lib/pos/inventory-report-core.js";
import {
  getAgentInventoryMovementsReport,
  getAgentInventoryReport,
  getAgentInventoryStock,
} from "../src/lib/pos/agent-inventory.js";

const branches = [
  { id: "b1", name: "Cochabamba" },
  { id: "b2", name: "Santa Cruz" },
];
const products = [
  {
    $id: "p1",
    name: "Tinta",
    sku: "T-1",
    barcode: "123",
    originBranchId: "b1",
    unit: "liter",
    price: 15,
    cost: 10,
  },
  {
    $id: "p2",
    name: "Papel",
    sku: "P-1",
    originBranchId: "b2",
    unit: "unit",
    price: 5,
  },
  {
    $id: "p3",
    name: "Lápiz",
    sku: "L-1",
    originBranchId: "b1",
    unit: "unit",
    price: 3,
    cost: 1,
  },
];
const stocks = [
  { productId: "p1", branchId: "b1", quantity: 2, minStock: 3, maxStock: 20 },
  { productId: "p1", branchId: "b2", quantity: 50, minStock: 1 }, // Fila histórica ajena al origen.
  { productId: "p2", branchId: "b2", quantity: 0, minStock: 0 },
];

test("inventory rows respect product origin and include products without stock rows", () => {
  const rows = buildInventoryRows(products, stocks, branches);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => [row.productId, row.branchId, row.status]),
    [
      ["p1", "b1", "low_stock"],
      ["p2", "b2", "out_of_stock"],
      ["p3", "b1", "out_of_stock"],
    ],
  );
  assert.equal(rows[0].maximum, 20);
  assert.equal(rows[1].cost, null);
  assert.deepEqual(
    filterInventoryRows(rows, {
      search: "123",
      status: "low_stock",
      branchId: "b1",
    }).map((row) => row.productId),
    ["p1"],
  );
  assert.equal(
    filterInventoryRows(rows, { branchId: "b2", status: "out_of_stock" })
      .length,
    1,
  );
});

test("inventory summary counts all statuses without mixing different units", () => {
  const report = summarizeInventory(
    buildInventoryRows(products, stocks, branches),
    branches,
  );
  assert.deepEqual(report.total, {
    products: 3,
    inStock: 0,
    lowStock: 1,
    outOfStock: 2,
    knownCostValue: 20,
    productsWithoutCost: 1,
  });
  assert.equal(report.branches[0].products, 2);
  assert.equal(report.branches[1].outOfStock, 1);
});

test("movement summary counts event types by branch without summing unlike units", () => {
  const report = buildMovementSummary(
    [
      { branchId: "b1", type: "in", quantity: 4 },
      { branchId: "b1", type: "out", quantity: 2 },
      { branchId: "b2", type: "adjustment", quantity: 1 },
    ],
    branches,
  );
  assert.equal(report.total.count, 3);
  assert.deepEqual(report.total.byType, {
    in: 1,
    out: 1,
    adjustment: 1,
    transfer: 0,
  });
  assert.equal(report.branches[0].count, 2);
  assert.equal(report.branches[1].name, "Santa Cruz");
});

test("inventory agent reports require administrator access before reading data", async () => {
  const context = { isAdmin: false };
  for (const getReport of [
    getAgentInventoryStock,
    getAgentInventoryReport,
    getAgentInventoryMovementsReport,
  ]) {
    await assert.rejects(getReport(context), (error) => error.status === 403);
  }
});
