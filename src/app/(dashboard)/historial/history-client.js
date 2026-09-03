"use client";

import { useState } from "react";
import { History, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import {
  buttonClass,
  inputClass,
  dateTime,
  useAdminReport,
  ReportState,
} from "../report-components";

const actions = {
  "product.create": "Producto creado",
  "product.update": "Producto modificado",
  "product.deactivate": "Producto desactivado",
  "stock.adjust": "Inventario ajustado",
  "stock.increase": "Inventario aumentado",
  "branch.create": "Sucursal creada",
  "branch.update": "Sucursal modificada",
  "branch.deactivate": "Sucursal desactivada",
  "permission.inventory": "Permiso de inventario",
  "permission.products": "Permiso de crear productos",
  "pos.tabs.update": "Pestañas del POS actualizadas",
  "movement.in": "Entrada de inventario",
  "movement.out": "Salida por venta",
  "movement.adjustment": "Ajuste de inventario",
  "movement.transfer": "Transferencia",
};
const fields = {
  name: "Nombre",
  sku: "SKU",
  barcode: "Código de barras",
  description: "Descripción",
  categoryId: "Categoría",
  price: "Precio",
  cost: "Costo",
  unit: "Unidad",
  imageFileId: "Imagen",
  isActive: "Activo",
  quantity: "Existencias",
  minStock: "Stock mínimo",
  maxStock: "Stock máximo",
  reason: "Motivo",
  code: "Código",
  address: "Dirección",
  city: "Ciudad",
  phone: "Teléfono",
  canIncreaseInventory: "Puede subir inventario",
  canCreateProducts: "Puede crear productos",
  allowedBranchIds: "Sucursales habilitadas",
  products: "Productos",
  monthly: "Mensualidades",
  custom: "Cobro personalizado",
  links: "Cobro por enlace",
  daily: "Ventas del día",
};

function displayValue(value, field, options) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (field === "allowedBranchIds" && Array.isArray(value))
    return (
      value
        .map(
          (id) =>
            options.branches.find((branch) => branch.id === id)?.name || id,
        )
        .join(", ") || "Ninguna"
    );
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export default function HistoryClient({ options, initialFilters }) {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const { data, loading, error, refresh } = useAdminReport(
    "/api/pos/admin/history",
    filters,
  );
  const setField = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  function selectSource(source) {
    const next = { ...draft, source, entityType: "", page: 1 };
    setDraft(next);
    setFilters(next);
  }

  return (
    <section className="mx-auto w-full max-w-[1500px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-violet-300">ADMINISTRACIÓN</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
            <History className="size-6" />
            Historial de cambios
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Quién realizó cada cambio y cuáles fueron los valores anteriores y
            nuevos.
          </p>
        </div>
        <button
          type="button"
          className={buttonClass}
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </header>
      <div className="flex flex-wrap gap-2" aria-label="Tipo de historial">
        {[
          ["changes", "Cambios y permisos"],
          ["inventory", "Movimientos de inventario"],
        ].map(([source, label]) => (
          <button
            key={source}
            type="button"
            aria-pressed={filters.source === source}
            className={`${buttonClass} ${filters.source === source ? "border-violet-400 bg-violet-400 text-neutral-950" : ""}`}
            onClick={() => selectSource(source)}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...draft, page: 1 });
        }}
        className="grid items-end gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3 sm:grid-cols-2 xl:grid-cols-6"
      >
        <label className="text-xs text-neutral-400">
          Desde
          <input
            type="date"
            required
            className={inputClass}
            value={draft.dateFrom}
            onChange={(event) => setField("dateFrom", event.target.value)}
          />
        </label>
        <label className="text-xs text-neutral-400">
          Hasta
          <input
            type="date"
            required
            min={draft.dateFrom}
            className={inputClass}
            value={draft.dateTo}
            onChange={(event) => setField("dateTo", event.target.value)}
          />
        </label>
        <label className="text-xs text-neutral-400">
          Sucursal
          <select
            className={inputClass}
            value={draft.branchId}
            onChange={(event) => setField("branchId", event.target.value)}
          >
            <option value="">Todas / catálogo global</option>
            {options.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
                {branch.isActive ? "" : " (inactiva)"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-400">
          Usuario
          <select
            className={inputClass}
            value={draft.actorId}
            onChange={(event) => setField("actorId", event.target.value)}
          >
            <option value="">Todos los usuarios</option>
            {options.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
                {user.isActive ? "" : " (inactivo)"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-400">
          Tipo de cambio
          <select
            className={inputClass}
            disabled={filters.source === "inventory"}
            value={draft.entityType}
            onChange={(event) => setField("entityType", event.target.value)}
          >
            <option value="">Todos</option>
            <option value="product">Productos</option>
            <option value="stock">Inventario</option>
            <option value="branch">Sucursales</option>
            <option value="permission">Permisos</option>
            <option value="pos_settings">Pestañas del POS</option>
          </select>
        </label>
        <button
          className={`${buttonClass} bg-neutral-100 text-neutral-950`}
          disabled={loading}
        >
          Aplicar filtros
        </button>
      </form>
      <p className="text-xs text-neutral-400">
        {filters.source === "changes"
          ? "El historial de cambios comienza con la activación de esta función. Los cambios del catálogo global se muestran al seleccionar Todas."
          : "Incluye las entradas, salidas por venta y ajustes que el sistema ya registraba."}
      </p>
      <ReportState loading={loading} error={error} />
      {data ? (
        <>
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <p>
              {data.total} {data.total === 1 ? "registro" : "registros"}
            </p>
            <p>
              Página {data.page} de {data.pages}
            </p>
          </div>
          {!data.events.length ? (
            <p className="rounded-lg border border-dashed border-neutral-700 p-12 text-center text-sm text-neutral-400">
              No hay registros con estos filtros.
            </p>
          ) : (
            <div className="space-y-2">
              {data.events.map((event) => (
                <details
                  key={event.id}
                  className="group rounded-lg border border-neutral-800 bg-neutral-900"
                >
                  <summary className="cursor-pointer rounded-lg px-4 py-3 marker:text-violet-300 focus-visible:outline focus-visible:outline-violet-400">
                    <span className="ml-2 inline-flex w-[calc(100%-28px)] flex-wrap items-center justify-between gap-3 align-middle">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {event.entityName}
                        </span>
                        <span className="mt-1 block text-xs text-neutral-400">
                          {actions[event.action] || event.action} ·{" "}
                          {event.actorName} ·{" "}
                          {event.branchName ||
                            (event.entityType === "permission"
                              ? "Permisos de usuario"
                              : event.entityType === "pos_settings"
                                ? "Configuración global del POS"
                                : "Catálogo global")}
                        </span>
                      </span>
                      <span className="text-right text-xs">
                        <span className="block text-neutral-400">
                          {dateTime(event.createdAt)}
                        </span>
                        <span
                          className={`mt-1 block ${event.status === "completed" ? "text-emerald-300" : event.status === "pending" ? "text-amber-300" : "text-red-300"}`}
                        >
                          {event.status === "completed"
                            ? `${event.changes.length} ${event.changes.length === 1 ? "cambio" : "cambios"}`
                            : event.status === "pending"
                              ? "Resultado por verificar"
                              : "Operación incompleta"}
                        </span>
                      </span>
                    </span>
                  </summary>
                  <div className="border-t border-neutral-800 p-3">
                    {event.status !== "completed" ? (
                      <p className="mb-3 text-xs text-amber-200">
                        Revisa el estado actual del registro: la operación pudo
                        aplicar cambios parcialmente.
                      </p>
                    ) : null}
                    {event.reason ? (
                      <p className="mb-3 text-sm text-neutral-300">
                        {event.reason}
                      </p>
                    ) : null}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px] text-left text-sm">
                        <thead className="text-xs text-neutral-500">
                          <tr>
                            <th className="px-2 pb-2 font-medium">Campo</th>
                            <th className="px-2 pb-2 font-medium">Antes</th>
                            <th className="px-2 pb-2 font-medium">Después</th>
                          </tr>
                        </thead>
                        <tbody>
                          {event.changes.map((change) => (
                            <tr
                              key={change.field}
                              className="border-t border-neutral-800"
                            >
                              <td className="w-1/4 px-2 py-2 text-neutral-400">
                                {fields[change.field] || change.field}
                              </td>
                              <td className="max-w-sm px-2 py-2 break-words whitespace-pre-wrap text-neutral-300">
                                {displayValue(
                                  change.before,
                                  change.field,
                                  options,
                                )}
                              </td>
                              <td className="max-w-sm px-2 py-2 break-words whitespace-pre-wrap text-neutral-100">
                                {displayValue(
                                  change.after,
                                  change.field,
                                  options,
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              className={buttonClass}
              disabled={data.page <= 1}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page - 1,
                }))
              }
            >
              <ChevronLeft className="size-4" />
              Anterior
            </button>
            <button
              className={buttonClass}
              disabled={data.page >= data.pages}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page + 1,
                }))
              }
            >
              Siguiente
              <ChevronRight className="size-4" />
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
