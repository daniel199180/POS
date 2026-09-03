"use client";

import { useState } from "react";
import { ChartNoAxesCombined, RefreshCw } from "lucide-react";
import { localReportDate, shiftReportDate } from "@/lib/pos/report-dates";
import {
  buttonClass,
  inputClass,
  money,
  number,
  dateLabel,
  dateTime,
  categories,
  useAdminReport,
  ReportState,
  Panel,
  CategoryBar,
  CategoryLegend,
} from "../report-components";
import { DailyChart, Distribution, HourlyChart } from "./sales-charts";

function Change({ value }) {
  return (
    <p
      className={`mt-1 text-xs ${value === null ? "text-neutral-500" : value >= 0 ? "text-emerald-300" : "text-amber-300"}`}
    >
      {value === null
        ? "Sin base en el período anterior"
        : `${value > 0 ? "+" : ""}${number(value)}% frente al período anterior`}
    </p>
  );
}

export default function AnalyticsClient({ options, initialFilters }) {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const { data, loading, error, refresh } = useAdminReport(
    "/api/pos/admin/analytics",
    filters,
  );
  const setField = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  function preset(value) {
    const today = localReportDate();
    const dateFrom =
      value === "month"
        ? `${today.slice(0, 7)}-01`
        : shiftReportDate(today, 1 - Number(value));
    const next = { ...draft, dateFrom, dateTo: today };
    setDraft(next);
    setFilters(next);
  }
  const summary = data?.summary;
  const maxBranch = Math.max(
    ...(data?.branches || []).map((branch) => branch.total),
    1,
  );

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-violet-300">ADMINISTRACIÓN</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
            <ChartNoAxesCombined className="size-6" />
            Analíticas de ventas
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Compara sucursales, identifica qué genera ingresos y revisa la
            actividad de cada cajero.
          </p>
        </div>
        <button
          type="button"
          className={buttonClass}
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...draft });
        }}
        className="rounded-lg border border-neutral-800 bg-neutral-900 p-3"
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {[
            ["1", "Hoy"],
            ["7", "Últimos 7 días"],
            ["30", "Últimos 30 días"],
            ["month", "Este mes"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={`${buttonClass} h-7 text-xs`}
              onClick={() => preset(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs text-neutral-400">
            Desde
            <input
              type="date"
              required
              value={draft.dateFrom}
              className={inputClass}
              onChange={(event) => setField("dateFrom", event.target.value)}
            />
          </label>
          <label className="text-xs text-neutral-400">
            Hasta
            <input
              type="date"
              required
              min={draft.dateFrom}
              value={draft.dateTo}
              className={inputClass}
              onChange={(event) => setField("dateTo", event.target.value)}
            />
          </label>
          <label className="text-xs text-neutral-400">
            Sucursal
            <select
              value={draft.branchId}
              className={inputClass}
              onChange={(event) => setField("branchId", event.target.value)}
            >
              <option value="">Todas las sucursales</option>
              {options.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.isActive ? "" : " (inactiva)"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-400">
            Cajero
            <select
              value={draft.cashierId}
              className={inputClass}
              onChange={(event) => setField("cashierId", event.target.value)}
            >
              <option value="">Todos los cajeros</option>
              {options.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                  {user.isActive ? "" : " (inactivo)"}
                </option>
              ))}
            </select>
          </label>
          <button
            className={`${buttonClass} bg-neutral-100 text-neutral-950`}
            disabled={loading}
          >
            Aplicar filtros
          </button>
        </div>
      </form>
      <ReportState loading={loading} error={error} />
      {data ? (
        <>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-neutral-400">
            <span>
              {dateLabel(data.range.dateFrom)} – {dateLabel(data.range.dateTo)}{" "}
              · Comparado con {dateLabel(data.range.previousFrom)} –{" "}
              {dateLabel(data.range.previousTo)}
            </span>
            <span>
              Actualizado: {dateTime(data.generatedAt)} · Hora de Bolivia
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-violet-800 bg-violet-950/30 p-4">
              <p className="text-xs text-violet-200">Ingresos cobrados</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {money(summary.total)}
              </p>
              <Change value={summary.revenueChange} />
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs text-neutral-400">Ventas completadas</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {number(summary.count)}
              </p>
              <Change value={summary.countChange} />
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs text-neutral-400">Ticket promedio</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {money(summary.averageTicket)}
              </p>
              <Change value={summary.ticketChange} />
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs text-neutral-400">
                Ventas anuladas / devueltas
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {number(summary.reversals)}{" "}
                <span className="text-sm text-neutral-400">
                  ({number(summary.reversalRate)}%)
                </span>
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {money(summary.reversedTotal)} excluidos de ingresos
              </p>
            </div>
          </div>
          {!summary.count ? (
            <p className="rounded-md border border-neutral-700 bg-neutral-900 p-4 text-sm text-neutral-400">
              No hay ventas completadas en este período con los filtros
              seleccionados.
            </p>
          ) : null}
          {summary.incompleteSales ? (
            <p className="rounded-md border border-amber-900 bg-amber-950/30 p-3 text-xs text-amber-200">
              {summary.incompleteSales} ventas tienen detalle faltante o
              inconsistente. Los totales se toman de la venta; los importes sin
              detalle se muestran aparte.
            </p>
          ) : null}
          <Panel
            title="Evolución de los ingresos"
            description="Importes diarios en Bs. Pasa sobre una barra para ver su detalle."
          >
            <DailyChart rows={data.daily} />
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Ingresos por tipo de cobro"
              description="Las ventas mixtas se reparten según los ítems cobrados."
            >
              <Distribution
                entries={categories.map((category) => ({
                  name: category.name,
                  color: category.color,
                  value: summary.categories[category.key],
                }))}
                total={summary.total}
              />
            </Panel>
            <Panel
              title="Métodos de pago"
              description="Efectivo neto de cambio y pagos digitales de ventas completadas."
            >
              <Distribution
                entries={[
                  {
                    name: "Efectivo",
                    value: summary.payments.cash,
                    color: "#34d399",
                  },
                  { name: "QR", value: summary.payments.qr, color: "#22d3ee" },
                  {
                    name: "Tarjeta",
                    value: summary.payments.card,
                    color: "#a78bfa",
                  },
                  ...(summary.payments.other
                    ? [
                        {
                          name: "Otros",
                          value: summary.payments.other,
                          color: "#a3a3a3",
                        },
                      ]
                    : []),
                ]}
                total={summary.total}
              />
            </Panel>
          </div>
          <Panel
            title="Origen de los pagos"
            description="Distingue los cobros realizados directamente en caja de los pagados mediante un enlace compartido."
          >
            <Distribution
              entries={[
                {
                  name: "POS directo",
                  value: summary.channels.pos,
                  color: "#737373",
                },
                {
                  name: "Enlace de pago",
                  value: summary.channels.paymentLink,
                  color: "#fbbf24",
                },
              ]}
              total={summary.total}
            />
          </Panel>
          <Panel
            title="Comparación entre sucursales"
            description="Participación en los ingresos del período seleccionado. Incluye sucursales sin ventas."
          >
            <CategoryLegend />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1150px] text-right text-sm">
                <thead className="text-xs text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Sucursal</th>
                    {[
                      "Ventas",
                      "Ingresos",
                      "Participación",
                      "Ticket promedio",
                      "Efectivo",
                      "QR",
                      "Tarjeta / otros",
                      "Por enlace",
                      "Anuladas",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-3 py-2 font-medium whitespace-nowrap"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.branches.map((branch) => (
                    <tr key={branch.id} className="border-t border-neutral-800">
                      <td className="min-w-44 px-3 py-3 text-left">
                        <span className="mb-2 block font-medium">
                          {branch.name}
                        </span>
                        <CategoryBar
                          values={branch.categories}
                          max={maxBranch}
                        />
                      </td>
                      <td className="px-3 py-3">{branch.count}</td>
                      <td className="px-3 py-3 font-semibold whitespace-nowrap">
                        {money(branch.total)}
                      </td>
                      <td className="px-3 py-3 text-neutral-400">
                        {summary.total
                          ? number((branch.total / summary.total) * 100)
                          : 0}
                        %
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {money(branch.averageTicket)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-emerald-300">
                        {money(branch.payments.cash)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-cyan-300">
                        {money(branch.payments.qr)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {money(branch.payments.card + branch.payments.other)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-amber-300">
                        {money(branch.channels.paymentLink)}
                      </td>
                      <td className="px-3 py-3 text-neutral-400">
                        {branch.reversals}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel
              title="Productos con más ingresos"
              description="Los 10 principales del catálogo, ordenados por ingreso. Excluye mensualidades y cobros personalizados."
            >
              {!data.products.length ? (
                <p className="py-8 text-center text-sm text-neutral-500">
                  No hay ventas de productos en este período.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="text-xs text-neutral-500">
                      <tr>
                        <th className="pb-2 text-left font-medium">Producto</th>
                        <th className="px-3 pb-2 font-medium">Cantidad</th>
                        <th className="pb-2 font-medium">Ingresos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.products.map((product) => (
                        <tr
                          className="border-t border-neutral-800"
                          key={product.id}
                        >
                          <td className="py-2 text-left">
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-neutral-500">
                              {product.sku}
                            </p>
                          </td>
                          <td className="px-3 py-2">
                            {number(product.quantity)}
                          </td>
                          <td className="py-2 whitespace-nowrap text-emerald-300">
                            {money(product.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel
              title="Horas de mayor actividad"
              description="Número de ventas por hora, acumulado en el período. Ayuda a planificar turnos de caja."
            >
              <HourlyChart rows={data.hourly} />
            </Panel>
          </div>
          <Panel
            title="Actividad por cajero"
            description="Volumen de cobros e ingresos registrados por usuario. El volumen depende también de sus turnos y sucursales."
          >
            {!data.cashiers.length ? (
              <p className="text-sm text-neutral-500">
                Sin actividad para mostrar.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-right text-sm">
                  <thead className="text-xs text-neutral-500">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">
                        Cajero
                      </th>
                      {[
                        "Ventas",
                        "Ingresos",
                        "Ticket promedio",
                        "Productos",
                        "Mensualidades",
                        "Personalizados",
                        "Por enlace",
                      ].map((title) => (
                        <th key={title} className="px-2 py-2 font-medium">
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.cashiers.map((cashier) => (
                      <tr
                        key={cashier.id}
                        className="border-t border-neutral-800"
                      >
                        <td className="px-2 py-2 text-left font-medium">
                          {cashier.name}
                        </td>
                        <td className="px-2 py-2">{cashier.count}</td>
                        {[
                          cashier.total,
                          cashier.averageTicket,
                          cashier.categories.products,
                          cashier.categories.monthly,
                          cashier.categories.custom,
                          cashier.channels.paymentLink,
                        ].map((amount, index) => (
                          <td
                            className="px-2 py-2 whitespace-nowrap"
                            key={index}
                          >
                            {money(amount)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <p className="text-xs leading-relaxed text-neutral-500">
            Los ingresos incluyen únicamente ventas completadas en el POS. Las
            anulaciones se agrupan por la fecha original de la venta. El ticket
            promedio es ingresos / ventas completadas. Estos importes no
            representan utilidad: no hay costos históricos guardados por venta.
            Los cobros de mensualidades corresponden a registros del POS, no a
            la deuda pendiente en Control Instituto.
          </p>
        </>
      ) : null}
    </section>
  );
}
