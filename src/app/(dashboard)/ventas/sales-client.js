"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  QrCode,
  ReceiptText,
  Search,
  X,
} from "lucide-react";

const paymentLabels = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
};

const statusLabels = {
  completed: "Completada",
  cancelled: "Anulada",
  refunded: "Devuelta",
};

const paymentIcons = {
  cash: Banknote,
  qr: QrCode,
  card: CreditCard,
};

function money(value) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
  }).format(value || 0);
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getItemCount(items = []) {
  return items.reduce((total, item) => total + (Number(item.quantity) || 0), 0);
}

function isCustomItem(item) {
  return item.productSku === "CUSTOM" || item.productId?.startsWith("custom-");
}

function buildParams(filters) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== "" && value !== null && typeof value !== "undefined") {
      params.set(key, String(value));
    }
  }

  return params;
}

export default function SalesClient({
  canCancel,
  options,
  initialData,
  initialFilters,
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [sales, setSales] = useState(initialData.sales);
  const [summary, setSummary] = useState(initialData.summary);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedSale, setSelectedSale] = useState(null);

  const totalPages = useMemo(
    () => Math.max(Math.ceil(total / Number(filters.pageSize || 25)), 1),
    [filters.pageSize, total],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      refreshSales(filters);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [filters]);

  async function refreshSales(nextFilters = filters) {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/pos/sales?${buildParams(nextFilters)}`,
        {
          credentials: "same-origin",
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudieron cargar ventas.");
      }

      setSales(payload.sales);
      setSelectedSale((current) =>
        current
          ? payload.sales.find((sale) => sale.id === current.id) || current
          : null,
      );
      setSummary(payload.summary);
      setTotal(payload.total);
      setPage(payload.page);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  function updateFilter(field, value) {
    setMessage("");
    setFilters((current) => ({
      ...current,
      [field]: value,
      page: 1,
    }));
  }

  function movePage(direction) {
    setFilters((current) => {
      const nextPage = Math.min(
        Math.max(Number(current.page || 1) + direction, 1),
        totalPages,
      );

      return {
        ...current,
        page: nextPage,
      };
    });
  }

  async function cancelSale(sale) {
    const reason = window.prompt(
      `Motivo para anular la orden ${sale.saleNumber}`,
      "Anulacion administrativa",
    );

    if (reason === null) {
      return;
    }

    setIsLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/pos/sales/${sale.id}/cancel`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo anular la venta.");
      }

      await refreshSales(filters);
      setMessage(
        `Orden ${payload.sale.saleNumber} anulada y stock restablecido.`,
      );
    } catch (cancelError) {
      setError(cancelError.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-3 border-b border-neutral-800 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium text-neutral-500 uppercase">
            Reporte diario
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Del {filters.dateFrom} al {filters.dateTo}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">
          <ReceiptText className="size-4 text-neutral-500" />
          {total} registros
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs font-medium text-neutral-500 uppercase">
            Total vendido
          </p>
          <p className="mt-2 text-2xl font-semibold">{money(summary.total)}</p>
        </div>
        <div className="rounded-md border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs font-medium text-neutral-500 uppercase">
            Ventas
          </p>
          <p className="mt-2 text-2xl font-semibold">{summary.count}</p>
        </div>
        <div className="rounded-md border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs font-medium text-neutral-500 uppercase">
            Ticket promedio
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {money(summary.averageTicket)}
          </p>
        </div>
        <div className="rounded-md border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs font-medium text-neutral-500 uppercase">
            Anuladas
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {summary.cancelledCount}
          </p>
        </div>
      </div>

      <div className="grid gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-4 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_1.4fr]">
        <label className="text-xs font-medium text-neutral-400">
          Desde
          <input
            value={filters.dateFrom}
            onChange={(event) => updateFilter("dateFrom", event.target.value)}
            type="date"
            className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300"
          />
        </label>

        <label className="text-xs font-medium text-neutral-400">
          Hasta
          <input
            value={filters.dateTo}
            onChange={(event) => updateFilter("dateTo", event.target.value)}
            type="date"
            className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300"
          />
        </label>

        <label className="text-xs font-medium text-neutral-400">
          Sucursal
          <select
            value={filters.branchId}
            onChange={(event) => updateFilter("branchId", event.target.value)}
            className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300"
          >
            <option value="">Todas</option>
            {options.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-neutral-400">
          Pago
          <select
            value={filters.paymentType}
            onChange={(event) =>
              updateFilter("paymentType", event.target.value)
            }
            className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300"
          >
            <option value="">Todos</option>
            <option value="cash">Efectivo</option>
            <option value="qr">QR</option>
            <option value="card">Tarjeta</option>
          </select>
        </label>

        <label className="text-xs font-medium text-neutral-400">
          Cajero
          <select
            value={filters.cashierId}
            onChange={(event) => updateFilter("cashierId", event.target.value)}
            className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300"
          >
            <option value="">Todos</option>
            {options.cashiers.map((cashier) => (
              <option key={cashier.id} value={cashier.id}>
                {cashier.name}
              </option>
            ))}
          </select>
        </label>

        <div className="relative self-end">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" />
          <input
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Buscar orden, cajero o sucursal"
            className="h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-10 pr-11 text-sm text-neutral-100 transition outline-none placeholder:text-neutral-600 focus:border-neutral-300"
          />
          {filters.search ? (
            <button
              type="button"
              onClick={() => updateFilter("search", "")}
              className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
              aria-label="Limpiar busqueda"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {Object.entries(summary.paymentTotals).map(([type, value]) => {
          const Icon = paymentIcons[type] || CreditCard;

          return (
            <div
              key={type}
              className="flex items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-4"
            >
              <div className="grid size-10 place-items-center rounded-md border border-neutral-800 bg-neutral-950 text-neutral-300">
                <Icon className="size-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-500 uppercase">
                  {paymentLabels[type]}
                </p>
                <p className="mt-1 text-lg font-semibold">{money(value)}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs font-medium text-neutral-500 uppercase">
            Origen: POS directo
          </p>
          <p className="mt-1 text-lg font-semibold">
            {money(summary.channelTotals?.pos)}
          </p>
        </div>
        <div className="rounded-md border border-amber-900 bg-amber-950/25 p-4">
          <p className="text-xs font-medium text-amber-300 uppercase">
            Origen: enlace de pago
          </p>
          <p className="mt-1 text-lg font-semibold">
            {money(summary.channelTotals?.paymentLink)}
          </p>
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
          <div className="min-w-[1450px]">
            <div className="grid grid-cols-[150px_150px_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_130px_minmax(190px,1fr)_120px_120px_210px] border-b border-neutral-800 bg-neutral-950 px-4 py-3 text-xs font-medium text-neutral-500 uppercase">
              <span>Orden</span>
              <span>Fecha</span>
              <span>Sucursal</span>
              <span>Cajero</span>
              <span>Pagador</span>
              <span>Pago</span>
              <span>Origen</span>
              <span>Total</span>
              <span>Estado</span>
              <span className="text-right">Acciones</span>
            </div>

            <div className="max-h-[calc(100vh-430px)] min-h-80 overflow-y-auto">
              {sales.map((sale) => (
                <div
                  key={sale.id}
                  className="grid grid-cols-[150px_150px_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_130px_minmax(190px,1fr)_120px_120px_210px] items-center border-b border-neutral-800 px-4 py-3 text-sm last:border-b-0 hover:bg-neutral-800/50"
                >
                  <span className="font-medium text-neutral-100">
                    {sale.saleNumber}
                  </span>
                  <span className="text-neutral-300">
                    {formatDateTime(sale.completedAt)}
                  </span>
                  <span className="truncate text-neutral-300">
                    {sale.branchName}
                  </span>
                  <span className="truncate text-neutral-300">
                    {sale.cashierName}
                  </span>
                  <span className="truncate text-neutral-300">
                    {sale.senderName || "-"}
                  </span>
                  <span className="text-neutral-300">
                    {sale.paymentMethodLabel}
                  </span>
                  <span className="truncate text-xs font-medium text-amber-300">
                    {sale.origin?.label || "POS directo"}
                  </span>
                  <span className="font-semibold">{money(sale.total)}</span>
                  <span
                    className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${
                      sale.status === "completed"
                        ? "border-emerald-900 bg-emerald-950 text-emerald-200"
                        : "border-red-900 bg-red-950 text-red-200"
                    }`}
                  >
                    {statusLabels[sale.status] || sale.status}
                  </span>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSale(sale)}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-neutral-300 transition hover:border-neutral-400 hover:text-white"
                    >
                      <Eye className="size-4" />
                      Detalle
                    </button>
                    {canCancel && sale.status === "completed" ? (
                      <button
                        type="button"
                        onClick={() => cancelSale(sale)}
                        disabled={isLoading}
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-neutral-300 transition hover:border-red-500 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Ban className="size-4" />
                        Anular
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}

              {sales.length === 0 && !isLoading ? (
                <div className="px-4 py-16 text-center text-sm text-neutral-500">
                  No hay ventas para estos filtros.
                </div>
              ) : null}

              {isLoading ? (
                <div className="px-4 py-6 text-center text-sm text-neutral-500">
                  Cargando ventas...
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-neutral-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-neutral-500">
            Pagina {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => movePage(-1)}
              disabled={Number(filters.page) <= 1 || isLoading}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-800 px-3 text-sm text-neutral-300 transition hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="size-4" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => movePage(1)}
              disabled={Number(filters.page) >= totalPages || isLoading}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-800 px-3 text-sm text-neutral-300 transition hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {selectedSale ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6">
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-neutral-800 px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-[0.16em] text-neutral-500 uppercase">
                  Detalle de venta
                </p>
                <h2 className="mt-1 truncate text-xl font-semibold text-neutral-100">
                  {selectedSale.saleNumber}
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  {formatDateTime(selectedSale.completedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="grid size-9 shrink-0 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
                aria-label="Cerrar detalle"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                  <p className="text-xs font-medium text-neutral-500 uppercase">
                    Sucursal
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-neutral-100">
                    {selectedSale.branchName || "-"}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                  <p className="text-xs font-medium text-neutral-500 uppercase">
                    Cajero
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-neutral-100">
                    {selectedSale.cashierName || "-"}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                  <p className="text-xs font-medium text-neutral-500 uppercase">
                    Pago
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-neutral-100">
                    {selectedSale.paymentMethodLabel ||
                      paymentLabels[selectedSale.paymentMethodType] ||
                      "-"}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                  <p className="text-xs font-medium text-neutral-500 uppercase">
                    Origen
                  </p>
                  <p className="mt-1 text-sm font-semibold text-amber-300">
                    {selectedSale.origin?.label || "POS directo"}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                  <p className="text-xs font-medium text-neutral-500 uppercase">
                    Estado
                  </p>
                  <p className="mt-1 text-sm font-semibold text-neutral-100">
                    {statusLabels[selectedSale.status] || selectedSale.status}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                  <p className="text-xs font-medium text-neutral-500 uppercase">
                    Items
                  </p>
                  <p className="mt-1 text-sm font-semibold text-neutral-100">
                    {getItemCount(selectedSale.items)} unidades
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                  <p className="text-xs font-medium text-neutral-500 uppercase">
                    Recibido
                  </p>
                  <p className="mt-1 text-sm font-semibold text-neutral-100">
                    {money(selectedSale.amountPaid)}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                  <p className="text-xs font-medium text-neutral-500 uppercase">
                    Cambio
                  </p>
                  <p className="mt-1 text-sm font-semibold text-neutral-100">
                    {money(selectedSale.change)}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                  <p className="text-xs font-medium text-neutral-500 uppercase">
                    Pagador
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-neutral-100">
                    {selectedSale.senderName || "-"}
                  </p>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-md border border-neutral-800">
                <div className="overflow-x-auto">
                  <div className="min-w-[670px]">
                    <div className="grid grid-cols-[minmax(220px,1fr)_120px_90px_120px_120px] border-b border-neutral-800 bg-neutral-900 px-4 py-3 text-xs font-medium text-neutral-500 uppercase">
                      <span>Producto</span>
                      <span>SKU</span>
                      <span>Cant.</span>
                      <span>Precio</span>
                      <span className="text-right">Subtotal</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {(selectedSale.items || []).map((item) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-[minmax(220px,1fr)_120px_90px_120px_120px] items-center border-b border-neutral-800 px-4 py-3 text-sm last:border-b-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-neutral-100">
                              {item.productName}
                            </p>
                            {isCustomItem(item) ? (
                              <p className="mt-1 text-xs text-cyan-300">
                                Cobro personalizado
                              </p>
                            ) : null}
                          </div>
                          <span className="truncate text-neutral-400">
                            {item.productSku}
                          </span>
                          <span className="text-neutral-300">
                            {item.quantity}
                          </span>
                          <span className="text-neutral-300">
                            {money(item.unitPrice)}
                          </span>
                          <span className="text-right font-semibold text-neutral-100">
                            {money(item.subtotal)}
                          </span>
                        </div>
                      ))}

                      {!selectedSale.items ||
                      selectedSale.items.length === 0 ? (
                        <div className="px-4 py-10 text-center text-sm text-neutral-500">
                          Esta venta no tiene items registrados.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_320px]">
                <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                  <p className="text-xs font-medium text-neutral-500 uppercase">
                    Notas
                  </p>
                  <p className="mt-2 text-sm whitespace-pre-wrap text-neutral-300">
                    {selectedSale.notes || "-"}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-neutral-300">
                      <span>Subtotal</span>
                      <span>{money(selectedSale.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-neutral-300">
                      <span>Descuento</span>
                      <span>{money(selectedSale.discount)}</span>
                    </div>
                    <div className="flex justify-between border-t border-neutral-800 pt-2 text-lg font-semibold text-neutral-100">
                      <span>Total</span>
                      <span>{money(selectedSale.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-neutral-800 px-5 py-4">
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="h-10 rounded-md bg-neutral-100 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-white"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
