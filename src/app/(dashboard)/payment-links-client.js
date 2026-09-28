"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { paymentLinkDisplayStatus } from "@/lib/pos/payment-link-view";
import PaymentLinksHistory from "./payment-links-history";
import {
  CalendarClock,
  Check,
  Clipboard,
  ExternalLink,
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
  showHistoryButton = false,
  branchOptions = [],
  isAdmin = false,
}) {
  const [selectedBranchId, setSelectedBranchId] = useState(branchId);
  const [links, setLinks] = useState([]);
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const requestSequence = useRef(0);
  const [summary, setSummary] = useState({
    ready: 0,
    expired: 0,
    cancelled: 0,
  });
  const [activeFilter, setActiveFilter] = useState("all");
  const [totalLinks, setTotalLinks] = useState(0);
  const [mainPage, setMainPage] = useState(1);
  const [mainNextCursor, setMainNextCursor] = useState("");
  const [mainCursors, setMainCursors] = useState({});
  const [history, setHistory] = useState({
    links: [],
    page: 1,
    nextCursor: "",
    cursors: {},
    total: 0,
  });
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchPage = useCallback(
    async (cursor = "", filter = "all") => {
      if (!selectedBranchId) return;
      const params = new URLSearchParams({ branchId: selectedBranchId, limit: "50", filter });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/pos/payment-links?${params}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.message || "No se pudieron cargar los enlaces.",
        );
      }
      return payload;
    },
    [selectedBranchId],
  );

  const loadLinks = useCallback(async (page = 1, cursor = "", filter = activeFilter) => {
    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setError("");
    try {
      const payload = await fetchPage(cursor, filter);
      if (sequence !== requestSequence.current) return;
      setLinks(payload.links || []);
      setSummary(payload.summary || { ready: 0, expired: 0, cancelled: 0 });
      setTotalLinks(payload.total || 0);
      setMainPage(page);
      setMainNextCursor(payload.nextCursor || "");
    } catch (requestError) {
      if (sequence === requestSequence.current) setError(requestError.message);
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, [activeFilter, fetchPage]);

  const loadHistoryPage = useCallback(
    async (page, cursor = "") => {
      const sequence = ++requestSequence.current;
      setHistoryLoading(true);
      setError("");
      try {
        const payload = await fetchPage(cursor);
        if (sequence !== requestSequence.current) return;
        setHistory((current) => ({
          ...current,
          links: payload.links || [],
          page,
          nextCursor: payload.nextCursor || "",
          total: payload.total || 0,
        }));
        setSummary(payload.summary || { ready: 0, expired: 0, cancelled: 0 });
        setTotalLinks(payload.total || 0);
      } catch (requestError) {
        if (sequence === requestSequence.current)
          setError(requestError.message);
      } finally {
        if (sequence === requestSequence.current) setHistoryLoading(false);
      }
    },
    [fetchPage],
  );

  useEffect(() => {
    setLinks([]);
    setSummary({ ready: 0, expired: 0, cancelled: 0 });
    setActiveFilter("all");
    setTotalLinks(0);
    setMainPage(1);
    setMainNextCursor("");
    setMainCursors({});
    setHistory({ links: [], page: 1, nextCursor: "", cursors: {}, total: 0 });
    setIsHistoryOpen(false);
    return () => {
      requestSequence.current++;
    };
  }, [branchId, selectedBranchId]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks, refreshKey]);

  useEffect(() => {
    if (!isHistoryOpen) return;
    const interval = window.setInterval(() => {
      const cursor =
        history.page === 1 ? "" : history.cursors[history.page] || "";
      loadHistoryPage(history.page, cursor);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [history.cursors, history.page, isHistoryOpen, loadHistoryPage]);

  function openHistory() {
    setIsHistoryOpen(true);
    loadHistoryPage(1);
  }

  function nextHistoryPage() {
    if (!history.nextCursor) return;
    const nextPage = history.page + 1;
    setHistory((current) => ({
      ...current,
      cursors: { ...current.cursors, [nextPage]: current.nextCursor },
    }));
    loadHistoryPage(nextPage, history.nextCursor);
  }

  function previousHistoryPage() {
    if (history.page <= 1) return;
    const previousPage = history.page - 1;
    loadHistoryPage(previousPage, history.cursors[previousPage] || "");
  }

  function nextMainPage() {
    if (!mainNextCursor) return;
    const nextPage = mainPage + 1;
    setMainCursors((current) => ({
      ...current,
      [nextPage]: mainNextCursor,
    }));
    loadLinks(nextPage, mainNextCursor);
  }

  function previousMainPage() {
    if (mainPage <= 1) return;
    const previousPage = mainPage - 1;
    loadLinks(previousPage, mainCursors[previousPage] || "");
  }

  function changeFilter(filter) {
    setActiveFilter(filter);
    setLinks([]);
    setMainPage(1);
    setMainNextCursor("");
    setMainCursors({});
  }

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
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
          {isAdmin && branchOptions.length > 0 ? (
            <label className="flex shrink-0 items-center gap-2 text-xs text-neutral-400">
              Sucursal
              <select
                value={selectedBranchId}
                onChange={(event) => setSelectedBranchId(event.target.value)}
                className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-xs text-neutral-200 outline-none focus:border-neutral-400"
              >
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-live="polite">
            {[
              ["all", "Todos", totalLinks],
              ["ready", "Listos para pagar", summary.ready],
              ["expired", "Vencidos", summary.expired],
              ["cancelled", "Cancelados", summary.cancelled],
            ].map(([filter, label, count]) => (
              <button
                key={filter}
                type="button"
                aria-pressed={activeFilter === filter}
                onClick={() => changeFilter(filter)}
                className={`shrink-0 rounded-md px-3 py-2 text-xs transition ${activeFilter === filter ? "bg-neutral-100 text-neutral-950" : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"}`}
              >
                {label} <strong className="ml-1 text-base">{count}</strong>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {showHistoryButton ? (
              <button type="button" onClick={openHistory} className="rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800">
                Historial
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => loadLinks()}
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

        <div className="min-h-0 flex-1 overflow-auto">
          {!isLoading && !error && links.length === 0 ? (
            <p className="p-10 text-center text-sm text-neutral-500">
              Todavia no hay enlaces.
            </p>
          ) : null}
          {links.length ? (
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Enlaces de pago recientes</caption>
              <thead className="sticky top-0 z-10 bg-neutral-900 text-[11px] uppercase tracking-wide text-neutral-500">
                <tr>
                  {["Acciones", "Creación", "Monto", "Estado", "Detalle"].map((heading) => (
                    <th key={heading} scope="col" className="px-4 py-2 font-medium">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {links.map((link) => {
                  const displayStatus = paymentLinkDisplayStatus(link);
                  const canCancel = !["paid", "cancelled", "expired"].includes(link.status);
                  return (
                    <tr key={link.id} className="border-t border-neutral-800 align-middle hover:bg-neutral-900/60">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => copyLink(link)} className="grid size-7 place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-white" aria-label="Copiar enlace">
                            {copiedId === link.id ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
                          </button>
                          <a href={link.sharePath} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-white" aria-label="Abrir enlace"><ExternalLink className="size-3.5" /></a>
                          {canCancel ? <button type="button" onClick={() => cancelLink(link)} disabled={cancellingId === link.id} className="grid size-7 place-items-center rounded text-neutral-500 hover:bg-red-950 hover:text-red-300 disabled:opacity-50" aria-label="Cancelar enlace">{cancellingId === link.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}</button> : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-500">
                        <div className="flex items-center gap-1"><CalendarClock className="size-3" />{new Date(link.createdAt).toLocaleDateString("es-BO")}</div>
                        <div className="pl-4 text-[10px] text-neutral-600">{new Date(link.createdAt).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-semibold">{money(link.total)}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${displayStatus === "paid" ? "border-emerald-800 bg-emerald-950 text-emerald-300" : displayStatus === "expired" ? "border-red-800 bg-red-950 text-red-300" : displayStatus === "cancelled" ? "border-neutral-700 bg-neutral-900 text-neutral-400" : "border-amber-800 bg-amber-950 text-amber-300"}`}>
                          {statusLabel[displayStatus] || displayStatus}
                        </span>
                      </td>
                      <td className="max-w-[300px] px-4 py-2 text-xs text-neutral-300">
                        <p className="truncate">{link.items.map((item) => `${item.quantity}× ${item.name}`).join(" · ")}</p>
                        {link.notes ? <p className="truncate text-neutral-500">{link.notes}</p> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-between border-t border-neutral-800 px-4 py-2 text-xs text-neutral-500">
          <span>{links.length ? `${(mainPage - 1) * 50 + 1}–${(mainPage - 1) * 50 + links.length} de ${totalLinks}` : "0 enlaces"}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={previousMainPage} disabled={mainPage === 1 || isLoading} className="rounded border border-neutral-800 px-2 py-1 disabled:opacity-30">Anterior</button>
            <span>Página {mainPage}</span>
            <button type="button" onClick={nextMainPage} disabled={!mainNextCursor || isLoading} className="rounded border border-neutral-800 px-2 py-1 disabled:opacity-30">Siguiente</button>
          </div>
        </div>
      </div>
      {isHistoryOpen ? (
        <PaymentLinksHistory
          links={history.links}
          branchName={branchName}
          total={history.total}
          page={history.page}
          hasNext={Boolean(history.nextCursor)}
          isLoading={historyLoading}
          error={error}
          onRefresh={() =>
            loadHistoryPage(
              history.page,
              history.page === 1 ? "" : history.cursors[history.page] || "",
            )
          }
          onNext={nextHistoryPage}
          onPrevious={previousHistoryPage}
          onClose={() => setIsHistoryOpen(false)}
        />
      ) : null}
    </div>
  );
}
