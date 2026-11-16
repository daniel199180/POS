import { Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { withTransaction } from "../appwrite/transaction.js";
import { ForbiddenError, canAccessBranch } from "./auth-core.js";
import { getSaleReceipt } from "./sales.js";
import { getLogoSettings } from "./settings.js";

const { databaseId, collections } = appwriteConfig;
const CLAIM_LEASE_MS = 2 * 60 * 1000;

function text(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function inputError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function assertWorkstationId(value) {
  const workstationId = text(value, 100);
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(workstationId)) {
    throw inputError("La estación de impresión no es válida.");
  }
  return workstationId;
}

function assertReceiptAccess(context, link) {
  if (!canAccessBranch(context, link.branchId)) {
    throw new ForbiddenError("No tienes acceso a esta sucursal.");
  }
  if (link.status !== "paid" || !link.saleId) {
    throw inputError("El enlace todavía no tiene una venta pagada.", 409);
  }
}

export function paymentLinkReceiptState(link, now = Date.now()) {
  const status = text(link?.receiptPrintStatus, 20) || "pending";
  const leaseExpired =
    status === "processing" &&
    (!link?.receiptClaimExpiresAt ||
      Date.parse(link.receiptClaimExpiresAt) <= now);
  return { status, leaseExpired };
}

async function buildClaimResult(context, link, tracked) {
  const [receipt, brand] = await Promise.all([
    getSaleReceipt(context, link.saleId),
    getLogoSettings(context),
  ]);
  return {
    linkId: link.$id,
    tracked,
    receipt: {
      ...receipt,
      companyName: brand.companyName || "",
    },
  };
}

async function findNextCandidate(databases, branchId) {
  const pending = await databases.listDocuments({
    databaseId,
    collectionId: collections.paymentLinks,
    queries: [
      Query.equal("branchId", branchId),
      Query.equal("status", "paid"),
      Query.equal("receiptPrintStatus", "pending"),
      Query.orderAsc("paidAt"),
      Query.limit(1),
    ],
  });
  if (pending.documents[0]) return pending.documents[0];

  const stale = await databases.listDocuments({
    databaseId,
    collectionId: collections.paymentLinks,
    queries: [
      Query.equal("branchId", branchId),
      Query.equal("status", "paid"),
      Query.equal("receiptPrintStatus", "processing"),
      Query.lessThanEqual("receiptClaimExpiresAt", new Date().toISOString()),
      Query.orderAsc("receiptClaimExpiresAt"),
      Query.limit(1),
    ],
  });
  return stale.documents[0] || null;
}

async function claimLink(context, candidateId, workstationId, manual) {
  const claimedAt = new Date();
  const claimExpiresAt = new Date(
    claimedAt.getTime() + CLAIM_LEASE_MS,
  ).toISOString();

  return withTransaction(context.userAgent, async (databases) => {
    const link = await databases.getDocument({
      databaseId,
      collectionId: collections.paymentLinks,
      documentId: candidateId,
    });
    assertReceiptAccess(context, link);
    const state = paymentLinkReceiptState(link, claimedAt.getTime());

    if (state.status === "printed" && manual) {
      return { link, tracked: false };
    }
    const claimable =
      state.status === "pending" ||
      state.leaseExpired ||
      (manual && state.status === "failed");
    if (!claimable) {
      throw inputError(
        state.status === "processing"
          ? "Este recibo está siendo procesado por otra estación."
          : "El recibo no está pendiente de impresión.",
        409,
      );
    }

    const updated = await databases.updateDocument({
      databaseId,
      collectionId: collections.paymentLinks,
      documentId: link.$id,
      data: {
        receiptPrintStatus: "processing",
        receiptClaimedBy: workstationId,
        receiptClaimedAt: claimedAt.toISOString(),
        receiptClaimExpiresAt: claimExpiresAt,
        receiptPrintAttempts: Number(link.receiptPrintAttempts || 0) + 1,
        receiptPrintError: "",
      },
    });
    return { link: updated, tracked: true };
  });
}

export async function claimNextPaymentLinkReceipt(context, input = {}) {
  const branchId = text(input.branchId, 36);
  const workstationId = assertWorkstationId(input.workstationId);
  if (!branchId || !canAccessBranch(context, branchId)) {
    throw new ForbiddenError("No tienes acceso a esta sucursal.");
  }

  const { databases } = createAdminClient(context.userAgent);
  const candidate = await findNextCandidate(databases, branchId);
  if (!candidate) return null;

  const claim = await claimLink(context, candidate.$id, workstationId, false);
  return buildClaimResult(context, claim.link, claim.tracked);
}

export async function claimPaymentLinkReceipt(context, linkId, input = {}) {
  const safeLinkId = text(linkId, 36);
  const workstationId = assertWorkstationId(input.workstationId);
  if (!safeLinkId) throw inputError("El enlace no es válido.");

  const claim = await claimLink(context, safeLinkId, workstationId, true);
  return buildClaimResult(context, claim.link, claim.tracked);
}

export async function finishPaymentLinkReceipt(context, linkId, input = {}) {
  const safeLinkId = text(linkId, 36);
  const workstationId = assertWorkstationId(input.workstationId);
  const result = input.result === "printed" ? "printed" : "failed";
  const errorMessage = text(input.error, 500);
  if (!safeLinkId) throw inputError("El enlace no es válido.");

  return withTransaction(context.userAgent, async (databases) => {
    const link = await databases.getDocument({
      databaseId,
      collectionId: collections.paymentLinks,
      documentId: safeLinkId,
    });
    assertReceiptAccess(context, link);
    if (
      link.receiptPrintStatus !== "processing" ||
      link.receiptClaimedBy !== workstationId
    ) {
      throw inputError("La reserva de impresión ya no está vigente.", 409);
    }

    const updated = await databases.updateDocument({
      databaseId,
      collectionId: collections.paymentLinks,
      documentId: link.$id,
      data: {
        receiptPrintStatus: result,
        ...(result === "printed"
          ? {
              receiptPrintedAt: new Date().toISOString(),
              receiptPrintError: "",
            }
          : {
              receiptPrintError:
                errorMessage || "No se pudo completar la impresión.",
            }),
      },
    });
    return {
      id: updated.$id,
      receiptPrintStatus: updated.receiptPrintStatus,
      receiptPrintedAt: updated.receiptPrintedAt || "",
      receiptPrintError: updated.receiptPrintError || "",
    };
  });
}
