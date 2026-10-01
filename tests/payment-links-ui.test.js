import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const compiledModules = new Map();

// Render real JSX using Next's installed compiler. Server rendering does not
// run effects, so neither Appwrite nor Baneco is contacted by these tests.
function loadModule(url) {
  if (compiledModules.has(url.href)) return compiledModules.get(url.href);
  const { code } = transformSync(readFileSync(url, "utf8"), {
    filename: url.pathname,
    jsc: {
      parser: { syntax: "ecmascript", jsx: true },
      transform: { react: { runtime: "automatic" } },
    },
    module: { type: "commonjs" },
  });
  const compiled = { exports: {} };
  function requireModule(specifier) {
    if (specifier.startsWith(".") || specifier.startsWith("@/")) {
      const path = specifier.endsWith(".js") ? specifier : `${specifier}.js`;
      return loadModule(
        specifier.startsWith("@/")
          ? new URL(`../src/${path.slice(2)}`, import.meta.url)
          : new URL(path, url),
      );
    }
    return require(specifier);
  }
  new Function("require", "module", "exports", code)(
    requireModule,
    compiled,
    compiled.exports,
  );
  compiledModules.set(url.href, compiled.exports);
  return compiled.exports;
}

function loadComponent(name) {
  return loadModule(
    new URL(`../src/app/(dashboard)/${name}.js`, import.meta.url),
  ).default;
}

const PaymentLinksClient = loadComponent("payment-links-client");
const PaymentLinkCreator = loadComponent("payment-link-creator");
const StaticPaymentQrClient = loadComponent("static-payment-qr-client");
const DashboardClient = loadComponent("dashboard-client");
function buttons(html) {
  return Array.from(
    html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g),
    (match) => ({
      html: match[0],
      label: match[1].replace(/<[^>]+>/g, "").trim(),
    }),
  );
}

function renderCreator(overrides = {}) {
  return renderToStaticMarkup(
    React.createElement(PaymentLinkCreator, {
      cart: [],
      paymentMethod: { id: "test-qr" },
      total: 0,
      ...overrides,
    }),
  );
}

test("payment links tab opens before a first link exists", () => {
  const html = renderToStaticMarkup(
    React.createElement(PaymentLinksClient, {
      branchId: "test-branch",
      branchName: "Sucursal de prueba",
    }),
  );
  assert.match(html, /Todavia no hay enlaces/);
  assert.match(html, /Listos para pagar/);
  assert.match(html, /Vencidos/);
  assert.doesNotMatch(html, /Historial de enlaces/);
  assert.doesNotMatch(html, />Enlaces de pago<\/p>/);
  assert.doesNotMatch(
    html,
    /debajo de Efectivo y QR|Enlaces recientes|consulta los enlaces/,
  );
  assert.doesNotMatch(html, /Enlace listo para compartir/);
  assert.ok(
    buttons(html).every((button) => button.label !== "Generar enlace de pago"),
  );
});

test("static QR tab uses the active branch and exposes payment history", () => {
  const html = renderToStaticMarkup(
    React.createElement(StaticPaymentQrClient, {
      branchId: "test-branch",
      branchName: "Sucursal de prueba",
      paymentMethods: [
        {
          id: "qr",
          branchId: "test-branch",
          type: "qr",
          isEnabled: true,
          config: { provider: "baneco" },
        },
      ],
    }),
  );
  assert.doesNotMatch(html, /Cobro reutilizable|múltiples pagos/);
  assert.doesNotMatch(html, />QR estático<|>Sucursal<.*<select/s);
  assert.doesNotMatch(html, /<img|Total recibido/);
  assert.match(html, /w-full rounded-md border/);
  assert.match(html, /Crear QR estático/);
  assert.match(html, /Mis QR estáticos/);
  const staticQrSource = readFileSync(
    new URL(
      "../src/app/(dashboard)/static-payment-qr-client.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(staticQrSource, /Consultar pagos/);
  assert.match(staticQrSource, /Deshabilitar/);
  assert.match(staticQrSource, /method: "DELETE"/);
});

test("empty checkout renders safely and disables link creation", () => {
  const html = renderCreator();
  assert.match(html, /Generar enlace de pago/);
  assert.match(buttons(html)[0].html, /disabled=""/);
  assert.doesNotMatch(html, /Enlace listo para compartir/);
});

test("checkout with products enables link creation", () => {
  const html = renderCreator({
    cart: [{ id: "test-product", quantity: 2, price: 10 }],
    total: 20,
    notes: "Pedido para llevar",
  });
  assert.match(html, /Generar enlace/);
  assert.doesNotMatch(html, /Ej\. Reserva mesa 4, pedido para llevar/);
  assert.doesNotMatch(html, /disabled=""/);
  assert.doesNotMatch(html, /Enlace listo para compartir/);
});

test("checkout shows missing QR configuration without crashing", () => {
  const html = renderCreator({ paymentMethod: null });
  assert.match(html, /Configura un metodo QR Baneco/);
  assert.match(html, /disabled=""/);
});

test("monthly charges cannot generate a link", () => {
  const html = renderCreator({
    cart: [{ id: "test-monthly", institutePayment: { paymentId: "test" } }],
  });
  assert.match(html, /Las mensualidades se cobran directamente/);
  assert.match(html, /disabled=""/);
});

test("link creation is disabled while a checkout operation is in progress", () => {
  const html = renderCreator({
    cart: [{ id: "test-product" }],
    isCreating: true,
  });
  assert.match(html, /Generando enlace/);
  assert.match(buttons(html)[0].html, /disabled=""/);
});

test("generated links stay out of checkout until the payment-link popup opens", () => {
  const html = renderCreator({
    latestLink: {
      id: "test-link",
      status: "open",
      sharePath: "/pagar/test",
      notes: "Mesa 4",
    },
  });
  assert.doesNotMatch(html, /Enlace listo para compartir/);
  assert.ok(buttons(html).every((button) => button.label !== "Copiar"));
  assert.ok(buttons(html).every((button) => button.label !== "Compartir"));
});

test("the link popup implementation includes note, generate and cancel controls", () => {
  const source = readFileSync(
    new URL("../src/app/(dashboard)/payment-link-creator.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /role="dialog"/);
  assert.match(source, /Nota <span[^>]*>\(opcional\)<\/span>/);
  assert.match(source, />\s*Cancelar\s*</);
  assert.match(source, /"Generar"/);
  assert.match(source, /Enlace de pago listo para compartir/);
  assert.match(source, /onClick=\{closeDialog\}/);
});

test("cancelled links are no longer offered for sharing in checkout", () => {
  const html = renderCreator({
    latestLink: {
      id: "test-link",
      status: "cancelled",
      sharePath: "/pagar/test",
    },
  });
  assert.doesNotMatch(html, /Enlace listo para compartir/);
});

test("POS places the link creator immediately after cash and QR buttons", () => {
  const html = renderToStaticMarkup(
    React.createElement(DashboardClient, {
      user: { id: "cashier", name: "Cajero de prueba" },
      catalog: {
        branches: [{ id: "branch", name: "Sucursal de prueba" }],
        paymentMethods: [
          { id: "cash", branchId: "branch", type: "cash", label: "Efectivo" },
          {
            id: "qr",
            branchId: "branch",
            type: "qr",
            label: "QR Simple",
            config: { provider: "baneco" },
          },
        ],
        productsPage: { products: [] },
      },
    }),
  );
  const checkout = html.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/)?.[1];
  assert.ok(
    buttons(html).some((button) => button.label === "Cobro personalizado"),
  );
  assert.doesNotMatch(html, /placeholder="Nombre del cobro"/);
  assert.ok(checkout);
  assert.deepEqual(
    buttons(checkout)
      .slice(0, 3)
      .map((button) => button.label),
    ["Efectivo", "QR Simple", "Generar enlace de pago"],
  );
  assert.ok(
    checkout.indexOf("payment-link-creator") < checkout.indexOf("Recibido"),
  );
  assert.match(html, /Sesión de POS/);
  assert.match(html, /Buscar producto por SKU, codigo o nombre/);
});

test("POS only renders tabs enabled by the administrator", () => {
  const html = renderToStaticMarkup(
    React.createElement(DashboardClient, {
      user: { id: "cashier", name: "Cajero de prueba" },
      catalog: {
        branches: [{ id: "branch", name: "Sucursal de prueba" }],
        paymentMethods: [],
        productsPage: { products: [] },
      },
      tabSettingsByBranch: {
        branch: {
          tabs: {
            products: false,
            monthly: false,
            custom: false,
            staticQr: false,
            links: false,
            daily: true,
          },
        },
      },
    }),
  );
  const renderedTabs = buttons(html)
    .filter((button) => /role="tab"/.test(button.html))
    .map((button) => button.label);

  assert.deepEqual(renderedTabs, ["Ventas del dia"]);
  assert.match(html, /Registro de ventas del dia/);
});

test("public payment page includes the payment bell and compact mobile styles", () => {
  const source = readFileSync(
    new URL("../src/app/pagar/[token]/payment-page-client.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /payment-success\.mp3/);
  assert.match(source, /px-3 py-4/);
  assert.match(source, /link\.notes/);
});

test("payment link notes are sent to the API and persisted", () => {
  const dashboardSource = readFileSync(
    new URL("../src/app/(dashboard)/dashboard-client.js", import.meta.url),
    "utf8",
  );
  const linkSource = readFileSync(
    new URL("../src/lib/pos/payment-links.js", import.meta.url),
    "utf8",
  );
  const setupSource = readFileSync(
    new URL("../scripts/setup-database.js", import.meta.url),
    "utf8",
  );

  assert.match(dashboardSource, /notes: paymentLinkNotes/);
  assert.match(
    linkSource,
    /const notes = text\(input\.notes\)\.slice\(0, 300\)/,
  );
  assert.match(linkSource, /notes,/);
  assert.match(setupSource, /key: "notes", size: 300/);
});
