import {
  DEFAULT_TIME_ZONE,
  localDate,
  localDateRange,
  shiftCalendarDate,
} from "./time-zone.js";

export function reportInputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function localReportDate(
  value = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
) {
  return localDate(value, timeZone);
}

export function shiftReportDate(value, days) {
  return shiftCalendarDate(value, days);
}

export function defaultReportFilters(timeZone = DEFAULT_TIME_ZONE) {
  const dateTo = localReportDate(new Date(), timeZone);
  return {
    dateFrom: shiftReportDate(dateTo, -29),
    dateTo,
    branchId: "",
    cashierId: "",
  };
}

export function parseReportRange(filters = {}, timeZone = DEFAULT_TIME_ZONE) {
  const defaults = defaultReportFilters(timeZone);
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
  let days = 0;
  for (
    let cursor = dateFrom;
    cursor <= dateTo;
    cursor = shiftReportDate(cursor, 1)
  ) {
    days += 1;
  }
  if (days < 1 || days > 366)
    throw reportInputError("Selecciona un período de 1 a 366 días.");
  const previousDateFrom = shiftReportDate(dateFrom, -days);
  const previousDateTo = shiftReportDate(dateFrom, -1);
  const previousRange = localDateRange(
    previousDateFrom,
    previousDateTo,
    timeZone,
  );
  return {
    dateFrom,
    dateTo,
    days,
    ...localDateRange(dateFrom, dateTo, timeZone),
    previousFrom: previousDateFrom,
    previousTo: previousDateTo,
    previousRangeFrom: previousRange.from,
    previousRangeTo: previousRange.to,
    timeZone,
  };
}
