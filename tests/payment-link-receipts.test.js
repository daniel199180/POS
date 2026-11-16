import test from "node:test";
import assert from "node:assert/strict";
import { paymentLinkReceiptState } from "../src/lib/pos/payment-link-receipts.js";

test("paid links without legacy print state are available for manual printing", () => {
  assert.deepEqual(paymentLinkReceiptState({}), {
    status: "pending",
    leaseExpired: false,
  });
});

test("an active claim is protected from another workstation", () => {
  const now = Date.now();
  assert.deepEqual(
    paymentLinkReceiptState(
      {
        receiptPrintStatus: "processing",
        receiptClaimExpiresAt: new Date(now + 60_000).toISOString(),
      },
      now,
    ),
    { status: "processing", leaseExpired: false },
  );
});

test("a crashed workstation releases its receipt after the lease expires", () => {
  const now = Date.now();
  assert.deepEqual(
    paymentLinkReceiptState(
      {
        receiptPrintStatus: "processing",
        receiptClaimExpiresAt: new Date(now - 1).toISOString(),
      },
      now,
    ),
    { status: "processing", leaseExpired: true },
  );
});
