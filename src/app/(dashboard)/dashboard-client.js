"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Clock3,
  CircleCheck,
  CreditCard,
  Download,
  ExternalLink,
  GraduationCap,
  Link2,
  ListChecks,
  Loader2,
  Monitor,
  Minus,
  Package,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import InstitutePaymentsClient from "./instituto/institute-payments-client";
import PaymentLinksClient from "./payment-links-client";
import PaymentLinkCreator from "./payment-link-creator";
import StaticPaymentQrClient from "./static-payment-qr-client";
import {
  CUSTOMER_DISPLAY_SESSION_STORAGE_KEY,
  CUSTOMER_DISPLAY_VERSION,
  createEmptyCustomerDisplaySnapshot,
  getCustomerDisplayChannelName,
  getCustomerDisplayHeartbeatKey,
  getCustomerDisplayStorageKey,
} from "@/lib/pos/customer-display";

const PRODUCT_PAGE_SIZE = 20;
const SALE_SUCCESS_RESET_DELAY_MS = 1800;
const CUSTOM_CHARGE_SKU = "CUSTOM";
const INSTITUTE_CHARGE_SKU = "MENSUALIDAD";
const POS_TAB_ORDER = [
  "products",
  "monthly",
  "custom",
  "staticQr",
  "links",
  "daily",
];
const DEFAULT_POS_TABS = Object.fromEntries(
  POS_TAB_ORDER.map((tabId) => [tabId, true]),
);

function normalizePosTabs(settings) {
  const tabs = Object.fromEntries(
    POS_TAB_ORDER.map((tabId) => [
      tabId,
      typeof settings?.[tabId] === "boolean" ? settings[tabId] : true,
    ]),
  );

  return POS_TAB_ORDER.some((tabId) => tabs[tabId]) ? tabs : DEFAULT_POS_TABS;
}

function firstEnabledPosTab(tabs) {
  return POS_TAB_ORDER.find((tabId) => tabs[tabId]) || "products";
}

const emptyDailyIncome = {
  date: "",
  generatedAt: "",
  salesCount: 0,
  totalRecords: 0,
  isLimited: false,
  sales: [],
  summary: {
    total: 0,
    count: 0,
    averageTicket: 0,
    cancelledCount: 0,
    cancelledTotal: 0,
    paymentTotals: {
      cash: 0,
      qr: 0,
      card: 0,
    },
    incomeTotals: {
      monthly: { cash: 0, card: 0, qr: 0, total: 0 },
      products: { cash: 0, card: 0, qr: 0, total: 0 },
    },
  },
};

const paymentIcons = {
  cash: Banknote,
  qr: QrCode,
  card: CreditCard,
};

const paymentToneClasses = {
  cash: {
    active:
      "border-white bg-white text-neutral-950 shadow-[0_0_0_2px_rgba(255,255,255,0.28)]",
    idle: "border-neutral-300 bg-white text-neutral-950 hover:border-white hover:bg-neutral-100",
  },
  qr: {
    active:
      "border-white bg-white text-neutral-950 shadow-[0_0_0_2px_rgba(255,255,255,0.28)]",
    idle: "border-neutral-300 bg-white text-neutral-950 hover:border-white hover:bg-neutral-100",
  },
  card: {
    active:
      "border-white bg-white text-neutral-950 shadow-[0_0_0_2px_rgba(255,255,255,0.28)]",
    idle: "border-neutral-300 bg-white text-neutral-950 hover:border-white hover:bg-neutral-100",
  },
};

function money(value) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
  }).format(value || 0);
}

function formatReportDate(value = "") {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value || "Hoy";
  }

  return `${day}/${month}/${year}`;
}

function formatClock(value, timeZone = "America/La_Paz") {
  try {
    return new Intl.DateTimeFormat("es-BO", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(value);
  } catch {
    return new Intl.DateTimeFormat("es-BO", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(value);
  }
}

function formatSaleTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function isMonthlySaleItem(item) {
  return (
    item?.productSku === INSTITUTE_CHARGE_SKU ||
    String(item?.productName || "")
      .trim()
      .toLowerCase()
      .startsWith("mensualidad:")
  );
}

function getDownloadFilename(disposition = "") {
  const match = disposition.match(/filename="?([^";]+)"?/i);

  return match?.[1] || "ingresos-del-dia.pdf";
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

export default function DashboardClient({
  user,
  profile,
  catalog,
  catalogError = "",
  settings = { logo: null },
  tabSettingsByBranch = {},
  timeZone = "America/La_Paz",
}) {
  const requestIdRef = useRef(0);
  const dailyIncomeRequestIdRef = useRef(0);
  const qrCheckInFlightRef = useRef(false);
  const qrAutoRegisterInFlightRef = useRef(false);
  const paymentLinkCreationRef = useRef(false);
  const qrPaymentRef = useRef(null);
  const qrAutoGenerateKeyRef = useRef("");
  const qrWarmupKeysRef = useRef(new Set());
  const saleResetTimerRef = useRef(null);
  const customerDisplayChannelRef = useRef(null);
  const customerDisplaySnapshotRef = useRef(null);
  const paymentSuccessAudioRef = useRef(null);
  const [displaySessionId, setDisplaySessionId] = useState("");
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [selectedBranchId, setSelectedBranchId] = useState(
    catalog.branches[0]?.id || "",
  );
  const enabledPosTabs = useMemo(
    () => normalizePosTabs(tabSettingsByBranch[selectedBranchId]?.tabs),
    [selectedBranchId, tabSettingsByBranch],
  );
  const [activePosTab, setActivePosTab] = useState(() =>
    firstEnabledPosTab(
      normalizePosTabs(
        tabSettingsByBranch[catalog.branches[0]?.id || ""]?.tabs,
      ),
    ),
  );
  const [institutePanelKey, setInstitutePanelKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [customChargeName, setCustomChargeName] = useState("");
  const [customChargePrice, setCustomChargePrice] = useState("");
  const [customChargeError, setCustomChargeError] = useState("");
  const [cart, setCart] = useState([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [saleMessage, setSaleMessage] = useState("");
  const [saleError, setSaleError] = useState("");
  const [lastCompletedSale, setLastCompletedSale] = useState(null);
  const [isCharging, setIsCharging] = useState(false);
  const [isCreatingPaymentLink, setIsCreatingPaymentLink] = useState(false);
  const [latestPaymentLink, setLatestPaymentLink] = useState(null);
  const [paymentLinkNotes, setPaymentLinkNotes] = useState("");
  const [paymentLinksRefreshKey, setPaymentLinksRefreshKey] = useState(0);
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
  const [hasQrLogoImageError, setHasQrLogoImageError] = useState(false);
  const [dailyIncome, setDailyIncome] = useState(emptyDailyIncome);
  const [isLoadingDailyIncome, setIsLoadingDailyIncome] = useState(false);
  const [isDownloadingDailyIncome, setIsDownloadingDailyIncome] =
    useState(false);
  const [dailyIncomeError, setDailyIncomeError] = useState("");
  const logoUrl = settings?.logo?.url || "";
  const qrLogoUrl = logoUrl && !hasQrLogoImageError ? logoUrl : "";
  const clockLabel = formatClock(currentTime, timeZone);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!enabledPosTabs[activePosTab]) {
      setActivePosTab(firstEnabledPosTab(enabledPosTabs));
    }
  }, [activePosTab, enabledPosTabs]);

  const syncInstituteCart = useCallback(({ ci, payments, studentName }) => {
    if (paymentLinkCreationRef.current) return;
    setCart((current) => {
      const regularItems = current.filter((item) => !item.institutePayment);
      const instituteItems = payments.map((payment) => ({
        id: `custom-inst-${payment.$id}`.slice(0, 36),
        institutePayment: {
          ci,
          courseBranchName: payment.courseBranchName,
          courseName: payment.courseName,
          paymentId: payment.$id,
          period: payment.periodo,
          studentName,
        },
        isCustom: true,
        name: `Mensualidad: ${studentName} · ${payment.courseName} · ${payment.periodo} · ${payment.courseBranchName}`,
        price: Number(payment.saldo),
        quantity: 1,
        sku: INSTITUTE_CHARGE_SKU,
        stock: 1,
      }));

      return [...regularItems, ...instituteItems];
    });
  }, []);

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
  const isBusy =
    isCharging || isGeneratingQr || isCheckingQr || isCreatingPaymentLink;
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
  const instituteCartItems = useMemo(
    () => cart.filter((item) => item.institutePayment),
    [cart],
  );
  const instituteCartPaymentIds = useMemo(
    () => instituteCartItems.map((item) => item.institutePayment.paymentId),
    [instituteCartItems],
  );
  const paymentLinkMethod = useMemo(
    () =>
      branchPaymentMethods.find(
        (method) =>
          method.type === "qr" && method.config?.provider === "baneco",
      ) || null,
    [branchPaymentMethods],
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
        category: item.institutePayment ? "monthly" : "product",
        customerName: item.institutePayment?.studentName || "",
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
              logoUrl: qrLogoUrl,
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
      qrLogoUrl,
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
    setLatestPaymentLink(null);
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
    setHasQrLogoImageError(false);
  }, [logoUrl]);

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
    if (
      !isBanecoQrPayment ||
      cart.length === 0 ||
      qrPayment ||
      lastCompletedSale ||
      isGeneratingQr ||
      isCheckingQr ||
      isCreatingPaymentLink ||
      isCharging
    ) {
      return;
    }

    const autoGenerateKey = [
      selectedBranchId,
      selectedPayment?.id || "",
      cartSignature,
      totals.total,
    ].join(":");

    if (qrAutoGenerateKeyRef.current === autoGenerateKey) {
      return;
    }

    qrAutoGenerateKeyRef.current = autoGenerateKey;
    generateQrPayment();
  }, [
    cart.length,
    cartSignature,
    isBanecoQrPayment,
    isCharging,
    isCheckingQr,
    isCreatingPaymentLink,
    isGeneratingQr,
    lastCompletedSale,
    qrPayment,
    selectedBranchId,
    selectedPayment?.id,
    totals.total,
  ]);

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
    loadDailyIncome({ branchId: selectedBranchId });
  }, [selectedBranchId, user.id]);

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
      const response = await fetch(`/api/pos/products?${params.toString()}`, {
        credentials: "same-origin",
      });
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

  async function loadDailyIncome({
    branchId = selectedBranchId,
    silent = false,
  } = {}) {
    if (!branchId) {
      return;
    }

    const requestId = dailyIncomeRequestIdRef.current + 1;
    dailyIncomeRequestIdRef.current = requestId;
    const params = new URLSearchParams({ branchId });

    if (!silent) {
      setIsLoadingDailyIncome(true);
    }

    setDailyIncomeError("");

    try {
      const response = await fetch(`/api/pos/daily-income?${params}`, {
        credentials: "same-origin",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo cargar ingresos.");
      }

      if (dailyIncomeRequestIdRef.current !== requestId) {
        return;
      }

      setDailyIncome(payload.report || emptyDailyIncome);
    } catch (error) {
      if (dailyIncomeRequestIdRef.current === requestId) {
        setDailyIncomeError(
          error.message || "No se pudo cargar ingresos del dia.",
        );
      }
    } finally {
      if (dailyIncomeRequestIdRef.current === requestId) {
        setIsLoadingDailyIncome(false);
      }
    }
  }

  async function downloadDailyIncomePdf() {
    if (!selectedBranchId || isDownloadingDailyIncome) {
      return;
    }

    setIsDownloadingDailyIncome(true);
    setDailyIncomeError("");

    try {
      const params = new URLSearchParams({ branchId: selectedBranchId });
      const response = await fetch(`/api/pos/daily-income/pdf?${params}`, {
        credentials: "same-origin",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "No se pudo generar el PDF.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getDownloadFilename(
        response.headers.get("content-disposition") || "",
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setDailyIncomeError(error.message || "No se pudo descargar el PDF.");
    } finally {
      setIsDownloadingDailyIncome(false);
    }
  }

  function handleProductsScroll(event) {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;

    if (scrollHeight - scrollTop - clientHeight < 180) {
      loadProductsPage();
    }
  }

  function addToCart(product) {
    if (paymentLinkCreationRef.current) return;
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

  function addCustomChargeToCart() {
    if (paymentLinkCreationRef.current) return;
    const name = customChargeName.trim();
    const price = Number(customChargePrice);

    setSaleMessage("");
    setSaleError("");
    setLastCompletedSale(null);

    if (!name || !Number.isFinite(price) || price <= 0) {
      setCustomChargeError("Ingresa nombre y precio valido.");
      return;
    }

    setCustomChargeError("");
    setCart((current) => [
      ...current,
      {
        id: `custom-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        name,
        sku: CUSTOM_CHARGE_SKU,
        price: Math.round(price * 100) / 100,
        quantity: 1,
        stock: Number.POSITIVE_INFINITY,
        isCustom: true,
      },
    ]);
    setCustomChargeName("");
    setCustomChargePrice("");
  }

  function updateQuantity(productId, direction) {
    if (paymentLinkCreationRef.current) return;
    setSaleMessage("");
    setSaleError("");
    setLastCompletedSale(null);
    setCart((current) =>
      current
        .map((item) => {
          if (item.id !== productId) {
            return item;
          }

          if (item.institutePayment) {
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
    if (paymentLinkCreationRef.current) return;
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
    }, SALE_SUCCESS_RESET_DELAY_MS);
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
    setPaymentLinkNotes("");
    qrPaymentRef.current = null;
    qrAutoGenerateKeyRef.current = "";
    setQrPayment(null);
    setIsQrPanelOpen(false);

    if (clearSearch) {
      setSearchTerm("");
    }

    setSelectedPaymentId(branchPaymentMethods[0]?.id || "");
    publishCustomerDisplayResetSnapshot();
  }

  function isActiveQrPayment(payment) {
    return Boolean(
      payment?.qrId && qrPaymentRef.current?.qrId === payment.qrId,
    );
  }

  function openCustomerDisplay() {
    if (!displaySessionId) {
      return;
    }

    const url = `/cliente-display?session=${encodeURIComponent(displaySessionId)}`;
    window.open(url, `pos-customer-display-${displaySessionId}`, "noopener");
    window.setTimeout(() => publishCustomerDisplaySnapshot(), 250);
  }

  async function registerInstitutePayments(items, saleNumber) {
    const instituteItems = items.filter((item) => item.institutePayment);

    if (instituteItems.length === 0) {
      return;
    }

    if (!["cash", "qr"].includes(selectedPayment.type)) {
      throw new Error(
        "Las mensualidades solo se pueden cobrar con Efectivo o QR.",
      );
    }

    const metodoPago = selectedPayment.type === "cash" ? "efectivo" : "qr";

    for (const item of instituteItems) {
      const response = await fetch("/api/pos/instituto-pagos", {
        body: JSON.stringify({
          ci: item.institutePayment.ci,
          branchId: selectedBranchId,
          metodoPago,
          monto: Number((item.price * item.quantity).toFixed(2)),
          notas: `Registro desde POS V1 · Venta ${saleNumber}`,
          paymentId: item.institutePayment.paymentId,
          referencia: saleNumber,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error ||
            result.message ||
            "No se pudo registrar la mensualidad.",
        );
      }
    }
  }

  async function registerSale(extraPayload = {}) {
    setIsCharging(true);
    setSaleMessage("");
    setSaleError("");

    try {
      const response = await fetch("/api/pos/sales", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId: selectedBranchId,
          paymentMethodId: selectedPayment.id,
          amountPaid:
            selectedPayment.type === "cash" ? totals.paid : totals.total,
          items: cart.map((item) => ({
            category: item.institutePayment ? "monthly" : "product",
            productId: item.id,
            quantity: item.quantity,
            isCustom: item.isCustom || false,
            name: item.name,
            unitPrice: item.price,
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
      let instituteWarning = "";

      try {
        await registerInstitutePayments(cart, payload.sale.saleNumber);
      } catch (instituteError) {
        instituteWarning = ` La venta quedó registrada, pero debes revisar Control Instituto: ${instituteError.message}`;
      }

      const completedMessage = `${successMessage}${instituteWarning}`;
      const completedSale = {
        id: payload.sale.id,
        saleNumber: payload.sale.saleNumber,
        total: totals.total,
        paymentType: selectedPayment.type,
        paymentLabel: selectedPayment.label,
        senderName: payload.sale.senderName || "",
        message: completedMessage,
        completedAt: new Date().toISOString(),
      };
      const completedSnapshot = buildCompletedSaleSnapshot({
        displaySessionId,
        selectedBranch,
        user,
        completedSale,
        successMessage: completedMessage,
        saleNumber: payload.sale.saleNumber,
      });

      setLastCompletedSale(completedSale);
      setSaleMessage(
        `${completedMessage} Venta ${payload.sale.saleNumber} registrada.`,
      );
      publishCustomerDisplaySnapshot(completedSnapshot);
      playPaymentSuccessSound();
      setCart([]);
      if (instituteCartItems.length > 0) {
        setInstitutePanelKey((current) => current + 1);
      }
      setAmountPaid("");
      qrPaymentRef.current = null;
      setQrPayment(null);
      setIsQrPanelOpen(false);
      scheduleSaleReset();
      await loadProductsPage({ reset: true });
      await loadDailyIncome({ branchId: selectedBranchId, silent: true });
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
            category: item.institutePayment
              ? "monthly"
              : item.isCustom
                ? "custom"
                : "product",
            productId: item.id,
            quantity: item.quantity,
            isCustom: item.isCustom || false,
            name: item.name,
            unitPrice: item.price,
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
    setIsQrPanelOpen(true);

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

      if (!isActiveQrPayment(currentQrPayment)) {
        return;
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
                logoUrl: qrLogoUrl,
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
        setIsQrPanelOpen(true);
        setSaleMessage("");
        setSaleError(
          "El QR no tiene pago confirmado. Mantén el QR visible y verifica nuevamente.",
        );
        return;
      }

      if (!silent) {
        setIsQrPanelOpen(true);
        setSaleMessage(
          "Pago QR pendiente de confirmacion. Mantén el QR visible y verifica nuevamente.",
        );
      }
    } catch (error) {
      qrAutoRegisterInFlightRef.current = false;
      if (isActiveQrPayment(currentQrPayment)) {
        setIsQrPanelOpen(true);
      }
      if (!silent && isActiveQrPayment(currentQrPayment)) {
        setSaleError(error.message || "No se pudo consultar el QR.");
      }
    } finally {
      qrCheckInFlightRef.current = false;
      setIsCheckingQr(false);
    }
  }

  async function cancelQrPayment() {
    const currentQrPayment = qrPaymentRef.current;

    qrPaymentRef.current = null;
    qrAutoRegisterInFlightRef.current = false;
    setQrPayment(null);
    setIsQrPanelOpen(false);
    setSaleError("");
    setSaleMessage("Pago QR cancelado. El carrito se conserva.");

    if (!currentQrPayment || !selectedPayment) {
      return true;
    }

    try {
      const response = await fetch("/api/pos/baneco-qr/cancel", {
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
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.message ||
            "No se pudo cancelar el QR en Baneco. Genera un QR nuevo antes de cobrar.",
        );
      }
      return true;
    } catch (error) {
      if (!qrPaymentRef.current) {
        qrPaymentRef.current = currentQrPayment;
        setQrPayment(currentQrPayment);
        setIsQrPanelOpen(false);
        setSaleMessage("");
        setSaleError(
          error.message ||
            "No se pudo cancelar el QR en Baneco. Genera un QR nuevo antes de cobrar.",
        );
      }
      return false;
    }
  }

  async function createCartPaymentLink() {
    if (
      paymentLinkCreationRef.current ||
      isBusy ||
      !paymentLinkMethod ||
      cart.length === 0 ||
      instituteCartItems.length > 0 ||
      lastCompletedSale ||
      qrPaymentRef.current?.status === "paid"
    ) {
      return;
    }

    paymentLinkCreationRef.current = true;
    setIsCreatingPaymentLink(true);
    setSaleError("");
    setSaleMessage("");
    try {
      // Cancel an existing checkout QR before creating a separate payable link.
      if (qrPaymentRef.current && !(await cancelQrPayment())) return;

      const response = await fetch("/api/pos/payment-links", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId: selectedBranchId,
          paymentMethodId: paymentLinkMethod.id,
          notes: paymentLinkNotes,
          items: cart.map((item) => ({
            productId: item.id,
            name: item.name,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: item.price,
            isCustom: item.isCustom,
            category: "product",
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.link?.sharePath) {
        throw new Error(payload.message || "No se pudo crear el enlace.");
      }

      resetPosSale();
      setLatestPaymentLink(payload.link);
      setPaymentLinksRefreshKey((current) => current + 1);
      await loadProductsPage({ reset: true });
      return payload.link;
    } catch (error) {
      setSaleError(error.message || "No se pudo crear el enlace.");
      return null;
    } finally {
      paymentLinkCreationRef.current = false;
      setIsCreatingPaymentLink(false);
    }
  }

  async function completeSale() {
    if (paymentLinkCreationRef.current) return;
    if (cart.length === 0 || !selectedPayment) {
      return;
    }

    if (selectedPayment.type === "cash" && totals.paid < totals.total) {
      setSaleMessage("");
      setSaleError("El monto recibido no cubre el total.");
      return;
    }

    if (
      instituteCartItems.length > 0 &&
      !["cash", "qr"].includes(selectedPayment.type)
    ) {
      setSaleMessage("");
      setSaleError(
        "Las mensualidades solo se pueden cobrar con Efectivo o QR.",
      );
      return;
    }

    if (isBanecoQrPayment) {
      if (!qrPayment) {
        await generateQrPayment();
        return;
      }

      setIsQrPanelOpen(true);
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
  const dailyPaymentTotals = dailyIncome.summary?.paymentTotals || {};
  const dailyCashTotal = dailyPaymentTotals.cash || 0;
  const dailyQrTotal = dailyPaymentTotals.qr || 0;
  const dailyIncomeTotals = dailyIncome.summary?.incomeTotals || {};
  const dailyProductsIncome = dailyIncomeTotals.products?.total || 0;
  const dailyMonthlyIncome = dailyIncomeTotals.monthly?.total || 0;
  const dailyCustomIncome = dailyIncomeTotals.custom?.total || 0;
  const dailyPaymentLinkIncome = dailyIncomeTotals.channels?.paymentLink || 0;
  const dailyTotal = dailyIncome.summary?.total || 0;
  const dailySalesCount = dailyIncome.summary?.count || 0;
  const dailySales = Array.isArray(dailyIncome.sales) ? dailyIncome.sales : [];
  const actionLabel = isGeneratingQr
    ? "Generando QR..."
    : isCheckingQr
      ? "Consultando QR..."
      : isCharging
        ? "Registrando..."
        : isBanecoQrPayment
          ? qrPayment
            ? "Ver QR de cobro"
            : saleError
              ? "Reintentar QR"
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

          {activePosTab === "products" && productsError ? (
            <div className="rounded-md border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
              {productsError}
            </div>
          ) : null}

          <div className="shrink-0 space-y-3 border-b border-neutral-800 pb-4">
            <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center">
              <div className="min-w-48">
                <select
                  aria-label="Sucursal"
                  disabled={isCreatingPaymentLink}
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

              <div className="min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2">
                <p className="text-[10px] font-medium tracking-[0.16em] text-neutral-600 uppercase">
                  Sesión de POS
                </p>
                <p className="truncate text-sm font-semibold text-neutral-200">
                  {user.name || user.email || "Usuario"}
                </p>
                <p className="mt-0.5 text-xs text-emerald-300">
                  {profile?.role === "super_admin"
                    ? "Super administrador · Todas las sucursales"
                    : profile?.role === "admin"
                      ? "Administrador"
                      : "Cajero"}
                </p>
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

            <div
              aria-label="Secciones del punto de venta"
              className="flex w-fit max-w-full flex-wrap gap-1 rounded-md border border-neutral-800 bg-neutral-900 p-1"
              role="tablist"
            >
              {enabledPosTabs.products ? (
                <button
                  aria-selected={activePosTab === "products"}
                  className={`inline-flex h-9 items-center gap-2 rounded px-3 text-sm font-semibold transition ${
                    activePosTab === "products"
                      ? "bg-emerald-400 text-emerald-950"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                  }`}
                  onClick={() => setActivePosTab("products")}
                  role="tab"
                  type="button"
                >
                  <Package className="size-4" />
                  Productos
                </button>
              ) : null}
              {enabledPosTabs.monthly ? (
                <button
                  aria-selected={activePosTab === "monthly"}
                  className={`inline-flex h-9 items-center gap-2 rounded px-3 text-sm font-semibold transition ${
                    activePosTab === "monthly"
                      ? "bg-cyan-400 text-cyan-950"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                  }`}
                  onClick={() => setActivePosTab("monthly")}
                  role="tab"
                  type="button"
                >
                  <GraduationCap className="size-4" />
                  Mensualidades
                </button>
              ) : null}
              {enabledPosTabs.custom ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePosTab === "custom"}
                  onClick={() => setActivePosTab("custom")}
                  className={`inline-flex h-9 items-center gap-2 rounded px-3 text-sm font-semibold transition ${activePosTab === "custom" ? "bg-neutral-100 text-neutral-950" : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"}`}
                >
                  <Plus className="size-4" />
                  Cobro personalizado
                </button>
              ) : null}
              {enabledPosTabs.staticQr ? (
                <button
                  aria-selected={activePosTab === "staticQr"}
                  className={`inline-flex h-9 items-center gap-2 rounded px-3 text-sm font-semibold transition ${
                    activePosTab === "staticQr"
                      ? "bg-violet-400 text-violet-950"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                  }`}
                  onClick={() => setActivePosTab("staticQr")}
                  role="tab"
                  type="button"
                >
                  <QrCode className="size-4" />
                  QR estático
                </button>
              ) : null}
              {enabledPosTabs.links ? (
                <button
                  aria-selected={activePosTab === "links"}
                  className={`inline-flex h-9 items-center gap-2 rounded px-3 text-sm font-semibold transition ${
                    activePosTab === "links"
                      ? "bg-amber-300 text-amber-950"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                  }`}
                  onClick={() => setActivePosTab("links")}
                  role="tab"
                  type="button"
                >
                  <Link2 className="size-4" />
                  Cobro por enlace
                </button>
              ) : null}
              {enabledPosTabs.daily ? (
                <button
                  aria-selected={activePosTab === "daily"}
                  className={`inline-flex h-9 items-center gap-2 rounded px-3 text-sm font-semibold transition ${
                    activePosTab === "daily"
                      ? "bg-violet-400 text-violet-950"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                  }`}
                  onClick={() => {
                    setActivePosTab("daily");
                    loadDailyIncome({ branchId: selectedBranchId });
                  }}
                  role="tab"
                  type="button"
                >
                  <ListChecks className="size-4" />
                  Ventas del dia
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
            {enabledPosTabs.custom && activePosTab === "custom" ? (
              <div className="shrink-0 border-b border-emerald-900 bg-emerald-950/25 px-4 py-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_150px_auto] lg:items-end">
                  <label className="text-xs font-medium text-neutral-400">
                    Cobro personalizado
                    <input
                      value={customChargeName}
                      onChange={(event) => {
                        setCustomChargeName(event.target.value);
                        setCustomChargeError("");
                      }}
                      placeholder="Nombre del cobro"
                      className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-100 transition outline-none placeholder:text-neutral-600 focus:border-neutral-300"
                    />
                  </label>
                  <label className="text-xs font-medium text-neutral-400">
                    Precio
                    <input
                      value={customChargePrice}
                      onChange={(event) => {
                        setCustomChargePrice(event.target.value);
                        setCustomChargeError("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          addCustomChargeToCart();
                        }
                      }}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-100 transition outline-none placeholder:text-neutral-600 focus:border-neutral-300"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={addCustomChargeToCart}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-emerald-400 px-4 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
                  >
                    <Plus className="size-4" />
                    Agregar cobro
                  </button>
                </div>
                {customChargeError ? (
                  <p className="mt-2 text-sm text-red-300">
                    {customChargeError}
                  </p>
                ) : null}
              </div>
            ) : null}
            {enabledPosTabs.products && activePosTab === "products" ? (
              <>
                <div className="shrink-0 border-b border-emerald-900 bg-emerald-950/25 p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-emerald-400" />
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      autoComplete="off"
                      placeholder="Buscar producto por SKU, codigo o nombre"
                      aria-label="Buscar productos"
                      className="h-10 w-full rounded-md border border-emerald-900 bg-neutral-950 px-10 pr-11 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-emerald-400"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm("")}
                        className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-white"
                        aria-label="Limpiar busqueda de productos"
                      >
                        <X className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-x-auto">
                  <div className="flex h-full min-w-[760px] flex-col">
                    <div className="grid grid-cols-[minmax(260px,1fr)_120px_120px_110px_110px] border-b border-emerald-900 bg-emerald-950/45 px-4 py-3 text-xs font-medium text-emerald-300 uppercase">
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
                          product.stockByBranch[selectedBranchId]?.quantity ||
                          0;

                        return (
                          <div
                            key={product.id}
                            className="grid grid-cols-[minmax(260px,1fr)_120px_120px_110px_110px] items-center border-b border-emerald-950 px-4 py-3 text-sm last:border-b-0 hover:bg-emerald-950/35"
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
                                className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-400 px-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
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
              </>
            ) : null}
            {enabledPosTabs.monthly ? (
              <div
                className={
                  activePosTab === "monthly" ? "flex min-h-0 flex-1" : "hidden"
                }
              >
                <InstitutePaymentsClient
                  embedded
                  cartPaymentIds={instituteCartPaymentIds}
                  key={institutePanelKey}
                  onCartChange={syncInstituteCart}
                  selectedBranchId={selectedBranchId}
                  selectedBranchName={selectedBranch?.name || ""}
                />
              </div>
            ) : null}
            {enabledPosTabs.staticQr && activePosTab === "staticQr" ? (
              <StaticPaymentQrClient
                key={selectedBranchId}
                branchId={selectedBranchId}
                branchName={selectedBranch?.name || "Sucursal"}
                paymentMethods={catalog.paymentMethods}
                timeZone={timeZone}
              />
            ) : null}
            {enabledPosTabs.links && activePosTab === "links" ? (
              <PaymentLinksClient
                key={selectedBranchId}
                branchId={selectedBranchId}
                branchName={selectedBranch?.name || "Sucursal"}
                refreshKey={paymentLinksRefreshKey}
                timeZone={timeZone}
                onCancelled={(link) => {
                  loadProductsPage({ reset: true });
                  setLatestPaymentLink((current) =>
                    current?.id === link.id ? link : current,
                  );
                }}
              />
            ) : null}
            {enabledPosTabs.daily && activePosTab === "daily" ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex shrink-0 flex-col gap-3 border-b border-violet-900 bg-violet-950/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-neutral-100">
                      Registro de ventas del dia
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {selectedBranch?.name || "Sucursal"} ·{" "}
                      {formatReportDate(dailyIncome.date)} ·{" "}
                      {user.name || user.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={downloadDailyIncomePdf}
                      disabled={
                        !selectedBranchId ||
                        isDownloadingDailyIncome ||
                        isLoadingDailyIncome
                      }
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isDownloadingDailyIncome ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        loadDailyIncome({ branchId: selectedBranchId })
                      }
                      disabled={isLoadingDailyIncome || !selectedBranchId}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-violet-800 bg-violet-950 px-3 text-sm font-semibold text-violet-100 transition hover:border-violet-500 hover:bg-violet-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RotateCcw
                        className={`size-4 ${
                          isLoadingDailyIncome ? "animate-spin" : ""
                        }`}
                      />
                      Actualizar
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
                    <div className="rounded-md border border-violet-800 bg-violet-950/30 px-3 py-2">
                      <p className="text-[11px] font-medium text-violet-200">
                        Total ingresado
                      </p>
                      <p className="mt-0.5 text-base font-semibold">
                        {isLoadingDailyIncome ? "..." : money(dailyTotal)}
                      </p>
                    </div>
                    <div className="rounded-md border border-violet-800 bg-violet-950/30 px-3 py-2">
                      <p className="text-[11px] font-medium text-violet-200">
                        Ventas registradas
                      </p>
                      <p className="mt-0.5 text-base font-semibold">
                        {isLoadingDailyIncome ? "..." : dailySalesCount}
                      </p>
                    </div>
                    <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2">
                      <p className="text-[11px] font-medium text-neutral-500">
                        Efectivo a entregar
                      </p>
                      <p className="mt-0.5 text-base font-semibold">
                        {isLoadingDailyIncome ? "..." : money(dailyCashTotal)}
                      </p>
                    </div>
                    <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2">
                      <p className="text-[11px] font-medium text-neutral-500">
                        Cobros por QR
                      </p>
                      <p className="mt-0.5 text-base font-semibold">
                        {isLoadingDailyIncome ? "..." : money(dailyQrTotal)}
                      </p>
                    </div>
                    <div className="rounded-md border border-emerald-800 bg-emerald-950/30 px-3 py-2">
                      <p className="text-[11px] font-medium text-emerald-300">
                        Productos
                      </p>
                      <p className="mt-0.5 text-base font-semibold">
                        {isLoadingDailyIncome
                          ? "..."
                          : money(dailyProductsIncome)}
                      </p>
                    </div>
                    <div className="rounded-md border border-cyan-800 bg-cyan-950/30 px-3 py-2">
                      <p className="text-[11px] font-medium text-cyan-300">
                        Mensualidades
                      </p>
                      <p className="mt-0.5 text-base font-semibold">
                        {isLoadingDailyIncome
                          ? "..."
                          : money(dailyMonthlyIncome)}
                      </p>
                    </div>
                    <div className="rounded-md border border-violet-800 bg-violet-950/30 px-3 py-2">
                      <p className="text-[11px] font-medium text-violet-300">
                        Personalizados
                      </p>
                      <p className="mt-0.5 text-base font-semibold">
                        {isLoadingDailyIncome
                          ? "..."
                          : money(dailyCustomIncome)}
                      </p>
                    </div>
                    <div className="rounded-md border border-amber-800 bg-amber-950/30 px-3 py-2">
                      <p className="text-[11px] font-medium text-amber-300">
                        Por enlace
                      </p>
                      <p className="mt-0.5 text-base font-semibold">
                        {isLoadingDailyIncome
                          ? "..."
                          : money(dailyPaymentLinkIncome)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-neutral-100">
                      Detalle de ventas
                    </h2>
                    <span className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-medium text-neutral-400">
                      {dailySales.length} registros
                    </span>
                  </div>

                  {dailyIncomeError ? (
                    <p className="mt-3 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-200">
                      {dailyIncomeError}
                    </p>
                  ) : null}

                  {isLoadingDailyIncome ? (
                    <div className="py-10 text-center text-sm text-neutral-500">
                      Cargando ventas del dia...
                    </div>
                  ) : null}

                  {!isLoadingDailyIncome && dailySales.length === 0 ? (
                    <div className="mt-3 rounded-md border border-dashed border-neutral-800 px-4 py-10 text-center text-sm text-neutral-500">
                      Aun no registraste ventas en esta sucursal hoy.
                    </div>
                  ) : null}

                  <div className="mt-2 space-y-2">
                    {dailySales.map((sale) => {
                      const saleItems = Array.isArray(sale.items)
                        ? sale.items
                        : [];
                      const isCashSale = sale.paymentMethodType === "cash";

                      return (
                        <article
                          key={sale.id}
                          className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-950"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-3 py-2">
                            <div>
                              <p className="text-sm font-semibold text-neutral-100">
                                {sale.saleNumber}
                              </p>
                              <p className="mt-0.5 text-xs text-neutral-500">
                                {formatSaleTime(sale.completedAt)} ·{" "}
                                {sale.paymentMethodLabel ||
                                  sale.paymentMethodType ||
                                  "Metodo no indicado"}
                              </p>
                              <p className="mt-1 text-[11px] font-medium text-amber-300">
                                Origen: {sale.origin?.label || "POS directo"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-neutral-100">
                                {money(sale.total)}
                              </p>
                              <p
                                className={`mt-0.5 text-xs font-medium ${
                                  isCashSale
                                    ? "text-emerald-300"
                                    : "text-cyan-300"
                                }`}
                              >
                                {isCashSale ? "Efectivo" : "Pago digital"}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-1 p-2">
                            {saleItems.map((item) => {
                              const monthlyItem = isMonthlySaleItem(item);

                              return (
                                <div
                                  key={item.id}
                                  className={`flex items-center justify-between gap-3 rounded-md border px-2 py-1.5 ${
                                    monthlyItem
                                      ? "border-cyan-800 bg-cyan-950/30"
                                      : "border-emerald-800 bg-emerald-950/30"
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-[13px] font-medium text-neutral-100">
                                      {item.productName}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-neutral-500">
                                      {monthlyItem
                                        ? "Mensualidad"
                                        : item.productSku || "Producto"}{" "}
                                      {" · "}
                                      {item.quantity} x {money(item.unitPrice)}
                                    </p>
                                  </div>
                                  <p className="shrink-0 text-[13px] font-semibold text-neutral-100">
                                    {money(item.subtotal)}
                                  </p>
                                </div>
                              );
                            })}

                            {saleItems.length === 0 ? (
                              <p className="px-1 py-2 text-sm text-neutral-500">
                                Esta venta no tiene detalle de items disponible.
                              </p>
                            ) : null}
                            {sale.notes ? (
                              <p className="rounded-md border border-amber-900 bg-amber-950/25 px-2 py-1.5 text-xs text-amber-100">
                                Nota: {sale.notes}
                              </p>
                            ) : null}
                          </div>

                          {isCashSale ? (
                            <div className="grid grid-cols-2 gap-3 border-t border-neutral-800 px-3 py-2 text-xs">
                              <p className="text-neutral-500">
                                Recibido{" "}
                                <span className="ml-1 font-semibold text-neutral-200">
                                  {money(sale.amountPaid)}
                                </span>
                              </p>
                              <p className="text-right text-neutral-500">
                                Cambio{" "}
                                <span className="ml-1 font-semibold text-neutral-200">
                                  {money(sale.change)}
                                </span>
                              </p>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div
            className={`shrink-0 rounded-md border border-neutral-800 bg-neutral-900 p-4 ${
              activePosTab === "daily" ? "hidden" : ""
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
                <div className="rounded-md border border-violet-800 bg-violet-950/30 px-3 py-2">
                  <p className="text-[11px] font-medium text-violet-200">
                    Ingresos totales
                  </p>
                  <p className="mt-0.5 text-base font-semibold">
                    {isLoadingDailyIncome ? "..." : money(dailyTotal)}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2">
                  <p className="text-[11px] font-medium text-neutral-500">
                    Efectivo
                  </p>
                  <p className="mt-0.5 text-base font-semibold">
                    {isLoadingDailyIncome ? "..." : money(dailyCashTotal)}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2">
                  <p className="text-[11px] font-medium text-neutral-500">QR</p>
                  <p className="mt-0.5 text-base font-semibold">
                    {isLoadingDailyIncome ? "..." : money(dailyQrTotal)}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm font-semibold text-neutral-300">
                  <Clock3 className="size-4 text-violet-300" />
                  <span className="tabular-nums">{clockLabel}</span>
                </div>
                <button
                  type="button"
                  onClick={downloadDailyIncomePdf}
                  disabled={
                    !selectedBranchId ||
                    isDownloadingDailyIncome ||
                    isLoadingDailyIncome
                  }
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-neutral-700 bg-neutral-950 px-4 text-sm font-semibold text-neutral-100 transition hover:border-neutral-400 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-600"
                >
                  {isDownloadingDailyIncome ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Descargar PDF
                </button>
              </div>
            </div>

            {dailyIncomeError ? (
              <p className="mt-3 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-200">
                {dailyIncomeError}
              </p>
            ) : null}
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
                className={`rounded-md border p-3 ${
                  item.institutePayment
                    ? "border-cyan-800 bg-cyan-950/30"
                    : "border-emerald-800 bg-emerald-950/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {item.institutePayment
                        ? item.institutePayment.studentName || "Estudiante"
                        : item.sku}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.id)}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-100"
                    aria-label={
                      item.institutePayment
                        ? "Eliminar cobro"
                        : "Quitar producto"
                    }
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  {item.institutePayment ? (
                    <span className="text-xs font-medium text-neutral-500">
                      Mensualidad
                    </span>
                  ) : (
                    <div className="flex h-9 items-center rounded-md border border-emerald-800 bg-emerald-950/30">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, "decrease")}
                        className="grid size-9 place-items-center text-emerald-100 transition hover:bg-emerald-900/60"
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
                        className="grid size-9 place-items-center text-emerald-100 transition hover:bg-emerald-900/60"
                        aria-label="Aumentar cantidad"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  )}
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
              <div
                className="mt-2 grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(
                    branchPaymentMethods.length,
                    1,
                  )}, minmax(0, 1fr))`,
                }}
              >
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
                      disabled={isCreatingPaymentLink}
                      className={`flex h-16 flex-col items-center justify-center gap-1 rounded-md border text-xs font-semibold transition ${isSelected ? tone.active : tone.idle}`}
                    >
                      <Icon className="size-5" />
                      {method.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <PaymentLinkCreator
              cart={cart}
              paymentMethod={paymentLinkMethod}
              isBusy={
                isBusy ||
                Boolean(lastCompletedSale) ||
                qrPayment?.status === "paid"
              }
              isCreating={isCreatingPaymentLink}
              latestLink={latestPaymentLink}
              notes={paymentLinkNotes}
              error={saleError}
              onNotesChange={setPaymentLinkNotes}
              onCreate={createCartPaymentLink}
            />

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
                <div className="text-xs font-medium text-neutral-400">
                  <p>Cambio</p>
                  <div className="mt-1 flex h-11 items-center rounded-md border border-neutral-800 bg-neutral-950 px-3">
                    <p className="text-sm font-semibold text-neutral-100">
                      {money(totals.change)}
                    </p>
                  </div>
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
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setIsQrPanelOpen(true)}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-300 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-200"
                    >
                      <QrCode className="size-4" />
                      Ver QR
                    </button>
                    <button
                      type="button"
                      onClick={() => checkQrPayment({ autoRegister: true })}
                      disabled={isCheckingQr || isCharging}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-cyan-700 bg-cyan-900 text-sm font-semibold text-cyan-50 transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-800 disabled:text-neutral-500"
                    >
                      {isCheckingQr || isCharging ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CircleCheck className="size-4" />
                      )}
                      Verificar
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-cyan-200">
                    El QR se genera automaticamente al seleccionar este metodo.
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
            <p className="mt-5 text-sm text-emerald-200">Volviendo al POS...</p>
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
                    lastCompletedSale?.total ||
                      qrPayment?.amount ||
                      totals.total,
                  )}
                </h2>
              </div>
              <div className="rounded-md border border-cyan-800 bg-cyan-950 px-3 py-2 text-xs font-semibold text-cyan-100">
                Visible hasta confirmar
              </div>
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
                    <h3 className="mt-3 text-2xl leading-tight font-semibold">
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

                  {saleError || saleMessage ? (
                    <p
                      className={`mb-4 rounded-md border px-3 py-2 text-sm ${
                        saleError
                          ? "border-red-900 bg-red-950 text-red-200"
                          : "border-cyan-800 bg-cyan-950 text-cyan-100"
                      }`}
                    >
                      {saleError || saleMessage}
                    </p>
                  ) : null}

                  <div className="relative rounded-md bg-white p-4">
                    {qrImageSrc ? (
                      <>
                        <img
                          src={qrImageSrc}
                          alt="QR simple Baneco"
                          className="mx-auto aspect-square w-full object-contain"
                        />
                        {qrLogoUrl ? (
                          <div className="pointer-events-none absolute top-1/2 left-1/2 grid aspect-square h-[10%] max-h-12 min-h-8 w-[10%] max-w-12 min-w-8 -translate-x-1/2 -translate-y-1/2 place-items-center overflow-hidden rounded-full bg-white p-0.5 shadow-sm ring-2 ring-white">
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
                      <p className="mt-1 truncate">{qrPayment.transactionId}</p>
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
                      : "Verificar pago en banco"}
                  </button>
                  <p className="mt-3 text-center text-xs text-neutral-500">
                    El QR se mantiene visible hasta que Baneco confirme el pago.
                  </p>
                  <button
                    type="button"
                    onClick={cancelQrPayment}
                    disabled={isCharging}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-red-900 bg-red-950 text-sm font-semibold text-red-100 transition hover:border-red-500 hover:bg-red-900 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-500"
                  >
                    <X className="size-4" />
                    Cancelar pago QR
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
