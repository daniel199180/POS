export const CUSTOMER_DISPLAY_VERSION = 1;
export const CUSTOMER_DISPLAY_SESSION_STORAGE_KEY =
  "pos-customer-display:session-id";

export function getCustomerDisplayChannelName(sessionId) {
  return `pos-customer-display:${sessionId || "default"}`;
}

export function getCustomerDisplayStorageKey(sessionId) {
  return `pos-customer-display:${sessionId || "default"}:snapshot`;
}

export function getCustomerDisplayHeartbeatKey(sessionId) {
  return `pos-customer-display:${sessionId || "default"}:heartbeat`;
}

export function createEmptyCustomerDisplaySnapshot(sessionId = "") {
  return {
    version: CUSTOMER_DISPLAY_VERSION,
    sessionId,
    branch: {
      id: "",
      name: "",
      city: "",
    },
    cashier: {
      name: "",
      email: "",
    },
    cart: [],
    totals: {
      subtotal: 0,
      discount: 0,
      total: 0,
      paid: 0,
      change: 0,
    },
    payment: {
      id: "",
      type: "",
      label: "",
      provider: "",
    },
    qr: null,
    sale: {
      message: "",
      error: "",
      completed: null,
      isCharging: false,
      isGeneratingQr: false,
      isCheckingQr: false,
    },
    updatedAt: "",
  };
}
