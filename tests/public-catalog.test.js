import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPublicCatalogProducts,
  isPublicCatalogImageAllowed,
  publicCatalogPath,
} from "../src/lib/pos/public-catalog-core.js";

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
];
const stocks = [
  { productId: "p1", branchId: "b1", quantity: 8 },
  { productId: "p2", branchId: "b1", quantity: 0 },
  { productId: "p3", branchId: "b1", quantity: 5 },
  { productId: "p4", branchId: "b1", quantity: 2 },
  { productId: "p2", branchId: "b2", quantity: 20 },
];

test("public catalog shows only active, available products from the branch of origin", () => {
  const result = buildPublicCatalogProducts({
    branch,
    products,
    stocks,
    categories: [{ $id: "c1", name: "Papelería", isActive: true }],
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    id: "p1",
    name: "Cuaderno",
    description: "100 hojas",
    sku: "CB-001",
    price: 15,
    unit: "unit",
    categoryId: "c1",
    categoryName: "Papelería",
    imageUrl: "/api/public/catalog/CBB/products/p1/image",
  });
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

test("private product images require an active matching branch, product and positive stock", () => {
  const activeBranch = { $id: "b1", isActive: true };
  const product = {
    $id: "p1",
    originBranchId: "b1",
    isActive: true,
    imageFileId: "image1",
  };
  const stock = { productId: "p1", branchId: "b1", quantity: 2 };
  assert.equal(isPublicCatalogImageAllowed(activeBranch, product, stock), true);
  assert.equal(
    isPublicCatalogImageAllowed(activeBranch, product, {
      ...stock,
      quantity: 0,
    }),
    false,
  );
  assert.equal(
    isPublicCatalogImageAllowed(
      activeBranch,
      { ...product, originBranchId: "b2" },
      stock,
    ),
    false,
  );
  assert.equal(
    isPublicCatalogImageAllowed(
      activeBranch,
      { ...product, isActive: false },
      stock,
    ),
    false,
  );
  assert.equal(
    isPublicCatalogImageAllowed(
      { ...activeBranch, isActive: false },
      product,
      stock,
    ),
    false,
  );
  assert.equal(
    isPublicCatalogImageAllowed(activeBranch, product, {
      ...stock,
      productId: "p2",
    }),
    false,
  );
});
