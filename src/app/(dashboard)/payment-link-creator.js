"use client";

import { useEffect, useState } from "react";
import { Clipboard, ExternalLink, Link2, Loader2, Share2 } from "lucide-react";

export default function PaymentLinkCreator({
  cart,
  paymentMethod,
  isBusy = false,
  isCreating = false,
  latestLink = null,
  onCreate,
}) {
  const [shareError, setShareError] = useState("");
  const [dismissedLinkId, setDismissedLinkId] = useState("");

  useEffect(() => {
    setDismissedLinkId("");
    setShareError("");
  }, [latestLink?.id]);
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
      latestLink.id !== dismissedLinkId,
  );
  const shareUrl =
    showLatestLink && typeof window !== "undefined"
      ? new URL(latestLink.sharePath, window.location.origin).toString()
      : "";

  async function copyLink() {
    setShareError("");
    try {
      await navigator.clipboard.writeText(shareUrl);
      setDismissedLinkId(latestLink.id);
    } catch {
      setShareError("No se pudo copiar. Puedes seleccionar y copiar la URL.");
    }
  }

  async function shareLink() {
    if (!navigator.share) return copyLink();
    setShareError("");
    try {
      await navigator.share({ title: "Cobro por enlace", url: shareUrl });
      setDismissedLinkId(latestLink.id);
    } catch (error) {
      if (error.name !== "AbortError") {
        setShareError("No se pudo compartir el enlace.");
      }
    }
  }

  return (
    <div className="mt-3" data-testid="payment-link-creator">
      <button
        type="button"
        onClick={onCreate}
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
          Vigencia: 5 horas. Reserva el stock hasta el pago o vencimiento.
        </p>
      ) : null}
      {unavailableReason && cart.length > 0 ? (
        <p className="mt-2 text-xs text-neutral-500">{unavailableReason}</p>
      ) : null}

      {showLatestLink ? (
        <div className="mt-3 rounded-md border border-amber-800 bg-amber-950/30 p-3">
          <p className="text-xs font-semibold text-amber-200">
            Enlace listo para compartir
          </p>
          <input
            aria-label="Enlace de pago generado"
            readOnly
            value={shareUrl}
            className="mt-2 h-9 w-full rounded border border-amber-900 bg-neutral-950 px-2 text-xs text-neutral-300"
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
              onClick={() => setDismissedLinkId(latestLink.id)}
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
      ) : null}
    </div>
  );
}
