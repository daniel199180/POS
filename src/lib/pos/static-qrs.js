import crypto from "node:crypto";
import { ID, Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { assertPosTabEnabled } from "./pos-ui-settings.js";
import { ForbiddenError, canAccessBranch } from "./auth-core.js";
import {
  cancelPosBanecoQr,
  checkPosBanecoQrStatus,
  generatePosBanecoQr,
} from "./baneco-qr.js";

const { databaseId, collections } = appwriteConfig;

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function inputError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseConfig(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function toStaticQr(document, { includeImage = true } = {}) {
  return {
    id: document.$id,
    branchId: document.branchId,
    branchName: document.branchName,
    paymentMethodId: document.paymentMethodId,
    paymentMethodLabel: document.paymentMethodLabel,
    createdByName: document.createdByName,
    description: document.description,
    qrId: document.qrId,
    qrImage: includeImage ? document.qrImage || "" : "",
    transactionId: document.transactionId,
    status: document.status,
    lastStatus: document.lastStatus || "pending",
    lastCheckedAt: document.lastCheckedAt || "",
    totalPaid: money(document.totalPaid),
    paymentsCount: Number(document.paymentsCount) || 0,
    lastError: document.lastError || "",
    createdAt: document.$createdAt,
    updatedAt: document.$updatedAt,
  };
}

function toPayment(document) {
  let details = {};
  try {
    details = JSON.parse(document.details || "{}");
  } catch {
    details = {};
  }

  return {
    id: document.$id,
    staticQrId: document.staticQrId,
    providerPaymentId: document.providerPaymentId,
    amount: money(document.amount),
    currency: document.currency || "BOB",
    paidAt: document.paidAt || document.$createdAt,
    senderName: document.senderName || "",
    senderDocumentId: document.senderDocumentId || "",
    senderAccount: document.senderAccount || "",
    bankName: document.bankName || "",
    bankOrder: document.bankOrder || "",
    status: document.status || "paid",
    saleId: document.saleId || "",
    details,
    createdAt: document.$createdAt,
  };
}

function assertBranchAccess(context, branchId) {
  if (!branchId || !canAccessBranch(context, branchId)) {
    throw new ForbiddenError("No tienes acceso a esta sucursal.");
  }
}

async function getStaticQrDocument(databases, qrId) {
  try {
    return await databases.getDocument({
      databaseId,
      collectionId: collections.staticQrs,
      documentId: text(qrId),
    });
  } catch (error) {
    if (error?.code === 404) {
      throw inputError("El QR estático no existe.", 404);
    }
    throw error;
  }
}

async function assertStaticQrAccess(context, document) {
  assertBranchAccess(context, document.branchId);
}

function providerValue(payment, keys) {
  for (const key of keys) {
    const value = payment?.[key];
    if (typeof value === "string" || typeof value === "number") {
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }
  return "";
}

function providerAmount(payment, fallback = 0) {
  return money(
    providerValue(payment, [
      "amount",
      "monto",
      "paidAmount",
      "paymentAmount",
      "importe",
      "amountPaid",
    ]) || fallback,
  );
}

function providerDate(payment, fallback) {
  const value = providerValue(payment, [
    "paidAt",
    "paymentDate",
    "transactionDate",
    "date",
    "fecha",
    "createdAt",
  ]);
  return value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : fallback;
}

function normalizeProviderPayment(payment, status) {
  const serialized = JSON.stringify(payment || {});
  const explicitId = providerValue(payment, [
    "paymentId",
    "transactionId",
    "reference",
    "referenceId",
    "id",
    "orderId",
    "authorizationNumber",
    "numeroReferencia",
  ]);
  const providerPaymentId = (
    explicitId || crypto.createHash("sha256").update(serialized).digest("hex")
  ).slice(0, 160);

  return {
    providerPaymentId: providerPaymentId.slice(0, 160),
    amount: providerAmount(payment, status.confirmedAmount),
    currency: providerValue(payment, ["currency", "moneda"]) || "BOB",
    paidAt: providerDate(payment, status.checkedAt),
    senderName: providerValue(payment, ["senderName", "payerName", "name"]),
    senderDocumentId: providerValue(payment, [
      "senderDocumentId",
      "documentId",
      "documentNumber",
    ]),
    senderAccount: providerValue(payment, ["senderAccount", "account"]),
    bankName: providerValue(payment, ["bankName", "originBank"]),
    bankOrder: providerValue(payment, [
      "bankOrder",
      "orderNumber",
      "numeroOrdenAch",
    ]),
    status: "paid",
    details: serialized.slice(0, 10000),
  };
}

async function listQrPayments(databases, staticQrId) {
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.staticQrPayments,
    queries: [
      Query.equal("staticQrId", staticQrId),
      Query.orderDesc("paidAt"),
      Query.limit(500),
    ],
  });
  return result.documents.map(toPayment);
}

function staticSaleId(paymentId) {
  return `static-${paymentId}`.slice(0, 36);
}

function staticSaleNumber(paymentId) {
  return `QR-${paymentId}`.slice(0, 30);
}

async function registerPaymentIncome(
  databases,
  staticQr,
  payment,
  context = {},
) {
  if (payment.saleId) return payment.saleId;

  const saleId = staticSaleId(payment.id);
  const cashierId = text(context.user?.id) || staticQr.createdByUserId;
  const cashierName = text(
    context.profile?.name || context.user?.name || context.user?.email,
    staticQr.createdByName,
  ).slice(0, 120);
  const saleData = {
    saleNumber: staticSaleNumber(payment.id),
    branchId: staticQr.branchId,
    branchName: staticQr.branchName,
    cashierId,
    cashierName,
    status: "completed",
    subtotal: payment.amount,
    discount: 0,
    total: payment.amount,
    paymentMethodId: staticQr.paymentMethodId,
    paymentMethodType: "qr",
    paymentMethodLabel: `QR estático · ${staticQr.description}`.slice(0, 80),
    amountPaid: payment.amount,
    change: 0,
    senderName: payment.senderName.slice(0, 160),
    notes:
      `QR estático: ${staticQr.description} | Ref: ${payment.providerPaymentId}`.slice(
        0,
        300,
      ),
    completedAt: payment.paidAt || new Date().toISOString(),
  };

  try {
    await databases.createDocument({
      databaseId,
      collectionId: collections.sales,
      documentId: saleId,
      permissions: [],
      data: saleData,
    });
  } catch (error) {
    if (error?.code !== 409) throw error;
  }

  const itemId = staticSaleId(payment.id);
  try {
    await databases.createDocument({
      databaseId,
      collectionId: collections.saleItems,
      documentId: itemId,
      permissions: [],
      data: {
        saleId,
        productId: `custom-${payment.id}`.slice(0, 36),
        productName: `QR estático: ${staticQr.description}`.slice(0, 200),
        productSku: "CUSTOM",
        quantity: 1,
        unitPrice: payment.amount,
        discount: 0,
        subtotal: payment.amount,
      },
    });
  } catch (error) {
    if (error?.code !== 409) throw error;
  }

  await databases.updateDocument({
    databaseId,
    collectionId: collections.staticQrPayments,
    documentId: payment.id,
    data: { saleId },
  });

  return saleId;
}

async function persistStatus(databases, document, status, context) {
  const rawPayments = Array.isArray(status.payment) ? status.payment : [];
  const existing = await listQrPayments(databases, document.$id);
  const existingIds = new Set(
    existing.map((payment) => payment.providerPaymentId),
  );

  for (const [index, rawPayment] of rawPayments.entries()) {
    const payment = normalizeProviderPayment(rawPayment, status);
    if (payment.amount <= 0 || existingIds.has(payment.providerPaymentId))
      continue;

    try {
      await databases.createDocument({
        databaseId,
        collectionId: collections.staticQrPayments,
        documentId: ID.unique(),
        permissions: [],
        data: {
          staticQrId: document.$id,
          branchId: document.branchId,
          providerPaymentId: payment.providerPaymentId,
          amount: payment.amount,
          currency: payment.currency.slice(0, 3),
          ...(payment.paidAt ? { paidAt: payment.paidAt } : {}),
          senderName: payment.senderName.slice(0, 160),
          senderDocumentId: payment.senderDocumentId.slice(0, 80),
          senderAccount: payment.senderAccount.slice(0, 120),
          bankName: payment.bankName.slice(0, 120),
          bankOrder: payment.bankOrder.slice(0, 120),
          status: payment.status,
          details: payment.details,
        },
      });
      existingIds.add(payment.providerPaymentId);
    } catch (error) {
      if (error?.code !== 409) throw error;
    }
  }

  let payments = await listQrPayments(databases, document.$id);
  for (const payment of payments) {
    await registerPaymentIncome(databases, document, payment, context);
  }
  payments = await listQrPayments(databases, document.$id);
  const totalPaid = money(
    payments.reduce((sum, payment) => sum + payment.amount, 0),
  );
  const updated = await databases.updateDocument({
    databaseId,
    collectionId: collections.staticQrs,
    documentId: document.$id,
    data: {
      lastCheckedAt: status.checkedAt,
      lastStatus: status.status,
      totalPaid,
      paymentsCount: payments.length,
      lastError: "",
      ...(status.status === "cancelled" ? { status: "cancelled" } : {}),
    },
  });

  return { document: updated, payments };
}

export async function createStaticQr(context, input = {}) {
  const branchId = text(input.branchId);
  const paymentMethodId = text(input.paymentMethodId);
  const description = text(input.description).slice(0, 120);

  if (!branchId || !paymentMethodId || !description) {
    throw inputError("Sucursal, método QR y descripción son obligatorios.");
  }

  assertBranchAccess(context, branchId);
  const { databases } = createAdminClient(context.userAgent);
  await assertPosTabEnabled(context, branchId, "staticQr", databases);

  const [branch, paymentMethod] = await Promise.all([
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
  ]);
  const config = parseConfig(paymentMethod.config);

  if (
    branch.isActive === false ||
    paymentMethod.branchId !== branchId ||
    paymentMethod.isEnabled === false ||
    paymentMethod.type !== "qr" ||
    config.provider !== "baneco"
  ) {
    throw inputError("La sucursal necesita un método QR Baneco activo.");
  }

  const generatedQr = await generatePosBanecoQr(
    context,
    { branchId, paymentMethodId, description },
    { staticQr: true },
  );

  try {
    const document = await databases.createDocument({
      databaseId,
      collectionId: collections.staticQrs,
      documentId: ID.unique(),
      permissions: [],
      data: {
        createdByUserId: context.user.id,
        createdByName: text(
          context.profile?.name || context.user.name || context.user.email,
          "Cajero",
        ).slice(0, 120),
        branchId,
        branchName: branch.name,
        paymentMethodId,
        paymentMethodLabel: paymentMethod.label,
        description,
        qrId: generatedQr.qrId,
        qrImage: generatedQr.qrImage,
        qrPaymentToken: generatedQr.paymentToken,
        transactionId: generatedQr.transactionId,
        status: "active",
        lastStatus: generatedQr.status,
        totalPaid: 0,
        paymentsCount: 0,
        lastError: "",
      },
    });

    return toStaticQr(document);
  } catch (error) {
    await cancelPosBanecoQr(
      context,
      {
        branchId,
        paymentMethodId,
        qrId: generatedQr.qrId,
        paymentToken: generatedQr.paymentToken,
      },
      { allowExpired: true },
    ).catch(() => {});
    throw error;
  }
}

function staticQrScopeQueries(context, branchId) {
  const queries = [];

  if (branchId) {
    queries.push(Query.equal("branchId", branchId));
  } else if (!context.isAdmin) {
    const allowedBranchIds = context.allowedBranchIds?.length
      ? context.allowedBranchIds
      : ["__none__"];
    queries.push(Query.equal("branchId", allowedBranchIds));
  }

  return queries;
}

export async function getStaticQrFilterOptions(context) {
  const { databases } = createAdminClient(context.userAgent);
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.staticQrs,
    queries: [
      ...staticQrScopeQueries(context, ""),
      Query.limit(500),
      Query.select(["createdByUserId", "createdByName"]),
    ],
  });
  const creators = new Map();
  for (const document of result.documents) {
    if (!document.createdByUserId) continue;
    creators.set(document.createdByUserId, {
      id: document.createdByUserId,
      name: document.createdByName || document.createdByUserId,
    });
  }

  return {
    creators: [...creators.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  };
}

export async function listStaticQrs(context, input = {}) {
  const branchId = text(input.branchId);
  if (branchId) assertBranchAccess(context, branchId);
  const createdByUserId = text(input.createdByUserId);
  const status = text(input.status);
  const page = Math.max(Number.parseInt(input.page, 10) || 1, 1);
  const defaultPageSize = input.pageSize ? 25 : 100;
  const pageSize = Math.min(
    Math.max(Number.parseInt(input.pageSize, 10) || defaultPageSize, 1),
    100,
  );

  const { databases } = createAdminClient(context.userAgent);
  const queries = [
    ...staticQrScopeQueries(context, branchId),
    ...(createdByUserId
      ? [Query.equal("createdByUserId", createdByUserId)]
      : []),
    ...(status === "active" || status === "cancelled"
      ? [Query.equal("status", status)]
      : []),
    Query.orderDesc("$createdAt"),
    Query.limit(pageSize),
    Query.offset((page - 1) * pageSize),
  ];

  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.staticQrs,
    queries,
  });

  return {
    qrs: result.documents.map((document) => toStaticQr(document)),
    total: result.total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(result.total / pageSize), 1),
  };
}

export async function getStaticQrDetails(context, qrId) {
  const { databases } = createAdminClient(context.userAgent);
  const document = await getStaticQrDocument(databases, qrId);
  await assertStaticQrAccess(context, document);
  const existingPayments = await listQrPayments(databases, document.$id);
  for (const payment of existingPayments) {
    await registerPaymentIncome(databases, document, payment, context);
  }
  return {
    qr: toStaticQr(document),
    payments: await listQrPayments(databases, document.$id),
  };
}

export async function checkStaticQr(context, qrId) {
  const { databases } = createAdminClient(context.userAgent);
  const document = await getStaticQrDocument(databases, qrId);
  await assertStaticQrAccess(context, document);

  if (document.status === "cancelled") {
    throw inputError("Este QR estático está cancelado.", 409);
  }

  try {
    const status = await checkPosBanecoQrStatus(
      context,
      {
        branchId: document.branchId,
        paymentMethodId: document.paymentMethodId,
        qrId: document.qrId,
        paymentToken: document.qrPaymentToken,
      },
      { allowExpired: true },
    );
    const persisted = await persistStatus(databases, document, status, context);
    return {
      qr: toStaticQr(persisted.document),
      payments: persisted.payments,
      bankStatus: status,
    };
  } catch (error) {
    await databases
      .updateDocument({
        databaseId,
        collectionId: collections.staticQrs,
        documentId: document.$id,
        data: { lastError: text(error.message).slice(0, 500) },
      })
      .catch(() => {});
    throw error;
  }
}

export async function cancelStaticQr(context, qrId) {
  const { databases } = createAdminClient(context.userAgent);
  const document = await getStaticQrDocument(databases, qrId);
  await assertStaticQrAccess(context, document);

  if (document.status === "cancelled") return toStaticQr(document);

  await cancelPosBanecoQr(
    context,
    {
      branchId: document.branchId,
      paymentMethodId: document.paymentMethodId,
      qrId: document.qrId,
      paymentToken: document.qrPaymentToken,
    },
    { allowExpired: true },
  );

  const updated = await databases.updateDocument({
    databaseId,
    collectionId: collections.staticQrs,
    documentId: document.$id,
    data: { status: "cancelled", lastStatus: "cancelled" },
  });
  return toStaticQr(updated);
}
