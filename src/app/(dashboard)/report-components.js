"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export const inputClass =
  "mt-1 h-9 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-100 outline-none focus:border-neutral-300";
export const buttonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-50";
export const money = (value) =>
  new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    maximumFractionDigits: 2,
  }).format(value || 0);
export const number = (value) =>
  new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 }).format(
    value || 0,
  );
export const dateLabel = (value) =>
  value?.split("-").reverse().join("/") || "—";
export const dateTime = (value, timeZone = "America/La_Paz") =>
  new Intl.DateTimeFormat("es-BO", {
    timeZone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

export const categories = [
  { key: "products", name: "Productos", color: "#34d399" },
  { key: "monthly", name: "Mensualidades", color: "#22d3ee" },
  { key: "custom", name: "Cobros personalizados", color: "#a78bfa" },
  { key: "unclassified", name: "Sin detalle", color: "#a3a3a3" },
];

export function useAdminReport(url, filters) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, loading: true, error: "" });
    async function load() {
      try {
        const response = await fetch(`${url}?${new URLSearchParams(filters)}`, {
          signal: controller.signal,
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message || "No se pudo cargar el reporte.");
        if (!controller.signal.aborted)
          setState({ data, loading: false, error: "" });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({ data: null, loading: false, error: error.message });
      }
    }
    load();
    return () => controller.abort();
  }, [url, filters, revision]);
  return { ...state, refresh: () => setRevision((value) => value + 1) };
}

export function ReportState({ loading, error }) {
  if (loading)
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400"
      >
        <Loader2 className="size-4 animate-spin" />
        Cargando registros…
      </div>
    );
  if (error)
    return (
      <p
        role="alert"
        className="rounded-md border border-red-900 bg-red-950/50 p-4 text-sm text-red-200"
      >
        {error}
      </p>
    );
  return null;
}

export function Panel({ title, description, children, className = "" }) {
  return (
    <section
      className={`min-w-0 rounded-lg border border-neutral-800 bg-neutral-900 p-4 ${className}`}
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 text-xs text-neutral-400">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function CategoryLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-neutral-400">
      {categories.map((category) => (
        <span key={category.key} className="inline-flex items-center gap-1.5">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: category.color }}
          />
          {category.name}
        </span>
      ))}
    </div>
  );
}

export function CategoryBar({ values, max }) {
  return (
    <div
      className="flex h-2 overflow-hidden rounded bg-neutral-800"
      aria-hidden="true"
    >
      {categories.map((category) => (
        <span
          key={category.key}
          style={{
            backgroundColor: category.color,
            width: `${max > 0 ? (values[category.key] / max) * 100 : 0}%`,
          }}
        />
      ))}
    </div>
  );
}
