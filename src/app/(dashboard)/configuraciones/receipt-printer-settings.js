"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  PlugZap,
  Printer,
  RefreshCw,
  Save,
  TriangleAlert,
} from "lucide-react";
import {
  DEFAULT_RECEIPT_PRINTER_SETTINGS,
  getReceiptPrinterSettings,
  listReceiptPrinters,
  normalizeReceiptPrinterSettings,
  printTestReceipt,
  saveReceiptPrinterSettings,
} from "@/lib/pos/receipt-printing";

function Toggle({ checked, disabled, label, description, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-neutral-800 bg-neutral-950 p-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 rounded border-neutral-700 bg-neutral-900 accent-neutral-100"
      />
      <span>
        <span className="block text-sm font-semibold text-neutral-200">
          {label}
        </span>
        {description ? (
          <span className="mt-1 block text-xs leading-5 text-neutral-500">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export default function ReceiptPrinterSettings({ canManage }) {
  const [settings, setSettings] = useState(DEFAULT_RECEIPT_PRINTER_SETTINGS);
  const [printers, setPrinters] = useState([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSettings(getReceiptPrinterSettings());
  }, []);

  function update(field, value) {
    setSettings((current) =>
      normalizeReceiptPrinterSettings({ ...current, [field]: value }),
    );
    setMessage("");
    setError("");
  }

  async function refreshPrinters() {
    setIsLoadingPrinters(true);
    setMessage("");
    setError("");

    try {
      const available = await listReceiptPrinters();
      setPrinters(available);
      setSettings((current) => ({
        ...current,
        printerName:
          current.printerName || (available.length === 1 ? available[0] : ""),
      }));
      setMessage(
        available.length
          ? `${available.length} impresora${available.length === 1 ? " encontrada" : "s encontradas"}.`
          : "QZ Tray está conectado, pero no reportó impresoras instaladas.",
      );
    } catch {
      setPrinters([]);
      setError(
        "No se pudo conectar con QZ Tray. Instálalo, ábrelo y vuelve a buscar.",
      );
    } finally {
      setIsLoadingPrinters(false);
    }
  }

  function save(event) {
    event.preventDefault();

    if (!canManage) return;

    const saved = saveReceiptPrinterSettings(settings);
    setSettings(saved);
    setError("");
    setMessage("Configuración de impresión guardada en esta computadora.");
  }

  async function testPrint() {
    if (!canManage) return;

    setIsTesting(true);
    setMessage("");
    setError("");

    try {
      const testSettings = normalizeReceiptPrinterSettings({
        ...settings,
        enabled: true,
      });
      await printTestReceipt(testSettings);
      setMessage(
        testSettings.mode === "browser"
          ? "Recibo preparado. Elige la impresora en el diálogo del sistema."
          : `Prueba enviada a ${testSettings.printerName}.`,
      );
    } catch (printError) {
      setError(
        printError.message || "No se pudo imprimir el recibo de prueba.",
      );
    } finally {
      setIsTesting(false);
    }
  }

  const directMode = settings.mode === "qz";
  const disabled = !canManage;

  return (
    <form
      onSubmit={save}
      className="rounded-md border border-neutral-800 bg-neutral-900 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-md bg-cyan-950 text-cyan-300">
            <Printer className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase">
              Recibos
            </p>
            <h2 className="mt-1 text-lg font-semibold">Impresora térmica</h2>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              Compatible con impresoras pequeñas instaladas en Windows, macOS o
              Linux. Esta configuración se guarda solo en esta computadora.
            </p>
          </div>
        </div>
        <span
          className={
            settings.enabled
              ? "rounded-md border border-emerald-900 bg-emerald-950 px-3 py-1.5 text-xs font-medium text-emerald-200"
              : "rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs font-medium text-neutral-400"
          }
        >
          {settings.enabled ? "Activa" : "Inactiva"}
        </span>
      </div>

      {message ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-emerald-900 bg-emerald-950 px-3 py-2.5 text-sm text-emerald-200">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-900 bg-red-950 px-3 py-2.5 text-sm text-red-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <Toggle
          checked={settings.enabled}
          disabled={disabled}
          onChange={(value) => update("enabled", value)}
          label="Habilitar recibos"
          description="Permite imprimir al cobrar y reimprimir desde Ventas."
        />
        <Toggle
          checked={settings.autoPrint}
          disabled={disabled || !settings.enabled}
          onChange={(value) => update("autoPrint", value)}
          label="Imprimir automáticamente"
          description="La venta se guarda aunque la impresión falle o sea cancelada."
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="block text-sm font-medium text-neutral-300 md:col-span-2">
          Método de impresión
          <select
            value={settings.mode}
            disabled={disabled}
            onChange={(event) => update("mode", event.target.value)}
            className="mt-2 block h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-200 disabled:opacity-60"
          >
            <option value="browser">Diálogo del sistema (universal)</option>
            <option value="qz">Directa con QZ Tray</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-300">
          Ancho del papel
          <select
            value={settings.paperWidth}
            disabled={disabled}
            onChange={(event) => update("paperWidth", event.target.value)}
            className="mt-2 block h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-200 disabled:opacity-60"
          >
            <option value="58">58 mm</option>
            <option value="80">80 mm</option>
          </select>
        </label>
      </div>

      {directMode ? (
        <div className="mt-4 rounded-md border border-cyan-950 bg-neutral-950 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
                <PlugZap className="size-4 text-cyan-300" />
                Impresión directa
              </p>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                Requiere QZ Tray abierto en la computadora de la caja. La
                primera conexión puede pedir confirmación de confianza.
              </p>
            </div>
            <a
              href="https://qz.io/download/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-xs font-semibold text-neutral-300 transition hover:border-neutral-400 hover:text-white"
            >
              Descargar QZ Tray
              <ExternalLink className="size-3.5" />
            </a>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1 text-sm font-medium text-neutral-300">
              Impresora instalada
              <select
                value={settings.printerName}
                disabled={disabled || isLoadingPrinters}
                onChange={(event) => update("printerName", event.target.value)}
                className="mt-2 block h-11 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-200 disabled:opacity-60"
              >
                <option value="">Selecciona una impresora</option>
                {settings.printerName &&
                !printers.includes(settings.printerName) ? (
                  <option value={settings.printerName}>
                    {settings.printerName} (guardada)
                  </option>
                ) : null}
                {printers.map((printer) => (
                  <option key={printer} value={printer}>
                    {printer}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={refreshPrinters}
              disabled={disabled || isLoadingPrinters}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-neutral-700 px-4 text-sm font-semibold text-neutral-200 transition hover:border-neutral-400 disabled:opacity-50"
            >
              {isLoadingPrinters ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Buscar impresoras
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <Toggle
              checked={settings.escPos}
              disabled={disabled}
              onChange={(value) => update("escPos", value)}
              label="Modo ESC/POS"
              description="Úsalo si tu impresora admite comandos térmicos."
            />
            <Toggle
              checked={settings.cutPaper}
              disabled={disabled || !settings.escPos}
              onChange={(value) => update("cutPaper", value)}
              label="Cortar papel"
              description="Envía el comando de corte al terminar."
            />
            <Toggle
              checked={settings.openDrawer}
              disabled={disabled || !settings.escPos}
              onChange={(value) => update("openDrawer", value)}
              label="Abrir cajón"
              description="Solo en pagos en efectivo y si está conectado a la impresora."
            />
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-3 text-sm leading-6 text-neutral-500">
          El modo universal abre el diálogo de impresión del navegador. Allí
          eliges cualquier impresora instalada y sus preferencias de papel.
        </p>
      )}

      <div
        className={`mt-4 grid gap-4 ${directMode ? "md:grid-cols-[140px_1fr]" : "grid-cols-1"}`}
      >
        {directMode ? (
          <label className="block text-sm font-medium text-neutral-300">
            Copias
            <select
              value={settings.copies}
              disabled={disabled}
              onChange={(event) => update("copies", event.target.value)}
              className="mt-2 block h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-200 disabled:opacity-60"
            >
              <option value="1">1 copia</option>
              <option value="2">2 copias</option>
              <option value="3">3 copias</option>
            </select>
          </label>
        ) : null}
        <label className="block text-sm font-medium text-neutral-300">
          Mensaje al pie
          <input
            type="text"
            value={settings.footer}
            maxLength={160}
            disabled={disabled}
            onChange={(event) => update("footer", event.target.value)}
            className="mt-2 block h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-200 disabled:opacity-60"
            placeholder="Gracias por su compra."
          />
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-neutral-100 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-white disabled:opacity-50"
        >
          <Save className="size-4" />
          Guardar impresión
        </button>
        <button
          type="button"
          onClick={testPrint}
          disabled={
            disabled || isTesting || (directMode && !settings.printerName)
          }
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-neutral-700 px-4 text-sm font-semibold text-neutral-200 transition hover:border-neutral-400 disabled:opacity-50"
        >
          {isTesting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Printer className="size-4" />
          )}
          Imprimir prueba
        </button>
      </div>
    </form>
  );
}
