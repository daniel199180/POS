import test from "node:test";
import assert from "node:assert/strict";
import {
  paymentLinkSummary,
  paymentLinkDisplayStatus,
  paymentLinkHistoryPage,
} from "../src/lib/pos/payment-link-view.js";

test("counts unpaid links and expired links without counting completed or received payments", () => {
  const now = Date.parse("2026-09-26T17:00:00Z");
  const future = "2026-10-10T17:00:00Z";
  const past = "2026-09-25T17:00:00Z";
  const links = [
    { status: "open", expiresAt: future },
    { status: "qr_pending", expiresAt: future },
    { status: "qr_pending", expiresAt: past },
    { status: "expired", expiresAt: past },
    { status: "paid", expiresAt: past },
    { status: "cancelled", expiresAt: past },
    { status: "payment_received", expiresAt: past },
  ];
  assert.deepEqual(paymentLinkSummary(links, now), { ready: 2, expired: 2 });
  assert.equal(paymentLinkDisplayStatus(links[2], now), "expired");
  assert.equal(paymentLinkDisplayStatus(links[4], now), "paid");
});

test("history pagination covers every record and clamps the page after refresh", () => {
  const links = Array.from({ length: 23 }, (_, id) => ({ id }));
  const pages = [1, 2, 3].map((page) => paymentLinkHistoryPage(links, page));
  assert.deepEqual(
    pages.flatMap((page) => page.rows),
    links,
  );
  assert.equal(pages[2].rows.length, 3);
  assert.equal(pages[2].pageCount, 3);
  assert.equal(paymentLinkHistoryPage(links.slice(0, 8), 3).page, 1);
  assert.deepEqual(paymentLinkHistoryPage([], 3).rows, []);
});
