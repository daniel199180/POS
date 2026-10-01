"use client";

import { useMemo, useState } from "react";
import {
  GraduationCap,
  Link2,
  ListChecks,
  Loader2,
  Package,
  Plus,
  QrCode,
} from "lucide-react";

const tabOptions = [
  {
    id: "products",
    label: "Productos",
    description: "Catálogo, buscador y venta de productos.",
    Icon: Package,
    tone: "text-emerald-300 bg-emerald-950 border-emerald-900",
  },
  {
    id: "monthly",
    label: "Mensualidades",
    description: "Consulta y cobro de cuotas de estudiantes.",
    Icon: GraduationCap,
    tone: "text-cyan-300 bg-cyan-950 border-cyan-900",
  },
  {
    id: "custom",
    label: "Cobro personalizado",
    description: "Cobros libres sin un producto del catálogo.",
    Icon: Plus,
    tone: "text-neutral-200 bg-neutral-950 border-neutral-700",
  },
  {
    id: "staticQr",
    label: "QR estático",
    description: "QR reutilizable sin monto fijo y consulta de pagos.",
    Icon: QrCode,
    tone: "text-violet-300 bg-violet-950 border-violet-900",
  },
  {
    id: "links",
    label: "Cobro por enlace",
    description: "Enlaces compartibles y seguimiento de sus pagos.",
    Icon: Link2,
    tone: "text-amber-200 bg-amber-950 border-amber-900",
  },
  {
    id: "daily",
    label: "Ventas del día",
    description: "Detalle de ingresos para el cuadre diario.",
    Icon: ListChecks,
    tone: "text-violet-300 bg-violet-950 border-violet-900",
  },
];

const defaultTabs = Object.fromEntries(tabOptions.map(({ id }) => [id, true]));

export default function PosTabsSettings({
  branchId,
  branchName,
  initialSettings,
  canManage,
  onChange,
}) {
  const [tabs, setTabs] = useState({
    ...defaultTabs,
    ...(initialSettings?.tabs || initialSettings || {}),
  });
  const [savingTab, setSavingTab] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const activeCount = useMemo(
    () => tabOptions.filter(({ id }) => tabs[id]).length,
    [tabs],
  );

  async function toggleTab(tabId) {
    if (!canManage || !branchId || savingTab) return;

    const nextTabs = { ...tabs, [tabId]: !tabs[tabId] };
    if (!Object.values(nextTabs).some(Boolean)) {
      setError("Debes mantener al menos una pestaña activa.");
      return;
    }

    const previousTabs = tabs;
    setTabs(nextTabs);
    setSavingTab(tabId);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/pos/manage/payments/tabs", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ branchId, tabs: nextTabs }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message || "No se pudo guardar la configuración.",
        );
      }

      setTabs(payload.tabs);
      onChange?.(payload);
      setMessage(`Las pestañas de ${branchName} fueron actualizadas.`);
    } catch (saveError) {
      setTabs(previousTabs);
      setError(saveError.message || "No se pudo guardar la configuración.");
    } finally {
      setSavingTab("");
    }
  }

  return (
    <div className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
      <div className="flex flex-col gap-2 border-b border-neutral-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.12em] text-neutral-500 uppercase">
            Punto de venta
          </p>
          <h2 className="mt-1 text-lg font-semibold text-neutral-100">
            Pestañas disponibles
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Define qué herramientas pueden ver los cajeros en {branchName}.
          </p>
        </div>
        <span className="w-fit rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs font-medium text-neutral-300">
          {activeCount} de {tabOptions.length} activas
        </span>
      </div>

      <div className="divide-y divide-neutral-800">
        {tabOptions.map(({ id, label, description, Icon, tone }) => {
          const isActive = tabs[id];
          const isLastActive = isActive && activeCount === 1;

          return (
            <div
              key={id}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-neutral-800/40"
            >
              <div
                className={`grid size-10 shrink-0 place-items-center rounded-md border ${tone}`}
              >
                <Icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-100">
                  {label}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`hidden text-xs sm:block ${isActive ? "text-emerald-300" : "text-neutral-500"}`}
                >
                  {isActive ? "Activa" : "Oculta"}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  aria-label={`${isActive ? "Desactivar" : "Activar"} ${label}`}
                  title={
                    isLastActive
                      ? "Debe quedar al menos una pestaña activa"
                      : undefined
                  }
                  disabled={
                    !canManage ||
                    !branchId ||
                    Boolean(savingTab) ||
                    isLastActive
                  }
                  onClick={() => toggleTab(id)}
                  className={`relative h-7 w-12 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isActive
                      ? "border-emerald-400 bg-emerald-400"
                      : "border-neutral-700 bg-neutral-950"
                  }`}
                >
                  <span
                    className={`absolute top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-white text-neutral-950 shadow transition ${
                      isActive ? "left-6" : "left-1"
                    }`}
                  >
                    {savingTab === id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : null}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {message || error ? (
        <p
          className={`border-t px-4 py-3 text-xs ${
            error
              ? "border-red-900 bg-red-950/60 text-red-200"
              : "border-emerald-900 bg-emerald-950/50 text-emerald-200"
          }`}
          role="status"
        >
          {error || message}
        </p>
      ) : null}
    </div>
  );
}
