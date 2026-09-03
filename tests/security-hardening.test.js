import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertRateLimit,
  requestFingerprint,
} from "../src/lib/security/rate-limit.js";
import { filterInstituteLedgerByBranch } from "../src/lib/pos/institute-branch.js";

test("rate limiter blocks abusive repeated requests", () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  assert.doesNotThrow(() =>
    assertRateLimit({ namespace: "test", key, limit: 2, windowMs: 60_000 }),
  );
  assert.doesNotThrow(() =>
    assertRateLimit({ namespace: "test", key, limit: 2, windowMs: 60_000 }),
  );
  assert.throws(
    () =>
      assertRateLimit({ namespace: "test", key, limit: 2, windowMs: 60_000 }),
    (error) => error.status === 429,
  );
});

test("request fingerprints never retain raw IP or account data", () => {
  const request = new Request("https://pos.test/login", {
    headers: { "x-forwarded-for": "192.0.2.4" },
  });
  const fingerprint = requestFingerprint(request, "persona@example.com");
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(fingerprint, /persona|192\.0\.2\.4/);
});

test("institute ledger only exposes the selected branch and recalculates debt", () => {
  const filtered = filterInstituteLedgerByBranch(
    {
      estudiante: { nombre: "Estudiante" },
      deudaTotal: 150,
      cursos: [
        { courseName: "A", sucursalNombre: "Santa Cruz", deudaTotal: 50 },
        { courseName: "B", sucursalNombre: "La Paz", deudaTotal: 100 },
      ],
    },
    "santa cruz",
  );
  assert.deepEqual(
    filtered.cursos.map((course) => course.courseName),
    ["A"],
  );
  assert.equal(filtered.deudaTotal, 50);
});

test("database bootstrap keeps operational collections server-only", () => {
  const setup = readFileSync(
    new URL("../scripts/setup-database.js", import.meta.url),
    "utf8",
  );
  const sourceModules = [
    "auth-core",
    "inventory",
    "management",
    "sales",
    "settings",
    "users",
  ].map((name) =>
    readFileSync(new URL(`../src/lib/pos/${name}.js`, import.meta.url), "utf8"),
  );
  assert.match(setup, /function collectionPermissions\(\)\s*{\s*return \[\]/);
  assert.doesNotMatch(setup, /Permission\.read\(Role\.users/);
  for (const source of sourceModules) {
    assert.doesNotMatch(source, /Permission\.read\(Role\.users/);
  }
});
