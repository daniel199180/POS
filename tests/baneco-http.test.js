import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { once } from "node:events";
import {
  cancelBanecoQr,
  generateBanecoQr,
  getBanecoQrStatus,
} from "../src/lib/pos/baneco.js";
import { getPosBanecoQrPaymentTokenPayload } from "../src/lib/pos/baneco-qr.js";
import { STATIC_QR_VALIDITY_DAYS } from "../src/lib/pos/payment-validity.js";

async function bank(t, respond) {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const call = {
      method: req.method,
      path: req.url,
      authorization: req.headers.authorization,
      body: raw ? JSON.parse(raw) : null,
    };
    calls.push(call);
    res.setHeader("Content-Type", "application/json");
    if (call.path.endsWith("/authenticate")) {
      res.end(
        JSON.stringify({ token: "test-token-long-enough", responseCode: 0 }),
      );
    } else {
      respond(call, res);
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    calls,
    config: { baseUrl: `http://127.0.0.1:${server.address().port}` },
    credentials: {
      apiUsername: "test-user",
      encryptedPassword: "test-encrypted-password",
      accountCredit: "test-account",
      encryptedAccountCredit: "test-encrypted-account",
    },
  };
}

test("cancellation uses DELETE with the QR body and bearer token", async (t) => {
  const fixture = await bank(t, (call, res) => {
    if (call.method !== "DELETE") {
      res.writeHead(405, { Allow: "DELETE" });
      res.end(JSON.stringify({ Message: "Method not allowed" }));
      return;
    }
    res.end(JSON.stringify({ responseCode: 0 }));
  });
  const result = await cancelBanecoQr({ ...fixture, qrId: "qr-test" });
  assert.equal(result.status, "cancelled");
  assert.deepEqual(fixture.calls.at(-1), {
    method: "DELETE",
    path: "/api/qrsimple/cancelQR",
    authorization: "Bearer test-token-long-enough",
    body: { qrId: "qr-test" },
  });
});

test("new bank QRs expire fourteen days after generation across a month boundary", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-09-26T17:00:00Z"),
  });
  const fixture = await bank(t, (_call, res) => {
    res.end(
      JSON.stringify({ responseCode: 0, qrId: "qr-test", qrImage: "image" }),
    );
  });
  await generateBanecoQr({
    ...fixture,
    amount: 29,
    transactionId: "test-transaction",
  });
  assert.equal(fixture.calls.at(-1).body.dueDate, "2026-10-10");
  assert.equal(fixture.calls.at(-1).body.singleUse, true);
});

test("static bank QRs last one year, omit amount and allow repeated payments", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-10-01T17:00:00Z"),
  });
  const fixture = await bank(t, (_call, res) => {
    res.end(
      JSON.stringify({ responseCode: 0, qrId: "static-qr", qrImage: "image" }),
    );
  });
  await generateBanecoQr({
    ...fixture,
    amount: 0,
    description: "Caja principal",
    transactionId: "static-transaction",
    singleUse: false,
    modifyAmount: true,
    dueDays: STATIC_QR_VALIDITY_DAYS,
  });
  const body = fixture.calls.at(-1).body;
  assert.equal(body.amount, 0);
  assert.equal(body.singleUse, false);
  assert.equal(body.modifyAmount, true);
  assert.equal(body.description, "Caja principal");
  assert.equal(body.dueDate, "2027-10-01");
});

test("signed QR receipts remain usable for fourteen days and then expire", (t) => {
  const previous = process.env.PAYMENT_CREDENTIALS_SECRET;
  process.env.PAYMENT_CREDENTIALS_SECRET = "validity-test-secret";
  t.after(() => {
    if (previous === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
    else process.env.PAYMENT_CREDENTIALS_SECRET = previous;
  });
  const generatedAt = "2026-09-26T17:00:00Z";
  const body = Buffer.from(
    JSON.stringify({ generatedAt, qrId: "qr-test" }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.PAYMENT_CREDENTIALS_SECRET)
    .update(body)
    .digest("base64url");
  const input = { paymentToken: `${body}.${signature}` };
  const day = 24 * 60 * 60 * 1000;
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse(generatedAt) + 13 * day,
  });
  assert.equal(getPosBanecoQrPaymentTokenPayload(input).qrId, "qr-test");
  t.mock.timers.setTime(Date.parse(generatedAt) + 14 * day + 1);
  assert.throws(() => getPosBanecoQrPaymentTokenPayload(input), /vencio/);
});

test("405 preserves provider Message and safe routing metadata without retries", async (t) => {
  const fixture = await bank(t, (_call, res) => {
    res.writeHead(405, { Allow: "DELETE" });
    res.end(JSON.stringify({ Message: "Provider routing error" }));
  });
  await assert.rejects(
    cancelBanecoQr({ ...fixture, qrId: "qr-test" }),
    (error) => {
      assert.equal(error.message, "Provider routing error");
      assert.equal(error.status, 405);
      assert.equal(error.method, "DELETE");
      assert.equal(error.path, "/api/qrsimple/cancelQR");
      assert.equal(error.allowedMethods, "DELETE");
      return true;
    },
  );
  assert.equal(
    fixture.calls.filter((call) => call.path.endsWith("/cancelQR")).length,
    1,
  );
});

test("status queries continue using GET with a QR body", async (t) => {
  const fixture = await bank(t, (_call, res) => {
    res.end(JSON.stringify({ responseCode: 0, statusQrCode: 0 }));
  });
  const result = await getBanecoQrStatus({ ...fixture, qrId: "qr-test" });
  assert.equal(result.status, "pending");
  assert.equal(fixture.calls.at(-1).method, "GET");
  assert.deepEqual(fixture.calls.at(-1).body, { qrId: "qr-test" });
});
