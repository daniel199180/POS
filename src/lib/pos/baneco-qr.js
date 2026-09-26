import crypto from "node:crypto";
import { Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { assertPosSaleTabsEnabled } from "./pos-ui-settings.js";
import {
  ForbiddenError,
  canAccessBranch,
  normalizeUserRole,
} from "./auth-core.js";
import {
  cancelBanecoQr,
  generateBanecoQr,
  getBanecoQrStatus,
  warmBanecoCredentials,
} from "./baneco.js";
import {
  decryptCredentialsWithRotation,
  encryptCredentials,
} from "./payments.js";
import {
  PAYMENT_VALIDITY_DAYS,
  PAYMENT_VALIDITY_MS,
} from "./payment-validity.js";

const { databaseId, collections } = appwriteConfig;
const QR_TOKEN_TTL_MS = PAYMENT_VALIDITY_MS;
const CUSTOM_PRODUCT_ID_PREFIX = "custom-";

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inputError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function getSigningSecret() {
  const secret =
    process.env.PAYMENT_CREDENTIALS_SECRET || process.env.APPWRITE_API_KEY;

  if (!secret) {
    throw new Error(
      "PAYMENT_CREDENTIALS_SECRET or APPWRITE_API_KEY is required.",
    );
  }

  return secret;
}

function parseConfig(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function getBanecoConfig(value) {
  const config = parseConfig(value);

  return {
    provider: "baneco",
    environment: "production",
    currency: "BOB",
    dueDays: PAYMENT_VALIDITY_DAYS,
    singleUse: true,
    modifyAmount: false,
    descriptionPrefix: text(config.descriptionPrefix, "POS V1").slice(0, 80),
  };
}

function getQrAuthorizedCashier(context) {
  const name =
    text(context.profile?.name) ||
    text(context.user?.name) ||
    text(context.user?.email);

  return {
    userId: text(context.user?.id),
    name,
    email: text(context.user?.email),
    profileId: text(context.profile?.id),
    profileRole: normalizeUserRole(context.profile?.role),
    allowedBranchIds: Array.isArray(context.allowedBranchIds)
      ? context.allowedBranchIds.filter(Boolean)
      : [],
  };
}

function buildQrTransactionId(branchCode = "POS") {
  const safeBranchCode = text(branchCode, "POS")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 5);
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();

  return `${safeBranchCode}${timestamp}${random}`.slice(0, 30);
}

function signQrPaymentPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

function verifyQrPaymentToken(token, { allowExpired = false } = {}) {
  const [body, signature] = text(token).split(".");

  if (!body || !signature) {
    throw inputError("El comprobante QR es invalido.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(body)
    .digest("base64url");

  if (signature.length !== expectedSignature.length) {
    throw inputError("El comprobante QR es invalido.");
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    )
  ) {
    throw inputError("El comprobante QR es invalido.");
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const generatedAt = Date.parse(payload.generatedAt);

    if (
      !generatedAt ||
      (!allowExpired && Date.now() - generatedAt > QR_TOKEN_TTL_MS)
    ) {
      throw inputError("El comprobante QR vencio. Genera un nuevo QR.");
    }

    return payload;
  } catch (error) {
    if (error.status) {
      throw error;
    }

    throw inputError("El comprobante QR es invalido.");
  }
}

function assertQrPaymentToken(input, expected = {}, options = {}) {
  const tokenPayload = verifyQrPaymentToken(input.paymentToken, options);
  const expectedAmount = roundMoney(expected.amount);

  if (expected.branchId && tokenPayload.branchId !== expected.branchId) {
    throw inputError("El comprobante QR no corresponde a esta sucursal.");
  }

  if (
    expected.paymentMethodId &&
    tokenPayload.paymentMethodId !== expected.paymentMethodId
  ) {
    throw inputError("El comprobante QR no corresponde al metodo de pago.");
  }

  if (expected.qrId && tokenPayload.qrId !== expected.qrId) {
    throw inputError("El comprobante QR no corresponde al QR generado.");
  }

  if (
    expectedAmount > 0 &&
    roundMoney(tokenPayload.amount) !== expectedAmount
  ) {
    throw inputError("El comprobante QR no coincide con el total de la venta.");
  }

  return tokenPayload;
}

export function getPosBanecoQrPaymentTokenPayload(input = {}, expected = {}) {
  return assertQrPaymentToken(input, expected);
}

function assertQrPaidToken(input, expected = {}) {
  const paidPayload = verifyQrPaymentToken(input.paidToken);
  const expectedAmount = roundMoney(expected.amount);

  if (paidPayload.tokenType !== "baneco-paid") {
    throw inputError("La confirmacion del pago QR es invalida.");
  }

  if (paidPayload.status !== "paid") {
    throw inputError("La confirmacion del pago QR no esta pagada.");
  }

  if (expected.branchId && paidPayload.branchId !== expected.branchId) {
    throw inputError("La confirmacion QR no corresponde a esta sucursal.");
  }

  if (
    expected.paymentMethodId &&
    paidPayload.paymentMethodId !== expected.paymentMethodId
  ) {
    throw inputError("La confirmacion QR no corresponde al metodo de pago.");
  }

  if (expected.qrId && paidPayload.qrId !== expected.qrId) {
    throw inputError("La confirmacion QR no corresponde al QR generado.");
  }

  if (expectedAmount > 0 && roundMoney(paidPayload.amount) !== expectedAmount) {
    throw inputError("La confirmacion QR no coincide con el total.");
  }

  return paidPayload;
}

function sanitizeSaleItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw inputError("Agrega al menos un producto al carrito.");
  }

  const itemsByProduct = new Map();

  for (const item of items) {
    const productId = text(item.productId || item.id);
    const quantity = number(item.quantity, 0);
    const isCustom =
      item.isCustom === true || productId.startsWith(CUSTOM_PRODUCT_ID_PREFIX);

    if (!productId || quantity <= 0) {
      throw inputError(
        "Todos los items deben tener producto y cantidad valida.",
      );
    }

    if (isCustom) {
      const name = text(item.name).slice(0, 200);
      const unitPrice = roundMoney(item.unitPrice || item.price);

      if (!name || unitPrice <= 0) {
        throw inputError(
          "Los cobros personalizados deben tener nombre y precio valido.",
        );
      }

      itemsByProduct.set(productId.slice(0, 36), {
        productId: productId.slice(0, 36),
        quantity,
        unitPrice,
        isCustom: true,
      });
      continue;
    }

    const currentQuantity = itemsByProduct.get(productId)?.quantity || 0;
    itemsByProduct.set(productId, {
      productId,
      quantity: currentQuantity + quantity,
      isCustom: false,
    });
  }

  return Array.from(itemsByProduct.values());
}

async function getStockDocument(databases, productId, branchId) {
  const stockResult = await databases.listDocuments({
    databaseId,
    collectionId: collections.stock,
    queries: [
      Query.equal("productId", productId),
      Query.equal("branchId", branchId),
      Query.limit(1),
    ],
  });

  return stockResult.documents[0];
}

async function calculateCartTotal(databases, branchId, items) {
  const rawItems = sanitizeSaleItems(items);
  const customItems = rawItems.filter((item) => item.isCustom);
  const productItems = rawItems.filter((item) => !item.isCustom);
  const productIds = productItems.map((item) => item.productId);
  const saleItems = [];

  for (const item of customItems) {
    saleItems.push({
      productId: item.productId,
      quantity: item.quantity,
      subtotal: roundMoney(item.unitPrice * item.quantity),
    });
  }

  if (productIds.length === 0) {
    return {
      total: roundMoney(
        saleItems.reduce((sum, item) => sum + item.subtotal, 0),
      ),
      itemCount: saleItems.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  const [productsResult, stocksResult] = await Promise.all([
    databases.listDocuments({
      databaseId,
      collectionId: collections.products,
      queries: [Query.equal("$id", productIds), Query.limit(productIds.length)],
    }),
    databases.listDocuments({
      databaseId,
      collectionId: collections.stock,
      queries: [
        Query.equal("productId", productIds),
        Query.equal("branchId", branchId),
        Query.limit(productIds.length),
      ],
    }),
  ]);
  const productsById = new Map(
    productsResult.documents.map((product) => [product.$id, product]),
  );
  const stockByProductId = new Map(
    stocksResult.documents.map((stock) => [stock.productId, stock]),
  );

  for (const rawItem of productItems) {
    const product = productsById.get(rawItem.productId);
    const stock = stockByProductId.get(rawItem.productId);

    if (!product) {
      throw inputError("Uno de los productos ya no esta disponible.");
    }

    if (!product.isActive) {
      throw inputError(`El producto ${product.name} esta inactivo.`);
    }

    if (!stock || stock.quantity < rawItem.quantity) {
      throw inputError(`Stock insuficiente para ${product.name}.`);
    }

    saleItems.push({
      productId: product.$id,
      quantity: rawItem.quantity,
      subtotal: roundMoney(product.price * rawItem.quantity),
    });
  }

  return {
    total: roundMoney(saleItems.reduce((sum, item) => sum + item.subtotal, 0)),
    itemCount: saleItems.reduce((sum, item) => sum + item.quantity, 0),
  };
}

async function getBanecoPaymentContext(context, input) {
  const branchId = text(input.branchId);
  const paymentMethodId = text(input.paymentMethodId);

  if (!branchId || !paymentMethodId) {
    throw inputError("Sucursal y metodo de pago son obligatorios.");
  }

  if (!canAccessBranch(context, branchId)) {
    throw new ForbiddenError("No tienes acceso a esta sucursal.");
  }

  const { databases } = createAdminClient(context.userAgent);
  const [branch, paymentMethod, credentialsResult] = await Promise.all([
    databases.getDocument({
      databaseId,
      collectionId: collections.branches,
      documentId: branchId,
    }),
    databases.getDocument({
      databaseId,
      collectionId: collections.branchPaymentMethods,
      documentId: paymentMethodId,
    }),
    databases.listDocuments({
      databaseId,
      collectionId: collections.branchPaymentCredentials,
      queries: [
        Query.equal("methodId", paymentMethodId),
        Query.equal("provider", "baneco"),
        Query.equal("isActive", true),
        Query.limit(1),
      ],
    }),
  ]);

  if (!branch.isActive) {
    throw inputError("La sucursal seleccionada esta inactiva.");
  }

  if (!paymentMethod.isEnabled || paymentMethod.branchId !== branchId) {
    throw inputError("El metodo QR no corresponde a la sucursal.");
  }

  const methodConfig = parseConfig(paymentMethod.config);

  if (paymentMethod.type !== "qr" || methodConfig.provider !== "baneco") {
    throw inputError("La sucursal no tiene QR Baneco activo para cobrar.");
  }

  const credentialDocument = credentialsResult.documents[0];

  if (!credentialDocument) {
    throw inputError("Configura las credenciales Baneco de esta sucursal.");
  }

  const decryptedCredentials = decryptCredentialsWithRotation(
    credentialDocument.encryptedPayload,
  );

  return {
    databases,
    branch,
    paymentMethod,
    credentialDocument,
    config: getBanecoConfig(methodConfig),
    credentials: decryptedCredentials.credentials,
    credentialsNeedRotation: decryptedCredentials.needsRotation,
  };
}

function hasPreparedBanecoCredentials(credentials) {
  return Boolean(
    text(credentials.encryptedPassword) &&
      text(credentials.encryptedAccountCredit),
  );
}

async function persistPreparedBanecoCredentials(
  databases,
  credentialDocument,
  credentials,
) {
  await databases.updateDocument({
    databaseId,
    collectionId: collections.branchPaymentCredentials,
    documentId: credentialDocument.$id,
    data: {
      encryptedPayload: encryptCredentials(credentials),
    },
  });
}

async function warmPaymentContextCredentials({
  databases,
  credentialDocument,
  config,
  credentials,
  credentialsNeedRotation = false,
}) {
  const wasPrepared = hasPreparedBanecoCredentials(credentials);
  const preparedCredentials = await warmBanecoCredentials(credentials, config);

  if (!wasPrepared || credentialsNeedRotation) {
    await persistPreparedBanecoCredentials(
      databases,
      credentialDocument,
      preparedCredentials,
    );
  }

  return preparedCredentials;
}

function readPaymentAmount(payment) {
  if (!payment || typeof payment !== "object") {
    return null;
  }

  for (const key of [
    "amount",
    "monto",
    "paidAmount",
    "paymentAmount",
    "importe",
  ]) {
    const value = number(payment[key], Number.NaN);

    if (Number.isFinite(value) && value > 0) {
      return roundMoney(value);
    }
  }

  return null;
}

function getConfirmedAmount(status) {
  const payments = Array.isArray(status.payment) ? status.payment : [];

  for (const payment of payments) {
    const amount = readPaymentAmount(payment);

    if (amount) {
      return amount;
    }
  }

  return null;
}

function readPaymentText(payment, keys) {
  if (!payment || typeof payment !== "object") {
    return "";
  }

  for (const key of keys) {
    const value = payment[key];

    if (typeof value === "string" || typeof value === "number") {
      const safeValue = String(value).trim();

      if (safeValue) {
        return safeValue;
      }
    }
  }

  return "";
}

function getPaymentDetail(status, keys) {
  const payments = Array.isArray(status.payment) ? status.payment : [];

  for (const payment of payments) {
    const value = readPaymentText(payment, keys);

    if (value) {
      return value;
    }
  }

  return "";
}

export async function generatePosBanecoQr(context, input = {}, options = {}) {
  const {
    databases,
    branch,
    paymentMethod,
    credentialDocument,
    config,
    credentials,
    credentialsNeedRotation,
  } = await getBanecoPaymentContext(context, input);
  if (!options.reservedCart) {
    await assertPosSaleTabsEnabled(context, branch.$id, input.items, databases);
  }
  const [preparedCredentials, cart] = await Promise.all([
    warmPaymentContextCredentials({
      databases,
      credentialDocument,
      config,
      credentials,
      credentialsNeedRotation,
    }),
    options.reservedCart ||
      calculateCartTotal(databases, branch.$id, input.items),
  ]);

  if (cart.total <= 0) {
    throw inputError("El total del QR debe ser mayor a cero.");
  }

  const transactionId = buildQrTransactionId(branch.code);
  const description =
    `${config.descriptionPrefix} ${branch.code || branch.name}`.slice(0, 120);
  const qr = await generateBanecoQr({
    amount: cart.total,
    config,
    credentials: preparedCredentials,
    description,
    transactionId,
  });

  return {
    branchId: branch.$id,
    paymentMethodId: paymentMethod.$id,
    amount: cart.total,
    currency: "BOB",
    itemCount: cart.itemCount,
    qrId: qr.qrId,
    qrImage: qr.qrImage,
    transactionId,
    status: "pending",
    message: qr.message,
    generatedAt: new Date().toISOString(),
    paymentToken: signQrPaymentPayload({
      tokenType: "baneco-qr-payment",
      branchId: branch.$id,
      paymentMethodId: paymentMethod.$id,
      amount: cart.total,
      currency: "BOB",
      qrId: qr.qrId,
      transactionId,
      cashier: getQrAuthorizedCashier(context),
      generatedAt: new Date().toISOString(),
    }),
  };
}

export async function checkPosBanecoQrStatus(
  context,
  input = {},
  options = {},
) {
  const qrId = text(input.qrId);

  if (!qrId) {
    throw inputError("El QR de Baneco es obligatorio.");
  }

  const tokenPayload = assertQrPaymentToken(
    input,
    {
      branchId: text(input.branchId),
      paymentMethodId: text(input.paymentMethodId),
      qrId,
    },
    options,
  );

  const { branch, paymentMethod, config, credentials } =
    await getBanecoPaymentContext(context, input);
  const status = await getBanecoQrStatus({
    config,
    credentials,
    qrId,
  });

  const confirmedAmount = getConfirmedAmount(status);
  const senderName = getPaymentDetail(status, [
    "senderName",
    "payerName",
    "name",
  ]);
  const senderDocumentId = getPaymentDetail(status, [
    "senderDocumentId",
    "documentId",
  ]);
  const senderAccount = getPaymentDetail(status, ["senderAccount", "account"]);
  const result = {
    branchId: branch.$id,
    paymentMethodId: paymentMethod.$id,
    qrId,
    status: status.status,
    statusCode: status.statusCode,
    confirmedAmount,
    senderName,
    senderDocumentId,
    senderAccount,
    payment: status.payment,
    message: status.message,
    checkedAt: new Date().toISOString(),
  };

  if (status.status === "paid") {
    result.paidToken = signQrPaymentPayload({
      tokenType: "baneco-paid",
      branchId: branch.$id,
      paymentMethodId: paymentMethod.$id,
      amount: roundMoney(tokenPayload.amount),
      currency: tokenPayload.currency || "BOB",
      qrId,
      transactionId: tokenPayload.transactionId || "",
      status: "paid",
      confirmedAmount,
      senderName,
      senderDocumentId,
      senderAccount,
      generatedAt: new Date().toISOString(),
    });
  }

  return result;
}

export async function cancelPosBanecoQr(context, input = {}, options = {}) {
  const qrId = text(input.qrId);

  if (!qrId) {
    throw inputError("El QR de Baneco es obligatorio.");
  }

  const tokenPayload = assertQrPaymentToken(
    input,
    {
      branchId: text(input.branchId),
      paymentMethodId: text(input.paymentMethodId),
      qrId,
    },
    options,
  );
  const { branch, paymentMethod, config, credentials } =
    await getBanecoPaymentContext(context, input);
  const cancelled = await cancelBanecoQr({
    config,
    credentials,
    qrId,
  });

  return {
    branchId: branch.$id,
    paymentMethodId: paymentMethod.$id,
    qrId,
    transactionId: tokenPayload.transactionId || "",
    status: "cancelled",
    statusCode: cancelled.statusCode || 9,
    message: cancelled.message,
    cancelledAt: new Date().toISOString(),
  };
}

export async function assertPosBanecoQrPaid(context, input = {}) {
  const expectedAmount = roundMoney(input.expectedAmount);
  const tokenPayload = assertQrPaymentToken(input, {
    branchId: text(input.branchId),
    paymentMethodId: text(input.paymentMethodId),
    qrId: text(input.qrId),
    amount: expectedAmount,
  });
  const status = await checkPosBanecoQrStatus(context, input);

  if (status.status !== "paid") {
    throw inputError("El pago QR aun no fue confirmado por Baneco.", 409);
  }

  if (
    status.confirmedAmount &&
    expectedAmount > 0 &&
    status.confirmedAmount !== expectedAmount
  ) {
    throw inputError(
      "El monto pagado por QR no coincide con el total de la venta.",
      409,
    );
  }

  return {
    ...status,
    transactionId: tokenPayload.transactionId || text(input.transactionId),
  };
}

export function assertPosBanecoQrPaidToken(input = {}, options = {}) {
  const expectedAmount = roundMoney(input.expectedAmount);
  const tokenPayload = assertQrPaymentToken(
    input,
    {
      branchId: text(input.branchId),
      paymentMethodId: text(input.paymentMethodId),
      qrId: text(input.qrId),
      amount: expectedAmount,
    },
    options,
  );
  const paidPayload = assertQrPaidToken(input, {
    branchId: text(input.branchId),
    paymentMethodId: text(input.paymentMethodId),
    qrId: text(input.qrId),
    amount: expectedAmount,
  });

  if (
    tokenPayload.transactionId &&
    paidPayload.transactionId &&
    tokenPayload.transactionId !== paidPayload.transactionId
  ) {
    throw inputError("La confirmacion QR no corresponde a esta venta.");
  }

  return {
    branchId: paidPayload.branchId,
    paymentMethodId: paidPayload.paymentMethodId,
    qrId: paidPayload.qrId,
    status: "paid",
    statusCode: 1,
    confirmedAmount: roundMoney(paidPayload.confirmedAmount),
    senderName: text(paidPayload.senderName),
    senderDocumentId: text(paidPayload.senderDocumentId),
    senderAccount: text(paidPayload.senderAccount),
    payment: [],
    message: "Pago QR confirmado.",
    checkedAt: paidPayload.generatedAt,
    transactionId: paidPayload.transactionId || tokenPayload.transactionId,
  };
}

export async function warmupPosBanecoQr(context, input = {}) {
  const paymentContext = await getBanecoPaymentContext(context, input);
  await warmPaymentContextCredentials(paymentContext);

  return {
    branchId: paymentContext.branch.$id,
    paymentMethodId: paymentContext.paymentMethod.$id,
    status: "ready",
    checkedAt: new Date().toISOString(),
  };
}
