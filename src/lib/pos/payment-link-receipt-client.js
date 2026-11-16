import { getReceiptWorkstationId, printReceipt } from "./receipt-printing.js";

async function responsePayload(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "No se pudo preparar el recibo.");
  }
  return payload;
}

async function finishClaim(claim, result, error = "") {
  if (!claim?.tracked) return null;
  const workstationId = getReceiptWorkstationId();
  const response = await fetch(
    `/api/pos/payment-links/${encodeURIComponent(claim.linkId)}/receipt`,
    {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workstationId, result, error }),
    },
  );
  return (await responsePayload(response)).receipt;
}

export async function printPaymentLinkReceiptClaim(claim) {
  try {
    const result = await printReceipt(claim.receipt);
    const receiptState = await finishClaim(claim, "printed");
    return { result, receiptState };
  } catch (error) {
    await finishClaim(
      claim,
      "failed",
      error.message || "No se pudo completar la impresión.",
    ).catch(() => {});
    throw error;
  }
}

export async function claimNextPaymentLinkReceipt(branchId) {
  const response = await fetch("/api/pos/payment-links/receipts/claim", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      branchId,
      workstationId: getReceiptWorkstationId(),
    }),
  });
  return (await responsePayload(response)).claim;
}

export async function printPaymentLinkReceipt(linkId) {
  const response = await fetch(
    `/api/pos/payment-links/${encodeURIComponent(linkId)}/receipt`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workstationId: getReceiptWorkstationId() }),
    },
  );
  const { claim } = await responsePayload(response);
  return printPaymentLinkReceiptClaim(claim);
}
