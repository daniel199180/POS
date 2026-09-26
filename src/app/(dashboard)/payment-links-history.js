"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  X,
} from "lucide-react";
import {
  paymentLinkDisplayStatus,
  paymentLinkHistoryPage,
} from "@/lib/pos/payment-link-view";

const labels = {
  open: "Listo para pagar",
  qr_pending: "QR pendiente",
  processing: "Confirmando",
  payment_received: "Pago recibido",
  paid: "Pagado",
  expired: "Vencido",
  cancelled: "Cancelado",
  failed: "Con error",
};
function date(value) {
  return value ? new Date(value).toLocaleString("es-BO") : "—";
}
function money(value) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
  }).format(value || 0);
}

export default function PaymentLinksHistory({
  links,
  branchName,
  isLoading,
  error,
  onRefresh,
  onClose,
}) {
  const dialog = useRef(null);
  const [requestedPage, setPage] = useState(1);
  const { page, pageCount, start, rows } = paymentLinkHistoryPage(
    links,
    requestedPage,
  );
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  useEffect(() => {
    setPage(page);
  }, [page]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="payment-history-title"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-6xl overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950 p-0 text-neutral-100 shadow-2xl backdrop:bg-black/75"
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-800 px-5 py-4">
          <div>
            <h2 id="payment-history-title" className="text-lg font-semibold">
              Historial de enlaces de pago
            </h2>
            <p className="mt-1 text-xs text-neutral-400">
              {branchName} · {links.length} enlaces
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={onRefresh}
              aria-label="Actualizar historial"
              className="grid size-9 place-items-center rounded-md border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50"
            >
              <RefreshCw
                className={`size-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar historial"
              className="grid size-9 place-items-center rounded-md hover:bg-neutral-800"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
        {error ? (
          <p
            role="alert"
            className="mx-5 mt-3 rounded-md border border-red-900 bg-red-950/50 p-3 text-sm text-red-200"
          >
            {error}
          </p>
        ) : null}
        <div className="min-h-0 overflow-auto" aria-busy={isLoading}>
          <table className="w-full min-w-[850px] text-left text-sm">
            <caption className="sr-only">
              Enlaces de pago de {branchName}
            </caption>
            <thead className="sticky top-0 bg-neutral-900 text-xs text-neutral-400">
              <tr>
                {[
                  "Creación",
                  "Monto",
                  "Estado",
                  "Cajera/o",
                  "Detalle",
                  "Vencimiento",
                  "Venta",
                  "Enlace",
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-4 py-3 font-medium"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((link) => {
                const status = paymentLinkDisplayStatus(link);
                return (
                  <tr
                    key={link.id}
                    className="border-t border-neutral-800 align-top hover:bg-neutral-900/60"
                  >
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-neutral-400">
                      {date(link.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">
                      {money(link.total)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs whitespace-nowrap ${status === "paid" ? "text-emerald-300" : status === "expired" ? "text-neutral-400" : "text-amber-300"}`}
                      >
                        {labels[status] || status}
                      </span>
                      {link.lastError ? (
                        <p className="mt-1 max-w-48 text-xs text-amber-300">
                          {link.lastError}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {link.createdByName || "—"}
                    </td>
                    <td className="min-w-44 px-4 py-3 text-xs text-neutral-300">
                      <p>
                        {link.items
                          .map((item) => `${item.quantity}× ${item.name}`)
                          .join(" · ")}
                      </p>
                      {link.notes ? (
                        <p className="mt-1 text-neutral-500">{link.notes}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-neutral-400">
                      {date(link.expiresAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-400">
                      {link.saleNumber || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={link.sharePath}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Abrir enlace de pago"
                        className="grid size-8 place-items-center rounded hover:bg-neutral-800"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-neutral-500"
                  >
                    {isLoading
                      ? "Cargando historial…"
                      : error
                        ? "No se pudo cargar el historial."
                        : "Todavía no hay enlaces."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-neutral-800 px-5 py-3 text-xs text-neutral-400">
          <p aria-live="polite">
            {links.length
              ? `${start + 1}–${start + rows.length} de ${links.length}`
              : "0 enlaces"}
            <span className="ml-3 text-neutral-500">
              Se actualiza cada 30 segundos
            </span>
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Página anterior"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="grid size-8 place-items-center rounded border border-neutral-700 hover:bg-neutral-800 disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span>
              Página {page} de {pageCount}
            </span>
            <button
              type="button"
              aria-label="Página siguiente"
              disabled={page === pageCount}
              onClick={() => setPage(page + 1)}
              className="grid size-8 place-items-center rounded border border-neutral-700 hover:bg-neutral-800 disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
