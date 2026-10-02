"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  Download,
  Eye,
  Loader2,
  QrCode,
  RefreshCw,
  X,
} from "lucide-react";

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

export default function StaticPaymentQrClient({
  branchId,
  branchName,
  paymentMethods = [],
  timeZone = "America/La_Paz",
}) {
  const [description, setDescription] = useState("");
  const [qrs, setQrs] = useState([]);
  const [selectedQr, setSelectedQr] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsTotalPages, setPaymentsTotalPages] = useState(1);
  const [paymentsDate, setPaymentsDate] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [qrToArchive, setQrToArchive] = useState(null);

  const loadQrs = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ branchId });
      const response = await fetch(`/api/pos/static-qrs?${params}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.message || "No se pudieron cargar los QR.");
      setQrs(payload.qrs || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    setSelectedQr(null);
    setPayments([]);
    loadQrs();
  }, [loadQrs]);

  async function createQr(event) {
    event.preventDefault();
    if (!description.trim() || isCreating) return;
    setIsCreating(true);
    setError("");
    try {
      const response = await fetch("/api/pos/static-qrs", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId,
          description: description.trim(),
          paymentMethodId: availablePaymentMethod?.id || "",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.message || "No se pudo crear el QR estático.");
      setDescription("");
      await loadQrs();
      openDetails(payload.qr);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setIsCreating(false);
    }
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
    setPaymentsTotal(0);
    setPaymentsPage(1);
    setPaymentsTotalPages(1);
    setPaymentsDate("");
    setError("");
    try {
      const response = await fetch(`/api/pos/static-qrs/${qr.id}?page=1`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          payload.message || "No se pudieron consultar los pagos.",
        );
      setSelectedQr(payload.qr);
      setPayments(payload.payments || []);
      setPaymentsTotal(payload.paymentsTotal || 0);
      setPaymentsPage(payload.paymentsPage || 1);
      setPaymentsTotalPages(payload.paymentsTotalPages || 1);
      setPaymentsDate(payload.paymentsDate || "");
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
        body: JSON.stringify({ action: "status", page: paymentsPage }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          payload.message || "No se pudieron consultar los pagos.",
        );
      setSelectedQr(payload.qr);
      setPayments(payload.payments || []);
      setPaymentsTotal(payload.paymentsTotal || 0);
      setPaymentsPage(payload.paymentsPage || 1);
      setPaymentsTotalPages(payload.paymentsTotalPages || 1);
      setPaymentsDate(payload.paymentsDate || "");
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
      setPaymentsTotal(payload.paymentsTotal || 0);
      setPaymentsPage(payload.paymentsPage || 1);
      setPaymentsTotalPages(payload.paymentsTotalPages || 1);
      setPaymentsDate(payload.paymentsDate || "");
    } catch (pageError) {
      setError(pageError.message);
    } finally {
      setIsChecking(false);
    }
  }

  const availablePaymentMethod = paymentMethods.find(
    (method) =>
      method.branchId === branchId &&
      method.type === "qr" &&
      method.config?.provider === "baneco" &&
      method.isEnabled !== false,
  );
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="static-payment-qr"
    >
      <div className="shrink-0 border-b border-violet-900 bg-violet-950/25 px-4 py-4">
        <form
          onSubmit={createQr}
          className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-end"
        >
          <label className="text-xs font-medium text-neutral-400">
            Descripción del QR
            <input
              autoFocus
              value={description}
              onChange={(event) =>
                setDescription(event.target.value.slice(0, 120))
              }
              placeholder="Ej. Caja principal, donaciones, cafetería"
              maxLength={120}
              className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-violet-400"
            />
          </label>
          <button
            type="submit"
            disabled={
              !description.trim() ||
              isCreating ||
              !branchId ||
              !availablePaymentMethod
            }
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-violet-400 px-5 text-sm font-semibold text-violet-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            {isCreating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <QrCode className="size-4" />
            )}
            {isCreating ? "Creando QR..." : "Crear QR estático"}
          </button>
        </form>
        {!availablePaymentMethod ? (
          <p className="mt-2 text-xs text-amber-300">
            Configura un método QR Baneco activo para esta sucursal.
          </p>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="m-4 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200"
        >
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-neutral-100">
              Mis QR estáticos
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {qrs.length} QR creados
            </p>
          </div>
          <button
            type="button"
            onClick={loadQrs}
            disabled={isLoading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            <RefreshCw
              className={`size-4 ${isLoading ? "animate-spin" : ""}`}
            />{" "}
            Actualizar
          </button>
        </div>

        {!qrs.length && !isLoading ? (
          <p className="rounded-md border border-neutral-800 px-4 py-10 text-center text-sm text-neutral-500">
            Todavía no hay QR estáticos para esta sucursal.
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
                  <h3 className="truncate font-semibold text-neutral-100">
                    {qr.description}
                  </h3>
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
                  className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${qr.status === "cancelled" ? "border-neutral-700 bg-neutral-900 text-neutral-500" : "border-emerald-800 bg-emerald-950 text-emerald-300"}`}
                >
                  {qr.status === "cancelled" ? "Deshabilitado" : "Activo"}
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
                  <button
                    type="button"
                    onClick={() => requestArchive(qr)}
                    disabled={isArchiving}
                    className="inline-flex h-9 items-center gap-1.5 rounded border border-neutral-700 px-3 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                  >
                    <Archive className="size-3.5" /> Archivar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

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
              <div className="min-w-0">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                    <p className="text-xs text-neutral-500">Pagos del día</p>
                    <p className="mt-1 text-lg font-semibold">
                      {paymentsTotal}
                    </p>
                  </div>
                  <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                    <p className="text-xs text-neutral-500">Última consulta</p>
                    <p className="mt-1 text-sm font-semibold">
                      {date(selectedQr.lastCheckedAt, timeZone)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-neutral-100">
                    Pagos del día
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
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto rounded-md border border-neutral-800">
                  <table className="w-full min-w-[650px] text-left text-xs">
                    <thead className="bg-neutral-900 text-neutral-500">
                      <tr>
                        {[
                          "Fecha",
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
                            No hay pagos registrados hoy. Pulsa “Consultar
                            banco” para actualizar.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                  <span>
                    {paymentsDate
                      ? `Fecha: ${dateOnly(`${paymentsDate}T12:00:00Z`, timeZone)}`
                      : "Pagos del día"}{" "}
                    · Página {paymentsPage} de {paymentsTotalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => loadPaymentsPage(paymentsPage - 1)}
                      disabled={paymentsPage <= 1 || isChecking}
                      className="h-8 rounded border border-neutral-700 px-3 font-semibold text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => loadPaymentsPage(paymentsPage + 1)}
                      disabled={
                        paymentsPage >= paymentsTotalPages || isChecking
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
