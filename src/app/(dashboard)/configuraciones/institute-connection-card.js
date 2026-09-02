"use client";

import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Save, Wifi } from "lucide-react";

export default function InstituteConnectionCard({ initialSettings, canManage }) {
  const [settings, setSettings] = useState(initialSettings);
  const [baseUrl, setBaseUrl] = useState(initialSettings.baseUrl || "");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  async function readJson(response, fallback) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || fallback);
    return payload;
  }

  async function saveConnection(event) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/pos/settings/instituto", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ baseUrl, token }),
      });
      const payload = await readJson(response, "No se pudo guardar la conexión.");
      setSettings(payload.settings);
      setBaseUrl(payload.settings.baseUrl || "");
      setToken("");
      setShowToken(false);
      setMessage("Conexión guardada. El token quedó cifrado en el POS.");
    } catch (saveError) {
      setError(saveError.message || "No se pudo guardar la conexión.");
    } finally {
      setIsSaving(false);
    }
  }

  async function testConnection() {
    setIsTesting(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/pos/settings/instituto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ baseUrl, token }),
      });
      const payload = await readJson(response, "No se pudo verificar la conexión.");
      setMessage(payload.message || "Conexión verificada.");
    } catch (testError) {
      setError(testError.message || "No se pudo verificar la conexión.");
    } finally {
      setIsTesting(false);
    }
  }

  const busy = isSaving || isTesting;

  return (
    <form onSubmit={saveConnection} className="rounded-md border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-neutral-500 uppercase">Integración</p>
          <h2 className="mt-1 text-lg font-semibold">Control Instituto</h2>
          <p className="mt-1 text-sm text-neutral-500">Pega los datos generados en Control Instituto para registrar mensualidades desde este POS.</p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${settings.configured && settings.enabled ? "border-emerald-900 bg-emerald-950 text-emerald-200" : "border-yellow-900 bg-yellow-950 text-yellow-200"}`}>
          <CheckCircle2 className="size-3.5" />
          {settings.configured && settings.enabled ? "Configurada" : "Pendiente"}
        </span>
      </div>

      {settings.source === "entorno" ? (
        <div className="mt-4 rounded-md border border-blue-900 bg-blue-950 px-3 py-2 text-sm text-blue-200">
          Hay una conexión antigua desde variables de entorno. Guarda estos datos aquí para administrarla desde el POS.
        </div>
      ) : null}
      {message ? <div className="mt-4 rounded-md border border-emerald-900 bg-emerald-950 px-3 py-2 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="mt-4 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-200">{error}</div> : null}

      <label className="mt-5 block text-sm font-medium text-neutral-300">
        URL base de Control Instituto
        <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} disabled={!canManage || busy} placeholder="http://localhost:3000" className="mt-2 block h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60" />
      </label>

      <label className="mt-4 block text-sm font-medium text-neutral-300">
        Token de acceso
        <div className="relative mt-2">
          <input type={showToken ? "text" : "password"} value={token} onChange={(event) => setToken(event.target.value)} disabled={!canManage || busy} placeholder={settings.configured ? "Déjalo vacío para conservar el token actual" : "Pega el token generado"} className="block h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 py-2 pr-12 pl-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60" />
          <button type="button" onClick={() => setShowToken((current) => !current)} disabled={!canManage || busy} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-neutral-500 hover:text-neutral-100 disabled:cursor-not-allowed" aria-label={showToken ? "Ocultar token" : "Mostrar token"}>
            {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <span className="mt-2 block text-xs font-normal text-neutral-500">El token se cifra antes de almacenarse y no vuelve a mostrarse. Actual: {settings.tokenPrefix || "sin token"}.</span>
      </label>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={!canManage || busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-neutral-100 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400">
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Guardar conexión
        </button>
        <button type="button" onClick={testConnection} disabled={!canManage || busy || !baseUrl || (!token && !settings.configured)} className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-neutral-700 px-4 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50">
          {isTesting ? <Loader2 className="size-4 animate-spin" /> : <Wifi className="size-4" />}
          Probar conexión
        </button>
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-3 text-sm text-neutral-500"><KeyRound className="mt-0.5 size-4 shrink-0" /><span>En Control Instituto abre <strong className="font-semibold text-neutral-300">API y accesos</strong>, genera el token y pégalo aquí junto con la URL base.</span></div>
    </form>
  );
}
