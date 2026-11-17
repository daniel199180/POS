import crypto from "node:crypto";
import { AppwriteException, Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { getLogoSettings } from "./settings.js";
import {
  CATALOG_BRANCH_CODES,
  publicCatalogPath,
} from "./public-catalog-core.js";

const { databaseId, collections } = appwriteConfig;
const TOKEN_VERSION = "v1";

function text(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function notFound() {
  const error = new Error("Recibo no disponible.");
  error.status = 404;
  return error;
}

function signingSecrets() {
  const current =
    process.env.RECEIPT_SIGNING_SECRET ||
    process.env.PAYMENT_CREDENTIALS_SECRET ||
    process.env.APPWRITE_API_KEY;
  const previous =
    process.env.RECEIPT_SIGNING_SECRET_PREVIOUS ||
    process.env.PAYMENT_CREDENTIALS_SECRET_PREVIOUS;

  if (!current) {
    throw new Error(
      "RECEIPT_SIGNING_SECRET, PAYMENT_CREDENTIALS_SECRET or APPWRITE_API_KEY is required.",
    );
  }

  return [current, previous].filter(Boolean);
}

function signature(body, secret) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

function signaturesMatch(left, right) {
  if (!left || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function createPublicReceiptToken(saleId) {
  const safeSaleId = text(saleId, 36);
  if (!/^[A-Za-z0-9._-]{1,36}$/.test(safeSaleId)) {
    throw new Error("La venta del recibo no es válida.");
  }
  const body = Buffer.from(`${TOKEN_VERSION}:${safeSaleId}`).toString(
    "base64url",
  );
  return `${body}.${signature(body, signingSecrets()[0])}`;
}

export function publicReceiptPath(saleId) {
  return `/recibo/${encodeURIComponent(createPublicReceiptToken(saleId))}`;
}

export function verifyPublicReceiptToken(token) {
  const [body, receivedSignature, ...extra] = text(token, 300).split(".");
  if (!body || !receivedSignature || extra.length > 0) throw notFound();
  const trusted = signingSecrets().some((secret) =>
    signaturesMatch(receivedSignature, signature(body, secret)),
  );
  if (!trusted) throw notFound();

  let decoded;
  try {
    decoded = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    throw notFound();
  }
  const prefix = `${TOKEN_VERSION}:`;
  const saleId = decoded.startsWith(prefix) ? decoded.slice(prefix.length) : "";
  if (!/^[A-Za-z0-9._-]{1,36}$/.test(saleId)) throw notFound();
  return saleId;
}

function publicPaymentLabel(sale) {
  const notes = text(sale.notes);
  const staticQr = notes.match(/^QR estático:\s*(.+?)(?:\s*\|\s*Ref:|$)/i);
  return staticQr
    ? `QR estático · ${staticQr[1]}`.slice(0, 80)
    : text(sale.paymentMethodLabel, 80) || "Pago";
}

export async function getPublicReceipt(token, userAgent = "") {
  const saleId = verifyPublicReceiptToken(token);
  const { databases } = createAdminClient(userAgent);
  let sale;

  try {
    sale = await databases.getDocument({
      databaseId,
      collectionId: collections.sales,
      documentId: saleId,
    });
  } catch (error) {
    if (error instanceof AppwriteException && error.code === 404)
      throw notFound();
    throw error;
  }

  const [itemsResult, branch, brand] = await Promise.all([
    databases.listDocuments({
      databaseId,
      collectionId: collections.saleItems,
      queries: [Query.equal("saleId", saleId), Query.limit(500)],
    }),
    databases.getDocument({
      databaseId,
      collectionId: collections.branches,
      documentId: sale.branchId,
    }),
    getLogoSettings({ userAgent }),
  ]);

  return {
    saleNumber: sale.saleNumber,
    companyName: brand.companyName || "",
    branchName: sale.branchName || branch.name,
    branchCode: branch.code || "",
    catalogPath: CATALOG_BRANCH_CODES.has(branch.code)
      ? publicCatalogPath(branch.code)
      : "",
    status: sale.status,
    completedAt: sale.completedAt || sale.$createdAt,
    subtotal: Number(sale.subtotal) || 0,
    discount: Number(sale.discount) || 0,
    total: Number(sale.total) || 0,
    paymentLabel: publicPaymentLabel(sale),
    items: itemsResult.documents.map((item) => ({
      name: item.productName || "Producto",
      sku: item.productSku || "",
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      subtotal: Number(item.subtotal) || 0,
    })),
  };
}
