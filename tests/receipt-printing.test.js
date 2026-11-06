import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEscPosReceipt,
  buildReceiptHtml,
  normalizeReceiptPrinterSettings,
} from "../src/lib/pos/receipt-printing.js";

const sale = {
  saleNumber: "V-123",
  branchName: "Sucursal Centro",
  cashierName: "Ana",
  completedAt: "2026-11-06T14:30:00.000Z",
  paymentMethodType: "cash",
  paymentMethodLabel: "Efectivo",
  subtotal: 12.5,
  discount: 0,
  total: 12.5,
  amountPaid: 20,
  change: 7.5,
  items: [
    {
      productName: "Café <grande>",
      productSku: "CAF-01",
      quantity: 1,
      unitPrice: 12.5,
      subtotal: 12.5,
    },
  ],
};

test("normaliza opciones portables y limita las copias", () => {
  assert.deepEqual(normalizeReceiptPrinterSettings({ copies: 99 }), {
    enabled: false,
    mode: "browser",
    printerName: "",
    paperWidth: "80",
    copies: 3,
    autoPrint: false,
    escPos: false,
    cutPaper: true,
    openDrawer: false,
    footer: "Gracias por su compra.",
  });
});

test("genera HTML seguro para papel térmico", () => {
  const html = buildReceiptHtml(sale, { paperWidth: "58" });

  assert.match(html, /size: 58mm auto/);
  assert.match(html, /Café &lt;grande&gt;/);
  assert.doesNotMatch(html, /Café <grande>/);
  assert.match(html, /Bs 12\.50/);
  assert.match(html, /V-123/);
});

test("genera comandos ESC\/POS opcionales para cajón y corte", () => {
  const output = buildEscPosReceipt(sale, {
    mode: "qz",
    escPos: true,
    paperWidth: "58",
    openDrawer: true,
    cutPaper: true,
  });

  assert.ok(output.startsWith("\x1B\x70\x00\x19\xFA"));
  assert.ok(output.endsWith("\x1D\x56\x00"));
  assert.match(output, /Cafe <grande>/);
  assert.match(output, /TOTAL/);
});
