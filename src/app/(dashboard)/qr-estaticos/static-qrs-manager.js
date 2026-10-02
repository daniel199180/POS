"use client";

import { useState } from "react";
import {
  Archive,
  Download,
  Eye,
  Loader2,
  QrCode,
  RefreshCw,
  X,
} from "lucide-react";

function date(value, timeZone) {
  return value
    ? new Intl.DateTimeFormat("es-BO", {
        timeZone,
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}

function dateOnly(value, timeZone) {
  return value
    ? new Intl.DateTimeFormat("es-BO", {
        timeZone,
        dateStyle: "short",
      }).format(new Date(value))
    : "—";
}

function money(value) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
  }).format(value || 0);
}

function qrImageSrc(value = "") {
  if (!value) return "";
  if (value.startsWith("data:") || value.startsWith("http")) return value;
  if (value.startsWith("<svg")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
  }
  return `data:image/png;base64,${value}`;
}

function filenamePart(value) {
  return (
    String(value || "qr")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 50) || "qr"
  );
}

export default function StaticQrsManager({
  initialData,
  initialFilters,
  branchOptions = [],
  creatorOptions = [],
  qrOptions = [],
  initialPaymentData = { payments: [], total: 0, page: 1, totalPages: 1 },
  initialPaymentFilters = {
    branchId: "",
    staticQrId: "",
    page: 1,
    pageSize: 15,
  },
  timeZone = "America/La_Paz",
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [qrs, setQrs] = useState(initialData.qrs || []);
  const [total, setTotal] = useState(initialData.total || 0);
  const [page, setPage] = useState(initialData.page || 1);
  const [totalPages, setTotalPages] = useState(initialData.totalPages || 1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedQr, setSelectedQr] = useState(null);
  const [payments, setPayments] = useState([]);
  const [detailPaymentsTotal, setDetailPaymentsTotal] = useState(0);
  const [detailPaymentsPage, setDetailPaymentsPage] = useState(1);
  const [detailPaymentsTotalPages, setDetailPaymentsTotalPages] = useState(1);
  const [detailPaymentsDate, setDetailPaymentsDate] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [qrToArchive, setQrToArchive] = useState(null);
  const [paymentFilters, setPaymentFilters] = useState(initialPaymentFilters);
  const [staticPayments, setStaticPayments] = useState(
    initialPaymentData.payments || [],
  );
  const [paymentsTotal, setPaymentsTotal] = useState(
    initialPaymentData.total || 0,
  );
  const [paymentsPage, setPaymentsPage] = useState(
    initialPaymentData.page || 1,
  );
  const [paymentsTotalPages, setPaymentsTotalPages] = useState(
    initialPaymentData.totalPages || 1,
  );
  const [isPaymentsLoading, setIsPaymentsLoading] = useState(false);

  async function loadQrs(nextFilters = filters) {
    setIsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(nextFilters.page || 1),
        pageSize: String(nextFilters.pageSize || 25),
      });
      for (const key of ["branchId", "createdByUserId", "status", "archived"]) {
        if (nextFilters[key]) params.set(key, nextFilters[key]);
      }
      const response = await fetch(`/api/pos/static-qrs?${params}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "No se pudieron cargar los QR.");
      }
      setQrs(payload.qrs || []);
      setTotal(payload.total || 0);
      setPage(payload.page || 1);
      setTotalPages(payload.totalPages || 1);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadStaticPayments(nextFilters = paymentFilters) {
    setIsPaymentsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(nextFilters.page || 1),
        pageSize: String(nextFilters.pageSize || 15),
      });
      if (nextFilters.branchId) params.set("branchId", nextFilters.branchId);
      if (nextFilters.staticQrId)
        params.set("staticQrId", nextFilters.staticQrId);
      const response = await fetch(`/api/pos/static-qr-payments?${params}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "No se pudieron cargar los pagos.");
      }
      setStaticPayments(payload.payments || []);
      setPaymentsTotal(payload.total || 0);
      setPaymentsPage(payload.page || 1);
      setPaymentsTotalPages(payload.totalPages || 1);
    } catch (paymentsError) {
      setError(paymentsError.message);
    } finally {
      setIsPaymentsLoading(false);
    }
  }

  function updatePaymentFilter(value) {
    const nextFilters = { ...paymentFilters, staticQrId: value, page: 1 };
    setPaymentFilters(nextFilters);
    loadStaticPayments(nextFilters);
  }

  function goToPaymentPage(nextPage) {
    const nextFilters = { ...paymentFilters, page: nextPage };
    setPaymentFilters(nextFilters);
    loadStaticPayments(nextFilters);
  }

  function updateFilter(key, value) {
    const nextFilters = { ...filters, [key]: value, page: 1 };
    setFilters(nextFilters);
    loadQrs(nextFilters);
  }

  function goToPage(nextPage) {
    const nextFilters = { ...filters, page: nextPage };
    setFilters(nextFilters);
    loadQrs(nextFilters);
  }

  function downloadQr(qr) {
    const link = document.createElement("a");
    link.href = qrImageSrc(qr.qrImage);
    link.download = `qr-estatico-${filenamePart(qr.description)}.${qr.qrImage?.startsWith("<svg") ? "svg" : "png"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function openDetails(qr) {
    setSelectedQr(qr);
    setPayments([]);
    setDetailPaymentsTotal(0);
    setDetailPaymentsPage(1);
    setDetailPaymentsTotalPages(1);
    setDetailPaymentsDate("");
    setError("");
    try {
      const response = await fetch(`/api/pos/static-qrs/${qr.id}?page=1`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.message || "No se pudieron consultar los pagos.",
        );
      }
      setSelectedQr(payload.qr);
      setPayments(payload.payments || []);
      setDetailPaymentsTotal(payload.paymentsTotal || 0);
      setDetailPaymentsPage(payload.paymentsPage || 1);
      setDetailPaymentsTotalPages(payload.paymentsTotalPages || 1);
      setDetailPaymentsDate(payload.paymentsDate || "");
    } catch (detailsError) {
      setError(detailsError.message);
    }
  }

  function requestArchive(qr) {
    if (!qr || isArchiving) return;
    setError("");
    setQrToArchive(qr);
  }

  async function archiveQr() {
    if (!qrToArchive || isArchiving) return;

    setIsArchiving(true);
    setError("");
    try {
      const response = await fetch("/api/pos/static-qrs/" + qrToArchive.id, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "No se pudo archivar el QR.");
      }

      setQrs((current) => current.filter((qr) => qr.id !== payload.qr.id));
      setTotal((current) => Math.max(current - 1, 0));
      setSelectedQr(null);
      setQrToArchive(null);
    } catch (archiveError) {
      setError(archiveError.message);
    } finally {
      setIsArchiving(false);
    }
  }

  async function checkPayments() {
    if (!selectedQr || isChecking) return;
    setIsChecking(true);
    setError("");
    try {
      const response = await fetch(`/api/pos/static-qrs/${selectedQr.id}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status", page: detailPaymentsPage }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.message || "No se pudieron consultar los pagos.",
        );
      }
      setSelectedQr(payload.qr);
      setPayments(payload.payments || []);
      setDetailPaymentsTotal(payload.paymentsTotal || 0);
      setDetailPaymentsPage(payload.paymentsPage || 1);
      setDetailPaymentsTotalPages(payload.paymentsTotalPages || 1);
      setDetailPaymentsDate(payload.paymentsDate || "");
      setQrs((current) =>
        current.map((qr) => (qr.id === payload.qr.id ? payload.qr : qr)),
      );
    } catch (checkError) {
      setError(checkError.message);
    } finally {
      setIsChecking(false);
    }
  }

  async function loadPaymentsPage(nextPage) {
    if (!selectedQr || isChecking) return;
    setIsChecking(true);
    setError("");
    try {
      const response = await fetch(
        `/api/pos/static-qrs/${selectedQr.id}?page=${nextPage}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.message || "No se pudieron consultar los pagos.",
        );
      }
      setSelectedQr(payload.qr);
      setPayments(payload.payments || []);
      setDetailPaymentsTotal(payload.paymentsTotal || 0);
      setDetailPaymentsPage(payload.paymentsPage || 1);
      setDetailPaymentsTotalPages(payload.paymentsTotalPages || 1);
      setDetailPaymentsDate(payload.paymentsDate || "");
    } catch (pageError) {
      setError(pageError.message);
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md bg-violet-400/15 text-violet-300">
            <QrCode className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-neutral-100">
              QR estáticos
            </h1>
            <p className="text-sm text-neutral-500">{total} QR registrados</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadQrs()}
          disabled={isLoading}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm font-semibold text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      <div className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 md:grid-cols-4">
        <label className="text-xs font-medium text-neutral-400">
          Sucursal
          <select
            value={filters.branchId}
            onChange={(event) => updateFilter("branchId", event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-violet-400"
          >
            <option value="">Todas las sucursales</option>
            {branchOptions.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-neutral-400">
          QR estático creado por
          <select
            value={filters.createdByUserId}
            onChange={(event) =>
              updateFilter("createdByUserId", event.target.value)
            }
            className="mt-1 h-10 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-violet-400"
          >
            <option value="">Todas las personas</option>
            {creatorOptions.map((creator) => (
              <option key={creator.id} value={creator.id}>
                {creator.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-neutral-400">
          Estado
          <select
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-violet-400"
          >
            <option value="">Todos</option>
            <option value="active">Activos</option>
            <option value="cancelled">Deshabilitados</option>
          </select>
        </label>
        <label className="text-xs font-medium text-neutral-400">
          Visibilidad
          <select
            value={filters.archived}
            onChange={(event) => updateFilter("archived", event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-violet-400"
          >
            <option value="false">Visibles</option>
            <option value="true">Archivados</option>
            <option value="all">Todos</option>
          </select>
        </label>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200"
        >
          {error}
        </p>
      ) : null}

      <div className="grid w-full gap-3">
        {qrs.map((qr) => (
          <article
            key={qr.id}
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 p-4"
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex min-w-[220px] flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="truncate font-semibold text-neutral-100">
                  {qr.description}
                </h2>
                <p className="text-xs text-neutral-500">
                  Creado {date(qr.createdAt, timeZone)}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-neutral-400">
                Pagos
                <span className="grid min-w-6 place-items-center rounded-full border border-violet-800 bg-violet-950 px-1.5 py-0.5 font-semibold text-violet-200">
                  {qr.paymentsCount}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${qr.archived ? "border-violet-800 bg-violet-950 text-violet-300" : qr.status === "cancelled" ? "border-neutral-700 bg-neutral-900 text-neutral-500" : "border-emerald-800 bg-emerald-950 text-emerald-300"}`}
              >
                {qr.archived
                  ? "Archivado"
                  : qr.status === "cancelled"
                    ? "Deshabilitado"
                    : "Activo"}
              </span>
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <button
                  type="button"
                  onClick={() => downloadQr(qr)}
                  className="inline-flex h-9 items-center gap-1.5 rounded border border-neutral-700 px-3 text-xs font-semibold text-neutral-200 hover:bg-neutral-800"
                >
                  <Download className="size-3.5" /> Descargar QR
                </button>
                <button
                  type="button"
                  onClick={() => openDetails(qr)}
                  className="inline-flex h-9 items-center gap-1.5 rounded border border-violet-800 px-3 text-xs font-semibold text-violet-200 hover:bg-violet-950"
                >
                  <Eye className="size-3.5" /> Consultar pagos
                </button>
                {!qr.archived ? (
                  <button
                    type="button"
                    onClick={() => requestArchive(qr)}
                    disabled={isArchiving}
                    className="inline-flex h-9 items-center gap-1.5 rounded border border-neutral-700 px-3 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                  >
                    <Archive className="size-3.5" /> Archivar
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
        {!qrs.length && !isLoading ? (
          <p className="rounded-md border border-neutral-800 px-4 py-12 text-center text-sm text-neutral-500">
            No hay QR estáticos que coincidan con los filtros.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-4 text-sm text-neutral-500">
        <span>
          Página {page} de {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1 || isLoading}
            className="h-9 rounded-md border border-neutral-700 px-3 font-semibold text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages || isLoading}
            className="h-9 rounded-md border border-neutral-700 px-3 font-semibold text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>

      <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">
              Pagos de QR estáticos
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Todos los pagos recibidos mediante QR estáticos.
            </p>
          </div>
          <label className="text-xs font-medium text-neutral-400">
            Filtrar por QR estático
            <select
              value={paymentFilters.staticQrId}
              onChange={(event) => updatePaymentFilter(event.target.value)}
              className="mt-1 h-10 min-w-64 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-violet-400"
            >
              <option value="">Todos los QR estáticos</option>
              {qrOptions.map((qr) => (
                <option key={qr.id} value={qr.id}>
                  {qr.description} · {qr.branchName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 overflow-x-auto rounded-md border border-neutral-800">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-neutral-900 text-neutral-500">
              <tr>
                {[
                  "Fecha",
                  "QR estático",
                  "Sucursal",
                  "Monto",
                  "Pagador",
                  "Banco",
                  "Referencia",
                ].map((heading) => (
                  <th key={heading} className="px-3 py-2 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staticPayments.map((payment) => (
                <tr key={payment.id} className="border-t border-neutral-800">
                  <td className="px-3 py-3 text-neutral-400">
                    {date(payment.paidAt, timeZone)}
                  </td>
                  <td className="px-3 py-3 font-semibold text-neutral-100">
                    {payment.staticQrDescription}
                  </td>
                  <td className="px-3 py-3 text-neutral-400">
                    {payment.staticQrBranchName}
                  </td>
                  <td className="px-3 py-3 font-semibold text-emerald-300">
                    {money(payment.amount)}
                  </td>
                  <td className="px-3 py-3 text-neutral-200">
                    {payment.senderName || "—"}
                  </td>
                  <td className="px-3 py-3 text-neutral-400">
                    {payment.bankName || "—"}
                  </td>
                  <td className="px-3 py-3 text-neutral-500">
                    {payment.bankOrder || payment.providerPaymentId}
                  </td>
                </tr>
              ))}
              {!staticPayments.length && !isPaymentsLoading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-10 text-center text-neutral-500"
                  >
                    No hay pagos registrados para este filtro.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-500">
          <span>
            {paymentsTotal} pagos · Página {paymentsPage} de{" "}
            {paymentsTotalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => goToPaymentPage(paymentsPage - 1)}
              disabled={paymentsPage <= 1 || isPaymentsLoading}
              className="h-9 rounded-md border border-neutral-700 px-3 font-semibold text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => goToPaymentPage(paymentsPage + 1)}
              disabled={paymentsPage >= paymentsTotalPages || isPaymentsLoading}
              className="h-9 rounded-md border border-neutral-700 px-3 font-semibold text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>

      {selectedQr ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6">
          <div className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-800 px-5 py-4">
              <div>
                <h2 className="text-xl font-semibold text-neutral-100">
                  {selectedQr.description}
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  {selectedQr.branchName} · {selectedQr.qrId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQr(null)}
                aria-label="Cerrar detalle del QR"
                className="grid size-9 place-items-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-neutral-100">
                  Pagos del día: {detailPaymentsTotal}
                </p>
                <div className="flex gap-2">
                  {selectedQr.status !== "cancelled" ? (
                    <button
                      type="button"
                      onClick={checkPayments}
                      disabled={isChecking}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-violet-400 px-3 text-xs font-semibold text-violet-950 hover:bg-violet-300 disabled:opacity-50"
                    >
                      {isChecking ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}{" "}
                      Consultar banco
                    </button>
                  ) : null}
                  {!selectedQr.archived ? (
                    <button
                      type="button"
                      onClick={() => requestArchive(selectedQr)}
                      disabled={isArchiving}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-700 px-3 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {isArchiving ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Archive className="size-3.5" />
                      )}{" "}
                      Archivar
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 overflow-x-auto rounded-md border border-neutral-800">
                <table className="w-full min-w-[650px] text-left text-xs">
                  <thead className="bg-neutral-900 text-neutral-500">
                    <tr>
                      {["Fecha", "Monto", "Pagador", "Banco", "Referencia"].map(
                        (heading) => (
                          <th key={heading} className="px-3 py-2 font-medium">
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr
                        key={payment.id}
                        className="border-t border-neutral-800"
                      >
                        <td className="px-3 py-3 text-neutral-400">
                          {date(payment.paidAt, timeZone)}
                        </td>
                        <td className="px-3 py-3 font-semibold text-emerald-300">
                          {money(payment.amount)}
                        </td>
                        <td className="px-3 py-3 text-neutral-200">
                          {payment.senderName || "—"}
                        </td>
                        <td className="px-3 py-3 text-neutral-400">
                          {payment.bankName || "—"}
                        </td>
                        <td className="px-3 py-3 text-neutral-500">
                          {payment.bankOrder || payment.providerPaymentId}
                        </td>
                      </tr>
                    ))}
                    {!payments.length ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-10 text-center text-neutral-500"
                        >
                          No hay pagos registrados hoy.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                <span>
                  {detailPaymentsDate
                    ? `Fecha: ${dateOnly(`${detailPaymentsDate}T12:00:00Z`, timeZone)}`
                    : "Pagos del día"}{" "}
                  · Página {detailPaymentsPage} de {detailPaymentsTotalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => loadPaymentsPage(detailPaymentsPage - 1)}
                    disabled={detailPaymentsPage <= 1 || isChecking}
                    className="h-8 rounded border border-neutral-700 px-3 font-semibold text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => loadPaymentsPage(detailPaymentsPage + 1)}
                    disabled={
                      detailPaymentsPage >= detailPaymentsTotalPages ||
                      isChecking
                    }
                    className="h-8 rounded border border-neutral-700 px-3 font-semibold text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
              {selectedQr.lastError ? (
                <p className="mt-3 rounded-md border border-amber-900 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
                  {selectedQr.lastError}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 justify-end border-t border-neutral-800 px-5 py-3">
              <button
                type="button"
                onClick={() => setSelectedQr(null)}
                className="h-10 rounded-md border border-neutral-700 px-4 text-sm font-semibold text-neutral-200 hover:bg-neutral-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {qrToArchive ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-4 py-6">
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-950 p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-neutral-100">
              Archivar QR estático
            </h2>
            <p className="mt-2 text-sm text-neutral-400">
              ¿Quieres archivar “{qrToArchive.description}”? Se conservará con
              sus pagos, pero dejará de aparecer en este panel.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setQrToArchive(null)}
                disabled={isArchiving}
                className="h-10 rounded-md border border-neutral-700 px-4 text-sm font-semibold text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={archiveQr}
                disabled={isArchiving}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-violet-400 px-4 text-sm font-semibold text-violet-950 hover:bg-violet-300 disabled:opacity-50"
              >
                {isArchiving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Archivar QR
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
