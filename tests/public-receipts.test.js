import assert from "node:assert/strict";
import test from "node:test";
import {
  createPublicReceiptToken,
  publicReceiptPath,
  verifyPublicReceiptToken,
} from "../src/lib/pos/public-receipts.js";

test("los enlaces públicos de recibo son firmados, permanentes y no adivinables", (t) => {
  const previous = process.env.RECEIPT_SIGNING_SECRET;
  process.env.RECEIPT_SIGNING_SECRET =
    "receipt-test-secret-with-enough-entropy";
  t.after(() => {
    if (previous === undefined) delete process.env.RECEIPT_SIGNING_SECRET;
    else process.env.RECEIPT_SIGNING_SECRET = previous;
  });

  const token = createPublicReceiptToken("sale-123");
  assert.equal(verifyPublicReceiptToken(token), "sale-123");
  assert.match(publicReceiptPath("sale-123"), /^\/recibo\//);
  assert.throws(
    () => verifyPublicReceiptToken(`${token.slice(0, -1)}x`),
    (error) => error.status === 404,
  );
});

test("la rotación conserva enlaces firmados con la clave anterior", (t) => {
  const current = process.env.RECEIPT_SIGNING_SECRET;
  const previous = process.env.RECEIPT_SIGNING_SECRET_PREVIOUS;
  process.env.RECEIPT_SIGNING_SECRET = "old-receipt-secret";
  delete process.env.RECEIPT_SIGNING_SECRET_PREVIOUS;
  const token = createPublicReceiptToken("sale-rotation");
  process.env.RECEIPT_SIGNING_SECRET = "new-receipt-secret";
  process.env.RECEIPT_SIGNING_SECRET_PREVIOUS = "old-receipt-secret";
  t.after(() => {
    if (current === undefined) delete process.env.RECEIPT_SIGNING_SECRET;
    else process.env.RECEIPT_SIGNING_SECRET = current;
    if (previous === undefined)
      delete process.env.RECEIPT_SIGNING_SECRET_PREVIOUS;
    else process.env.RECEIPT_SIGNING_SECRET_PREVIOUS = previous;
  });

  assert.equal(verifyPublicReceiptToken(token), "sale-rotation");
});
