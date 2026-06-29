"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  CircleCheck,
  CreditCard,
  ExternalLink,
  Loader2,
  Monitor,
  Minus,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  CUSTOMER_DISPLAY_SESSION_STORAGE_KEY,
  CUSTOMER_DISPLAY_VERSION,
  createEmptyCustomerDisplaySnapshot,
  getCustomerDisplayChannelName,
  getCustomerDisplayHeartbeatKey,
  getCustomerDisplayStorageKey,
} from "@/lib/pos/customer-display";

const PRODUCT_PAGE_SIZE = 20;

const paymentIcons = {
  cash: Banknote,
  qr: QrCode,
  card: CreditCard,
};

const paymentToneClasses = {
  cash: {
    active:
      "border-emerald-300 bg-emerald-400 text-emerald-950 shadow-[0_0_0_1px_rgba(110,231,183,0.45)]",
    idle: "border-emerald-800 bg-emerald-950 text-emerald-100 hover:border-emerald-400 hover:bg-emerald-800",
  },
  qr: {
    active:
      "border-cyan-200 bg-cyan-400 text-cyan-950 shadow-[0_0_0_1px_rgba(103,232,249,0.45)]",
    idle: "border-cyan-800 bg-cyan-950 text-cyan-100 hover:border-cyan-400 hover:bg-cyan-800",
  },
  card: {
    active:
      "border-fuchsia-200 bg-fuchsia-400 text-fuchsia-950 shadow-[0_0_0_1px_rgba(240,171,252,0.45)]",
    idle: "border-fuchsia-800 bg-fuchsia-950 text-fuchsia-100 hover:border-fuchsia-400 hover:bg-fuchsia-800",
  },
};

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

function mergeProducts(current, nextProducts) {
  const existingIds = new Set(current.map((product) => product.id));
  const uniqueNext = nextProducts.filter(
    (product) => !existingIds.has(product.id),
  );

  return [...current, ...uniqueNext];
}

function getSuccessMessage({ paymentType, senderName }) {
  const safeName = typeof senderName === "string" ? senderName.trim() : "";

  if (safeName) {
    return `Gracias, ${safeName}. Pago registrado.`;
  }

  if (paymentType === "qr") {
    return "Pago QR confirmado.";
  }

  if (paymentType === "cash") {
    return "Pago en efectivo confirmado.";
  }

  return "Pago confirmado.";
}

function buildCompletedSaleSnapshot({
  displaySessionId,
  selectedBranch,
  user,
  completedSale,
  successMessage,
  saleNumber,
}) {
  return {
    ...createEmptyCustomerDisplaySnapshot(displaySessionId),
    branch: {
      id: selectedBranch?.id || "",
      name: selectedBranch?.name || "",
      city: selectedBranch?.city || "",
    },
    cashier: {
      name: user.name || user.email,
      email: user.email,
    },
    sale: {
      message: `${successMessage} Venta ${saleNumber} registrada.`,
      error: "",
      completed: completedSale,
      isCharging: false,
      isGeneratingQr: false,
      isCheckingQr: false,
    },
    updatedAt: new Date().toISOString(),
  };
}

export default function DashboardClient({ user, catalog, catalogError = "" }) {
  const requestIdRef = useRef(0);
  const qrCheckInFlightRef = useRef(false);
  const qrAutoRegisterInFlightRef = useRef(false);
  const qrPaymentRef = useRef(null);
  const qrWarmupKeysRef = useRef(new Set());
  const saleResetTimerRef = useRef(null);
  const customerDisplayChannelRef = useRef(null);
  const customerDisplaySnapshotRef = useRef(null);
  const paymentSuccessAudioRef = useRef(null);
  const [displaySessionId, setDisplaySessionId] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState(
    catalog.branches[0]?.id || "",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [saleMessage, setSaleMessage] = useState("");
  const [saleError, setSaleError] = useState("");
  const [lastCompletedSale, setLastCompletedSale] = useState(null);
  const [isCharging, setIsCharging] = useState(false);
  const [qrPayment, setQrPayment] = useState(null);
  const [isQrPanelOpen, setIsQrPanelOpen] = useState(false);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [isCheckingQr, setIsCheckingQr] = useState(false);
  const [products, setProducts] = useState(
    catalog.productsPage?.products || [],
  );
  const [nextOffset, setNextOffset] = useState(
    catalog.productsPage?.nextOffset || 0,
  );
  const [hasMoreProducts, setHasMoreProducts] = useState(
    catalog.productsPage?.hasMore || false,
  );
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState("");

  const selectedBranch = useMemo(
    () =>
      catalog.branches.find((branch) => branch.id === selectedBranchId) ||
      catalog.branches[0],
    [catalog.branches, selectedBranchId],
  );

  const branchPaymentMethods = useMemo(
    () =>
      catalog.paymentMethods.filter(
        (method) => method.branchId === selectedBranchId,
      ),
    [catalog.paymentMethods, selectedBranchId],
  );

  const selectedPayment =
    branchPaymentMethods.find((method) => method.id === selectedPaymentId) ||
    branchPaymentMethods[0];
  const isBanecoQrPayment =
    selectedPayment?.type === "qr" &&
    selectedPayment?.config?.provider === "baneco";
  const isUnavailableQrPayment =
    selectedPayment?.type === "qr" && !isBanecoQrPayment;
  const isBusy = isCharging || isGeneratingQr || isCheckingQr;
  const hasSaleState =
    cart.length > 0 ||
    Boolean(amountPaid) ||
    Boolean(qrPayment) ||
    Boolean(saleMessage) ||
    Boolean(saleError) ||
    Boolean(lastCompletedSale);
  const displayPayment = cart.length > 0 ? selectedPayment : null;
  const cartSignature = useMemo(
    () =>
      cart
        .map((item) => `${item.id}:${item.quantity}`)
        .sort()
        .join("|"),
    [cart],
  );

  const totals = useMemo(() => {
    const subtotal = cart.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    );
    const paid = Number(amountPaid) || 0;

    return {
      subtotal,
      discount: 0,
      total: subtotal,
      paid,
      change: Math.max(paid - subtotal, 0),
    };
  }, [amountPaid, cart]);
  const customerDisplaySnapshot = useMemo(
    () => ({
      version: CUSTOMER_DISPLAY_VERSION,
      sessionId: displaySessionId,
      branch: {
        id: selectedBranch?.id || "",
        name: selectedBranch?.name || "",
        city: selectedBranch?.city || "",
      },
      cashier: {
        name: user.name || user.email,
        email: user.email,
      },
      cart: cart.map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.price,
        subtotal: item.price * item.quantity,
      })),
      totals: {
        subtotal: totals.subtotal,
        discount: totals.discount,
        total: totals.total,
        paid: displayPayment
          ? displayPayment.type === "cash"
            ? totals.paid
            : totals.total
          : 0,
        change: displayPayment?.type === "cash" ? totals.change : 0,
      },
      payment: {
        id: displayPayment?.id || "",
        type: displayPayment?.type || "",
        label: displayPayment?.label || "",
        provider: displayPayment?.config?.provider || "",
      },
      qr:
        cart.length > 0 && isBanecoQrPayment && qrPayment
          ? {
              qrId: qrPayment.qrId,
              qrImage: qrPayment.qrImage,
              amount: qrPayment.amount,
              status: qrPayment.status,
              transactionId: qrPayment.transactionId,
              checkedAt: qrPayment.checkedAt || "",
            }
          : null,
      sale: {
        message: saleMessage,
        error: saleError,
        completed: lastCompletedSale,
        isCharging,
        isGeneratingQr,
        isCheckingQr,
      },
      updatedAt: new Date().toISOString(),
    }),
    [
      cart,
      displaySessionId,
      isBanecoQrPayment,
      isCharging,
      isCheckingQr,
      isGeneratingQr,
      lastCompletedSale,
      qrPayment,
      saleError,
      saleMessage,
      selectedBranch,
      displayPayment,
      totals,
      user.email,
      user.name,
    ],
  );

  useEffect(() => {
    resetPosSale({ clearSearch: true });
  }, [selectedBranchId]);

  useEffect(() => {
    if (!displaySessionId) {
      let storedSessionId = "";

      try {
        storedSessionId =
          window.localStorage
            .getItem(CUSTOMER_DISPLAY_SESSION_STORAGE_KEY)
            ?.trim() || "";
      } catch {
        storedSessionId = "";
      }

      const randomPart = Math.random().toString(36).slice(2, 10);
      const sessionId =
        storedSessionId ||
        window.crypto?.randomUUID?.() ||
        `${Date.now()}-${randomPart}`;

      try {
        window.localStorage.setItem(
          CUSTOMER_DISPLAY_SESSION_STORAGE_KEY,
          sessionId,
        );
      } catch {
        // A runtime session still works with BroadcastChannel.
      }
      setDisplaySessionId(sessionId);
    }
  }, [displaySessionId]);

  useEffect(() => {
    customerDisplaySnapshotRef.current = customerDisplaySnapshot;
  }, [customerDisplaySnapshot]);

  useEffect(() => {
    qrPaymentRef.current = qrPayment;
  }, [qrPayment]);

  useEffect(
    () => () => {
      if (saleResetTimerRef.current) {
        window.clearTimeout(saleResetTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!displaySessionId || typeof window.BroadcastChannel !== "function") {
      return;
    }

    const channel = new BroadcastChannel(
      getCustomerDisplayChannelName(displaySessionId),
    );
    customerDisplayChannelRef.current = channel;
    channel.onmessage = (event) => {
      if (event.data?.type === "display-ready") {
        publishCustomerDisplaySnapshot();
      }
    };

    return () => {
      channel.close();
      customerDisplayChannelRef.current = null;
    };
  }, [displaySessionId]);

  useEffect(() => {
    publishCustomerDisplaySnapshot();
  }, [customerDisplaySnapshot]);

  useEffect(() => {
    if (!displaySessionId) {
      return;
    }

    function publishHeartbeat() {
      const heartbeat = new Date().toISOString();

      try {
        window.localStorage.setItem(
          getCustomerDisplayHeartbeatKey(displaySessionId),
          heartbeat,
        );
      } catch {
        // BroadcastChannel keeps the live display connected when storage fails.
      }

      customerDisplayChannelRef.current?.postMessage({
        type: "heartbeat",
        heartbeat,
      });
    }

    publishHeartbeat();
    const interval = window.setInterval(publishHeartbeat, 3000);

    return () => window.clearInterval(interval);
  }, [displaySessionId]);

  useEffect(() => {
    if (!displaySessionId) {
      return;
    }

    return () => {
      publishCustomerDisplayResetSnapshot();
    };
  }, [displaySessionId, selectedBranch, user.email, user.name]);

  useEffect(() => {
    setSelectedPaymentId(branchPaymentMethods[0]?.id || "");
  }, [branchPaymentMethods]);

  useEffect(() => {
    setQrPayment(null);
    qrPaymentRef.current = null;
    setIsQrPanelOpen(false);
  }, [cartSignature, selectedPaymentId]);

  useEffect(() => {
    if (!selectedBranchId) {
      return;
    }

    const banecoQrMethods = branchPaymentMethods.filter(
      (method) => method.type === "qr" && method.config?.provider === "baneco",
    );

    if (banecoQrMethods.length === 0) {
      return;
    }

    const controllers = [];

    for (const method of banecoQrMethods) {
      const warmupKey = `${selectedBranchId}:${method.id}`;

      if (qrWarmupKeysRef.current.has(warmupKey)) {
        continue;
      }

      qrWarmupKeysRef.current.add(warmupKey);
      const controller = new AbortController();
      controllers.push(controller);

      fetch("/api/pos/baneco-qr/warmup", {
        method: "POST",
        credentials: "same-origin",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId: selectedBranchId,
          paymentMethodId: method.id,
        }),
      }).catch((error) => {
        if (error.name !== "AbortError") {
          qrWarmupKeysRef.current.delete(warmupKey);
        }
      });
    }

    return () => {
      for (const controller of controllers) {
        controller.abort();
      }
    };
  }, [branchPaymentMethods, selectedBranchId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadProductsPage({ reset: true });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [selectedBranchId, searchTerm]);

  useEffect(() => {
    if (
      !isBanecoQrPayment ||
      !qrPayment ||
      qrPayment.status !== "pending" ||
      isCharging
    ) {
      return;
    }

    const firstCheck = window.setTimeout(() => {
      checkQrPayment({ autoRegister: true, silent: true });
    }, 700);
    const interval = window.setInterval(() => {
      checkQrPayment({ autoRegister: true, silent: true });
    }, 1500);

    return () => {
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
    };
  }, [
    isBanecoQrPayment,
    isCharging,
    qrPayment?.paymentToken,
    qrPayment?.qrId,
    qrPayment?.status,
  ]);

  async function loadProductsPage({ reset = false } = {}) {
    if (!selectedBranchId || (!reset && isLoadingProducts)) {
      return;
    }

    if (!reset && !hasMoreProducts) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const offset = reset ? 0 : nextOffset;
    const params = new URLSearchParams({
      branchId: selectedBranchId,
      search: searchTerm,
      offset: String(offset),
      limit: String(PRODUCT_PAGE_SIZE),
    });

    setIsLoadingProducts(true);
    setProductsError("");

    try {
      const response = await fetch(`/api/pos/products?${params.toString()}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudieron cargar productos.");
      }

      if (requestIdRef.current !== requestId) {
        return;
      }

      setProducts((current) =>
        reset ? payload.products : mergeProducts(current, payload.products),
      );
      setNextOffset(payload.nextOffset);
      setHasMoreProducts(payload.hasMore);
    } catch (error) {
      if (requestIdRef.current === requestId) {
        setProductsError(error.message || "No se pudieron cargar productos.");
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoadingProducts(false);
      }
    }
  }

  function handleProductsScroll(event) {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;

    if (scrollHeight - scrollTop - clientHeight < 180) {
      loadProductsPage();
    }
  }

  function addToCart(product) {
    setSaleMessage("");
    setSaleError("");
    setLastCompletedSale(null);
    const branchStock = product.stockByBranch[selectedBranchId]?.quantity || 0;

    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);

      if (existing) {
        return current.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: Math.min(item.quantity + 1, branchStock),
              }
            : item,
        );
      }

      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          quantity: 1,
          stock: branchStock,
        },
      ];
    });
  }

  function updateQuantity(productId, direction) {
    setSaleMessage("");
    setSaleError("");
    setLastCompletedSale(null);
    setCart((current) =>
      current
        .map((item) => {
          if (item.id !== productId) {
            return item;
          }

          return {
            ...item,
            quantity:
              direction === "increase"
                ? Math.min(item.quantity + 1, item.stock)
                : item.quantity - 1,
          };
        })
        .filter((item) => item.quantity > 0),
    );
  }

  function removeFromCart(productId) {
    setSaleMessage("");
    setSaleError("");
    setLastCompletedSale(null);
    setCart((current) => current.filter((item) => item.id !== productId));
  }

  function buildCustomerDisplayResetSnapshot() {
    return {
      ...createEmptyCustomerDisplaySnapshot(displaySessionId),
      branch: {
        id: selectedBranch?.id || "",
        name: selectedBranch?.name || "",
        city: selectedBranch?.city || "",
      },
      cashier: {
        name: user.name || user.email,
        email: user.email,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  function publishCustomerDisplaySnapshot(snapshotOverride = null) {
    const snapshot = snapshotOverride || customerDisplaySnapshotRef.current;

    if (!displaySessionId || !snapshot) {
      return;
    }

    customerDisplaySnapshotRef.current = snapshot;

    try {
      window.localStorage.setItem(
        getCustomerDisplayStorageKey(displaySessionId),
        JSON.stringify(snapshot),
      );
    } catch {
      // localStorage can be blocked, BroadcastChannel still covers live tabs.
    }

    customerDisplayChannelRef.current?.postMessage({
      type: "snapshot",
      snapshot,
    });
  }

  function publishCustomerDisplayResetSnapshot() {
    publishCustomerDisplaySnapshot(buildCustomerDisplayResetSnapshot());
  }

  function clearSaleResetTimer() {
    if (saleResetTimerRef.current) {
      window.clearTimeout(saleResetTimerRef.current);
      saleResetTimerRef.current = null;
    }
  }

  function scheduleSaleReset() {
    clearSaleResetTimer();
    saleResetTimerRef.current = window.setTimeout(() => {
      saleResetTimerRef.current = null;
      resetPosSale();
    }, 3600);
  }

  function playPaymentSuccessSound() {
    const audio = paymentSuccessAudioRef.current;

    if (!audio) {
      return;
    }

    audio.currentTime = 0;
    audio.play()?.catch?.(() => {});
  }

  function resetPosSale({ clearSearch = false } = {}) {
    clearSaleResetTimer();
    setCart([]);
    setAmountPaid("");
    setSaleMessage("");
    setSaleError("");
    setLastCompletedSale(null);
    qrPaymentRef.current = null;
    setQrPayment(null);
    setIsQrPanelOpen(false);

    if (clearSearch) {
      setSearchTerm("");
    }

    setSelectedPaymentId(branchPaymentMethods[0]?.id || "");
    publishCustomerDisplayResetSnapshot();
  }

  function openCustomerDisplay() {
    if (!displaySessionId) {
      return;
    }

    const url = `/cliente-display?session=${encodeURIComponent(displaySessionId)}`;
    window.open(url, `pos-customer-display-${displaySessionId}`, "noopener");
    window.setTimeout(() => publishCustomerDisplaySnapshot(), 250);
  }

  async function registerSale(extraPayload = {}) {
    setIsCharging(true);
    setSaleMessage("");
    setSaleError("");

    try {
      const response = await fetch("/api/pos/sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId: selectedBranchId,
          paymentMethodId: selectedPayment.id,
          amountPaid:
            selectedPayment.type === "cash" ? totals.paid : totals.total,
          items: cart.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
          ...extraPayload,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo registrar la venta.");
      }

      const successMessage = getSuccessMessage({
        paymentType: selectedPayment.type,
        senderName: payload.sale.senderName,
      });
      const completedSale = {
        id: payload.sale.id,
        saleNumber: payload.sale.saleNumber,
        total: totals.total,
        paymentType: selectedPayment.type,
        paymentLabel: selectedPayment.label,
        senderName: payload.sale.senderName || "",
        message: successMessage,
        completedAt: new Date().toISOString(),
      };
      const completedSnapshot = buildCompletedSaleSnapshot({
        displaySessionId,
        selectedBranch,
        user,
        completedSale,
        successMessage,
        saleNumber: payload.sale.saleNumber,
      });

      setLastCompletedSale(completedSale);
      setSaleMessage(
        `${successMessage} Venta ${payload.sale.saleNumber} registrada.`,
      );
      publishCustomerDisplaySnapshot(completedSnapshot);
      playPaymentSuccessSound();
      setCart([]);
      setAmountPaid("");
      qrPaymentRef.current = null;
      setQrPayment(null);
      setIsQrPanelOpen(false);
      scheduleSaleReset();
      await loadProductsPage({ reset: true });
    } catch (error) {
      setSaleError(error.message || "No se pudo registrar la venta.");
    } finally {
      setIsCharging(false);
    }
  }

  async function generateQrPayment() {
    if (cart.length === 0 || !selectedPayment) {
      return;
    }

    setIsGeneratingQr(true);
    setSaleMessage("");
    setSaleError("");

    try {
      const response = await fetch("/api/pos/baneco-qr", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId: selectedBranchId,
          paymentMethodId: selectedPayment.id,
          items: cart.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo generar el QR.");
      }

      const generatedQr = payload.qr;

      qrPaymentRef.current = generatedQr;
      setQrPayment(generatedQr);
      setIsQrPanelOpen(true);
      setSaleMessage("QR Baneco generado. Esperando pago...");

      window.setTimeout(() => {
        checkQrPayment({
          autoRegister: true,
          silent: true,
          paymentOverride: generatedQr,
        });
      }, 500);
    } catch (error) {
      setSaleError(error.message || "No se pudo generar el QR.");
    } finally {
      setIsGeneratingQr(false);
    }
  }

  async function checkQrPayment({
    autoRegister = false,
    silent = false,
    paymentOverride = null,
  } = {}) {
    const currentQrPayment = paymentOverride || qrPaymentRef.current;

    if (!currentQrPayment || qrCheckInFlightRef.current) {
      return;
    }

    qrCheckInFlightRef.current = true;
    setIsCheckingQr(true);

    if (!silent) {
      setSaleMessage("");
      setSaleError("");
    }

    try {
      const response = await fetch("/api/pos/baneco-qr/status", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId: selectedBranchId,
          paymentMethodId: selectedPayment.id,
          qrId: currentQrPayment.qrId,
          paymentToken: currentQrPayment.paymentToken,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo consultar el QR.");
      }

      const nextQrPayment = currentQrPayment
        ? {
            ...currentQrPayment,
            status: payload.status.status,
            statusCode: payload.status.statusCode,
            checkedAt: payload.status.checkedAt,
            confirmedAmount: payload.status.confirmedAmount,
            senderName: payload.status.senderName || "",
            senderDocumentId: payload.status.senderDocumentId || "",
            senderAccount: payload.status.senderAccount || "",
            paidToken:
              payload.status.paidToken || currentQrPayment.paidToken || "",
          }
        : null;

      qrPaymentRef.current = nextQrPayment;
      setQrPayment(nextQrPayment);

      if (payload.status.status === "paid") {
        setIsQrPanelOpen(false);
        setSaleMessage("Pago QR confirmado. Registrando venta...");
        publishCustomerDisplaySnapshot({
          ...customerDisplaySnapshotRef.current,
          qr: nextQrPayment
            ? {
                qrId: nextQrPayment.qrId,
                qrImage: nextQrPayment.qrImage,
                amount: nextQrPayment.amount,
                status: nextQrPayment.status,
                transactionId: nextQrPayment.transactionId,
                checkedAt: nextQrPayment.checkedAt || "",
              }
            : customerDisplaySnapshotRef.current?.qr || null,
          sale: {
            ...(customerDisplaySnapshotRef.current?.sale || {}),
            message: "Pago QR confirmado. Registrando venta...",
            error: "",
            isCheckingQr: false,
          },
          updatedAt: new Date().toISOString(),
        });

        if (autoRegister && !qrAutoRegisterInFlightRef.current) {
          qrAutoRegisterInFlightRef.current = true;
          await registerSale({
            banecoQr: {
              qrId: currentQrPayment.qrId,
              transactionId: currentQrPayment.transactionId,
              paymentToken: currentQrPayment.paymentToken,
              paidToken: payload.status.paidToken || nextQrPayment?.paidToken,
            },
          });
          qrAutoRegisterInFlightRef.current = false;
        }

        return;
      }

      if (payload.status.status === "cancelled") {
        setSaleMessage("");
        setSaleError("El QR fue cancelado en Baneco. Genera uno nuevo.");
        return;
      }

      if (!silent) {
        setSaleMessage("Pago QR pendiente de confirmacion.");
      }
    } catch (error) {
      qrAutoRegisterInFlightRef.current = false;
      if (!silent) {
        setSaleError(error.message || "No se pudo consultar el QR.");
      }
    } finally {
      qrCheckInFlightRef.current = false;
      setIsCheckingQr(false);
    }
  }

  async function completeSale() {
    if (cart.length === 0 || !selectedPayment) {
      return;
    }

    if (selectedPayment.type === "cash" && totals.paid < totals.total) {
      setSaleMessage("");
      setSaleError("El monto recibido no cubre el total.");
      return;
    }

    if (isBanecoQrPayment) {
      if (!qrPayment) {
        await generateQrPayment();
        return;
      }

      setIsQrPanelOpen(true);
      await checkQrPayment({ autoRegister: true });
      return;
    }

    await registerSale();
  }

  const qrImageSrc = getQrImageSrc(qrPayment?.qrImage || "");
  const shouldShowPaymentPanel = Boolean(
    isQrPanelOpen && isBanecoQrPayment && qrPayment && !lastCompletedSale,
  );
  const shouldShowSaleSuccessOverlay = Boolean(lastCompletedSale);
  const shouldShowInlineSaleMessage = Boolean(
    saleMessage && !lastCompletedSale,
  );
  const actionLabel = isGeneratingQr
    ? "Generando QR..."
    : isCheckingQr
      ? "Consultando QR..."
      : isCharging
        ? "Registrando..."
        : isBanecoQrPayment
          ? qrPayment
            ? "Confirmar pago QR"
            : "Generar QR"
          : isUnavailableQrPayment
            ? "QR no disponible"
            : "Cobrar venta";

  return (
    <>
      <audio
        ref={paymentSuccessAudioRef}
        src="/sounds/payment-success.mp3"
        preload="auto"
      />
      <section className="mx-auto grid h-[100dvh] w-full max-w-[1600px] gap-4 overflow-hidden px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="flex min-h-0 flex-col gap-4">
          {catalogError ? (
            <div className="rounded-md border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
              {catalogError}
            </div>
          ) : null}

          {productsError ? (
            <div className="rounded-md border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
              {productsError}
            </div>
          ) : null}

          <div className="shrink-0 space-y-3 border-b border-neutral-800 pb-4">
            <div className="text-center">
              <p className="text-[11px] font-medium tracking-[0.18em] text-neutral-600 uppercase">
                Cajero
              </p>
              <p className="mt-1 truncate text-sm font-medium text-neutral-300">
                {user.name || "Cajero"}
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center">
              <div className="min-w-48">
                <select
                  aria-label="Sucursal"
                  value={selectedBranchId}
                  onChange={(event) => setSelectedBranchId(event.target.value)}
                  className="h-12 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm font-medium text-neutral-100 transition outline-none focus:border-neutral-300"
                >
                  {catalog.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  list="product-search-options"
                  placeholder="Buscar por SKU, codigo o nombre"
                  className="h-12 w-full rounded-md border border-neutral-800 bg-neutral-900 px-10 pr-11 text-sm text-neutral-100 transition outline-none placeholder:text-neutral-600 focus:border-neutral-300"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
                    aria-label="Limpiar busqueda"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
                <datalist id="product-search-options">
                  {products.map((product) => (
                    <option
                      key={product.id}
                      value={`${product.sku} ${product.name}`}
                    />
                  ))}
                </datalist>
              </div>

              <button
                type="button"
                onClick={openCustomerDisplay}
                disabled={!displaySessionId}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-4 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                title="Abrir pantalla cliente"
              >
                <Monitor className="size-4" />
                Pantalla cliente
                <ExternalLink className="size-4 text-neutral-500" />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
            <div className="min-h-0 flex-1 overflow-x-auto">
              <div className="flex h-full min-w-[760px] flex-col">
                <div className="grid grid-cols-[minmax(260px,1fr)_120px_120px_110px_110px] border-b border-neutral-800 bg-neutral-950 px-4 py-3 text-xs font-medium text-neutral-500 uppercase">
                  <span>Producto</span>
                  <span>SKU</span>
                  <span>Precio</span>
                  <span>Stock</span>
                  <span className="text-right">Accion</span>
                </div>

                <div
                  onScroll={handleProductsScroll}
                  className="min-h-0 flex-1 overflow-y-auto"
                >
                  {products.map((product) => {
                    const stock =
                      product.stockByBranch[selectedBranchId]?.quantity || 0;

                    return (
                      <div
                        key={product.id}
                        className="grid grid-cols-[minmax(260px,1fr)_120px_120px_110px_110px] items-center border-b border-neutral-800 px-4 py-3 text-sm last:border-b-0 hover:bg-neutral-800/50"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-neutral-100">
                            {product.name}
                          </p>
                          <p className="mt-1 truncate text-xs text-neutral-500">
                            {product.barcode || "Sin codigo"}
                          </p>
                        </div>
                        <span className="font-medium text-neutral-300">
                          {product.sku}
                        </span>
                        <span className="font-semibold">
                          {money(product.price)}
                        </span>
                        <span className="text-neutral-300">{stock}</span>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => addToCart(product)}
                            className="inline-flex h-9 items-center gap-2 rounded-md bg-neutral-100 px-3 text-sm font-semibold text-neutral-950 transition hover:bg-white"
                          >
                            <Plus className="size-4" />
                            Agregar
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {products.length === 0 && !isLoadingProducts ? (
                    <div className="px-4 py-12 text-center text-sm text-neutral-500">
                      No hay productos para esta busqueda.
                    </div>
                  ) : null}

                  {isLoadingProducts ? (
                    <div className="px-4 py-5 text-center text-sm text-neutral-500">
                      Cargando productos...
                    </div>
                  ) : null}

                  {!hasMoreProducts && products.length > 0 ? (
                    <div className="px-4 py-4 text-center text-xs text-neutral-600">
                      Fin del listado
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <p className="py-10 text-center text-sm text-neutral-500">
                Sin productos
              </p>
            ) : null}

            {cart.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-neutral-800 bg-neutral-950 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="mt-1 text-xs text-neutral-500">{item.sku}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.id)}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-100"
                    aria-label="Quitar producto"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex h-9 items-center rounded-md border border-neutral-800">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, "decrease")}
                      className="grid size-9 place-items-center text-neutral-300 transition hover:bg-neutral-800"
                      aria-label="Disminuir cantidad"
                    >
                      <Minus className="size-4" />
                    </button>
                    <span className="w-10 text-center text-sm font-semibold">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, "increase")}
                      className="grid size-9 place-items-center text-neutral-300 transition hover:bg-neutral-800"
                      aria-label="Aumentar cantidad"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                  <p className="text-sm font-semibold">
                    {money(item.price * item.quantity)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="max-h-[58%] shrink-0 overflow-y-auto border-t border-neutral-800 p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>{money(totals.total)}</span>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-medium text-neutral-500 uppercase">
                Metodo de pago
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {branchPaymentMethods.map((method) => {
                  const Icon = paymentIcons[method.type] || CreditCard;
                  const isSelected = selectedPayment?.id === method.id;
                  const tone =
                    paymentToneClasses[method.type] || paymentToneClasses.card;

                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedPaymentId(method.id)}
                      className={`flex h-16 flex-col items-center justify-center gap-1 rounded-md border text-xs font-semibold transition ${isSelected ? tone.active : tone.idle}`}
                    >
                      <Icon className="size-5" />
                      {method.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedPayment?.type === "cash" ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-neutral-400">
                  Recibido
                  <input
                    value={amountPaid}
                    onChange={(event) => setAmountPaid(event.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300"
                  />
                </label>
                <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                  <p className="text-xs font-medium text-neutral-500">Cambio</p>
                  <p className="mt-1 text-sm font-semibold">
                    {money(totals.change)}
                  </p>
                </div>
              </div>
            ) : null}

            {isBanecoQrPayment ? (
              <div className="mt-4 rounded-md border border-cyan-800 bg-cyan-950 p-3 text-cyan-50">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-cyan-300 uppercase">
                      QR Baneco
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {money(qrPayment?.amount || totals.total)}
                    </p>
                  </div>
                  <div
                    className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${
                      qrPayment?.status === "paid"
                        ? "border-emerald-900 bg-emerald-950 text-emerald-200"
                        : "border-cyan-700 bg-cyan-900 text-cyan-100"
                    }`}
                  >
                    {qrPayment?.status === "paid" ? (
                      <CircleCheck className="size-4" />
                    ) : isCheckingQr ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <QrCode className="size-4" />
                    )}
                    {qrPayment?.status === "paid"
                      ? "Pagado"
                      : qrPayment
                        ? "Pendiente"
                        : "Sin generar"}
                  </div>
                </div>

                {qrPayment ? (
                  <button
                    type="button"
                    onClick={() => setIsQrPanelOpen(true)}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-cyan-300 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-200"
                  >
                    <QrCode className="size-4" />
                    Ver QR de cobro
                  </button>
                ) : (
                  <p className="mt-3 text-sm text-cyan-200">
                    El QR se abrira en una ventana lateral al generar el cobro.
                  </p>
                )}
              </div>
            ) : null}

            {isUnavailableQrPayment ? (
              <p className="mt-4 rounded-md border border-yellow-900 bg-yellow-950 px-3 py-2 text-sm text-yellow-200">
                Este metodo QR no tiene Baneco activo para esta sucursal.
              </p>
            ) : null}

            {shouldShowInlineSaleMessage ? (
              <p className="mt-4 rounded-md border border-emerald-900 bg-emerald-950 px-3 py-2 text-sm text-emerald-200">
                {saleMessage}
              </p>
            ) : null}

            {saleError ? (
              <p className="mt-4 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-200">
                {saleError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={completeSale}
              disabled={
                cart.length === 0 ||
                !selectedPayment ||
                isBusy ||
                isUnavailableQrPayment
              }
              className="mt-4 h-12 w-full rounded-md bg-neutral-100 text-sm font-semibold text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
            >
              {actionLabel}
            </button>

            <button
              type="button"
              onClick={() => resetPosSale()}
              disabled={!hasSaleState || isBusy}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-neutral-800 text-sm font-semibold text-neutral-300 transition hover:border-neutral-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              title="Limpiar venta"
            >
              <RotateCcw className="size-4" />
              Limpiar venta
            </button>
          </div>
        </aside>
      </section>
      {shouldShowSaleSuccessOverlay ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-md border border-emerald-800 bg-emerald-950 p-6 text-center text-emerald-50 shadow-2xl">
            <div className="mx-auto grid size-20 place-items-center rounded-full border border-emerald-700 bg-emerald-900">
              <CircleCheck className="size-11" />
            </div>
            <p className="mt-5 text-xs font-semibold tracking-[0.18em] text-emerald-300 uppercase">
              Pago confirmado
            </p>
            <h2 className="mt-3 text-3xl font-semibold">
              {money(lastCompletedSale.total)}
            </h2>
            <p className="mt-3 text-base font-semibold text-emerald-100">
              {lastCompletedSale.message || saleMessage}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-left text-sm">
              <div className="rounded-md border border-emerald-800 bg-emerald-900/70 p-3">
                <p className="text-xs font-medium text-emerald-300 uppercase">
                  Venta
                </p>
                <p className="mt-2 truncate font-semibold">
                  {lastCompletedSale.saleNumber}
                </p>
              </div>
              <div className="rounded-md border border-emerald-800 bg-emerald-900/70 p-3">
                <p className="text-xs font-medium text-emerald-300 uppercase">
                  Metodo
                </p>
                <p className="mt-2 truncate font-semibold">
                  {lastCompletedSale.paymentLabel}
                </p>
              </div>
            </div>
            <p className="mt-5 text-sm text-emerald-200">
              Volviendo al POS...
            </p>
          </div>
        </div>
      ) : null}
      {shouldShowPaymentPanel ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45">
          <aside className="flex h-full w-full max-w-md flex-col border-l border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-800 px-5 py-4">
              <div>
                <p
                  className={`text-xs font-semibold uppercase ${
                    lastCompletedSale ? "text-emerald-300" : "text-cyan-300"
                  }`}
                >
                  {lastCompletedSale ? "Venta registrada" : "QR simple Baneco"}
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  {money(
                    lastCompletedSale?.total || qrPayment?.amount || totals.total,
                  )}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsQrPanelOpen(false)}
                className="grid size-10 place-items-center rounded-md border border-neutral-800 text-neutral-400 transition hover:border-neutral-500 hover:text-white"
                aria-label="Cerrar QR"
              >
                <X className="size-5" />
              </button>
            </div>

            {lastCompletedSale ? (
              <>
                <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto p-5">
                  <div className="w-full rounded-md border border-emerald-900 bg-emerald-950 p-5 text-emerald-50">
                    <div className="grid size-16 place-items-center rounded-full border border-emerald-700 bg-emerald-900">
                      <CircleCheck className="size-9" />
                    </div>
                    <p className="mt-5 text-xs font-semibold tracking-[0.16em] text-emerald-300 uppercase">
                      Pago exitoso
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold leading-tight">
                      {saleMessage || lastCompletedSale.message}
                    </h3>
                    {lastCompletedSale.senderName ? (
                      <p className="mt-4 rounded-md border border-emerald-800 bg-emerald-900/70 px-3 py-2 text-sm font-medium text-emerald-100">
                        Cliente: {lastCompletedSale.senderName}
                      </p>
                    ) : null}
                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-md border border-emerald-800 bg-emerald-900/70 p-3">
                        <p className="text-xs font-medium text-emerald-300 uppercase">
                          Venta
                        </p>
                        <p className="mt-2 truncate font-semibold">
                          {lastCompletedSale.saleNumber}
                        </p>
                      </div>
                      <div className="rounded-md border border-emerald-800 bg-emerald-900/70 p-3">
                        <p className="text-xs font-medium text-emerald-300 uppercase">
                          Metodo
                        </p>
                        <p className="mt-2 truncate font-semibold">
                          {lastCompletedSale.paymentLabel}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 border-t border-neutral-800 p-5">
                  <button
                    type="button"
                    onClick={() => resetPosSale()}
                    className="h-12 w-full rounded-md bg-emerald-300 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200"
                  >
                    Limpiar venta
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsQrPanelOpen(false)}
                    className="mt-3 h-11 w-full rounded-md border border-neutral-800 text-sm font-semibold text-neutral-300 transition hover:border-neutral-500 hover:text-white"
                  >
                    Ocultar ventana
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  <div
                    className={`mb-4 inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${
                      qrPayment.status === "paid"
                        ? "border-emerald-900 bg-emerald-950 text-emerald-200"
                        : "border-cyan-800 bg-cyan-950 text-cyan-100"
                    }`}
                  >
                    {qrPayment.status === "paid" ? (
                      <CircleCheck className="size-4" />
                    ) : isCheckingQr ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <QrCode className="size-4" />
                    )}
                    {qrPayment.status === "paid"
                      ? "Pagado"
                      : "Pendiente de pago"}
                  </div>

                  <div className="rounded-md bg-white p-4">
                    {qrImageSrc ? (
                      <img
                        src={qrImageSrc}
                        alt="QR simple Baneco"
                        className="mx-auto aspect-square w-full object-contain"
                      />
                    ) : (
                      <div className="grid aspect-square place-items-center text-sm font-medium text-neutral-500">
                        QR no disponible
                      </div>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-neutral-500">
                    <div className="min-w-0 rounded-md border border-neutral-800 bg-neutral-900 p-3">
                      <p className="font-medium text-neutral-400">QR ID</p>
                      <p className="mt-1 truncate">{qrPayment.qrId}</p>
                    </div>
                    <div className="min-w-0 rounded-md border border-neutral-800 bg-neutral-900 p-3">
                      <p className="font-medium text-neutral-400">TX</p>
                      <p className="mt-1 truncate">
                        {qrPayment.transactionId}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 border-t border-neutral-800 p-5">
                  <button
                    type="button"
                    onClick={() => checkQrPayment({ autoRegister: true })}
                    disabled={isCheckingQr || isCharging}
                    className="h-12 w-full rounded-md bg-cyan-300 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                  >
                    {isCheckingQr || isCharging
                      ? "Consultando..."
                      : "Confirmar pago QR"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsQrPanelOpen(false)}
                    className="mt-3 h-11 w-full rounded-md border border-neutral-800 text-sm font-semibold text-neutral-300 transition hover:border-neutral-500 hover:text-white"
                  >
                    Ocultar ventana
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}
    </>
  );
}
