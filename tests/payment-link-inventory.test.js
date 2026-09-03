import test from "node:test";
import assert from "node:assert/strict";
import {
  LINK_TTL_MS,
  reconcilePaymentLink,
} from "../src/lib/pos/payment-links.js";
import { appwriteConfig } from "../src/lib/appwrite/config.js";

const c = appwriteConfig.collections;
function fixture({
  qr = false,
  expired = true,
  reserved = true,
  custom = false,
} = {}) {
  let link = {
    $id: "test-link",
    branchId: "branch",
    createdByUserId: "cashier",
    createdByRole: "cashier",
    status: qr ? "qr_pending" : "open",
    qrId: qr ? "qr" : "",
    qrPaymentToken: "token",
    expiresAt: new Date(
      Date.now() + (expired ? -1000 : LINK_TTL_MS),
    ).toISOString(),
    items: JSON.stringify({
      inventoryStatus: reserved ? "reserved" : "",
      items: [
        {
          productId: "product",
          name: "Prueba",
          sku: "P",
          quantity: 2,
          unitPrice: 5,
          subtotal: 10,
          isCustom: custom,
        },
      ],
    }),
  };
  let stock = 8;
  const calls = [];
  let saleCount = 0;
  const services = {
    transaction: async (_id, _ua, work) => {
      const before = {
        link: structuredClone(link),
        stock,
        calls: calls.length,
        saleCount,
      };
      const db = {
        listDocuments: async ({ collectionId }) => ({
          documents:
            collectionId === c.stock ? [{ $id: "stock", quantity: stock }] : [],
        }),
        incrementDocumentAttribute: async ({ value }) => {
          calls.push("restore");
          stock += value;
          return { quantity: stock };
        },
        createDocument: async () => {
          calls.push("movement");
          return {};
        },
        updateDocument: async ({ data }) => {
          link = { ...link, ...data };
          return link;
        },
      };
      try {
        return await work(db, structuredClone(link));
      } catch (error) {
        link = before.link;
        stock = before.stock;
        calls.length = before.calls;
        saleCount = before.saleCount;
        throw error;
      }
    },
    checkQr: async () => {
      calls.push("check");
      return { status: calls.includes("cancel") ? "cancelled" : "pending" };
    },
    cancelQr: async () => {
      calls.push("cancel");
    },
    createSale: async (_ctx, _input, options) => {
      calls.push("sale");
      saleCount++;
      assert.equal(options.reservedItems[0].quantity, 2);
      return {
        id: "sale",
        saleNumber: "TEST",
        completedAt: new Date().toISOString(),
      };
    },
  };
  return {
    services,
    calls,
    stock: () => stock,
    link: () => link,
    sales: () => saleCount,
    run: (end = "") => reconcilePaymentLink("test-link", null, end, services),
  };
}

test("new payment links have a five-hour lifetime", () =>
  assert.equal(LINK_TTL_MS, 18_000_000));
test("expired unpaid link restores stock exactly once", async () => {
  const f = fixture();
  await f.run();
  await f.run();
  assert.equal(f.stock(), 10);
  assert.equal(f.link().status, "expired");
  assert.equal(f.calls.filter((x) => x === "restore").length, 1);
});
test("unexpired link retains its reservation", async () => {
  const f = fixture({ expired: false });
  await f.run();
  assert.equal(f.stock(), 8);
  assert.equal(f.link().status, "open");
});
test("QR cancellation is confirmed before returning inventory", async () => {
  const f = fixture({ qr: true });
  await f.run();
  assert.deepEqual(f.calls, [
    "check",
    "cancel",
    "check",
    "restore",
    "movement",
  ]);
});
test("a bank timeout never releases inventory", async () => {
  const f = fixture({ qr: true });
  f.services.checkQr = async () => {
    throw Error("timeout");
  };
  await assert.rejects(f.run(), /timeout/);
  assert.equal(f.stock(), 8);
  assert.equal(f.link().status, "qr_pending");
});
test("an ambiguous cancellation retains stock", async () => {
  const f = fixture({ qr: true });
  f.services.checkQr = async () => ({ status: "pending" });
  await assert.rejects(f.run(), /cancelacion pendiente/);
  assert.equal(f.stock(), 8);
});
test("a payment arriving at expiry wins; sale is recorded once without another deduction", async () => {
  const f = fixture({ qr: true });
  f.services.checkQr = async () => ({ status: "paid", paidToken: "confirmed" });
  await f.run();
  await f.run();
  assert.equal(f.stock(), 8);
  assert.equal(f.sales(), 1);
  assert.equal(f.link().status, "paid");
  assert.equal(JSON.parse(f.link().items).inventoryStatus, "consumed");
});
test("payment during cancellation is settled instead of restored", async () => {
  const f = fixture({ qr: true });
  f.services.checkQr = async () => ({
    status: f.calls.includes("cancel") ? "paid" : "pending",
  });
  await f.run();
  assert.equal(f.stock(), 8);
  assert.equal(f.link().status, "paid");
});
test("failed sale registration keeps the reservation for retry", async () => {
  const f = fixture({ qr: true });
  f.services.checkQr = async () => ({ status: "paid" });
  f.services.createSale = async () => {
    throw Error("database failure");
  };
  await assert.rejects(f.run(), /database failure/);
  assert.equal(f.stock(), 8);
  assert.equal(f.link().status, "qr_pending");
});
test("manual cancellation also restores once", async () => {
  const f = fixture({ expired: false });
  await f.run("cancelled");
  await f.run("cancelled");
  assert.equal(f.stock(), 10);
  assert.equal(f.link().status, "cancelled");
});
test("custom charges and legacy unreserved links never add stock", async () => {
  for (const options of [{ custom: true }, { reserved: false }]) {
    const f = fixture(options);
    await f.run();
    assert.equal(f.stock(), 8);
  }
});
