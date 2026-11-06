"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Edit3,
  History,
  PackagePlus,
  ImagePlus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

const emptyForm = {
  id: "",
  name: "",
  description: "",
  sku: "",
  originBranchId: "",
  barcode: "",
  categoryId: "",
  price: "",
  cost: "",
  unit: "unit",
  imageFileId: "",
  isActive: true,
  stockByBranch: {},
};

function isSkuBranch(branch) {
  return ["CBB", "SCZ", "LPZ"].includes(
    String(branch.code || "").toUpperCase(),
  );
}

function inferOriginBranchId(product, branches) {
  if (product.originBranchId) {
    return product.originBranchId;
  }

  const prefix = String(product.sku || "")
    .slice(0, 2)
    .toUpperCase();
  return (
    branches.find(
      (branch) =>
        isSkuBranch(branch) &&
        { CBB: "CB", SCZ: "SC", LPZ: "LP" }[
          String(branch.code || "").toUpperCase()
        ] === prefix,
    )?.id || ""
  );
}

function money(value) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
  }).format(value || 0);
}

function dateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function movementTypeLabel(type) {
  if (type === "in") return "Entrada";
  if (type === "out") return "Salida";
  if (type === "transfer") return "Transferencia";
  return "Ajuste";
}

function toForm(product, branches) {
  const originBranchId = inferOriginBranchId(product, branches);
  const stock = product.stockByBranch?.[originBranchId] || {};
  const stockByBranch = originBranchId
    ? {
        [originBranchId]: {
          quantity: stock.quantity || 0,
          minStock: stock.minStock || 0,
        },
      }
    : {};

  return {
    ...emptyForm,
    ...product,
    originBranchId,
    price: String(product.price ?? ""),
    cost: String(product.cost ?? ""),
    stockByBranch,
  };
}

function createEmptyForm(branches) {
  const originBranchId = branches.find(isSkuBranch)?.id || "";

  return {
    ...emptyForm,
    originBranchId,
    stockByBranch: originBranchId
      ? {
          [originBranchId]: {
            quantity: 0,
            minStock: 0,
          },
        }
      : {},
  };
}

export default function ProductsManagerClient({
  branches,
  initialProducts,
  initialStockMovements = [],
  initialCategories = [],
  allowedBranchIds = [],
  canManage,
  canCreateProducts,
  canIncreaseInventory,
  inventoryBranchIds = [],
  isAdmin,
}) {
  const canCreateProduct = canManage || canCreateProducts;
  const skuBranches = useMemo(() => branches.filter(isSkuBranch), [branches]);
  const [products, setProducts] = useState(initialProducts);
  const [categories, setCategories] = useState(initialCategories);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [photoProduct, setPhotoProduct] = useState(null);
  const [stockMovements, setStockMovements] = useState(initialStockMovements);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState(() => createEmptyForm(branches));
  const [inventoryForm, setInventoryForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive),
    [products],
  );
  const inventoryBranches = useMemo(() => {
    if (canManage) {
      return branches;
    }

    const allowed = new Set(inventoryBranchIds);
    return branches.filter((branch) => allowed.has(branch.id));
  }, [branches, canManage, inventoryBranchIds]);
  const canUploadStock = canIncreaseInventory && inventoryBranches.length > 0;
  const canUploadPhoto = (product) =>
    (canManage || canCreateProducts) &&
    (canManage || allowedBranchIds.includes(product.originBranchId));

  async function uploadPhoto(file) {
    if (!photoProduct || !file) return;
    setIsSaving(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("image", file);
      const response = await fetch(
        `/api/pos/manage/products/${photoProduct.id}/image`,
        { method: "POST", body: formData, credentials: "same-origin" },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.message || "No se pudo subir la foto.");
      await refreshProducts(searchTerm);
      setPhotoProduct(null);
      setMessage("Foto convertida a WebP y guardada.");
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCategory(event) {
    event.preventDefault();
    if (!canManage) return;
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(
        editingCategoryId
          ? `/api/pos/manage/categories/${editingCategoryId}`
          : "/api/pos/manage/categories",
        {
          method: editingCategoryId ? "PATCH" : "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: categoryName, isActive: true }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.message || "No se pudo guardar la categoría.");
      const refreshed = await fetch("/api/pos/manage/categories", {
        credentials: "same-origin",
      });
      setCategories((await refreshed.json()).categories);
      setCategoryName("");
      setEditingCategoryId("");
      setMessage("Categoría guardada.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivateCategory(category) {
    if (
      !canManage ||
      !window.confirm(`¿Desactivar la categoría ${category.name}?`)
    )
      return;
    const response = await fetch(`/api/pos/manage/categories/${category.id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: category.name, isActive: false }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.message || "No se pudo desactivar la categoría.");
      return;
    }
    setCategories((current) =>
      current.map((item) =>
        item.id === category.id ? payload.category : item,
      ),
    );
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      refreshProducts(searchTerm);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  async function refreshProducts(search = "") {
    const params = new URLSearchParams({ search });
    const response = await fetch(`/api/pos/manage/products?${params}`, {
      credentials: "same-origin",
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.message || "No se pudieron cargar productos.");
      return;
    }

    setProducts(payload.products);
  }

  async function refreshStockMovements() {
    if (!isAdmin) {
      return;
    }

    const response = await fetch("/api/pos/manage/inventory-movements", {
      credentials: "same-origin",
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.message || "No se pudieron cargar movimientos.");
      return;
    }

    setStockMovements(payload.movements);
  }

  function resetForm() {
    setForm(createEmptyForm(branches));
    setMessage("");
    setError("");
  }

  function editProduct(product) {
    setForm(toForm(product, branches));
    setMessage("");
    setError("");
  }

  function openInventoryForm(product) {
    const productBranch = inventoryBranches.find(
      (branch) => branch.id === product.originBranchId,
    );

    if (!productBranch) {
      setError(
        "Este producto solo puede recibir inventario en su sucursal de origen, que no está habilitada para tu usuario.",
      );
      return;
    }

    setInventoryForm({
      product,
      branchId: productBranch.id,
      quantity: "",
      reason: "",
    });
    setMessage("");
    setError("");
  }

  function updateInventoryField(field, value) {
    setInventoryForm((current) =>
      current
        ? {
            ...current,
            [field]: value,
          }
        : current,
    );
  }

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateOriginBranch(branchId) {
    setForm((current) => ({
      ...current,
      originBranchId: branchId,
      stockByBranch: {
        [branchId]: current.stockByBranch[branchId] || {
          quantity: 0,
          minStock: 0,
        },
      },
    }));
  }

  function updateStock(branchId, field, value) {
    setForm((current) => ({
      ...current,
      stockByBranch: {
        ...current.stockByBranch,
        [branchId]: {
          ...(current.stockByBranch[branchId] || {}),
          [field]: value,
        },
      },
    }));
  }

  async function saveProduct(event) {
    event.preventDefault();

    if (!canCreateProduct || (!canManage && form.id)) {
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        form.id
          ? `/api/pos/manage/products/${form.id}`
          : "/api/pos/manage/products",
        {
          method: form.id ? "PATCH" : "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo guardar el producto.");
      }

      await refreshProducts(searchTerm);
      resetForm();
      setMessage("Producto guardado.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteProduct(productId) {
    if (!canManage) {
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/pos/manage/products/${productId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo desactivar.");
      }

      await refreshProducts(searchTerm);
      if (form.id === productId) {
        resetForm();
      }
      setMessage("Producto desactivado.");
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function saveInventoryIncrease(event) {
    event.preventDefault();

    if (!inventoryForm || !canUploadStock) {
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/pos/inventory/increase", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: inventoryForm.product.id,
          branchId: inventoryForm.branchId,
          quantity: inventoryForm.quantity,
          reason: inventoryForm.reason,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo subir el inventario.");
      }

      await refreshProducts(searchTerm);
      await refreshStockMovements();
      setInventoryForm(null);
      setMessage("Inventario actualizado.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      className={`mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 ${
        canCreateProduct ? "xl:grid-cols-[minmax(0,1fr)_390px]" : ""
      }`}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-neutral-800 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase">
              Catalogo
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Productos
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {canManage || canCreateProducts
                ? `${activeProducts.length} productos activos`
                : `${activeProducts.length} productos disponibles`}
            </p>
          </div>

          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar producto por nombre, SKU o codigo"
              className="h-12 w-full rounded-md border border-neutral-800 bg-neutral-900 px-10 pr-11 text-sm text-neutral-100 transition outline-none placeholder:text-neutral-600 focus:border-neutral-300"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
                aria-label="Limpiar busqueda"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        {message ? (
          <div className="rounded-md border border-emerald-900 bg-emerald-950 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              <div className="grid grid-cols-[minmax(260px,1fr)_130px_120px_120px_120px] border-b border-neutral-800 bg-neutral-950 px-4 py-3 text-xs font-medium text-neutral-500 uppercase">
                <span>Producto</span>
                <span>SKU</span>
                <span>Precio</span>
                <span>Stock</span>
                <span className="text-right">Acciones</span>
              </div>

              <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
                {products.map((product) => {
                  const stockBranches = canManage
                    ? branches
                    : inventoryBranches;
                  const stockTotal = stockBranches.reduce(
                    (total, branch) =>
                      total + (product.stockByBranch[branch.id]?.quantity || 0),
                    0,
                  );

                  return (
                    <div
                      key={product.id}
                      className="grid grid-cols-[minmax(260px,1fr)_130px_120px_120px_120px] items-center border-b border-neutral-800 px-4 py-3 text-sm last:border-b-0 hover:bg-neutral-800/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-100">
                          {product.name}
                        </p>
                        <p className="mt-1 truncate text-xs text-neutral-500">
                          {product.barcode || "Sin codigo"}
                        </p>
                      </div>
                      <span className="font-medium text-neutral-300">
                        {product.sku}
                      </span>
                      <span className="font-semibold">
                        {money(product.price)}
                      </span>
                      <span className="text-neutral-300">{stockTotal}</span>
                      <div className="flex justify-end gap-2">
                        {canUploadPhoto(product) ? (
                          <button
                            type="button"
                            onClick={() => setPhotoProduct(product)}
                            className="grid size-9 place-items-center rounded-md border border-neutral-700 text-neutral-300 transition hover:border-emerald-500 hover:text-emerald-200"
                            title="Subir foto"
                            aria-label={`Subir foto de ${product.name}`}
                          >
                            <Camera className="size-4" />
                          </button>
                        ) : null}
                        {canUploadStock ? (
                          <button
                            type="button"
                            onClick={() => openInventoryForm(product)}
                            className="grid size-9 place-items-center rounded-md border border-neutral-700 text-neutral-300 transition hover:border-emerald-500 hover:text-emerald-200"
                            title="Subir stock"
                          >
                            <Plus className="size-4" />
                          </button>
                        ) : null}
                        {canManage ? (
                          <>
                            <button
                              type="button"
                              onClick={() => editProduct(product)}
                              className="grid size-9 place-items-center rounded-md border border-neutral-700 text-neutral-300 transition hover:border-neutral-300 hover:text-neutral-100"
                              title="Editar"
                            >
                              <Edit3 className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteProduct(product.id)}
                              className="grid size-9 place-items-center rounded-md border border-neutral-700 text-neutral-300 transition hover:border-red-500 hover:text-red-200"
                              title="Desactivar"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                {products.length === 0 ? (
                  <div className="px-4 py-12 text-center text-sm text-neutral-500">
                    No hay productos para mostrar.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {canManage ? (
          <div className="rounded-md border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="text-lg font-semibold">Categorías</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Organiza los productos que se muestran en el catálogo.
            </p>
            <form onSubmit={saveCategory} className="mt-4 flex flex-wrap gap-2">
              <input
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                maxLength={80}
                required
                placeholder="Nombre de la categoría"
                className="h-10 min-w-48 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm"
              />
              <button
                disabled={isSaving}
                className="rounded-md bg-neutral-100 px-4 text-sm font-semibold text-neutral-950"
              >
                {editingCategoryId ? "Actualizar" : "Agregar"}
              </button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {categories
                .filter((category) => category.isActive)
                .map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center gap-1 rounded-full border border-neutral-700 px-3 py-1 text-sm"
                  >
                    <span>{category.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategoryId(category.id);
                        setCategoryName(category.name);
                      }}
                      aria-label={`Editar ${category.name}`}
                      className="p-1 text-neutral-400"
                    >
                      <Edit3 className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deactivateCategory(category)}
                      aria-label={`Desactivar ${category.name}`}
                      className="p-1 text-neutral-400"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        {isAdmin ? (
          <div className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
            <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-4 py-3">
              <History className="size-4 text-neutral-400" />
              <h2 className="text-sm font-semibold text-neutral-100">
                Movimientos recientes de inventario
              </h2>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[920px]">
                <div className="grid grid-cols-[140px_minmax(220px,1fr)_160px_100px_100px_100px_160px] border-b border-neutral-800 px-4 py-3 text-xs font-medium text-neutral-500 uppercase">
                  <span>Fecha</span>
                  <span>Producto</span>
                  <span>Sucursal</span>
                  <span>Tipo</span>
                  <span>Cantidad</span>
                  <span>Nuevo</span>
                  <span>Usuario</span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {stockMovements.map((movement) => (
                    <div
                      key={movement.id}
                      className="grid grid-cols-[140px_minmax(220px,1fr)_160px_100px_100px_100px_160px] items-center border-b border-neutral-800 px-4 py-3 text-sm last:border-b-0"
                    >
                      <span className="text-xs text-neutral-500">
                        {dateTime(movement.createdAt)}
                      </span>
                      <span className="truncate text-neutral-200">
                        {movement.productName}
                      </span>
                      <span className="truncate text-neutral-300">
                        {movement.branchName}
                      </span>
                      <span className="text-neutral-300">
                        {movementTypeLabel(movement.type)}
                      </span>
                      <span className="font-medium text-neutral-100">
                        {movement.quantity}
                      </span>
                      <span className="text-neutral-300">
                        {movement.newQty}
                      </span>
                      <span className="truncate text-neutral-300">
                        {movement.userName}
                      </span>
                    </div>
                  ))}

                  {stockMovements.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-neutral-500">
                      No hay movimientos de inventario para mostrar.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {canCreateProduct ? (
        <form
          onSubmit={saveProduct}
          className="h-fit rounded-md border border-neutral-800 bg-neutral-900 p-4"
        >
          <div className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-4">
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase">
                {form.id ? "Edicion" : "Nuevo"}
              </p>
              <h2 className="mt-1 text-lg font-semibold">Producto</h2>
            </div>
            {canCreateProduct ? (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-neutral-300 transition hover:border-neutral-300 hover:text-neutral-100"
              >
                <PackagePlus className="size-4" />
                Nuevo
              </button>
            ) : null}
          </div>

          {!canManage ? (
            <p className="mt-4 rounded-md border border-yellow-900 bg-yellow-950 px-3 py-2 text-sm text-yellow-100">
              Tu usuario puede crear productos, pero no modificarlos ni
              asignarles stock.
            </p>
          ) : null}

          <div className="mt-4 grid gap-3">
            <label className="text-xs font-medium text-neutral-400">
              Sucursal de origen
              <select
                value={form.originBranchId}
                onChange={(event) => updateOriginBranch(event.target.value)}
                disabled={!canCreateProduct || Boolean(form.id)}
                required
                className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
              >
                <option value="" disabled>
                  Selecciona una sucursal física
                </option>
                {skuBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-neutral-400">
              Nombre
              <input
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                disabled={!canCreateProduct}
                className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-neutral-400">
                SKU automático
                <input
                  value={form.sku}
                  readOnly
                  placeholder="Se genera al guardar"
                  className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-500 transition outline-none"
                />
              </label>
              <label className="text-xs font-medium text-neutral-400">
                Codigo
                <input
                  value={form.barcode}
                  onChange={(event) =>
                    updateField("barcode", event.target.value)
                  }
                  disabled={!canCreateProduct}
                  className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                />
              </label>
            </div>

            <label className="text-xs font-medium text-neutral-400">
              Descripcion
              <textarea
                value={form.description}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                disabled={!canCreateProduct}
                rows={3}
                className="mt-1 w-full resize-none rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
              />
            </label>

            <label className="text-xs font-medium text-neutral-400">
              Categoría
              <select
                value={form.categoryId}
                onChange={(event) =>
                  updateField("categoryId", event.target.value)
                }
                disabled={!canCreateProduct || (!canManage && Boolean(form.id))}
                className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
              >
                <option value="">Sin categoría</option>
                {categories
                  .filter((category) => category.isActive)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-neutral-400">
                Precio
                <input
                  value={form.price}
                  onChange={(event) => updateField("price", event.target.value)}
                  disabled={!canCreateProduct}
                  type="number"
                  min="0"
                  step="0.01"
                  className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                />
              </label>
              <label className="text-xs font-medium text-neutral-400">
                Costo
                <input
                  value={form.cost}
                  onChange={(event) => updateField("cost", event.target.value)}
                  disabled={!canCreateProduct}
                  type="number"
                  min="0"
                  step="0.01"
                  className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                />
              </label>
              <label className="text-xs font-medium text-neutral-400">
                Unidad
                <select
                  value={form.unit}
                  onChange={(event) => updateField("unit", event.target.value)}
                  disabled={!canCreateProduct}
                  className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                >
                  <option value="unit">Unidad</option>
                  <option value="kg">Kg</option>
                  <option value="liter">Litro</option>
                  <option value="meter">Metro</option>
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                checked={form.isActive}
                onChange={(event) =>
                  updateField("isActive", event.target.checked)
                }
                disabled={!canCreateProduct}
                type="checkbox"
                className="size-4 accent-neutral-100"
              />
              Producto activo
            </label>
          </div>

          {canManage ? (
            <div className="mt-5 border-t border-neutral-800 pt-4">
              <p className="text-xs font-medium text-neutral-500 uppercase">
                Stock por sucursal
              </p>
              <div className="mt-3 space-y-2">
                {skuBranches
                  .filter((branch) => branch.id === form.originBranchId)
                  .map((branch) => (
                    <div
                      key={branch.id}
                      className="grid grid-cols-[1fr_90px_90px] items-center gap-2"
                    >
                      <span className="truncate text-sm text-neutral-300">
                        {branch.name}
                      </span>
                      <input
                        value={form.stockByBranch[branch.id]?.quantity ?? 0}
                        onChange={(event) =>
                          updateStock(branch.id, "quantity", event.target.value)
                        }
                        disabled={!canManage}
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                      />
                      <input
                        value={form.stockByBranch[branch.id]?.minStock ?? 0}
                        onChange={(event) =>
                          updateStock(branch.id, "minStock", event.target.value)
                        }
                        disabled={!canManage}
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                      />
                    </div>
                  ))}
              </div>
              <div className="mt-2 grid grid-cols-[1fr_90px_90px] gap-2 text-xs text-neutral-600">
                <span />
                <span>Cantidad</span>
                <span>Minimo</span>
              </div>
            </div>
          ) : null}

          {canCreateProduct ? (
            <button
              type="submit"
              disabled={isSaving}
              className="mt-5 h-12 w-full rounded-md bg-neutral-100 text-sm font-semibold text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
            >
              {isSaving ? "Guardando..." : "Guardar producto"}
            </button>
          ) : null}
        </form>
      ) : null}

      {photoProduct ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 px-4 py-4">
          <div className="w-full max-w-md rounded-md border border-neutral-700 bg-neutral-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-neutral-500 uppercase">
                  Foto de producto
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  {photoProduct.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPhotoProduct(null)}
                aria-label="Cerrar"
                className="p-2 text-neutral-400"
              >
                <X className="size-5" />
              </button>
            </div>
            {photoProduct.imageFileId ? (
              <img
                src={`/api/pos/manage/products/${photoProduct.id}/image?v=${photoProduct.imageFileId}`}
                alt={photoProduct.name}
                className="mt-4 max-h-52 w-full rounded-md object-contain"
              />
            ) : null}
            <p className="mt-4 text-sm text-neutral-400">
              La foto se reduce y se guarda en formato WebP.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md bg-neutral-100 px-3 py-3 text-sm font-semibold text-neutral-950">
                <ImagePlus className="size-4" /> Subir foto
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  className="sr-only"
                  disabled={isSaving}
                  onChange={(event) => uploadPhoto(event.target.files?.[0])}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-neutral-600 px-3 py-3 text-sm font-semibold">
                <Camera className="size-4" /> Sacar foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  disabled={isSaving}
                  onChange={(event) => uploadPhoto(event.target.files?.[0])}
                />
              </label>
            </div>
            {isSaving ? (
              <p className="mt-3 text-sm text-neutral-400">
                Comprimiendo y subiendo…
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {inventoryForm ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 px-4 py-4">
          <form
            onSubmit={saveInventoryIncrease}
            className="w-full max-w-md rounded-md border border-neutral-800 bg-neutral-950 p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-800 pb-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-neutral-500 uppercase">
                  Inventario
                </p>
                <h2 className="mt-1 truncate text-lg font-semibold text-neutral-100">
                  {inventoryForm.product.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInventoryForm(null)}
                className="grid size-9 shrink-0 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-900 hover:text-neutral-100"
                aria-label="Cerrar"
                title="Cerrar"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="text-xs font-medium text-neutral-400">
                Sucursal
                <select
                  value={inventoryForm.branchId}
                  disabled
                  className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                >
                  {inventoryBranches
                    .filter(
                      (branch) =>
                        branch.id === inventoryForm.product.originBranchId,
                    )
                    .map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                </select>
              </label>

              <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">
                Stock actual:{" "}
                <span className="font-semibold text-neutral-100">
                  {inventoryForm.product.stockByBranch[inventoryForm.branchId]
                    ?.quantity || 0}
                </span>
              </div>

              <label className="text-xs font-medium text-neutral-400">
                Cantidad a subir
                <input
                  value={inventoryForm.quantity}
                  onChange={(event) =>
                    updateInventoryField("quantity", event.target.value)
                  }
                  disabled={isSaving}
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                />
              </label>

              <label className="text-xs font-medium text-neutral-400">
                Motivo
                <input
                  value={inventoryForm.reason}
                  onChange={(event) =>
                    updateInventoryField("reason", event.target.value)
                  }
                  disabled={isSaving}
                  maxLength={200}
                  className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="mt-5 h-12 w-full rounded-md bg-neutral-100 text-sm font-semibold text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
            >
              {isSaving ? "Guardando..." : "Subir inventario"}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
