"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  paymentLinkDisplayStatus,
  paymentLinkSummary,
} from "@/lib/pos/payment-link-view";
import PaymentLinksHistory from "./payment-links-history";
import {
  CalendarClock,
  Check,
  Clipboard,
  ExternalLink,
  History,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";

function money(value) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
  }).format(value || 0);
}

const statusLabel = {
  open: "Listo para pagar",
  qr_pending: "QR pendiente",
  processing: "Confirmando",
  payment_received: "Pago recibido",
  paid: "Pagado",
  expired: "Vencido",
  cancelled: "Cancelado",
  failed: "Con error",
};

function fullUrl(path) {
  if (!path || typeof window === "undefined") return "";
  return new URL(path, window.location.origin).toString();
}

export default function PaymentLinksClient({
  branchId,
  branchName,
  refreshKey = 0,
  onCancelled,
}) {
  const [links, setLinks] = useState([]);
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const requestSequence = useRef(0);
  const summary = paymentLinkSummary(links);

  const loadLinks = useCallback(async () => {
    if (!branchId) return;
    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/pos/payment-links?branchId=${encodeURIComponent(branchId)}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const payload = await response.json().catch(() => ({}));
      if (sequence !== requestSequence.current) return;
      if (!response.ok) {
        throw new Error(
          payload.message || "No se pudieron cargar los enlaces.",
        );
      }
      setLinks(payload.links || []);
    } catch (requestError) {
      if (sequence === requestSequence.current) setError(requestError.message);
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    setLinks([]);
    setIsHistoryOpen(false);
    return () => {
      requestSequence.current++;
    };
  }, [branchId]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks, refreshKey]);

  useEffect(() => {
    if (!isHistoryOpen) return;
    const interval = window.setInterval(loadLinks, 30_000);
    return () => window.clearInterval(interval);
  }, [isHistoryOpen, loadLinks]);

  async function copyLink(link) {
    const url = fullUrl(link.sharePath);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(link.id);
      window.setTimeout(() => setCopiedId(""), 1800);
    } catch {
      setError(
        "No se pudo copiar. Abre el enlace y copialo desde el navegador.",
      );
    }
  }

  async function cancelLink(link) {
    setCancellingId(link.id);
    setError("");
    try {
      const response = await fetch(`/api/pos/payment-links/${link.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "No se pudo cancelar el enlace.");
      }
      setLinks((current) =>
        current.map((candidate) =>
          candidate.id === link.id ? payload.link : candidate,
        ),
      );
      onCancelled?.(payload.link);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCancellingId("");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-amber-900 bg-amber-950/25 p-4">
        <p className="text-sm font-semibold text-amber-100">Enlaces de pago</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
          <div className="flex gap-5" aria-live="polite">
            <p className="text-xs text-neutral-400">
              Listos para pagar{" "}
              <strong className="ml-2 text-lg text-amber-300">
                {summary.ready}
              </strong>
            </p>
            <p className="text-xs text-neutral-400">
              Vencidos{" "}
              <strong className="ml-2 text-lg text-neutral-200">
                {summary.expired}
              </strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsHistoryOpen(true);
                loadLinks();
              }}
              className="flex items-center gap-2 rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              <History className="size-4" /> Historial de enlaces
            </button>
            <button
              type="button"
              onClick={loadLinks}
              disabled={isLoading}
              className="grid size-9 place-items-center rounded-md border border-neutral-800 text-neutral-400 hover:text-white disabled:opacity-50"
              aria-label="Actualizar enlaces"
            >
              <RefreshCw
                className={`size-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        {error ? (
          <p className="m-4 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {!isLoading && !error && links.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-500">
              Todavia no hay enlaces.
            </p>
          ) : null}
          {links.map((link) => {
            const displayStatus = paymentLinkDisplayStatus(link);
            const canCancel = !["paid", "cancelled", "expired"].includes(
              link.status,
            );
            return (
              <article
                key={link.id}
                className="rounded-md border border-neutral-800 bg-neutral-950 p-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{money(link.total)}</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${link.status === "paid" ? "border-emerald-800 bg-emerald-950 text-emerald-300" : "border-amber-800 bg-amber-950 text-amber-200"}`}
                      >
                        {statusLabel[displayStatus] || displayStatus}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-neutral-400">
                      {link.items
                        .map((item) => `${item.quantity}× ${item.name}`)
                        .join(" · ")}
                    </p>
                    {link.notes ? (
                      <p className="mt-2 line-clamp-2 text-xs text-neutral-300">
                        Nota: {link.notes}
                      </p>
                    ) : null}
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-neutral-600">
                      <CalendarClock className="size-3.5" />
                      {new Date(link.createdAt).toLocaleString("es-BO")}
                      {link.createdByName ? ` · ${link.createdByName}` : ""}
                      {link.saleNumber ? ` · ${link.saleNumber}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copyLink(link)}
                      className="grid size-8 place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-white"
                      aria-label="Copiar enlace"
                    >
                      {copiedId === link.id ? (
                        <Check className="size-4" />
                      ) : (
                        <Clipboard className="size-4" />
                      )}
                    </button>
                    <a
                      href={link.sharePath}
                      target="_blank"
                      rel="noreferrer"
                      className="grid size-8 place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-white"
                      aria-label="Abrir enlace"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                    {canCancel ? (
                      <button
                        type="button"
                        onClick={() => cancelLink(link)}
                        disabled={cancellingId === link.id}
                        className="grid size-8 place-items-center rounded text-neutral-500 hover:bg-red-950 hover:text-red-300 disabled:opacity-50"
                        aria-label="Cancelar enlace"
                      >
                        {cancellingId === link.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
                {link.lastError ? (
                  <p className="mt-2 text-xs text-amber-300">
                    Requiere revision: {link.lastError}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
      {isHistoryOpen ? (
        <PaymentLinksHistory
          links={links}
          branchName={branchName}
          isLoading={isLoading}
          error={error}
          onRefresh={loadLinks}
          onClose={() => setIsHistoryOpen(false)}
        />
      ) : null}
    </div>
  );
}
