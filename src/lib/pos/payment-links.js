import crypto from "node:crypto";
import { ID, Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import {
  ForbiddenError,
  canAccessBranch,
  isAdministratorRole,
  normalizeUserRole,
} from "./auth-core.js";
import {
  cancelPosBanecoQr,
  checkPosBanecoQrStatus,
  generatePosBanecoQr,
} from "./baneco-qr.js";
import { decryptCredentials, encryptCredentials } from "./payments.js";
import { createSale } from "./sales.js";
import { withTransaction } from "../appwrite/transaction.js";
import { getLogoImage } from "./settings.js";
import { PAYMENT_VALIDITY_MS } from "./payment-validity.js";
import {
  assertPosSaleTabsEnabled,
  assertPosTabEnabled,
} from "./pos-ui-settings.js";

const { databaseId, collections } = appwriteConfig;
export const LINK_TTL_MS = PAYMENT_VALIDITY_MS;
const TERMINAL_STATUSES = new Set(["paid", "expired", "cancelled"]);
const CUSTOM_PRODUCT_ID_PREFIX = "custom-";

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function inputError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseItems(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.items)
        ? parsed.items
        : [];
  } catch {
    return [];
  }
}

function inventoryStatus(link) {
  try {
    return JSON.parse(link.items || "[]").inventoryStatus || "";
  } catch {
    return "";
  }
}

function inventoryItems(link, status) {
  return JSON.stringify({
    inventoryStatus: status,
    items: parseItems(link.items),
  });
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

function publicPath(token) {
  return `/pagar/${encodeURIComponent(token)}`;
}

function readStoredToken(document) {
  return text(decryptCredentials(document.encryptedToken)?.token);
}

function toPaymentLink(
  document,
  { includeToken = false, includeQr = false } = {},
) {
  const items = parseItems(document.items);
  const result = {
    id: document.$id,
    branchId: document.branchId,
    branchName: document.branchName,
    paymentMethodId: document.paymentMethodId,
    paymentMethodLabel: document.paymentMethodLabel,
    createdByName: document.createdByName,
    notes: document.notes || "",
    status: document.status,
    items,
    itemCount: document.itemCount,
    total: document.total,
    expiresAt: document.expiresAt,
    qrId: document.qrId || "",
    qrImage:
      includeQr &&
      (document.status === "qr_pending" ||
        document.status === "payment_received")
        ? document.qrImage || ""
        : "",
    transactionId: document.transactionId || "",
    senderName: document.senderName || "",
    saleId: document.saleId || "",
    saleNumber: document.saleNumber || "",
    paidAt: document.paidAt || "",
    lastError: document.lastError || "",
    createdAt: document.$createdAt,
    updatedAt: document.$updatedAt,
  };

  if (includeToken) {
    const token = readStoredToken(document);
    result.sharePath = publicPath(token);
  }

  return result;
}

function contextFromPaymentLink(link, userAgent) {
  const role = normalizeUserRole(link.createdByRole);
  const isAdmin = isAdministratorRole(role);
  const email = text(link.createdByEmail);
  const name = text(link.createdByName) || email || "Cajero";

  return {
    user: { id: link.createdByUserId, name, email },
    profile: {
      id: text(link.createdByProfileId),
      userId: link.createdByUserId,
      name,
      email,
      role,
      branchId: link.branchId,
      allowedBranchIds: [link.branchId],
      isActive: true,
    },
    userAgent,
    isAdmin,
    isSuperAdmin: role === "super_admin",
    canViewAnalytics: role === "super_admin",
    allowedBranchIds: [link.branchId],
  };
}

async function getLinkDocumentByToken(databases, rawToken) {
  const token = text(rawToken);

  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
    throw inputError("El enlace de pago no es valido.", 404);
  }

  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.paymentLinks,
    queries: [Query.equal("tokenHash", hashToken(token)), Query.limit(1)],
  });
  const link = result.documents[0];

  if (!link) {
    throw inputError("El enlace de pago no existe.", 404);
  }

  return link;
}

async function expireIfNeeded(databases, link) {
  if (
    !TERMINAL_STATUSES.has(link.status) &&
    Date.parse(link.expiresAt) <= Date.now()
  ) {
    return reconcilePaymentLink(link.$id, undefined, "expired");
  }
  return link;
}

async function moveReservedStock(databases, link, direction) {
  for (const item of parseItems(link.items)) {
    if (item.isCustom) continue;
    const result = await databases.listDocuments({
      databaseId,
      collectionId: collections.stock,
      queries: [
        Query.equal("productId", item.productId),
        Query.equal("branchId", link.branchId),
        Query.limit(1),
      ],
    });
    const stock = result.documents[0];
    if (!stock)
      throw inputError(`No existe inventario para ${item.name}.`, 409);
    const updated = await databases[
      direction === "out"
        ? "decrementDocumentAttribute"
        : "incrementDocumentAttribute"
    ]({
      databaseId,
      collectionId: collections.stock,
      documentId: stock.$id,
      attribute: "quantity",
      value: item.quantity,
      ...(direction === "out" ? { min: 0 } : {}),
    });
    await databases.createDocument({
      databaseId,
      collectionId: collections.stockMovements,
      documentId: ID.unique(),
      data: {
        productId: item.productId,
        branchId: link.branchId,
        type: direction,
        quantity: item.quantity,
        previousQty:
          direction === "out"
            ? updated.quantity + item.quantity
            : updated.quantity - item.quantity,
        newQty: updated.quantity,
        reason: `${direction === "out" ? "Reserva" : "Devolucion"} enlace ${link.$id}`,
        userId: link.createdByUserId,
      },
      permissions: [],
    });
  }
}

async function canonicalizeItems(databases, branchId, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw inputError("Agrega productos al carrito antes de crear el enlace.");
  }

  const items = [];
  const seenProducts = new Map();

  for (const rawItem of rawItems) {
    const productId = text(rawItem.productId || rawItem.id).slice(0, 36);
    const quantity = Math.trunc(number(rawItem.quantity));
    const isCustom =
      rawItem.isCustom === true ||
      productId.startsWith(CUSTOM_PRODUCT_ID_PREFIX);

    if (
      rawItem.institutePayment ||
      text(rawItem.category).toLowerCase() === "monthly" ||
      text(rawItem.sku).toUpperCase() === "MENSUALIDAD"
    ) {
      throw inputError(
        "Las mensualidades deben cobrarse directamente desde su pestaña.",
      );
    }

    if (!productId || quantity <= 0) {
      throw inputError("Todos los productos deben tener una cantidad valida.");
    }

    if (isCustom) {
      const name = text(rawItem.name).slice(0, 200);
      const unitPrice = money(rawItem.unitPrice ?? rawItem.price);

      if (!name || unitPrice <= 0) {
        throw inputError("El cobro personalizado no tiene un precio valido.");
      }

      items.push({
        productId,
        name,
        sku: "CUSTOM",
        quantity,
        unitPrice,
        subtotal: money(unitPrice * quantity),
        isCustom: true,
      });
      continue;
    }

    seenProducts.set(productId, (seenProducts.get(productId) || 0) + quantity);
  }

  for (const [productId, quantity] of seenProducts) {
    const [product, stockResult] = await Promise.all([
      databases.getDocument({
        databaseId,
        collectionId: collections.products,
        documentId: productId,
      }),
      databases.listDocuments({
        databaseId,
        collectionId: collections.stock,
        queries: [
          Query.equal("productId", productId),
          Query.equal("branchId", branchId),
          Query.limit(1),
        ],
      }),
    ]);
    const stock = stockResult.documents[0];

    if (product.isActive === false) {
      throw inputError(`El producto ${product.name} esta inactivo.`);
    }

    if (!stock || number(stock.quantity) < quantity) {
      throw inputError(`Stock insuficiente para ${product.name}.`);
    }

    const unitPrice = money(product.price);
    items.push({
      productId: product.$id,
      name: product.name,
      sku: product.sku,
      quantity,
      unitPrice,
      subtotal: money(unitPrice * quantity),
      isCustom: false,
    });
  }

  const serialized = JSON.stringify(items);

  if (serialized.length > 30000) {
    throw inputError("El carrito es demasiado grande para un enlace de pago.");
  }

  return items;
}

function toSaleItems(items) {
  return items.map((item) => ({
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    isCustom: item.isCustom,
  }));
}

export async function createPaymentLink(context, input = {}) {
  const branchId = text(input.branchId);
  const paymentMethodId = text(input.paymentMethodId);

  if (!branchId || !paymentMethodId) {
    throw inputError("Sucursal y metodo QR son obligatorios.");
  }

  if (!canAccessBranch(context, branchId)) {
    throw new ForbiddenError("No tienes acceso a esta sucursal.");
  }

  const { databases } = createAdminClient(context.userAgent);
  await assertPosTabEnabled(context, branchId, "links", databases);
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
    throw inputError(
      "La sucursal necesita un metodo QR Baneco activo para crear enlaces.",
    );
  }

  const items = await canonicalizeItems(databases, branchId, input.items);
  await assertPosSaleTabsEnabled(context, branchId, items, databases);
  const total = money(items.reduce((sum, item) => sum + item.subtotal, 0));
  const notes = text(input.notes).slice(0, 300);

  if (total <= 0) {
    throw inputError("El total del enlace debe ser mayor a cero.");
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();
  const document = await withTransaction(
    context.userAgent,
    async (transactionDb) => {
      const document = await transactionDb.createDocument({
        databaseId,
        collectionId: collections.paymentLinks,
        documentId: ID.unique(),
        permissions: [],
        data: {
          tokenHash: hashToken(token),
          encryptedToken: encryptCredentials({ token }),
          createdByUserId: context.user.id,
          createdByName: (
            text(
              context.profile?.name || context.user.name || context.user.email,
            ) || "Cajero"
          ).slice(0, 120),
          createdByEmail: text(context.user.email).slice(0, 200),
          createdByProfileId: text(context.profile?.id).slice(0, 36),
          createdByRole: normalizeUserRole(context.profile?.role),
          branchId,
          branchName: branch.name,
          paymentMethodId,
          paymentMethodLabel: paymentMethod.label,
          notes,
          status: "open",
          items: JSON.stringify({ inventoryStatus: "reserved", items }),
          itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
          total,
          expiresAt,
        },
      });
      await moveReservedStock(transactionDb, document, "out");
      return document;
    },
  );

  return {
    ...toPaymentLink(document),
    sharePath: publicPath(token),
  };
}

function paymentLinkScopeQueries(context, branchId) {
  const queries = [];

  if (!context.isAdmin) {
    queries.push(Query.equal("createdByUserId", context.user.id));
  }

  if (branchId) queries.push(Query.equal("branchId", branchId));

  return queries;
}

async function countPaymentLinks(databases, scopeQueries, filters) {
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.paymentLinks,
    queries: [
      ...scopeQueries,
      ...filters,
      Query.limit(1),
      Query.select(["$id"]),
    ],
  });
  return result.total;
}

export async function listPaymentLinks(context, input = {}) {
  const branchId = text(input.branchId);
  const filter = text(input.filter) || "all";

  if (branchId && !canAccessBranch(context, branchId)) {
    throw new ForbiddenError("No tienes acceso a esta sucursal.");
  }

  const { databases } = createAdminClient(context.userAgent);
  const pageSize = Math.min(Math.max(Number(input.limit) || 25, 1), 50);
  const cursor = text(input.cursor);
  const scopeQueries = paymentLinkScopeQueries(context, branchId);
  const now = new Date().toISOString();
  const filterQueries =
    filter === "ready"
      ? [
          Query.equal("status", ["open", "qr_pending", "failed"]),
          Query.greaterThan("expiresAt", now),
        ]
      : filter === "expired"
        ? [
            Query.or([
              Query.equal("status", "expired"),
              Query.and([
                Query.equal("status", ["open", "qr_pending", "failed"]),
                Query.lessThanEqual("expiresAt", now),
              ]),
            ]),
          ]
        : filter === "cancelled"
          ? [Query.equal("status", "cancelled")]
          : [];
  const pageResult = await databases.listDocuments({
    databaseId,
    collectionId: collections.paymentLinks,
    queries: [
      ...scopeQueries,
      ...filterQueries,
      Query.orderDesc("$createdAt"),
      Query.limit(pageSize + 1),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ],
  });
  const pageDocuments = pageResult.documents.slice(0, pageSize);
  const documents = pageDocuments.map((link) =>
    toPaymentLink(link, { includeToken: true }),
  );
  const nextCursor =
    pageResult.documents.length > pageSize
      ? pageDocuments.at(-1).$id
      : "";
  const [ready, expired, cancelled, pendingConfirmation] = await Promise.all([
    countPaymentLinks(databases, scopeQueries, [
      Query.equal("status", ["open", "qr_pending", "failed"]),
      Query.greaterThan("expiresAt", now),
    ]),
    countPaymentLinks(databases, scopeQueries, [
      Query.or([
        Query.equal("status", "expired"),
        Query.and([
          Query.equal("status", ["open", "qr_pending", "failed"]),
          Query.lessThanEqual("expiresAt", now),
        ]),
      ]),
    ]),
    countPaymentLinks(databases, scopeQueries, [
      Query.equal("status", "cancelled"),
    ]),
    countPaymentLinks(databases, scopeQueries, [
      Query.equal("status", ["processing", "payment_received"]),
    ]),
  ]);

  return {
    links: documents,
    total: pageResult.total,
    nextCursor,
    summary: { ready, expired, cancelled, pendingConfirmation },
  };
}

export async function cancelPaymentLink(context, linkId) {
  const { databases } = createAdminClient(context.userAgent);
  const link = await databases.getDocument({
    databaseId,
    collectionId: collections.paymentLinks,
    documentId: text(linkId),
  });

  if (link.createdByUserId !== context.user.id && !context.isAdmin) {
    throw new ForbiddenError("No puedes cancelar este enlace de pago.");
  }

  const updated = await reconcilePaymentLink(
    link.$id,
    context.userAgent,
    "cancelled",
  );
  if (updated.status === "paid")
    throw inputError("El enlace ya fue pagado y no se puede cancelar.", 409);
  return toPaymentLink(updated, { includeToken: true });
}

export async function getPublicPaymentLink(rawToken, userAgent) {
  const { databases } = createAdminClient(userAgent);
  const found = await getLinkDocumentByToken(databases, rawToken);
  const link = await expireIfNeeded(databases, found);
  return toPaymentLink(link, { includeQr: true });
}

export async function getPaymentLinkLogo(rawToken, userAgent) {
  const { databases } = createAdminClient(userAgent);
  await getLinkDocumentByToken(databases, rawToken);
  return getLogoImage({ userAgent });
}

async function linkTransaction(linkId, userAgent, work) {
  return withTransaction(userAgent, async (databases) => {
    // Staging the link first makes concurrent generation, payment and expiry
    // conflict at commit instead of applying inventory operations twice.
    const link = await databases.updateDocument({
      databaseId,
      collectionId: collections.paymentLinks,
      documentId: linkId,
      data: { lastError: "" },
    });
    return work(databases, link);
  });
}

export async function generatePublicPaymentLinkQr(rawToken, userAgent) {
  const { databases } = createAdminClient(userAgent);
  const found = await getLinkDocumentByToken(databases, rawToken);
  await expireIfNeeded(databases, found);
  let generatedQr;
  try {
    const link = await linkTransaction(
      found.$id,
      userAgent,
      async (db, link) => {
        if (
          ["expired", "cancelled"].includes(link.status) ||
          Date.parse(link.expiresAt) <= Date.now()
        ) {
          throw inputError("Este enlace de pago ya no esta vigente.", 410);
        }
        if (link.status === "paid" || link.qrId) return link;
        generatedQr = await generatePosBanecoQr(
          contextFromPaymentLink(link, userAgent),
          {
            branchId: link.branchId,
            paymentMethodId: link.paymentMethodId,
            items: toSaleItems(parseItems(link.items)),
          },
          inventoryStatus(link) === "reserved"
            ? { reservedCart: { total: link.total, itemCount: link.itemCount } }
            : {},
        );
        if (money(generatedQr.amount) !== money(link.total))
          throw inputError("El precio cambio. Solicita un enlace nuevo.", 409);
        if (Date.parse(link.expiresAt) <= Date.now())
          throw inputError("Este enlace de pago vencio.", 410);
        return db.updateDocument({
          databaseId,
          collectionId: collections.paymentLinks,
          documentId: link.$id,
          data: {
            status: "qr_pending",
            qrId: generatedQr.qrId,
            qrImage: generatedQr.qrImage,
            qrPaymentToken: generatedQr.paymentToken,
            transactionId: generatedQr.transactionId,
          },
        });
      },
    );
    return toPaymentLink(link, { includeQr: true });
  } catch (error) {
    if (generatedQr) {
      // If another request won, its QR remains valid; only cancel ours.
      const latest = await databases.getDocument({
        databaseId,
        collectionId: collections.paymentLinks,
        documentId: found.$id,
      });
      if (latest.qrId === generatedQr.qrId)
        return toPaymentLink(latest, { includeQr: true });
      await cancelPosBanecoQr(contextFromPaymentLink(found, userAgent), {
        branchId: found.branchId,
        paymentMethodId: found.paymentMethodId,
        qrId: generatedQr.qrId,
        paymentToken: generatedQr.paymentToken,
      });
    }
    throw error;
  }
}

async function findSaleByPaymentLink(databases, paymentLinkId) {
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collections.sales,
    queries: [Query.equal("paymentLinkId", paymentLinkId), Query.limit(1)],
  });
  return result.documents[0] || null;
}

export async function reconcilePaymentLink(
  linkId,
  userAgent,
  requestedEnd = "",
  services = {},
) {
  const transaction = services.transaction || linkTransaction;
  const checkQr = services.checkQr || checkPosBanecoQrStatus;
  const cancelQr = services.cancelQr || cancelPosBanecoQr;
  const recordSale = services.createSale || createSale;
  return transaction(linkId, userAgent, async (databases, link) => {
    if (TERMINAL_STATUSES.has(link.status)) return link;
    const context = contextFromPaymentLink(link, userAgent);
    const qrInput = {
      branchId: link.branchId,
      paymentMethodId: link.paymentMethodId,
      qrId: link.qrId,
      paymentToken: link.qrPaymentToken,
    };
    let status = link.qrId
      ? await checkQr(context, qrInput, { allowExpired: true })
      : { status: "pending" };
    const ending =
      requestedEnd ||
      (Date.parse(link.expiresAt) <= Date.now() ? "expired" : "");
    if (
      ending &&
      link.qrId &&
      status.status !== "paid" &&
      status.status !== "cancelled"
    ) {
      // Never release on a timeout or an ambiguous bank response.
      await cancelQr(context, qrInput, { allowExpired: true });
      status = await checkQr(context, qrInput, { allowExpired: true });
      if (!["paid", "cancelled"].includes(status.status)) {
        throw inputError(
          "Confirmacion de cancelacion pendiente; el inventario sigue reservado.",
          409,
        );
      }
    }
    if (status.status === "paid") {
      const existing = await findSaleByPaymentLink(databases, link.$id);
      const sale =
        existing ||
        (await recordSale(
          context,
          {
            branchId: link.branchId,
            paymentMethodId: link.paymentMethodId,
            items: toSaleItems(parseItems(link.items)),
            notes: [`Cobro por enlace ${link.$id}`, text(link.notes)]
              .filter(Boolean)
              .join(" | ")
              .slice(0, 300),
            banecoQr: {
              ...qrInput,
              transactionId: link.transactionId,
              paidToken: status.paidToken,
            },
          },
          {
            databases,
            paymentLinkId: link.$id,
            allowExpiredQrToken: true,
            ...(inventoryStatus(link) === "reserved"
              ? { reservedItems: parseItems(link.items) }
              : {}),
          },
        ));
      return databases.updateDocument({
        databaseId,
        collectionId: collections.paymentLinks,
        documentId: link.$id,
        data: {
          status: "paid",
          items: inventoryItems(
            link,
            inventoryStatus(link) === "reserved"
              ? "consumed"
              : inventoryStatus(link),
          ),
          saleId: sale.$id || sale.id,
          saleNumber: sale.saleNumber,
          senderName: status.senderName || "",
          paidAt: sale.completedAt || sale.$createdAt,
          lastError: "",
        },
      });
    }
    if (ending || status.status === "cancelled") {
      if (link.status === "payment_received")
        throw inputError("Pago recibido pendiente de conciliacion.", 409);
      if (inventoryStatus(link) === "reserved")
        await moveReservedStock(databases, link, "in");
      return databases.updateDocument({
        databaseId,
        collectionId: collections.paymentLinks,
        documentId: link.$id,
        data: {
          status: ending || "cancelled",
          items: inventoryItems(
            link,
            inventoryStatus(link) === "reserved"
              ? "released"
              : inventoryStatus(link),
          ),
          lastError: "",
        },
      });
    }
    return link;
  });
}

export async function checkPublicPaymentLink(rawToken, userAgent) {
  const { databases } = createAdminClient(userAgent);
  const link = await getLinkDocumentByToken(databases, rawToken);
  return toPaymentLink(await reconcilePaymentLink(link.$id, userAgent), {
    includeQr: true,
  });
}

export async function reconcilePendingPaymentLinks() {
  const { databases } = createAdminClient();
  let cursor;
  let processed = 0;
  const failures = [];
  do {
    const result = await databases.listDocuments({
      databaseId,
      collectionId: collections.paymentLinks,
      queries: [
        Query.equal("status", [
          "open",
          "qr_pending",
          "processing",
          "payment_received",
          "failed",
        ]),
        Query.orderAsc("$id"),
        Query.limit(50),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    for (const link of result.documents) {
      if (!link.qrId && Date.parse(link.expiresAt) > Date.now()) continue;
      try {
        await reconcilePaymentLink(link.$id);
        processed++;
      } catch (error) {
        failures.push({
          id: link.$id,
          message: text(error.message).slice(0, 200),
        });
      }
    }
    cursor =
      result.documents.length === 50 ? result.documents.at(-1).$id : null;
  } while (cursor);
  return { processed, failures };
}
