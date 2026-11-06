export const RECEIPT_PRINTER_STORAGE_KEY = "pos.receipt-printer.v1";

export const DEFAULT_RECEIPT_PRINTER_SETTINGS = Object.freeze({
  enabled: false,
  mode: "browser",
  printerName: "",
  paperWidth: "80",
  copies: 1,
  autoPrint: false,
  escPos: false,
  cutPaper: true,
  openDrawer: false,
  footer: "Gracias por su compra.",
});

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(Number(value) || minimum, minimum), maximum);
}

export function normalizeReceiptPrinterSettings(value = {}) {
  const source = { ...DEFAULT_RECEIPT_PRINTER_SETTINGS, ...value };
  const mode = source.mode === "qz" ? "qz" : "browser";
  const paperWidth = source.paperWidth === "58" ? "58" : "80";

  return {
    enabled: Boolean(source.enabled),
    mode,
    printerName: String(source.printerName || "").trim(),
    paperWidth,
    copies: clamp(source.copies, 1, 3),
    autoPrint: Boolean(source.autoPrint),
    escPos: mode === "qz" && Boolean(source.escPos),
    cutPaper: Boolean(source.cutPaper),
    openDrawer: Boolean(source.openDrawer),
    footer: String(source.footer ?? DEFAULT_RECEIPT_PRINTER_SETTINGS.footer)
      .trim()
      .slice(0, 160),
  };
}

export function getReceiptPrinterSettings() {
  if (typeof window === "undefined") {
    return { ...DEFAULT_RECEIPT_PRINTER_SETTINGS };
  }

  try {
    const stored = window.localStorage.getItem(RECEIPT_PRINTER_STORAGE_KEY);

    return normalizeReceiptPrinterSettings(
      stored ? JSON.parse(stored) : DEFAULT_RECEIPT_PRINTER_SETTINGS,
    );
  } catch {
    return { ...DEFAULT_RECEIPT_PRINTER_SETTINGS };
  }
}

export function saveReceiptPrinterSettings(value) {
  const settings = normalizeReceiptPrinterSettings(value);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      RECEIPT_PRINTER_STORAGE_KEY,
      JSON.stringify(settings),
    );
    window.dispatchEvent(
      new CustomEvent("pos:receipt-printer-settings", { detail: settings }),
    );
  }

  return settings;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amount(value) {
  return `Bs ${number(value).toFixed(2)}`;
}

function receiptDate(value) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function normalizeReceipt(receipt = {}) {
  return {
    saleNumber: String(receipt.saleNumber || receipt.id || "SIN-NUMERO"),
    branchName: String(receipt.branchName || "Punto de venta"),
    cashierName: String(receipt.cashierName || "-"),
    customerName: String(receipt.senderName || receipt.customerName || ""),
    completedAt: receipt.completedAt || new Date().toISOString(),
    paymentLabel: String(
      receipt.paymentMethodLabel || receipt.paymentLabel || "-",
    ),
    paymentType: String(receipt.paymentMethodType || receipt.paymentType || ""),
    subtotal: number(receipt.subtotal ?? receipt.total),
    discount: number(receipt.discount),
    total: number(receipt.total),
    amountPaid: number(receipt.amountPaid ?? receipt.total),
    change: number(receipt.change),
    notes: String(receipt.notes || ""),
    items: Array.isArray(receipt.items)
      ? receipt.items.map((item) => ({
          name: String(item.productName || item.name || "Producto"),
          sku: String(item.productSku || item.sku || ""),
          quantity: number(item.quantity),
          unitPrice: number(item.unitPrice ?? item.price),
          subtotal: number(
            item.subtotal ??
              number(item.quantity) * number(item.unitPrice ?? item.price),
          ),
        }))
      : [],
  };
}

export function buildReceiptHtml(receipt, settingsValue = {}) {
  const settings = normalizeReceiptPrinterSettings(settingsValue);
  const sale = normalizeReceipt(receipt);
  const width = settings.paperWidth === "58" ? 58 : 80;
  const rows = sale.items
    .map(
      (item) => `
        <tr>
          <td>
            <strong>${escapeHtml(item.name)}</strong>
            ${item.sku ? `<small>${escapeHtml(item.sku)}</small>` : ""}
          </td>
          <td class="qty">${escapeHtml(item.quantity)}</td>
          <td class="money">${escapeHtml(amount(item.subtotal))}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <title>Recibo ${escapeHtml(sale.saleNumber)}</title>
    <style>
      @page { size: ${width}mm auto; margin: 2mm; }
      * { box-sizing: border-box; }
      html, body { width: ${width - 4}mm; margin: 0; padding: 0; }
      body { color: #000; background: #fff; font: 12px/1.32 Arial, sans-serif; }
      h1 { margin: 0 0 4px; font-size: 16px; text-align: center; }
      p { margin: 2px 0; }
      .center { text-align: center; }
      .rule { margin: 7px 0; border-top: 1px dashed #000; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 3px 0; vertical-align: top; text-align: left; }
      th { border-bottom: 1px solid #000; font-size: 10px; }
      td small { display: block; font-size: 9px; }
      .qty { width: 12%; text-align: center; }
      .money { width: 28%; text-align: right; white-space: nowrap; }
      .totals { margin-left: auto; width: 76%; }
      .totals td:last-child { text-align: right; white-space: nowrap; }
      .total { border-top: 1px solid #000; font-size: 14px; font-weight: 700; }
      .footer { margin-top: 10px; text-align: center; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(sale.branchName)}</h1>
    <p class="center">RECIBO DE PAGO</p>
    <div class="rule"></div>
    <p><strong>Venta:</strong> ${escapeHtml(sale.saleNumber)}</p>
    <p><strong>Fecha:</strong> ${escapeHtml(receiptDate(sale.completedAt))}</p>
    <p><strong>Cajero:</strong> ${escapeHtml(sale.cashierName)}</p>
    ${sale.customerName ? `<p><strong>Cliente:</strong> ${escapeHtml(sale.customerName)}</p>` : ""}
    <div class="rule"></div>
    <table>
      <thead><tr><th>Detalle</th><th class="qty">Cant.</th><th class="money">Importe</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3">Sin detalle de productos</td></tr>'}</tbody>
    </table>
    <div class="rule"></div>
    <table class="totals">
      <tr><td>Subtotal</td><td>${escapeHtml(amount(sale.subtotal))}</td></tr>
      ${sale.discount ? `<tr><td>Descuento</td><td>-${escapeHtml(amount(sale.discount))}</td></tr>` : ""}
      <tr class="total"><td>Total</td><td>${escapeHtml(amount(sale.total))}</td></tr>
      <tr><td>Recibido</td><td>${escapeHtml(amount(sale.amountPaid))}</td></tr>
      ${sale.change ? `<tr><td>Cambio</td><td>${escapeHtml(amount(sale.change))}</td></tr>` : ""}
    </table>
    <div class="rule"></div>
    <p><strong>Pago:</strong> ${escapeHtml(sale.paymentLabel)}</p>
    ${sale.notes ? `<p><strong>Notas:</strong> ${escapeHtml(sale.notes)}</p>` : ""}
    ${settings.footer ? `<p class="footer">${escapeHtml(settings.footer)}</p>` : ""}
  </body>
</html>`;
}

function ascii(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "?");
}

function wrap(value, width) {
  const words = ascii(value).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    if (word.length > width) {
      if (line) lines.push(line);
      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }
      line = "";
    } else if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function twoColumns(left, right, width) {
  const safeRight = ascii(right).slice(0, width);
  const available = Math.max(width - safeRight.length - 1, 1);
  const leftLines = wrap(left, available);

  return leftLines
    .map((line, index) =>
      index === leftLines.length - 1
        ? `${line}${" ".repeat(Math.max(width - line.length - safeRight.length, 1))}${safeRight}`
        : line,
    )
    .join("\n");
}

export function buildEscPosReceipt(receipt, settingsValue = {}) {
  const settings = normalizeReceiptPrinterSettings({
    ...settingsValue,
    mode: "qz",
    escPos: true,
  });
  const sale = normalizeReceipt(receipt);
  const columns = settings.paperWidth === "58" ? 32 : 48;
  const divider = "-".repeat(columns);
  const lines = [
    "\x1B\x40",
    "\x1B\x61\x01",
    "\x1B\x45\x01",
    `${ascii(sale.branchName)}\n`,
    "\x1B\x45\x00",
    "RECIBO DE PAGO\n",
    "\x1B\x61\x00",
    `${divider}\n`,
    `Venta: ${ascii(sale.saleNumber)}\n`,
    `Fecha: ${ascii(receiptDate(sale.completedAt))}\n`,
    `Cajero: ${ascii(sale.cashierName)}\n`,
  ];

  if (sale.customerName) lines.push(`Cliente: ${ascii(sale.customerName)}\n`);
  lines.push(`${divider}\n`);

  for (const item of sale.items) {
    lines.push(`${wrap(item.name, columns).join("\n")}\n`);
    lines.push(
      `${twoColumns(`${item.quantity} x ${amount(item.unitPrice)}`, amount(item.subtotal), columns)}\n`,
    );
  }

  if (!sale.items.length) lines.push("Sin detalle de productos\n");

  lines.push(
    `${divider}\n`,
    `${twoColumns("Subtotal", amount(sale.subtotal), columns)}\n`,
  );
  if (sale.discount) {
    lines.push(
      `${twoColumns("Descuento", `-${amount(sale.discount)}`, columns)}\n`,
    );
  }
  lines.push(
    "\x1B\x45\x01",
    `${twoColumns("TOTAL", amount(sale.total), columns)}\n`,
    "\x1B\x45\x00",
    `${twoColumns("Recibido", amount(sale.amountPaid), columns)}\n`,
  );
  if (sale.change) {
    lines.push(`${twoColumns("Cambio", amount(sale.change), columns)}\n`);
  }
  lines.push(`${divider}\n`, `Pago: ${ascii(sale.paymentLabel)}\n`);
  if (sale.notes) lines.push(`Notas: ${ascii(sale.notes)}\n`);
  if (settings.footer) {
    lines.push(
      "\x1B\x61\x01",
      `${wrap(settings.footer, columns).join("\n")}\n`,
      "\x1B\x61\x00",
    );
  }
  lines.push("\n\n\n");

  if (settings.openDrawer && sale.paymentType === "cash") {
    lines.unshift("\x1B\x70\x00\x19\xFA");
  }
  if (settings.cutPaper) lines.push("\x1D\x56\x00");

  return lines.join("");
}

let qzPromise;

async function getQz() {
  if (typeof window === "undefined") {
    throw new Error(
      "La impresión directa solo está disponible en el navegador.",
    );
  }

  qzPromise ||= import("qz-tray").then((module) => module.default || module);
  return qzPromise;
}

export async function connectQz() {
  const qz = await getQz();

  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ retries: 1, delay: 0 });
  }

  return qz;
}

export async function listReceiptPrinters() {
  const qz = await connectQz();
  const printers = await qz.printers.find();

  return Array.isArray(printers) ? printers : [printers].filter(Boolean);
}

function printInBrowser(receipt, settings) {
  if (typeof document === "undefined") {
    throw new Error("La impresión solo está disponible en el navegador.");
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Recibo para imprimir");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument;

  if (!frameWindow || !frameDocument) {
    frame.remove();
    throw new Error("El navegador no pudo preparar el recibo.");
  }

  frameDocument.open();
  frameDocument.write(buildReceiptHtml(receipt, settings));
  frameDocument.close();

  const cleanup = () => window.setTimeout(() => frame.remove(), 500);
  frameWindow.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(() => {
    frameWindow.focus();
    frameWindow.print();
    window.setTimeout(() => frame.remove(), 60_000);
  }, 50);
}

export async function printReceipt(receipt, settingsValue) {
  const settings = normalizeReceiptPrinterSettings(
    settingsValue || getReceiptPrinterSettings(),
  );

  if (!settings.enabled) {
    throw new Error("Activa la impresora de recibos en Configuraciones.");
  }

  if (settings.mode === "browser") {
    printInBrowser(receipt, settings);
    return { mode: "browser", printerName: "Diálogo del sistema" };
  }

  if (!settings.printerName) {
    throw new Error("Selecciona una impresora para la impresión directa.");
  }

  const qz = await connectQz();
  const config = qz.configs.create(settings.printerName, {
    copies: settings.copies,
    jobName: `Recibo ${receipt?.saleNumber || "POS"}`,
    margins: 0,
    scaleContent: false,
  });

  if (settings.escPos) {
    await qz.print(config, [
      {
        type: "raw",
        format: "command",
        flavor: "plain",
        data: buildEscPosReceipt(receipt, settings),
      },
    ]);
  } else {
    await qz.print(config, [
      {
        type: "pixel",
        format: "html",
        flavor: "plain",
        data: buildReceiptHtml(receipt, settings),
        options: {
          pageWidth: Number(settings.paperWidth) / 25.4,
        },
      },
    ]);
  }

  return { mode: "qz", printerName: settings.printerName };
}

export function shouldAutoPrintReceipt() {
  const settings = getReceiptPrinterSettings();
  return settings.enabled && settings.autoPrint;
}

export async function printTestReceipt(settingsValue) {
  const now = new Date();

  return printReceipt(
    {
      saleNumber: "PRUEBA-001",
      branchName: "Punto de venta",
      cashierName: "Impresión de prueba",
      completedAt: now.toISOString(),
      paymentMethodType: "cash",
      paymentMethodLabel: "Efectivo",
      subtotal: 15,
      discount: 0,
      total: 15,
      amountPaid: 20,
      change: 5,
      items: [
        {
          productName: "Producto de prueba",
          productSku: "TEST",
          quantity: 1,
          unitPrice: 15,
          subtotal: 15,
        },
      ],
    },
    settingsValue,
  );
}
