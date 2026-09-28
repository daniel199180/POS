import test from "node:test";
import assert from "node:assert/strict";
import { Databases, Query } from "node-appwrite";
import { listPaymentLinks } from "../src/lib/pos/payment-links.js";
import { encryptCredentials } from "../src/lib/pos/payments.js";

function document(id, status = "qr_pending") {
  return {
    $id: id,
    branchId: "branch",
    status,
    qrId: status === "qr_pending" ? "qr-test" : "",
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    items: JSON.stringify({ inventoryStatus: "reserved", items: [] }),
    encryptedToken: encryptCredentials({ token: "test-share-token" }),
    $createdAt: new Date().toISOString(),
  };
}

function mockList(t, documents, total = documents.length) {
  const calls = [];
  t.mock.method(Databases.prototype, "listDocuments", async (input) => {
    calls.push(input.queries);
    return { documents, total };
  });
  return calls;
}

test("history keeps expired, cancelled and unpaid links visible without reconciling on read", async (t) => {
  const previous = process.env.APPWRITE_API_KEY;
  process.env.APPWRITE_API_KEY = "local-test-key";
  t.after(() => {
    if (previous === undefined) delete process.env.APPWRITE_API_KEY;
    else process.env.APPWRITE_API_KEY = previous;
  });
  const calls = mockList(
    t,
    [
      document("expired", "expired"),
      document("cancelled", "cancelled"),
      document("unpaid", "open"),
    ],
    3,
  );
  const result = await listPaymentLinks(
    { isAdmin: true },
    { branchId: "branch" },
  );
  assert.deepEqual(
    result.links.map((link) => link.id),
    ["expired", "cancelled", "unpaid"],
  );
  assert.equal(result.total, 3);
  assert.equal(result.nextCursor, "");
  assert.ok(result.summary);
  assert.equal(calls.length, 5);
});

test("history requests one cursor page instead of downloading all records", async (t) => {
  const previous = process.env.APPWRITE_API_KEY;
  process.env.APPWRITE_API_KEY = "local-test-key";
  t.after(() => {
    if (previous === undefined) delete process.env.APPWRITE_API_KEY;
    else process.env.APPWRITE_API_KEY = previous;
  });
  const calls = mockList(
    t,
    Array.from({ length: 50 }, (_, index) => document(`link-${index}`, "paid")),
    103,
  );
  const result = await listPaymentLinks(
    { isAdmin: false, user: { id: "cashier" }, allowedBranchIds: ["branch"] },
    { branchId: "branch", cursor: "link-49", limit: 50 },
  );
  assert.equal(result.links.length, 50);
  assert.equal(result.total, 103);
  assert.equal(calls.length, 5);
  for (const queries of calls) {
    assert.ok(queries.includes(Query.equal("branchId", "branch")));
    assert.ok(queries.includes(Query.equal("createdByUserId", "cashier")));
  }
  assert.ok(calls[0].includes(Query.cursorAfter("link-49")));
});
