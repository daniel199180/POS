// Product creation currently supports these physical branch codes.
export const CATALOG_BRANCH_CODES = new Set(["CBB", "SCZ", "LPZ"]);

export function publicCatalogPath(code) {
  return `/catalogo/${encodeURIComponent(String(code).toUpperCase())}`;
}

export function isPublicCatalogImageAllowed(branch, product, stock) {
  return (
    branch?.isActive === true &&
    product?.isActive === true &&
    product.originBranchId === branch.$id &&
    Boolean(product.imageFileId) &&
    stock?.branchId === branch.$id &&
    stock?.productId === product.$id &&
    Number(stock.quantity) > 0
  );
}

export function buildPublicCatalogProducts({
  branch,
  products,
  stocks,
  categories,
}) {
  const available = new Set(
    stocks
      .filter(
        (stock) => stock.branchId === branch.id && Number(stock.quantity) > 0,
      )
      .map((stock) => stock.productId),
  );
  const categoryNames = new Map(
    categories
      .filter((category) => category.isActive !== false)
      .map((category) => [category.$id, category.name]),
  );

  return products
    .filter(
      (product) =>
        product.isActive === true &&
        product.originBranchId === branch.id &&
        available.has(product.$id),
    )
    .map((product) => ({
      id: product.$id,
      name: product.name,
      description: product.description || "",
      sku: product.sku || "",
      price: Number(product.price) || 0,
      unit: product.unit || "unit",
      categoryId: categoryNames.has(product.categoryId)
        ? product.categoryId
        : "",
      categoryName: categoryNames.get(product.categoryId) || "Otros",
      imageUrl: product.imageFileId
        ? `/api/public/catalog/${encodeURIComponent(branch.code)}/products/${encodeURIComponent(product.$id)}/image`
        : "",
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}
