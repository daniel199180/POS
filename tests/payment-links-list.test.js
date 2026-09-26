import test from "node:test";
import assert from "node:assert/strict";
import { Client, Databases, Query } from "node-appwrite";
import { listPaymentLinks } from "../src/lib/pos/payment-links.js";
import { encryptCredentials } from "../src/lib/pos/payments.js";

test("a failed reconciliation keeps the affected link and other links visible", async (t) => {
  const previous = process.env.APPWRITE_API_KEY;
  process.env.APPWRITE_API_KEY = "local-test-key";
  t.after(() => {
    if (previous === undefined) delete process.env.APPWRITE_API_KEY;
    else process.env.APPWRITE_API_KEY = previous;
  });
  const base = {
    branchId: "branch",
    status: "qr_pending",
    qrId: "qr-test",
    items: JSON.stringify({ inventoryStatus: "reserved", items: [] }),
    encryptedToken: encryptCredentials({ token: "test-share-token" }),
    $createdAt: new Date().toISOString(),
  };
  const documents = [
    {
      ...base,
      $id: "expired",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    },
    {
      ...base,
      $id: "active",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
  ];
  const before = structuredClone(documents);
  t.mock.method(Databases.prototype, "listDocuments", async () => ({
    documents,
  }));
  const mutations = [];
  t.mock.method(
    Client.prototype,
    "call",
    async (method, url, _headers, payload) => {
      if (method === "post" && url.pathname.endsWith("/transactions")) {
        return { $id: "test-transaction" };
      }
      if (url.pathname.includes("/documents")) {
        const error = new Error("Reconciliation unavailable");
        error.status = 405;
        throw error;
      }
      mutations.push({ method, payload });
      return {};
    },
  );
  const log = t.mock.method(console, "error", () => {});
  const links = await listPaymentLinks({ isAdmin: true });
  assert.equal(links.length, 2);
  const expired = links.find((link) => link.id === "expired");
  assert.equal(expired.status, "qr_pending");
  assert.match(expired.lastError, /conciliacion sigue pendiente/);
  assert.equal(links.find((link) => link.id === "active").lastError, "");
  assert.deepEqual(documents, before);
  assert.deepEqual(mutations, [
    { method: "patch", payload: { rollback: true } },
  ]);
  assert.equal(log.mock.callCount(), 1);
});

test("history includes links beyond the first hundred and keeps cashier and branch filters", async (t) => {
  const previous = process.env.APPWRITE_API_KEY;
  process.env.APPWRITE_API_KEY = "local-test-key";
  t.after(() => {
    if (previous === undefined) delete process.env.APPWRITE_API_KEY;
    else process.env.APPWRITE_API_KEY = previous;
  });
  const encryptedToken = encryptCredentials({ token: "test-share-token" });
  const documents = Array.from({ length: 103 }, (_, index) => ({
    $id: `link-${index}`,
    status: "paid",
    branchId: "branch",
    items: "[]",
    encryptedToken,
    $createdAt: new Date(Date.now() - index * 1000).toISOString(),
  }));
  let calls = 0;
  t.mock.method(Databases.prototype, "listDocuments", async ({ queries }) => {
    assert.ok(queries.includes(Query.equal("branchId", "branch")));
    assert.ok(queries.includes(Query.equal("createdByUserId", "cashier")));
    if (calls++ === 0) return { documents: documents.slice(0, 100) };
    assert.ok(queries.includes(Query.cursorAfter("link-99")));
    return { documents: documents.slice(100) };
  });
  const links = await listPaymentLinks(
    { isAdmin: false, user: { id: "cashier" }, allowedBranchIds: ["branch"] },
    { branchId: "branch" },
  );
  assert.equal(calls, 2);
  assert.equal(links.length, 103);
  assert.equal(links.at(-1).id, "link-102");
});
