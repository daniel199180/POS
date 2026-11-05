import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPublicCatalogProducts,
  isPublicCatalogImageAllowed,
  publicCatalogPath,
  paginatePublicCatalogProducts,
} from "../src/lib/pos/public-catalog-core.js";
import sharp from "sharp";
import {
  canEditProductImage,
  compressProductImage,
} from "../src/lib/pos/product-images.js";

const branch = { id: "b1", code: "CBB", name: "Cochabamba" };
const products = [
  {
    $id: "p1",
    name: "Cuaderno",
    description: "100 hojas",
    sku: "CB-001",
    price: 15,
    cost: 4,
    unit: "unit",
    categoryId: "c1",
    imageFileId: "image1",
    isActive: true,
    originBranchId: "b1",
  },
  { $id: "p2", name: "Lápiz", price: 2, isActive: true, originBranchId: "b1" },
  {
    $id: "p3",
    name: "Bolígrafo",
    price: 3,
    isActive: true,
    originBranchId: "b2",
  },
  { $id: "p4", name: "Regla", price: 5, isActive: false, originBranchId: "b1" },
  { $id: "p5", name: "Tijera", price: 6, isActive: true, originBranchId: "b1" },
];
const stocks = [
  { productId: "p1", branchId: "b1", quantity: 8 },
  { productId: "p2", branchId: "b1", quantity: 0 },
  { productId: "p3", branchId: "b1", quantity: 5 },
  { productId: "p4", branchId: "b1", quantity: 2 },
  { productId: "p2", branchId: "b2", quantity: 20 },
];

test("public catalog shows active branch products with available and unconfirmed stock", () => {
  const result = buildPublicCatalogProducts({
    branch,
    products,
    stocks,
    categories: [{ $id: "c1", name: "Papelería", isActive: true }],
  });
  assert.equal(result.length, 3);
  assert.deepEqual(result[0], {
    id: "p1",
    name: "Cuaderno",
    description: "100 hojas",
    sku: "CB-001",
    price: 15,
    unit: "unit",
    stockAvailable: 8,
    categoryId: "c1",
    categoryName: "Papelería",
    imageUrl: "/api/public/catalog/CBB/products/p1/image?v=image1",
  });
  assert.equal(result[1].id, "p2");
  assert.equal(result[1].stockAvailable, 0);
  assert.equal(result[2].id, "p5");
  assert.equal(result[2].stockAvailable, 0);
  assert.equal("cost" in result[0], false);
  assert.equal("quantity" in result[0], false);
});

test("disabled categories become uncategorized and branch links use stable codes", () => {
  const result = buildPublicCatalogProducts({
    branch,
    products: [{ ...products[0], categoryId: "c2", imageFileId: "" }],
    stocks,
    categories: [{ $id: "c2", name: "Privada", isActive: false }],
  });
  assert.equal(result[0].categoryId, "");
  assert.equal(result[0].categoryName, "Otros");
  assert.equal(result[0].imageUrl, "");
  assert.equal(publicCatalogPath("cbb"), "/catalogo/CBB");
});

test("private product images require an active product owned by the branch, even without stock", () => {
  const activeBranch = { $id: "b1", isActive: true };
  const product = {
    $id: "p1",
    originBranchId: "b1",
    isActive: true,
    imageFileId: "image1",
  };
  assert.equal(isPublicCatalogImageAllowed(activeBranch, product), true);
  assert.equal(
    isPublicCatalogImageAllowed(activeBranch, {
      ...product,
      originBranchId: "b2",
    }),
    false,
  );
  assert.equal(
    isPublicCatalogImageAllowed(activeBranch, { ...product, isActive: false }),
    false,
  );
  assert.equal(
    isPublicCatalogImageAllowed({ ...activeBranch, isActive: false }, product),
    false,
  );
  assert.equal(
    isPublicCatalogImageAllowed(activeBranch, { ...product, imageFileId: "" }),
    false,
  );
});

test("catalog pages contain at most 20 products and preserve search and sort", () => {
  const many = Array.from({ length: 45 }, (_, index) => ({
    id: `p${index}`,
    name: `Artículo ${String(index).padStart(2, "0")}`,
    description: "",
    sku: `SKU${index}`,
    price: index,
    categoryId: index < 25 ? "c1" : "c2",
  }));
  const first = paginatePublicCatalogProducts(many);
  const second = paginatePublicCatalogProducts(many, { page: 2 });
  const third = paginatePublicCatalogProducts(many, { page: 3 });
  assert.equal(first.products.length, 20);
  assert.equal("description" in first.products[0], false);
  assert.equal(second.products.length, 20);
  assert.equal(third.products.length, 5);
  assert.equal(third.hasMore, false);
  assert.equal(
    new Set(
      [...first.products, ...second.products, ...third.products].map(
        (item) => item.id,
      ),
    ).size,
    45,
  );
  const filtered = paginatePublicCatalogProducts(many, {
    categoryId: "c1",
    search: "artículo",
    sort: "priceDesc",
  });
  assert.equal(filtered.total, 25);
  assert.equal(filtered.products[0].price, 24);
});

test("product photos are compressed to small WebP and scoped to authorized branches", async () => {
  const png = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const webp = await compressProductImage({
    type: "image/png",
    size: png.length,
    arrayBuffer: async () => png,
  });
  const metadata = await sharp(webp).metadata();
  assert.equal(metadata.format, "webp");
  assert.ok(metadata.width <= 900);
  assert.ok(webp.length <= 220 * 1024);
  const cashier = {
    isAdmin: false,
    canManageCatalog: false,
    canCreateProducts: true,
    allowedBranchIds: ["b1"],
  };
  assert.equal(canEditProductImage(cashier, { originBranchId: "b1" }), true);
  assert.equal(canEditProductImage(cashier, { originBranchId: "b2" }), false);
  assert.equal(
    canEditProductImage(
      { ...cashier, canCreateProducts: false },
      { originBranchId: "b1" },
    ),
    false,
  );
});
