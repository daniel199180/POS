import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertRateLimit,
  requestFingerprint,
} from "../src/lib/security/rate-limit.js";
import { filterInstituteLedgerByBranch } from "../src/lib/pos/institute-branch.js";
import {
  assertCanViewAnalytics,
  isAdministratorRole,
  normalizeUserRole,
} from "../src/lib/pos/auth-core.js";

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

test("role hierarchy reserves analytics for super administrators", () => {
  assert.equal(normalizeUserRole("super_admin"), "super_admin");
  assert.equal(normalizeUserRole("admin"), "admin");
  assert.equal(normalizeUserRole("unexpected"), "cashier");
  assert.equal(isAdministratorRole("super_admin"), true);
  assert.equal(isAdministratorRole("admin"), true);
  assert.equal(isAdministratorRole("cashier"), false);
  assert.throws(
    () => assertCanViewAnalytics({ canViewAnalytics: false }),
    (error) => error.status === 403,
  );
  assert.doesNotThrow(() => assertCanViewAnalytics({ canViewAnalytics: true }));
});

test("user deletion removes both the Appwrite account and POS profile", () => {
  const route = readFileSync(
    new URL(
      "../src/app/api/pos/manage/users/[profileId]/route.js",
      import.meta.url,
    ),
    "utf8",
  );
  const users = readFileSync(
    new URL("../src/lib/pos/users.js", import.meta.url),
    "utf8",
  );
  assert.match(route, /deleteManagedUser/);
  assert.match(users, /users\.delete\(\{ userId: currentProfile\.userId \}\)/);
  assert.match(users, /databases\.deleteDocument\(\{/);
  assert.doesNotMatch(route, /deactivateManagedUser/);
});
