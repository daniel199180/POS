function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return Math.round(value * 100) / 100;
}

export function buildInventoryRows(products, stocks, branches) {
  const branchNames = new Map(
    branches.map((branch) => [branch.id, branch.name]),
  );
  const stocksByProduct = new Map();
  for (const stock of stocks) {
    const entries = stocksByProduct.get(stock.productId) || [];
    entries.push(stock);
    stocksByProduct.set(stock.productId, entries);
  }

  return products.flatMap((product) => {
    const originBranchId = product.originBranchId || "";
    const productStocks = (stocksByProduct.get(product.$id) || []).filter(
      (stock) => !originBranchId || stock.branchId === originBranchId,
    );
    const rows = productStocks.length
      ? productStocks
      : originBranchId
        ? [{ branchId: originBranchId, quantity: 0, minStock: 0 }]
        : [];
    return rows.map((stock) => {
      const quantity = amount(stock.quantity);
      const minimum = amount(stock.minStock);
      return {
        productId: product.$id,
        productName: product.name,
        sku: product.sku || "",
        barcode: product.barcode || "",
        categoryId: product.categoryId || "",
        branchId: stock.branchId,
        branchName: branchNames.get(stock.branchId) || stock.branchId,
        unit: product.unit || "unit",
        quantity,
        minimum,
        maximum: stock.maxStock == null ? null : amount(stock.maxStock),
        status:
          quantity <= 0
            ? "out_of_stock"
            : quantity <= minimum
              ? "low_stock"
              : "in_stock",
        cost: product.cost == null ? null : amount(product.cost),
        price: amount(product.price),
      };
    });
  });
}

export function filterInventoryRows(
  rows,
  { branchId = "", search = "", status = "all" } = {},
) {
  const term = search.trim().toLocaleLowerCase();
  return rows.filter(
    (row) =>
      (!branchId || row.branchId === branchId) &&
      (status === "all" || row.status === status) &&
      (!term ||
        `${row.productName} ${row.sku} ${row.barcode}`
          .toLocaleLowerCase()
          .includes(term)),
  );
}

export function summarizeInventory(rows, branches) {
  const summarize = (items) => ({
    products: items.length,
    inStock: items.filter((row) => row.status === "in_stock").length,
    lowStock: items.filter((row) => row.status === "low_stock").length,
    outOfStock: items.filter((row) => row.status === "out_of_stock").length,
    knownCostValue: money(
      items.reduce(
        (sum, row) => sum + (row.cost == null ? 0 : row.quantity * row.cost),
        0,
      ),
    ),
    productsWithoutCost: items.filter((row) => row.cost == null).length,
  });
  return {
    total: summarize(rows),
    branches: branches
      .map((branch) => ({
        id: branch.id,
        name: branch.name,
        ...summarize(rows.filter((row) => row.branchId === branch.id)),
      }))
      .filter((branch) => branch.products > 0),
  };
}

export function buildMovementSummary(movements, branches) {
  const branchNames = new Map(
    branches.map((branch) => [branch.id, branch.name]),
  );
  const summarize = (items) => {
    const types = { in: 0, out: 0, adjustment: 0, transfer: 0 };
    for (const item of items) types[item.type] = (types[item.type] || 0) + 1;
    return { count: items.length, byType: types };
  };
  const branchIds = [...new Set(movements.map((item) => item.branchId))];
  return {
    total: summarize(movements),
    branches: branchIds.map((branchId) => ({
      id: branchId,
      name: branchNames.get(branchId) || branchId,
      ...summarize(movements.filter((item) => item.branchId === branchId)),
    })),
  };
}
