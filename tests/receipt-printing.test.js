import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEscPosReceipt,
  buildReceiptHtml,
  getReceiptQrLinks,
  getReceiptPrinterSettings,
  normalizeReceiptPrinterSettings,
  saveReceiptPrinterSettings,
} from "../src/lib/pos/receipt-printing.js";

const sale = {
  saleNumber: "V-123",
  branchId: "branch-centro",
  branchName: "Sucursal Centro",
  companyName: "Empresa Demo",
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
  assert.match(html, /Empresa Demo/);
  assert.match(html, /Sucursal: Sucursal Centro/);
  assert.match(html, /padding-bottom: 10mm/);
  assert.equal((html.match(/class="receipt"/g) || []).length, 2);
  assert.equal((html.match(/RECIBO DE PAGO/g) || []).length, 1);
  assert.match(html, />ORIGINAL</);
  assert.match(html, />COPIA</);
  assert.match(html, /receipt \+ \.receipt/);
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
  assert.ok(output.includes("\x1B\x64\x05"));
  assert.match(output, /Cafe <grande>/);
  assert.match(output, /Empresa Demo/);
  assert.match(output, /Sucursal: Sucursal Centro/);
  assert.ok(output.indexOf("RECIBO DE PAGO") < output.indexOf("Empresa Demo"));
  assert.equal((output.match(/RECIBO DE PAGO/g) || []).length, 1);
  assert.equal((output.match(/\*\*\* ORIGINAL \*\*\*/g) || []).length, 1);
  assert.equal((output.match(/\*\*\* COPIA \*\*\*/g) || []).length, 1);
  assert.equal((output.match(/\x1D\x56\x00/g) || []).length, 2);
  assert.ok(
    output.indexOf("*** ORIGINAL ***") < output.indexOf("\x1D\x56\x00"),
  );
  assert.ok(output.indexOf("\x1D\x56\x00") < output.indexOf("*** COPIA ***"));
  assert.match(output, /TOTAL/);
});

test("imprime los tres QR juntos únicamente en el recibo original", () => {
  const receiptWithQr = {
    ...sale,
    receiptUrl: "https://pos.example/recibo/token-seguro",
    whatsappNumber: "59170000000",
    branchCode: "SCZ",
    catalogUrl: "https://pos.example/catalogo/SCZ",
  };
  const links = getReceiptQrLinks(receiptWithQr);
  assert.deepEqual(
    links.map((link) => link.label),
    ["Ver recibo", "Chat WhatsApp", "Ver catálogo online"],
  );

  const html = buildReceiptHtml(receiptWithQr, { paperWidth: "80" });
  assert.equal((html.match(/class="receipt-qrs"/g) || []).length, 1);
  assert.equal((html.match(/aria-label="Código QR"/g) || []).length, 3);
  assert.match(html, /Ver recibo/);
  assert.match(html, /Chat WhatsApp/);
  assert.match(html, /Ver catálogo online/);
  const viewBoxes = [...html.matchAll(/viewBox="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.equal(new Set(viewBoxes).size, 1);
  assert.equal(
    (html.match(/Este recibo no tiene valor legal/g) || []).length,
    1,
  );
  assert.equal((html.match(/Gracias por su compra/g) || []).length, 1);
  assert.equal((html.match(/Empresa Demo/g) || []).length, 1);
  assert.ok(html.indexOf("receipt-qrs") < html.indexOf(">COPIA<"));

  const escPos = buildEscPosReceipt(receiptWithQr, {
    mode: "qz",
    escPos: true,
    paperWidth: "80",
  });
  assert.equal((escPos.match(/\x1D\x76\x30\x00/g) || []).length, 1);
  assert.equal((escPos.match(/WhatsApp/g) || []).length, 1);
  assert.match(escPos, /catalogo/);
  assert.match(escPos, /online/);
  assert.ok(escPos.indexOf("WhatsApp") < escPos.indexOf("*** COPIA ***"));
  assert.equal(
    (escPos.match(/Este recibo no tiene valor legal/g) || []).length,
    1,
  );
  assert.equal((escPos.match(/Gracias por su compra/g) || []).length, 1);
});

test("mantiene original y copia unidos cuando el corte está desactivado", () => {
  const output = buildEscPosReceipt(sale, {
    mode: "qz",
    escPos: true,
    paperWidth: "58",
    cutPaper: false,
  });

  assert.equal((output.match(/\x1D\x56\x00/g) || []).length, 0);
  assert.match(output, /\*\*\* ORIGINAL \*\*\*[\s\S]*\*\*\* COPIA \*\*\*/);
});

test("guarda y recupera una impresora distinta por sucursal", () => {
  const values = new Map();
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  };
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
    dispatchEvent: () => true,
  };

  try {
    saveReceiptPrinterSettings("branch-a", {
      enabled: true,
      mode: "qz",
      printerName: "Impresora A",
    });
    saveReceiptPrinterSettings("branch-b", {
      enabled: true,
      mode: "qz",
      printerName: "Impresora B",
    });

    assert.equal(
      getReceiptPrinterSettings("branch-a").printerName,
      "Impresora A",
    );
    assert.equal(
      getReceiptPrinterSettings("branch-b").printerName,
      "Impresora B",
    );
    assert.equal(getReceiptPrinterSettings("branch-c").enabled, false);
  } finally {
    globalThis.window = previousWindow;
    globalThis.CustomEvent = previousCustomEvent;
  }
});
