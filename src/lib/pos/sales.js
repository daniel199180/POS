import { ID, Permission, Query, Role } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import {
  assertPosBanecoQrPaid,
  assertPosBanecoQrPaidToken,
  getPosBanecoQrPaymentTokenPayload,
} from "./baneco-qr.js";
import { ForbiddenError, canAccessBranch } from "./auth-core.js";

const { databaseId, collections } = appwriteConfig;
const documentPermissions = [Permission.read(Role.users())];
const paymentTypes = new Set(["cash", "qr", "card"]);
const saleStatuses = new Set(["completed", "cancelled", "refunded"]);
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const SUMMARY_LIMIT = 2000;
const LA_PAZ_OFFSET = "-04:00";
const CUSTOM_PRODUCT_SKU = "CUSTOM";
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

function normalizeTokenBranchIds(value, fallbackBranchId) {
  const branchIds = Array.isArray(value)
    ? value.map((branchId) => text(branchId))
    : [];
  const uniqueBranchIds = branchIds.filter(Boolean);
  const fallback = text(fallbackBranchId);

  if (fallback && !uniqueBranchIds.includes(fallback)) {
    uniqueBranchIds.push(fallback);
  }

  return uniqueBranchIds;
}

export function createSaleContextFromBanecoQrToken(input, userAgent) {
  const branchId = text(input.branchId);
  const paymentMethodId = text(input.paymentMethodId);
  const qrInput = input.banecoQr || {};
  const qrId = text(qrInput.qrId);
  const paymentToken = text(qrInput.paymentToken);

  if (!branchId || !paymentMethodId || !qrId || !paymentToken) {
    return null;
  }

  const tokenPayload = getPosBanecoQrPaymentTokenPayload(
    {
      paymentToken,
    },
    {
      branchId,
      paymentMethodId,
      qrId,
    },
  );

  if (tokenPayload.tokenType !== "baneco-qr-payment") {
    return null;
  }

  const cashier = tokenPayload.cashier || {};
  const userId = text(cashier.userId);

  if (!userId) {
    return null;
  }

  const email = text(cashier.email);
  const name = text(cashier.name) || email || "Cajero";
  const role = cashier.profileRole === "admin" ? "admin" : "cashier";
  const allowedBranchIds = normalizeTokenBranchIds(
    cashier.allowedBranchIds,
    branchId,
  );

  return {
    user: {
      id: userId,
      name,
      email,
    },
    profile: {
      id: text(cashier.profileId),
      userId,
      name,
      email,
      role,
      branchId,
      allowedBranchIds,
      isActive: true,
    },
    userAgent,
    isAdmin: role === "admin",
    canManageCatalog: role === "admin",
    canManagePayments: role === "admin",
    canManageUsers: role === "admin",
    allowedBranchIds,
    fromSignedQrPaymentToken: true,
  };
}

function formatLocalDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDateRange(dateFrom, dateTo) {
  const safeFrom = text(dateFrom) || formatLocalDate();
  const safeTo = text(dateTo) || safeFrom;

  return {
    dateFrom: safeFrom,
    dateTo: safeTo,
    from: new Date(`${safeFrom}T00:00:00${LA_PAZ_OFFSET}`).toISOString(),
    to: new Date(`${safeTo}T23:59:59.999${LA_PAZ_OFFSET}`).toISOString(),
  };
}

function clampPageSize(value) {
  return Math.min(
    Math.max(Math.trunc(number(value, DEFAULT_PAGE_SIZE)), 1),
    MAX_PAGE_SIZE,
  );
}

function toBranch(document) {
  return {
    id: document.$id,
    name: document.name,
    code: document.code,
    city: document.city,
    isActive: document.isActive,
  };
}

function toPaymentMethod(document) {
  return {
    id: document.$id,
    branchId: document.branchId,
    type: document.type,
    label: document.label,
    isEnabled: document.isEnabled,
    sortOrder: document.sortOrder || 0,
  };
}

function toCashier(document) {
  return {
    id: document.userId,
    profileId: document.$id,
    name: document.name,
    email: document.email,
    role: document.role,
    allowedBranchIds: Array.isArray(document.allowedBranchIds)
      ? document.allowedBranchIds
      : document.branchId
        ? [document.branchId]
        : [],
    isActive: document.isActive !== false,
  };
}

function toSale(document) {
  return {
    id: document.$id,
    saleNumber: document.saleNumber,
    branchId: document.branchId,
    branchName: document.branchName,
    cashierId: document.cashierId,
    cashierName: document.cashierName,
    status: document.status,
    subtotal: document.subtotal,
    discount: document.discount || 0,
    total: document.total,
    paymentMethodId: document.paymentMethodId,
    paymentMethodType: document.paymentMethodType,
    paymentMethodLabel: document.paymentMethodLabel,
    amountPaid: document.amountPaid,
    change: document.change || 0,
    senderName: document.senderName || "",
    notes: document.notes || "",
    completedAt: document.completedAt || document.$createdAt,
    createdAt: document.$createdAt,
    updatedAt: document.$updatedAt,
  };
}

function toSaleItem(document) {
  return {
    id: document.$id,
    saleId: document.saleId,
    productId: document.productId,
    productName: document.productName,
    productSku: document.productSku,
    quantity: document.quantity,
    unitPrice: document.unitPrice,
    discount: document.discount || 0,
    subtotal: document.subtotal,
  };
}

async function fetchSaleItemsBySaleIds(databases, saleIds) {
  if (saleIds.length === 0) {
    return new Map();
  }

  const itemsBySaleId = new Map(saleIds.map((saleId) => [saleId, []]));
  const batchSize = 100;

  for (let cursor = 0; cursor < saleIds.length; cursor += batchSize) {
    const batchIds = saleIds.slice(cursor, cursor + batchSize);
    let offset = 0;

    while (true) {
      const result = await databases.listDocuments({
        databaseId,
        collectionId: collections.saleItems,
        queries: [
          Query.equal("saleId", batchIds),
          Query.orderAsc("$createdAt"),
          Query.limit(500),
          Query.offset(offset),
        ],
      });

      for (const item of result.documents.map(toSaleItem)) {
        const saleItems = itemsBySaleId.get(item.saleId) || [];
        saleItems.push(item);
        itemsBySaleId.set(item.saleId, saleItems);
      }

      if (result.documents.length < 500) {
        break;
      }

      offset += result.documents.length;
    }
  }

  return itemsBySaleId;
}

function matchesSaleSearch(sale, search) {
  const term = text(search).toLowerCase();

  if (!term) {
    return true;
  }

  return [
    sale.saleNumber,
    sale.branchName,
    sale.cashierName,
    sale.senderName,
    sale.paymentMethodLabel,
    sale.paymentMethodType,
    sale.status,
  ]
    .join(" ")
    .toLowerCase()
    .includes(term);
}

function buildSaleNumber(branchCode = "POS") {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${branchCode}-${timestamp}-${random}`.slice(0, 30);
}

function assertAdmin(context) {
  if (!context.isAdmin) {
    throw new ForbiddenError("Solo un administrador puede anular ventas.");
  }
}

function allowedBranchFilter(context, requestedBranchId) {
  const branchId = text(requestedBranchId);

  if (branchId) {
    if (!canAccessBranch(context, branchId)) {
      throw new ForbiddenError("No tienes acceso a esta sucursal.");
    }

    return branchId;
  }

  if (context.isAdmin) {
    return "";
  }

  return context.allowedBranchIds || [];
}

function buildSalesQueries(context, filters = {}, { paginate = true } = {}) {
  const pageSize = clampPageSize(filters.pageSize);
  const page = Math.max(Math.trunc(number(filters.page, 1)), 1);
  const offset = (page - 1) * pageSize;
  const queries = [];
  const dateRange = getDateRange(filters.dateFrom, filters.dateTo);
  const branchFilter = allowedBranchFilter(context, filters.branchId);
  const paymentType = text(filters.paymentType);
  const cashierId = text(filters.cashierId);
  const status = text(filters.status);

  queries.push(Query.greaterThanEqual("completedAt", dateRange.from));
  queries.push(Query.lessThanEqual("completedAt", dateRange.to));

  if (Array.isArray(branchFilter)) {
    queries.push(
      Query.equal(
        "branchId",
        branchFilter.length > 0 ? branchFilter : "__no_branch_access__",
      ),
    );
  } else if (branchFilter) {
    queries.push(Query.equal("branchId", branchFilter));
  }

  if (paymentTypes.has(paymentType)) {
    queries.push(Query.equal("paymentMethodType", paymentType));
  }

  if (cashierId) {
    queries.push(Query.equal("cashierId", cashierId));
  }

  if (saleStatuses.has(status)) {
    queries.push(Query.equal("status", status));
  }

  queries.push(Query.orderDesc("completedAt"));

  if (paginate) {
    queries.push(Query.limit(pageSize));
    queries.push(Query.offset(offset));
  }

  return {
    queries,
    page,
    pageSize,
    offset,
    dateRange,
  };
}

function getSaleSummary(sales) {
  const completed = sales.filter((sale) => sale.status === "completed");
  const cancelled = sales.filter((sale) => sale.status === "cancelled");
  const paymentTotals = {
    cash: 0,
    qr: 0,
    card: 0,
  };

  for (const sale of completed) {
    paymentTotals[sale.paymentMethodType] = roundMoney(
      (paymentTotals[sale.paymentMethodType] || 0) + sale.total,
    );
  }

  const total = roundMoney(
    completed.reduce((sum, sale) => sum + (sale.total || 0), 0),
  );

  return {
    total,
    count: completed.length,
    averageTicket: completed.length ? roundMoney(total / completed.length) : 0,
    cancelledCount: cancelled.length,
    cancelledTotal: roundMoney(
      cancelled.reduce((sum, sale) => sum + (sale.total || 0), 0),
    ),
    paymentTotals,
  };
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
        productName: name,
        productSku: CUSTOM_PRODUCT_SKU,
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

async function assertQrHasNotBeenUsed(databases, branchId, qrId) {
  const safeQrId = text(qrId);

  if (!safeQrId) {
    return;
  }

  const recentQrSales = await databases.listDocuments({
    databaseId,
    collectionId: collections.sales,
    queries: [Query.equal("branchId", branchId), Query.limit(500)],
  });
  const marker = `BanecoQR:${safeQrId}`;
  const alreadyUsed = recentQrSales.documents.some(
    (sale) =>
      sale.paymentMethodType === "qr" &&
      sale.status === "completed" &&
      text(sale.notes).includes(marker),
  );

  if (alreadyUsed) {
    throw inputError("Este QR ya fue registrado en una venta.", 409);
  }
}

async function fetchSummarySales(databases, context, filters) {
  const { queries } = buildSalesQueries(context, filters, { paginate: false });
  const documents = [];
  let offset = 0;

  while (documents.length < SUMMARY_LIMIT) {
    const result = await databases.listDocuments({
      databaseId,
      collectionId: collections.sales,
      queries: [
        ...queries,
        Query.limit(Math.min(MAX_PAGE_SIZE, SUMMARY_LIMIT - documents.length)),
        Query.offset(offset),
      ],
    });

    documents.push(...result.documents);

    if (result.documents.length < MAX_PAGE_SIZE) {
      break;
    }

    offset += result.documents.length;
  }

  return documents
    .map(toSale)
    .filter((sale) => matchesSaleSearch(sale, filters.search));
}

export function getDefaultSalesDate() {
  return formatLocalDate();
}

export async function getSalesFilterOptions(context) {
  const { databases } = createAdminClient(context.userAgent);
  const [branchesResult, paymentMethodsResult, cashiersResult] =
    await Promise.all([
      databases.listDocuments({
        databaseId,
        collectionId: collections.branches,
        queries: [Query.equal("isActive", true), Query.limit(500)],
      }),
      databases.listDocuments({
        databaseId,
        collectionId: collections.branchPaymentMethods,
        queries: [Query.equal("isEnabled", true), Query.limit(500)],
      }),
      databases.listDocuments({
        databaseId,
        collectionId: collections.userProfiles,
        queries: [Query.equal("isActive", true), Query.limit(500)],
      }),
    ]);

  const branches = branchesResult.documents
    .map(toBranch)
    .filter((branch) => context.isAdmin || canAccessBranch(context, branch.id))
    .sort((left, right) => left.name.localeCompare(right.name));
  const branchIds = new Set(branches.map((branch) => branch.id));
  const paymentMethods = paymentMethodsResult.documents
    .map(toPaymentMethod)
    .filter((method) => branchIds.has(method.branchId))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const cashiers = cashiersResult.documents
    .map(toCashier)
    .filter(
      (cashier) =>
        context.isAdmin ||
        cashier.allowedBranchIds.some((branchId) => branchIds.has(branchId)),
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    branches,
    paymentMethods,
    cashiers,
  };
}

export async function listSales(context, filters = {}) {
  const { databases } = createAdminClient(context.userAgent);
  const search = text(filters.search);
  const queryFilters = buildSalesQueries(context, filters, {
    paginate: !search,
  });
  const queries = search
    ? [...queryFilters.queries, Query.limit(500)]
    : queryFilters.queries;
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.sales,
    queries,
  });
  const sales = result.documents
    .map(toSale)
    .filter((sale) => matchesSaleSearch(sale, search));
  const paginatedSales = search
    ? sales.slice(
        queryFilters.offset,
        queryFilters.offset + queryFilters.pageSize,
      )
    : sales;
  const itemsBySaleId = await fetchSaleItemsBySaleIds(
    databases,
    paginatedSales.map((sale) => sale.id),
  );
  const summarySales = await fetchSummarySales(databases, context, {
    ...filters,
    search,
  });

  return {
    sales: paginatedSales.map((sale) => ({
      ...sale,
      items: itemsBySaleId.get(sale.id) || [],
    })),
    summary: getSaleSummary(summarySales),
    page: queryFilters.page,
    pageSize: queryFilters.pageSize,
    total: search ? sales.length : result.total,
    dateFrom: queryFilters.dateRange.dateFrom,
    dateTo: queryFilters.dateRange.dateTo,
  };
}

export async function getDailyIncomeReport(context, filters = {}) {
  const branchId = text(filters.branchId);

  if (!branchId) {
    throw inputError("Selecciona una sucursal.");
  }

  if (!canAccessBranch(context, branchId)) {
    throw new ForbiddenError("No tienes acceso a esta sucursal.");
  }

  const reportDate = formatLocalDate();
  const { databases } = createAdminClient(context.userAgent);
  const branchDocument = await databases.getDocument({
    databaseId,
    collectionId: collections.branches,
    documentId: branchId,
  });
  const { queries } = buildSalesQueries(
    context,
    {
      dateFrom: reportDate,
      dateTo: reportDate,
      branchId,
      cashierId: context.user.id,
      status: "completed",
    },
    { paginate: false },
  );
  const documents = [];
  let offset = 0;
  let totalRecords = 0;

  while (documents.length < SUMMARY_LIMIT) {
    const result = await databases.listDocuments({
      databaseId,
      collectionId: collections.sales,
      queries: [
        ...queries,
        Query.limit(Math.min(MAX_PAGE_SIZE, SUMMARY_LIMIT - documents.length)),
        Query.offset(offset),
      ],
    });

    totalRecords = result.total;
    documents.push(...result.documents);

    if (result.documents.length < MAX_PAGE_SIZE) {
      break;
    }

    offset += result.documents.length;
  }

  const sales = documents.map(toSale);
  const itemsBySaleId = await fetchSaleItemsBySaleIds(
    databases,
    sales.map((sale) => sale.id),
  );
  const salesWithItems = sales.map((sale) => ({
    ...sale,
    items: itemsBySaleId.get(sale.id) || [],
  }));

  return {
    date: reportDate,
    generatedAt: new Date().toISOString(),
    branch: toBranch(branchDocument),
    cashier: {
      id: context.user.id,
      name: context.profile?.name || context.user.name || context.user.email,
      email: context.user.email,
    },
    summary: getSaleSummary(sales),
    sales: salesWithItems,
    totalRecords,
    isLimited: totalRecords > sales.length,
  };
}

export async function createSale(context, input) {
  const branchId = text(input.branchId);
  const paymentMethodId = text(input.paymentMethodId);
  const rawItems = sanitizeSaleItems(input.items);

  if (!branchId || !paymentMethodId) {
    throw inputError("Sucursal y metodo de pago son obligatorios.");
  }

  if (!canAccessBranch(context, branchId)) {
    throw new ForbiddenError("No tienes acceso a esta sucursal.");
  }

  const { databases } = createAdminClient(context.userAgent);
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

  if (!branch.isActive) {
    throw inputError("La sucursal seleccionada esta inactiva.");
  }

  if (!paymentMethod.isEnabled || paymentMethod.branchId !== branchId) {
    throw inputError("El metodo de pago no corresponde a la sucursal.");
  }

  const saleItems = [];

  for (const rawItem of rawItems) {
    if (rawItem.isCustom) {
      saleItems.push({
        productId: rawItem.productId,
        productName: rawItem.productName,
        productSku: rawItem.productSku,
        quantity: rawItem.quantity,
        unitPrice: rawItem.unitPrice,
        subtotal: roundMoney(rawItem.unitPrice * rawItem.quantity),
        isCustom: true,
      });
      continue;
    }

    const [product, stock] = await Promise.all([
      databases.getDocument({
        databaseId,
        collectionId: collections.products,
        documentId: rawItem.productId,
      }),
      getStockDocument(databases, rawItem.productId, branchId),
    ]);

    if (!product.isActive) {
      throw inputError(`El producto ${product.name} esta inactivo.`);
    }

    if (!stock || stock.quantity < rawItem.quantity) {
      throw inputError(`Stock insuficiente para ${product.name}.`);
    }

    saleItems.push({
      productId: product.$id,
      productName: product.name,
      productSku: product.sku,
      product,
      stock,
      quantity: rawItem.quantity,
      unitPrice: roundMoney(product.price),
      subtotal: roundMoney(product.price * rawItem.quantity),
      isCustom: false,
    });
  }

  const subtotal = roundMoney(
    saleItems.reduce((sum, item) => sum + item.subtotal, 0),
  );
  const discount = 0;
  const total = roundMoney(subtotal - discount);
  const amountPaid =
    paymentMethod.type === "cash" ? roundMoney(input.amountPaid) : total;

  if (paymentMethod.type === "cash" && amountPaid < total) {
    throw inputError("El monto recibido no cubre el total.");
  }

  let notes = text(input.notes);
  let senderName = "";

  if (paymentMethod.type === "qr") {
    const paymentConfig = parseConfig(paymentMethod.config);

    if (paymentConfig.provider !== "baneco") {
      throw inputError("El metodo QR no tiene proveedor Baneco configurado.");
    }

    const qrInput = input.banecoQr || {};
    const qrId = text(qrInput.qrId);
    const transactionId = text(qrInput.transactionId);
    const paymentToken = text(qrInput.paymentToken);
    const paidToken = text(qrInput.paidToken);

    if (!qrId || !paymentToken) {
      throw inputError("Primero genera y confirma el QR Baneco.");
    }

    await assertQrHasNotBeenUsed(databases, branchId, qrId);

    const qrPayment = paidToken
      ? assertPosBanecoQrPaidToken({
          branchId,
          paymentMethodId,
          qrId,
          transactionId,
          paymentToken,
          paidToken,
          expectedAmount: total,
        })
      : await assertPosBanecoQrPaid(context, {
          branchId,
          paymentMethodId,
          qrId,
          transactionId,
          paymentToken,
          expectedAmount: total,
        });
    senderName = text(qrPayment.senderName).slice(0, 160);
    const qrNote = [
      `BanecoQR:${qrId}`,
      `TX:${qrPayment.transactionId || transactionId || "-"}`,
    ].join(";");
    notes = [qrNote, notes].filter(Boolean).join(" | ").slice(0, 300);
  }

  const completedAt = new Date().toISOString();
  const sale = await databases.createDocument({
    databaseId,
    collectionId: collections.sales,
    documentId: ID.unique(),
    data: {
      saleNumber: buildSaleNumber(branch.code),
      branchId,
      branchName: branch.name,
      cashierId: context.user.id,
      cashierName:
        context.profile.name || context.user.name || context.user.email,
      status: "completed",
      subtotal,
      discount,
      total,
      paymentMethodId,
      paymentMethodType: paymentMethod.type,
      paymentMethodLabel: paymentMethod.label,
      amountPaid,
      change: roundMoney(Math.max(amountPaid - total, 0)),
      senderName,
      notes,
      completedAt,
    },
    permissions: documentPermissions,
  });

  for (const item of saleItems) {
    await databases.createDocument({
      databaseId,
      collectionId: collections.saleItems,
      documentId: ID.unique(),
      data: {
        saleId: sale.$id,
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: 0,
        subtotal: item.subtotal,
      },
      permissions: documentPermissions,
    });

    if (item.isCustom) {
      continue;
    }

    const previousQty = item.stock.quantity;
    const newQty = roundMoney(previousQty - item.quantity);

    await databases.updateDocument({
      databaseId,
      collectionId: collections.stock,
      documentId: item.stock.$id,
      data: {
        quantity: newQty,
      },
    });

    await databases.createDocument({
      databaseId,
      collectionId: collections.stockMovements,
      documentId: ID.unique(),
      data: {
        productId: item.product.$id,
        branchId,
        type: "out",
        quantity: item.quantity,
        previousQty,
        newQty,
        reason: `Venta ${sale.saleNumber}`,
        saleId: sale.$id,
        userId: context.user.id,
      },
      permissions: documentPermissions,
    });
  }

  return toSale(sale);
}

export async function cancelSale(context, saleId, input = {}) {
  assertAdmin(context);

  const { databases } = createAdminClient(context.userAgent);
  const saleDocument = await databases.getDocument({
    databaseId,
    collectionId: collections.sales,
    documentId: saleId,
  });
  const sale = toSale(saleDocument);

  if (sale.status !== "completed") {
    throw inputError("Solo se pueden anular ventas completadas.");
  }

  const saleItemsResult = await databases.listDocuments({
    databaseId,
    collectionId: collections.saleItems,
    queries: [Query.equal("saleId", saleId), Query.limit(500)],
  });
  const saleItems = saleItemsResult.documents.map(toSaleItem);

  if (saleItems.length === 0) {
    throw inputError("La venta no tiene items registrados.");
  }

  for (const item of saleItems) {
    if (
      item.productSku === CUSTOM_PRODUCT_SKU ||
      item.productId.startsWith(CUSTOM_PRODUCT_ID_PREFIX)
    ) {
      continue;
    }

    const stock = await getStockDocument(
      databases,
      item.productId,
      sale.branchId,
    );
    const previousQty = stock?.quantity || 0;
    const newQty = roundMoney(previousQty + item.quantity);

    if (stock) {
      await databases.updateDocument({
        databaseId,
        collectionId: collections.stock,
        documentId: stock.$id,
        data: {
          quantity: newQty,
        },
      });
    } else {
      await databases.createDocument({
        databaseId,
        collectionId: collections.stock,
        documentId: ID.unique(),
        data: {
          productId: item.productId,
          branchId: sale.branchId,
          quantity: newQty,
          minStock: 0,
        },
        permissions: documentPermissions,
      });
    }

    await databases.createDocument({
      databaseId,
      collectionId: collections.stockMovements,
      documentId: ID.unique(),
      data: {
        productId: item.productId,
        branchId: sale.branchId,
        type: "adjustment",
        quantity: item.quantity,
        previousQty,
        newQty,
        reason: `Anulacion ${sale.saleNumber}`,
        saleId,
        userId: context.user.id,
      },
      permissions: documentPermissions,
    });
  }

  const reason = text(input.reason);
  const notes = reason
    ? `Anulada: ${reason}`.slice(0, 300)
    : `Anulada por ${context.profile.name || context.user.email}`.slice(0, 300);
  const updatedSale = await databases.updateDocument({
    databaseId,
    collectionId: collections.sales,
    documentId: saleId,
    data: {
      status: "cancelled",
      notes,
    },
  });

  return toSale(updatedSale);
}
