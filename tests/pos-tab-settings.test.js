import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POS_TAB_SETTINGS,
  normalizePosTabSettings,
  validatePosTabSettings,
} from "../src/lib/pos/pos-ui-settings.js";

test("POS tabs default to visible when no configuration exists", () => {
  assert.deepEqual(normalizePosTabSettings(), DEFAULT_POS_TAB_SETTINGS);
  assert.deepEqual(normalizePosTabSettings({ monthly: false }), {
    ...DEFAULT_POS_TAB_SETTINGS,
    monthly: false,
  });
});

test("POS tabs require at least one visible section", () => {
  assert.throws(
    () =>
      validatePosTabSettings({
        products: false,
        monthly: false,
        custom: false,
        links: false,
        daily: false,
      }),
    /al menos una pestaña/i,
  );
  assert.equal(
    validatePosTabSettings({ products: false, daily: true }).daily,
    true,
  );
});
