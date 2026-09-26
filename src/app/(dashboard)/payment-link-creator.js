"use client";

import { useEffect, useState } from "react";
import {
  Clipboard,
  ExternalLink,
  Link2,
  Loader2,
  Share2,
  X,
} from "lucide-react";

export default function PaymentLinkCreator({
  cart,
  paymentMethod,
  isBusy = false,
  isCreating = false,
  latestLink = null,
  notes = "",
  error = "",
  onNotesChange,
  onCreate,
}) {
  const [shareError, setShareError] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [createdLinkId, setCreatedLinkId] = useState("");
  const [hasStartedCreation, setHasStartedCreation] = useState(false);

  useEffect(() => {
    setShareError("");
  }, [createdLinkId]);

  useEffect(() => {
    if (!isDialogOpen) return undefined;

    function closeOnEscape(event) {
      if (event.key === "Escape" && !isCreating) closeDialog();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isCreating, isDialogOpen]);
  const hasMonthlyItems = cart.some((item) => Boolean(item.institutePayment));
  const unavailableReason = !paymentMethod
    ? "Configura un metodo QR Baneco para crear enlaces."
    : hasMonthlyItems
      ? "Las mensualidades se cobran directamente en el POS."
      : cart.length === 0
        ? "Agrega productos al carrito para generar un enlace."
        : "";
  const showLatestLink = Boolean(
    latestLink?.sharePath &&
      latestLink.status !== "cancelled" &&
      latestLink.id === createdLinkId,
  );
  const shareUrl =
    showLatestLink && typeof window !== "undefined"
      ? new URL(latestLink.sharePath, window.location.origin).toString()
      : "";

  async function copyLink() {
    setShareError("");
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      setShareError("No se pudo copiar. Puedes seleccionar y copiar la URL.");
    }
  }

  async function shareLink() {
    if (!navigator.share) return copyLink();
    setShareError("");
    try {
      await navigator.share({ title: "Cobro por enlace", url: shareUrl });
    } catch (error) {
      if (error.name !== "AbortError") {
        setShareError("No se pudo compartir el enlace.");
      }
    }
  }

  function openDialog() {
    setShareError("");
    setCreatedLinkId("");
    setHasStartedCreation(false);
    onNotesChange?.("");
    setIsDialogOpen(true);
  }

  function closeDialog() {
    setIsDialogOpen(false);
    setCreatedLinkId("");
    setHasStartedCreation(false);
    setShareError("");
    onNotesChange?.("");
  }

  async function createLink() {
    setHasStartedCreation(true);
    const link = await onCreate?.();
    if (link?.id) setCreatedLinkId(link.id);
  }

  return (
    <div className="mt-3" data-testid="payment-link-creator">
      <button
        type="button"
        onClick={openDialog}
        disabled={Boolean(unavailableReason) || isBusy || isCreating}
        title={
          unavailableReason || "Crear un enlace con los productos del carrito"
        }
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-amber-300 px-3 text-sm font-semibold text-amber-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
      >
        {isCreating ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Link2 className="size-4" />
        )}
        {isCreating ? "Generando enlace..." : "Generar enlace de pago"}
      </button>
      {!unavailableReason ? (
        <p className="mt-2 text-xs text-neutral-500">
          Vigencia: 14 dias. Reserva el stock hasta el pago o vencimiento.
        </p>
      ) : null}
      {unavailableReason && cart.length > 0 ? (
        <p className="mt-2 text-xs text-neutral-500">{unavailableReason}</p>
      ) : null}

      {isDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-link-dialog-title"
            className="w-full max-w-md rounded-md border border-neutral-800 bg-neutral-950 p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium tracking-[0.16em] text-amber-300 uppercase">
                  Enlace de cobro
                </p>
                <h2
                  id="payment-link-dialog-title"
                  className="mt-1 text-xl font-semibold text-neutral-100"
                >
                  {showLatestLink
                    ? "Enlace listo para copiar"
                    : "Generar enlace de pago"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                disabled={isCreating}
                aria-label="Cerrar popup de enlace de pago"
                className="grid size-9 shrink-0 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-white disabled:opacity-50"
              >
                <X className="size-5" />
              </button>
            </div>

            {showLatestLink ? (
              <div className="mt-5 rounded-md border border-amber-800 bg-amber-950/30 p-3">
                <p className="text-xs font-semibold text-amber-200">
                  Enlace de pago listo para compartir
                </p>
                {latestLink.notes ? (
                  <p className="mt-1 text-xs text-amber-100">
                    {latestLink.notes}
                  </p>
                ) : null}
                <input
                  aria-label="Enlace de pago generado"
                  readOnly
                  value={shareUrl}
                  className="mt-2 h-10 w-full rounded border border-amber-900 bg-neutral-950 px-2 text-xs text-neutral-300"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyLink}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded border border-amber-800 text-xs font-semibold text-amber-100 hover:bg-amber-900/50"
                  >
                    <Clipboard className="size-4" />
                    Copiar
                  </button>
                  <button
                    type="button"
                    onClick={shareLink}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded border border-amber-800 text-xs font-semibold text-amber-100 hover:bg-amber-900/50"
                  >
                    <Share2 className="size-4" />
                    Compartir
                  </button>
                  <a
                    href={latestLink.sharePath}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Abrir enlace de pago"
                    className="grid size-9 place-items-center rounded border border-amber-800 text-amber-100 hover:bg-amber-900/50"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                </div>
                {shareError ? (
                  <p role="alert" className="mt-2 text-xs text-red-300">
                    {shareError}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                {hasStartedCreation && error ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-md border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-200"
                  >
                    {error}
                  </p>
                ) : null}
                <label className="mt-5 block text-sm font-medium text-neutral-300">
                  Nota <span className="text-neutral-500">(opcional)</span>
                  <textarea
                    autoFocus
                    value={notes}
                    onChange={(event) =>
                      onNotesChange?.(event.target.value.slice(0, 300))
                    }
                    disabled={isBusy || isCreating}
                    maxLength={300}
                    rows={3}
                    placeholder="Ej. Reserva mesa 4, pedido para llevar"
                    className="mt-2 min-h-24 w-full resize-none rounded-md border border-neutral-800 bg-black px-3 py-2 text-sm text-neutral-100 transition outline-none placeholder:text-neutral-600 focus:border-amber-400 disabled:opacity-60"
                  />
                </label>
              </>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDialog}
                disabled={isCreating}
                className="h-10 rounded-md border border-neutral-700 px-4 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:text-white disabled:opacity-50"
              >
                Cancelar
              </button>
              {!showLatestLink ? (
                <button
                  type="button"
                  onClick={createLink}
                  disabled={isBusy || isCreating}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-amber-300 px-4 text-sm font-semibold text-amber-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                >
                  {isCreating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {isCreating ? "Generando..." : "Generar"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
