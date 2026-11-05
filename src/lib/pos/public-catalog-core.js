// Product creation currently supports these physical branch codes.
export const CATALOG_BRANCH_CODES = new Set(["CBB", "SCZ", "LPZ"]);

export function publicCatalogPath(code) {
  return `/catalogo/${encodeURIComponent(String(code).toUpperCase())}`;
}

export function isPublicCatalogImageAllowed(branch, product) {
  return (
    branch?.isActive === true &&
    product?.isActive === true &&
    product.originBranchId === branch.$id &&
    Boolean(product.imageFileId)
  );
}

export function buildPublicCatalogProducts({
  branch,
  products,
  stocks,
  categories,
}) {
  const stockByProduct = new Map(
    stocks
      .filter((stock) => stock.branchId === branch.id)
      .map((stock) => [
        stock.productId,
        Math.max(0, Number(stock.quantity) || 0),
      ]),
  );
  const categoryNames = new Map(
    categories
      .filter((category) => category.isActive !== false)
      .map((category) => [category.$id, category.name]),
  );

  return products
    .filter(
      (product) =>
        product.isActive === true && product.originBranchId === branch.id,
    )
    .map((product) => ({
      id: product.$id,
      name: product.name,
      description: product.description || "",
      sku: product.sku || "",
      price: Number(product.price) || 0,
      unit: product.unit || "unit",
      stockAvailable: stockByProduct.get(product.$id) || 0,
      categoryId: categoryNames.has(product.categoryId)
        ? product.categoryId
        : "",
      categoryName: categoryNames.get(product.categoryId) || "Otros",
      imageUrl: product.imageFileId
        ? `/api/public/catalog/${encodeURIComponent(branch.code)}/products/${encodeURIComponent(product.$id)}/image?v=${encodeURIComponent(product.imageFileId)}`
        : "",
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}

export function paginatePublicCatalogProducts(products, filters = {}) {
  const search = String(filters.search || "")
    .trim()
    .toLocaleLowerCase("es");
  const categoryId = String(filters.categoryId || "");
  const sort = String(filters.sort || "name");
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(filters.page, 10) || 1),
  );
  const filteredProducts = products.filter(
    (product) =>
      (!categoryId || product.categoryId === categoryId) &&
      (!search ||
        `${product.name} ${product.description} ${product.sku}`
          .toLocaleLowerCase("es")
          .includes(search)),
  );
  if (sort === "priceAsc" || sort === "priceDesc") {
    const direction = sort === "priceAsc" ? 1 : -1;
    filteredProducts.sort(
      (a, b) =>
        direction * (a.price - b.price) ||
        a.name.localeCompare(b.name, "es") ||
        a.id.localeCompare(b.id),
    );
  }
  const offset = (page - 1) * 20;
  return {
    products: filteredProducts
      .slice(offset, offset + 20)
      .map(({ description, ...product }) => product),
    total: filteredProducts.length,
    hasMore: offset + 20 < filteredProducts.length,
    page,
  };
}
