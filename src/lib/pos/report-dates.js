const DAY_MS = 86400000;

export function reportInputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function localReportDate(value = new Date()) {
  return new Date(new Date(value).getTime() - 4 * 3600000)
    .toISOString()
    .slice(0, 10);
}

export function shiftReportDate(value, days) {
  return new Date(Date.parse(`${value}T12:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function defaultReportFilters() {
  const dateTo = localReportDate();
  return {
    dateFrom: shiftReportDate(dateTo, -29),
    dateTo,
    branchId: "",
    cashierId: "",
  };
}

export function parseReportRange(filters = {}) {
  const defaults = defaultReportFilters();
  const dateFrom = filters.dateFrom || defaults.dateFrom;
  const dateTo = filters.dateTo || defaults.dateTo;
  for (const value of [dateFrom, dateTo]) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) ||
      new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
    ) {
      throw reportInputError("Selecciona fechas válidas.");
    }
  }
  const days =
    Math.round((Date.parse(dateTo) - Date.parse(dateFrom)) / DAY_MS) + 1;
  if (days < 1 || days > 366)
    throw reportInputError("Selecciona un período de 1 a 366 días.");
  return {
    dateFrom,
    dateTo,
    days,
    from: `${dateFrom}T00:00:00.000-04:00`,
    to: `${dateTo}T23:59:59.999-04:00`,
    previousFrom: shiftReportDate(dateFrom, -days),
    previousTo: shiftReportDate(dateFrom, -1),
  };
}
