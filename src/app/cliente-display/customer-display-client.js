"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  CircleCheck,
  Monitor,
  QrCode,
  ShoppingBag,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  CUSTOMER_DISPLAY_VERSION,
  createEmptyCustomerDisplaySnapshot,
  getCustomerDisplayChannelName,
  getCustomerDisplayHeartbeatKey,
  getCustomerDisplayStorageKey,
} from "@/lib/pos/customer-display";

const PAYMENT_SUCCESS_RESET_DELAY_MS = 2500;

function money(value) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
  }).format(value || 0);
}

function getQrImageSrc(value = "") {
  const qrImage = value.trim();

  if (!qrImage) {
    return "";
  }

  if (qrImage.startsWith("data:") || qrImage.startsWith("http")) {
    return qrImage;
  }

  if (qrImage.startsWith("<svg")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrImage)}`;
  }

  return `data:image/png;base64,${qrImage}`;
}

function parseSnapshot(value) {
  if (!value) {
    return null;
  }

  try {
    const snapshot = JSON.parse(value);

    if (snapshot?.version !== CUSTOMER_DISPLAY_VERSION) {
      return null;
    }

    return snapshot;
  } catch {
    return null;
  }
}

export default function CustomerDisplayClient({ initialSessionId }) {
  const latestUpdatedAtRef = useRef("");
  const latestHeartbeatRef = useRef("");
  const successTimerRef = useRef(null);
  const activeSuccessIdRef = useRef("");
  const dismissedSuccessIdRef = useRef("");
  const playedSuccessAudioIdsRef = useRef(new Set());
  const successAudioRef = useRef(null);
  const [snapshot, setSnapshot] = useState(() =>
    createEmptyCustomerDisplaySnapshot(initialSessionId),
  );
  const [successOverlay, setSuccessOverlay] = useState(null);
  const [lastMessageAt, setLastMessageAt] = useState("");
  const [now, setNow] = useState(Date.now());
  const [hasQrLogoImageError, setHasQrLogoImageError] = useState(false);
  const isConnected = Boolean(
    lastMessageAt && now - Date.parse(lastMessageAt) < 12_000,
  );
  const qrImageSrc = getQrImageSrc(snapshot.qr?.qrImage || "");
  const logoUrl = snapshot.qr?.logoUrl || "";
  const qrLogoUrl = logoUrl && !hasQrLogoImageError ? logoUrl : "";
  const hasCart = snapshot.cart.length > 0;
  const isQrPayment = snapshot.payment.type === "qr" || Boolean(snapshot.qr);
  const visibleCartItems = snapshot.cart.slice(0, 8);
  const hiddenCartItems = Math.max(
    snapshot.cart.length - visibleCartItems.length,
    0,
  );

  const paymentStatus = useMemo(() => {
    if (snapshot.sale.error) {
      return {
        tone: "error",
        text: snapshot.sale.error,
      };
    }

    if (snapshot.sale.message) {
      return {
        tone: "success",
        text: snapshot.sale.message,
      };
    }

    if (snapshot.qr?.status === "paid") {
      return {
        tone: "success",
        text: "Pago QR confirmado.",
      };
    }

    if (snapshot.qr) {
      return {
        tone: "pending",
        text: "QR listo para pagar.",
      };
    }

    if (hasCart) {
      return {
        tone: "pending",
        text: "Venta en curso.",
      };
    }

    return {
      tone: "idle",
      text: "Esperando nueva venta.",
    };
  }, [hasCart, snapshot.payment.type, snapshot.qr, snapshot.sale]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setHasQrLogoImageError(false);
  }, [logoUrl]);

  useEffect(
    () => () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!initialSessionId) {
      return;
    }

    const storageKey = getCustomerDisplayStorageKey(initialSessionId);
    const heartbeatKey = getCustomerDisplayHeartbeatKey(initialSessionId);
    const markConnected = () => setLastMessageAt(new Date().toISOString());
    const resetToEmptySnapshot = () => {
      activeSuccessIdRef.current = "";
      setSuccessOverlay(null);
      setSnapshot((current) => {
        const emptySnapshot = {
          ...createEmptyCustomerDisplaySnapshot(initialSessionId),
          branch: current.branch,
          cashier: current.cashier,
          updatedAt: new Date().toISOString(),
        };

        try {
          window.localStorage.setItem(
            storageKey,
            JSON.stringify(emptySnapshot),
          );
        } catch {
          // The live display still resets even if localStorage is blocked.
        }

        latestUpdatedAtRef.current = emptySnapshot.updatedAt;

        return emptySnapshot;
      });
    };
    const playSuccessAudioOnce = (successId) => {
      if (!successId || playedSuccessAudioIdsRef.current.has(successId)) {
        return;
      }

      playedSuccessAudioIdsRef.current.add(successId);
      const successAudio = successAudioRef.current;

      if (successAudio) {
        successAudio.currentTime = 0;
        const playPromise = successAudio.play();
        playPromise?.catch?.(() => {});
      }
    };
    const applySnapshot = (nextSnapshot) => {
      if (!nextSnapshot || nextSnapshot.version !== CUSTOMER_DISPLAY_VERSION) {
        return;
      }

      setSnapshot({
        ...createEmptyCustomerDisplaySnapshot(initialSessionId),
        ...nextSnapshot,
      });
      latestUpdatedAtRef.current = nextSnapshot.updatedAt || "";
      markConnected();

      if (nextSnapshot.qr?.status === "paid") {
        playSuccessAudioOnce(
          nextSnapshot.qr.qrId ||
            nextSnapshot.qr.transactionId ||
            nextSnapshot.qr.checkedAt,
        );
      }

      const completedSale = nextSnapshot.sale?.completed;
      const completedSaleId =
        completedSale?.id ||
        completedSale?.saleNumber ||
        completedSale?.completedAt ||
        "";

      if (
        completedSaleId &&
        completedSaleId !== activeSuccessIdRef.current &&
        completedSaleId !== dismissedSuccessIdRef.current
      ) {
        activeSuccessIdRef.current = completedSaleId;
        setSuccessOverlay(completedSale);
        playSuccessAudioOnce(completedSaleId);

        if (successTimerRef.current) {
          window.clearTimeout(successTimerRef.current);
        }

        successTimerRef.current = window.setTimeout(() => {
          dismissedSuccessIdRef.current = completedSaleId;
          resetToEmptySnapshot();
        }, PAYMENT_SUCCESS_RESET_DELAY_MS);
        return;
      }

      if (nextSnapshot.qr?.status === "paid" && !completedSaleId) {
        if (successTimerRef.current) {
          window.clearTimeout(successTimerRef.current);
        }

        successTimerRef.current = window.setTimeout(() => {
          resetToEmptySnapshot();
        }, PAYMENT_SUCCESS_RESET_DELAY_MS);
      }
    };
    let storedSnapshot = null;

    try {
      storedSnapshot = parseSnapshot(window.localStorage.getItem(storageKey));
    } catch {
      storedSnapshot = null;
    }

    if (storedSnapshot) {
      applySnapshot(storedSnapshot);
    }

    const channel =
      typeof window.BroadcastChannel === "function"
        ? new BroadcastChannel(getCustomerDisplayChannelName(initialSessionId))
        : null;

    if (channel) {
      channel.onmessage = (event) => {
        if (event.data?.type === "snapshot") {
          applySnapshot(event.data.snapshot);
          return;
        }

        if (event.data?.type === "heartbeat") {
          latestHeartbeatRef.current = event.data.heartbeat || "";
          markConnected();
        }
      };
      channel.postMessage({
        type: "display-ready",
        sessionId: initialSessionId,
      });
    }

    const fallbackInterval = window.setInterval(() => {
      let nextSnapshot = null;

      try {
        nextSnapshot = parseSnapshot(window.localStorage.getItem(storageKey));
      } catch {
        nextSnapshot = null;
      }

      if (
        nextSnapshot &&
        nextSnapshot.updatedAt !== latestUpdatedAtRef.current
      ) {
        applySnapshot(nextSnapshot);
      }

      let heartbeat = "";

      try {
        heartbeat = window.localStorage.getItem(heartbeatKey) || "";
      } catch {
        heartbeat = "";
      }

      if (heartbeat && heartbeat !== latestHeartbeatRef.current) {
        latestHeartbeatRef.current = heartbeat;
        markConnected();
      }
    }, 500);

    return () => {
      channel?.close();
      window.clearInterval(fallbackInterval);
    };
  }, [initialSessionId]);

  if (!initialSessionId) {
    return (
      <main className="grid h-screen place-items-center overflow-hidden bg-neutral-950 px-6 text-neutral-100">
        <div className="max-w-xl text-center">
          <Monitor className="mx-auto size-12 text-neutral-500" />
          <p className="mt-3 text-neutral-400">
            Abre esta pantalla desde el punto de venta del cajero.
          </p>
        </div>
      </main>
    );
  }

  const greenOverlay =
    successOverlay ||
    snapshot.sale.completed ||
    (snapshot.qr?.status === "paid"
      ? {
          message: "Pago QR confirmado.",
          total: snapshot.qr.amount || snapshot.totals.total,
          saleNumber: "",
        }
      : null);

  if (greenOverlay) {
    return (
      <main className="grid h-screen place-items-center overflow-hidden bg-emerald-950 px-8 text-emerald-50">
        <audio
          ref={successAudioRef}
          src="/sounds/payment-success.mp3"
          preload="auto"
        />
        <div className="text-center">
          <div className="mx-auto grid size-28 place-items-center rounded-full border border-emerald-700 bg-emerald-900">
            <CircleCheck className="size-16" />
          </div>
          <p className="mt-8 text-sm font-semibold tracking-[0.28em] text-emerald-200 uppercase">
            Pago exitoso
          </p>
          <h1 className="mt-4 text-5xl font-semibold">
            {greenOverlay.message || "Compra confirmada."}
          </h1>
          <p className="mt-6 text-6xl font-semibold tracking-normal">
            {money(greenOverlay.total)}
          </p>
          {greenOverlay.saleNumber ? (
            <p className="mt-6 text-lg text-emerald-200">
              Venta {greenOverlay.saleNumber}
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-neutral-950 p-4 text-neutral-100 lg:p-6">
      <audio
        ref={successAudioRef}
        src="/sounds/payment-success.mp3"
        preload="auto"
      />
      <section
        className={`grid h-full min-h-0 gap-4 ${
          isQrPayment
            ? "grid-cols-[minmax(280px,0.72fr)_minmax(360px,1.28fr)]"
            : "grid-cols-2"
        }`}
      >
        <div className="flex min-h-0 flex-col rounded-md border border-neutral-800 bg-neutral-950">
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-800 px-5 py-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-400">
                {snapshot.cashier.name || "Cajero"}
              </p>
              <h1 className="mt-1 text-2xl font-semibold">Detalle de compra</h1>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 text-right">
              <span
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
                  isConnected
                    ? "border-emerald-900 bg-emerald-950 text-emerald-200"
                    : "border-neutral-800 bg-neutral-900 text-neutral-400"
                }`}
              >
                {isConnected ? (
                  <Wifi className="size-4" />
                ) : (
                  <WifiOff className="size-4" />
                )}
                {isConnected ? "Conectado" : "Sin conexion"}
              </span>
              <p className="max-w-56 truncate text-sm font-semibold text-neutral-300">
                {snapshot.branch.name || "Sucursal"}
              </p>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_86px_130px] border-b border-neutral-800 bg-neutral-900 px-5 py-3 text-xs font-medium text-neutral-500 uppercase">
            <span>Producto</span>
            <span className="text-center">Cant.</span>
            <span className="text-right">Subtotal</span>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {hasCart ? (
              <div className="h-full">
                {visibleCartItems.map((item) => (
                  <div
                    key={item.id}
                    className={`mx-3 my-3 grid grid-cols-[minmax(0,1fr)_86px_130px] items-center rounded-md border p-3 ${
                      item.category === "monthly"
                        ? "border-cyan-800 bg-cyan-950/30"
                        : "border-emerald-800 bg-emerald-950/30"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold">
                        {item.name}
                      </p>
                      <p className="mt-1 truncate text-sm text-neutral-500">
                        {item.category === "monthly"
                          ? `Mensualidad${item.customerName ? ` · ${item.customerName}` : ""}`
                          : item.sku}
                      </p>
                    </div>
                    <p className="text-center text-xl font-semibold">
                      {item.quantity}
                    </p>
                    <p className="text-right text-lg font-semibold">
                      {money(item.subtotal)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid h-full place-items-center px-6 text-center text-neutral-500">
                <div>
                  <ShoppingBag className="mx-auto size-10" />
                  <p className="mt-4 text-lg font-medium">
                    Esperando productos
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-neutral-800 px-5 py-3">
            <p className="text-sm text-neutral-500">
              {snapshot.cart.length} productos
              {hiddenCartItems > 0 ? ` / ${hiddenCartItems} mas` : ""}
            </p>
            <p className="text-sm font-semibold text-neutral-300">
              Total {money(snapshot.totals.total)}
            </p>
          </div>
        </div>

        <aside
          className={`flex min-h-0 flex-col rounded-md border border-neutral-800 bg-neutral-900 ${
            isQrPayment ? "justify-center p-4" : "p-5"
          }`}
        >
          <div
            className={`mx-auto flex aspect-square shrink-0 flex-col rounded-md border border-neutral-800 bg-neutral-950 ${
              isQrPayment
                ? "w-[min(100%,calc(100vh-72px))] p-3"
                : "w-[min(100%,calc(100vh-230px))] p-4"
            }`}
          >
            {isQrPayment ? (
              <>
                <div className="relative grid min-h-0 flex-1 place-items-center rounded-md bg-white p-2">
                  {snapshot.qr && qrImageSrc ? (
                    <>
                      <img
                        src={qrImageSrc}
                        alt="QR simple Baneco"
                        className="max-h-full max-w-full object-contain"
                      />
                      {qrLogoUrl ? (
                        <div className="pointer-events-none absolute top-1/2 left-1/2 grid aspect-square h-[11%] min-h-8 w-[11%] min-w-8 -translate-x-1/2 -translate-y-1/2 place-items-center overflow-hidden rounded-full bg-white p-0.5 shadow-sm ring-2 ring-white">
                          <img
                            src={qrLogoUrl}
                            alt=""
                            onError={() => setHasQrLogoImageError(true)}
                            className="max-h-full max-w-full rounded-full object-contain"
                          />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="grid aspect-square w-full max-w-72 place-items-center rounded-md border border-neutral-200 text-center text-neutral-500">
                      QR pendiente
                    </div>
                  )}
                </div>
              </>
            ) : snapshot.payment.type === "cash" ? (
              <div className="grid h-full place-items-center">
                <div className="w-full text-center">
                  <Banknote className="mx-auto size-14 text-neutral-500" />
                  <p className="mt-4 text-xs font-medium text-neutral-500 uppercase">
                    Pago en efectivo
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {paymentStatus.text}
                  </p>
                  <div className="mt-6 grid grid-cols-2 gap-3 text-left">
                    <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                      <p className="text-xs font-medium text-neutral-500 uppercase">
                        Recibido
                      </p>
                      <p className="mt-2 text-lg font-semibold">
                        {money(snapshot.totals.paid)}
                      </p>
                    </div>
                    <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                      <p className="text-xs font-medium text-neutral-500 uppercase">
                        Cambio
                      </p>
                      <p className="mt-2 text-lg font-semibold">
                        {money(snapshot.totals.change)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <Monitor className="mx-auto size-14 text-neutral-500" />
                  <p className="mt-4 text-xs font-medium text-neutral-500 uppercase">
                    Metodo de pago
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {paymentStatus.text}
                  </p>
                </div>
              </div>
            )}
          </div>

          {!isQrPayment ? (
            <div className="mt-4 flex min-h-0 flex-1 flex-col justify-center rounded-md border border-neutral-800 bg-neutral-950 p-5">
              <p className="text-xs font-medium text-neutral-500 uppercase">
                Total a pagar
              </p>
              <p className="mt-2 text-5xl font-semibold tracking-normal">
                {money(snapshot.totals.total)}
              </p>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
