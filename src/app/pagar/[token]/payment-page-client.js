"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  QrCode,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

function money(value) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
  }).format(value || 0);
}

function qrSource(value) {
  if (!value) return "";
  if (value.startsWith("data:") || value.startsWith("http")) return value;
  if (value.startsWith("<svg")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
  }
  return `data:image/png;base64,${value}`;
}

function terminalMessage(link) {
  if (link?.status === "cancelled") return "Este enlace fue cancelado.";
  if (link?.status === "expired") return "Este enlace de pago vencio.";
  if (link?.status === "failed") return "No se pudo procesar este enlace.";
  return "";
}

export default function PaymentPageClient({ token }) {
  const [link, setLink] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [now, setNow] = useState(Date.now);
  const successAudioRef = useRef(null);
  const announcedPaymentRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const request = useCallback(
    async (method = "GET", action = "") => {
      const response = await fetch(
        `/api/public/payment-links/${encodeURIComponent(token)}`,
        {
          method,
          cache: "no-store",
          headers:
            method === "POST" ? { "content-type": "application/json" } : {},
          body: method === "POST" ? JSON.stringify({ action }) : undefined,
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo abrir el enlace.");
      }

      setLink(payload.link);
      setError("");
      return payload.link;
    },
    [token],
  );

  useEffect(() => {
    let active = true;
    request()
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request]);

  useEffect(() => {
    if (
      !link ||
      !["qr_pending", "processing", "payment_received"].includes(link.status)
    ) {
      return undefined;
    }

    const interval = window.setInterval(async () => {
      if (isChecking) return;
      setIsChecking(true);
      try {
        await request("POST", "status");
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setIsChecking(false);
      }
    }, 3500);

    return () => window.clearInterval(interval);
  }, [isChecking, link, request]);

  useEffect(() => {
    if (link?.status !== "paid" || announcedPaymentRef.current) return;
    announcedPaymentRef.current = true;
    const audio = successAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play()?.catch?.(() => {});
  }, [link?.status]);

  async function unlockSuccessSound() {
    const audio = successAudioRef.current;
    if (!audio) return;
    audio.muted = true;
    try {
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // The visual confirmation remains available when media is blocked.
    } finally {
      audio.muted = false;
    }
  }

  async function generateQr() {
    await unlockSuccessSound();
    setIsGenerating(true);
    setError("");
    try {
      await request("POST", "generate");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsGenerating(false);
    }
  }

  if (isLoading) {
    return (
      <main className="grid min-h-[100dvh] place-items-center px-5">
        <Loader2 className="size-9 animate-spin text-cyan-300" />
      </main>
    );
  }

  if (!link) {
    return (
      <main className="grid min-h-[100dvh] place-items-center px-5">
        <div className="max-w-md rounded-xl border border-red-900 bg-red-950/40 p-6 text-center">
          <TriangleAlert className="mx-auto size-10 text-red-300" />
          <h1 className="mt-4 text-xl font-semibold">Enlace no disponible</h1>
          <p className="mt-2 text-sm text-red-200">{error}</p>
        </div>
      </main>
    );
  }

  const expiredLocally =
    Date.parse(link.expiresAt) <= now && link.status !== "paid";
  const unavailable =
    terminalMessage(link) ||
    (expiredLocally
      ? "La vigencia del enlace finalizo. Estamos verificando su estado."
      : "");
  const isPaid = link.status === "paid";
  const paymentReceived = link.status === "payment_received";
  const showQr = Boolean(link.qrImage) && !isPaid && !expiredLocally;

  return (
    <main className="min-h-[100dvh] bg-neutral-950 px-3 py-4 text-neutral-100 sm:px-4 sm:py-12">
      <audio
        ref={successAudioRef}
        src="/sounds/payment-success.mp3"
        preload="auto"
        playsInline
      />
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-3 flex items-center gap-3 sm:mb-5 sm:gap-4">
          {!logoFailed ? (
            <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border border-neutral-700 bg-white p-1.5 sm:size-20 sm:p-2">
              <img
                src={`/api/public/payment-links/${encodeURIComponent(token)}/logo`}
                alt="Logo de la institucion"
                className="size-full object-contain"
                onError={() => setLogoFailed(true)}
              />
            </div>
          ) : null}
          <div className="flex-1">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-cyan-300 uppercase sm:text-xs sm:tracking-[0.18em]">
              Cobro por enlace
            </p>
            <h1 className="mt-0.5 text-xl leading-tight font-semibold sm:mt-2 sm:text-2xl">
              Detalle a pagar
            </h1>
          </div>
          <ShieldCheck className="size-7 shrink-0 text-cyan-300 sm:size-9" />
        </div>

        <section className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl">
          <div className="border-b border-neutral-800 px-3 py-3 sm:px-5 sm:py-4">
            <p className="flex items-center gap-2 text-sm text-neutral-300">
              <MapPin className="size-4 text-cyan-300" />
              {link.branchName}
            </p>
            <p className="mt-1.5 flex items-center gap-2 text-[11px] text-neutral-500 sm:mt-2 sm:text-xs">
              <Clock3 className="size-4" />
              Valido hasta {new Date(link.expiresAt).toLocaleString("es-BO")}
            </p>
          </div>

          <div className="space-y-2 p-2.5 sm:p-4">
            {link.items.map((item) => (
              <article
                key={`${item.productId}-${item.name}`}
                className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 sm:p-4"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-sm leading-snug font-semibold break-words text-neutral-100 sm:text-base">
                      {item.name}
                    </p>
                    <p className="mt-1 text-[11px] text-emerald-300 sm:text-xs">
                      {item.quantity} × {money(item.unitPrice)}
                      {item.sku ? ` · ${item.sku}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold sm:text-base">
                    {money(item.subtotal)}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className="border-t border-neutral-800 p-3 sm:p-5">
            <div className="flex items-center justify-between text-lg font-semibold sm:text-xl">
              <span>Total</span>
              <span>{money(link.total)}</span>
            </div>

            {isPaid ? (
              <div className="mt-4 rounded-lg border border-emerald-700 bg-emerald-950 p-4 text-center sm:mt-5 sm:p-5">
                <CheckCircle2 className="mx-auto size-10 text-emerald-300 sm:size-12" />
                <p className="mt-3 text-lg font-semibold text-emerald-100">
                  Pago confirmado
                </p>
                <p className="mt-1 text-sm text-emerald-300">
                  {link.saleNumber
                    ? `Venta ${link.saleNumber}`
                    : "Gracias por tu pago."}
                </p>
              </div>
            ) : unavailable ? (
              <div className="mt-5 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
                {unavailable}
              </div>
            ) : paymentReceived ? (
              <div className="mt-5 rounded-lg border border-amber-700 bg-amber-950/40 p-4 text-center text-sm text-amber-100">
                El pago fue confirmado. El comercio esta terminando de registrar
                la venta.
              </div>
            ) : showQr ? (
              <div className="mt-5 text-center">
                <div className="mx-auto w-fit rounded-xl bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="Codigo QR para pagar"
                    className="size-52 max-w-full object-contain sm:size-64"
                    src={qrSource(link.qrImage)}
                  />
                </div>
                <p className="mt-3 text-sm text-neutral-400">
                  Escanea el QR desde la app de tu banco.
                </p>
                <div className="mt-2 flex items-center justify-center gap-2 text-xs text-cyan-300">
                  {isChecking ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <QrCode className="size-4" />
                  )}
                  Esperando confirmacion del pago
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={generateQr}
                disabled={isGenerating}
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60 sm:mt-5 sm:h-13 sm:text-base"
              >
                {isGenerating ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <QrCode className="size-5" />
                )}
                {isGenerating ? "Generando QR..." : "Pagar"}
              </button>
            )}

            {error && !unavailable ? (
              <p className="mt-4 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            ) : null}
          </div>
        </section>
        <p className="mt-4 text-center text-xs text-neutral-600">
          El QR se genera al confirmar que deseas pagar.
        </p>
      </div>
    </main>
  );
}
