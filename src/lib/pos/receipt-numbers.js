import { appwriteConfig } from "../appwrite/config.js";

const { databaseId, collections } = appwriteConfig;
const documentPermissions = [];
const MAX_RECEIPT_SEQUENCE = 999_999_999;

function isNotFound(error) {
  return error?.code === 404;
}

function isConflict(error) {
  return error?.code === 409;
}

export function normalizeReceiptPrefix(branchCode) {
  const prefix = String(branchCode || "POS")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 10);

  return prefix || "POS";
}

export function formatReceiptNumber(prefix, number) {
  const safeNumber = Number(number);
  if (
    !Number.isInteger(safeNumber) ||
    safeNumber < 1 ||
    safeNumber > MAX_RECEIPT_SEQUENCE
  ) {
    throw new Error("Se agotó la numeración de recibos para esta sucursal.");
  }

  return `${normalizeReceiptPrefix(prefix)}-${String(safeNumber).padStart(6, "0")}`;
}

async function ensureReceiptSequence(databases, branchId, branchCode) {
  try {
    return await databases.getDocument({
      databaseId,
      collectionId: collections.receiptSequences,
      documentId: branchId,
    });
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  try {
    return await databases.createDocument({
      databaseId,
      collectionId: collections.receiptSequences,
      documentId: branchId,
      data: {
        branchId,
        prefix: normalizeReceiptPrefix(branchCode),
        nextNumber: 1,
      },
      permissions: documentPermissions,
    });
  } catch (error) {
    if (!isConflict(error)) throw error;

    return databases.getDocument({
      databaseId,
      collectionId: collections.receiptSequences,
      documentId: branchId,
    });
  }
}

export async function allocateReceiptNumber(
  databases,
  { branchId, branchCode },
) {
  const sequence = await ensureReceiptSequence(databases, branchId, branchCode);
  const number = Number(sequence.nextNumber);
  await databases.incrementDocumentAttribute({
    databaseId,
    collectionId: collections.receiptSequences,
    documentId: branchId,
    attribute: "nextNumber",
    value: 1,
    max: MAX_RECEIPT_SEQUENCE + 1,
  });

  return formatReceiptNumber(sequence.prefix, number);
}
