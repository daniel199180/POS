"use client";

import {
  categories,
  money,
  number,
  dateLabel,
  CategoryLegend,
} from "../report-components";

export function DailyChart({ rows }) {
  const width = 1000,
    height = 230,
    left = 70,
    top = 16,
    bottom = 32;
  const plotHeight = height - top - bottom;
  const max = Math.max(...rows.map((row) => row.total), 1);
  const step = (width - left - 16) / Math.max(rows.length, 1);
  const barWidth = Math.min(28, step * 0.8);
  const ticks = [
    ...new Set([
      0,
      Math.floor((rows.length - 1) / 3),
      Math.floor(((rows.length - 1) * 2) / 3),
      rows.length - 1,
    ]),
  ];
  return (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 w-full"
        role="img"
        aria-label="Ingresos diarios, separados en productos, mensualidades y cobros personalizados"
      >
        {[0, 0.5, 1].map((part) => (
          <g key={part}>
            <line
              x1={left}
              y1={top + plotHeight * (1 - part)}
              x2={width - 16}
              y2={top + plotHeight * (1 - part)}
              stroke="#303030"
              strokeDasharray="3 4"
            />
            <text
              x={left - 10}
              y={top + plotHeight * (1 - part) + 4}
              textAnchor="end"
              fontSize="11"
              fill="#a3a3a3"
            >
              {number(max * part)}
            </text>
          </g>
        ))}
        {rows.map((row, index) => {
          let cumulative = 0;
          return (
            <g
              key={row.date}
              tabIndex={0}
              role="img"
              aria-label={`${dateLabel(row.date)}: ${money(row.total)}, ${row.count} ventas`}
            >
              <title>{`${dateLabel(row.date)} · ${money(row.total)} · ${row.count} ventas\n${categories.map((category) => `${category.name}: ${money(row.categories[category.key])}`).join("\n")}`}</title>
              {categories.map((category) => {
                const value = row.categories[category.key];
                const y = top + plotHeight * (1 - (cumulative + value) / max);
                cumulative += value;
                return (
                  <rect
                    key={category.key}
                    x={left + step * (index + 0.5) - barWidth / 2}
                    y={y}
                    width={barWidth}
                    height={(plotHeight * value) / max}
                    fill={category.color}
                  />
                );
              })}
            </g>
          );
        })}
        {ticks.map((index) =>
          rows[index] ? (
            <text
              key={index}
              x={left + step * (index + 0.5)}
              y={height - 8}
              fontSize="11"
              textAnchor="middle"
              fill="#a3a3a3"
            >
              {dateLabel(rows[index].date).slice(0, 5)}
            </text>
          ) : null,
        )}
        <text x={left} y={10} fontSize="10" fill="#737373">
          Bs
        </text>
      </svg>
      <CategoryLegend />
      <details className="mt-3 text-xs text-neutral-400">
        <summary className="cursor-pointer">Ver importes por día</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-right">
            <thead>
              <tr>
                <th className="p-2 text-left">Fecha</th>
                <th className="p-2">Ventas</th>
                {categories.map((category) => (
                  <th className="p-2" key={category.key}>
                    {category.name}
                  </th>
                ))}
                <th className="p-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date} className="border-t border-neutral-800">
                  <td className="p-2 text-left">{dateLabel(row.date)}</td>
                  <td className="p-2">{row.count}</td>
                  {categories.map((category) => (
                    <td className="p-2 whitespace-nowrap" key={category.key}>
                      {money(row.categories[category.key])}
                    </td>
                  ))}
                  <td className="p-2 whitespace-nowrap text-neutral-100">
                    {money(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function Distribution({ entries, total }) {
  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <div key={entry.name}>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <span className="text-neutral-300">{entry.name}</span>
            <span className="font-medium whitespace-nowrap">
              {money(entry.value)}{" "}
              <span className="ml-1 font-normal text-neutral-500">
                {total ? number((entry.value / total) * 100) : 0}%
              </span>
            </span>
          </div>
          <div className="h-2 rounded bg-neutral-800">
            <div
              className="h-full rounded"
              style={{
                width: `${total ? (entry.value / total) * 100 : 0}%`,
                backgroundColor: entry.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HourlyChart({ rows }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <>
      <svg
        viewBox="0 0 720 190"
        className="w-full"
        role="img"
        aria-label="Número de ventas por hora, horario de Bolivia"
      >
        {[0, 0.5, 1].map((part) => (
          <g key={part}>
            <line
              x1="30"
              x2="712"
              y1={155 - 135 * part}
              y2={155 - 135 * part}
              stroke="#303030"
            />
            <text
              x="23"
              y={159 - 135 * part}
              fontSize="10"
              textAnchor="end"
              fill="#a3a3a3"
            >
              {number(max * part)}
            </text>
          </g>
        ))}
        {rows.map((row) => (
          <g
            key={row.hour}
            tabIndex={0}
            role="img"
            aria-label={`${row.hour}:00: ${row.count} ventas, ${money(row.total)}`}
          >
            <title>{`${row.hour}:00 · ${row.count} ventas · ${money(row.total)}`}</title>
            <rect
              x={35 + row.hour * 28}
              y={155 - (row.count / max) * 135}
              width="19"
              height={(row.count / max) * 135}
              rx="2"
              fill="#a78bfa"
            />
            {row.hour % 3 === 0 ? (
              <text
                x={44 + row.hour * 28}
                y="177"
                textAnchor="middle"
                fontSize="10"
                fill="#a3a3a3"
              >
                {String(row.hour).padStart(2, "0")}:00
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <details className="text-xs text-neutral-400">
        <summary className="cursor-pointer">
          Ver ventas e ingresos por hora
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {rows.map((row) => (
            <p key={row.hour}>
              {String(row.hour).padStart(2, "0")}:00 · {row.count} ventas ·{" "}
              {money(row.total)}
            </p>
          ))}
        </div>
      </details>
    </>
  );
}
