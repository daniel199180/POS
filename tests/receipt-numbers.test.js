import assert from "node:assert/strict";
import test from "node:test";
import { appwriteConfig } from "../src/lib/appwrite/config.js";
import {
  allocateReceiptNumber,
  formatReceiptNumber,
  normalizeReceiptPrefix,
} from "../src/lib/pos/receipt-numbers.js";

const sequences = appwriteConfig.collections.receiptSequences;

test("normaliza el código y genera un correlativo legible", () => {
  assert.equal(normalizeReceiptPrefix(" sc-z "), "SC-Z");
  assert.equal(normalizeReceiptPrefix(""), "POS");
  assert.equal(formatReceiptNumber("SC", 1), "SC-000001");
  assert.equal(formatReceiptNumber("LP", 1234567), "LP-1234567");
});

test("rechaza números fuera del rango correlativo", () => {
  assert.throws(() => formatReceiptNumber("SC", 0), /agotó/);
  assert.throws(() => formatReceiptNumber("SC", 1_000_000_000), /agotó/);
});

test("crea una secuencia por sucursal y asigna el primer número", async () => {
  let sequence = null;
  const databases = {
    getDocument: async () => {
      if (!sequence) throw Object.assign(new Error("missing"), { code: 404 });
      return sequence;
    },
    createDocument: async ({ collectionId, documentId, data }) => {
      assert.equal(collectionId, sequences);
      assert.equal(documentId, "branch-sc");
      sequence = { $id: documentId, ...data };
      return sequence;
    },
    incrementDocumentAttribute: async ({ attribute, value }) => {
      assert.equal(attribute, "nextNumber");
      sequence = { ...sequence, nextNumber: sequence.nextNumber + value };
    },
  };

  assert.equal(
    await allocateReceiptNumber(databases, {
      branchId: "branch-sc",
      branchCode: "SC",
    }),
    "SC-000001",
  );
  assert.equal(
    await allocateReceiptNumber(databases, {
      branchId: "branch-sc",
      branchCode: "OTRO",
    }),
    "SC-000002",
  );
});

test("recupera la secuencia si otra caja la creó simultáneamente", async () => {
  const existing = {
    $id: "branch-lp",
    branchId: "branch-lp",
    prefix: "LP",
    nextNumber: 8,
  };
  let reads = 0;
  const databases = {
    getDocument: async () => {
      reads += 1;
      if (reads === 1) throw Object.assign(new Error("missing"), { code: 404 });
      return existing;
    },
    createDocument: async () => {
      throw Object.assign(new Error("conflict"), { code: 409 });
    },
    incrementDocumentAttribute: async () => undefined,
  };

  assert.equal(
    await allocateReceiptNumber(databases, {
      branchId: "branch-lp",
      branchCode: "LP",
    }),
    "LP-000008",
  );
});
