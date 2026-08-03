"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Edit3,
  History,
  PackagePlus,
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
  barcode: "",
  categoryId: "",
  price: "",
  cost: "",
  unit: "unit",
  imageFileId: "",
  isActive: true,
  stockByBranch: {},
};

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
  const stockByBranch = branches.reduce((index, branch) => {
    const stock = product.stockByBranch?.[branch.id] || {};

    return {
      ...index,
      [branch.id]: {
        quantity: stock.quantity || 0,
        minStock: stock.minStock || 0,
      },
    };
  }, {});

  return {
    ...emptyForm,
    ...product,
    price: String(product.price ?? ""),
    cost: String(product.cost ?? ""),
    stockByBranch,
  };
}

function createEmptyForm(branches) {
  return {
    ...emptyForm,
    stockByBranch: branches.reduce(
      (index, branch) => ({
        ...index,
        [branch.id]: {
          quantity: 0,
          minStock: 0,
        },
      }),
      {},
    ),
  };
}

export default function ProductsManagerClient({
  branches,
  initialProducts,
  initialStockMovements = [],
  canManage,
  canIncreaseInventory,
  inventoryBranchIds = [],
  isAdmin,
}) {
  const [products, setProducts] = useState(initialProducts);
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
    const firstBranch = inventoryBranches[0];

    if (!firstBranch) {
      setError("No tienes sucursales habilitadas para subir inventario.");
      return;
    }

    setInventoryForm({
      product,
      branchId: firstBranch.id,
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

    if (!canManage) {
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
        canManage ? "xl:grid-cols-[minmax(0,1fr)_390px]" : ""
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
              {canManage
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

      {canManage ? (
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
            {canManage ? (
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
              Tu usuario solo puede consultar productos.
            </p>
          ) : null}

          <div className="mt-4 grid gap-3">
            <label className="text-xs font-medium text-neutral-400">
              Nombre
              <input
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                disabled={!canManage}
                className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-neutral-400">
                SKU
                <input
                  value={form.sku}
                  onChange={(event) => updateField("sku", event.target.value)}
                  disabled={!canManage}
                  className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                />
              </label>
              <label className="text-xs font-medium text-neutral-400">
                Codigo
                <input
                  value={form.barcode}
                  onChange={(event) =>
                    updateField("barcode", event.target.value)
                  }
                  disabled={!canManage}
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
                disabled={!canManage}
                rows={3}
                className="mt-1 w-full resize-none rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
              />
            </label>

            <div className="grid grid-cols-3 gap-3">
              <label className="text-xs font-medium text-neutral-400">
                Precio
                <input
                  value={form.price}
                  onChange={(event) => updateField("price", event.target.value)}
                  disabled={!canManage}
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
                  disabled={!canManage}
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
                  disabled={!canManage}
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
                disabled={!canManage}
                type="checkbox"
                className="size-4 accent-neutral-100"
              />
              Producto activo
            </label>
          </div>

          <div className="mt-5 border-t border-neutral-800 pt-4">
            <p className="text-xs font-medium text-neutral-500 uppercase">
              Stock por sucursal
            </p>
            <div className="mt-3 space-y-2">
              {branches.map((branch) => (
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

          {canManage ? (
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

      {inventoryForm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4">
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
                  onChange={(event) =>
                    updateInventoryField("branchId", event.target.value)
                  }
                  disabled={inventoryBranches.length <= 1 || isSaving}
                  className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                >
                  {inventoryBranches.map((branch) => (
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
