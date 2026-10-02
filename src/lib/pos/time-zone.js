export const DEFAULT_TIME_ZONE = "America/La_Paz";

function dateTimeParts(value, timeZone) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: partValue }) => [type, partValue]),
  );
}

export function localDate(value = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = dateTimeParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function localHour(value, timeZone = DEFAULT_TIME_ZONE) {
  return Number(dateTimeParts(value, timeZone).hour);
}

export function shiftCalendarDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function localDateTimeToIso(
  date,
  time = "00:00:00",
  timeZone = DEFAULT_TIME_ZONE,
) {
  const dateMatch = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(time).match(
    /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?/,
  );
  if (!dateMatch || !timeMatch) return "";

  const [, year, month, day] = dateMatch;
  const [, hour, minute, second = "00", fraction = "0"] = timeMatch;
  const milliseconds = Number(fraction.padEnd(3, "0"));
  const localAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds,
  );

  function offsetAt(timestamp) {
    const wholeSecond = Math.floor(timestamp / 1000) * 1000;
    const parts = dateTimeParts(timestamp, timeZone);
    return (
      Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
      ) - wholeSecond
    );
  }

  const firstGuess = localAsUtc - offsetAt(localAsUtc);
  const timestamp = localAsUtc - offsetAt(firstGuess);
  return new Date(timestamp).toISOString();
}

export function localDateRange(dateFrom, dateTo = dateFrom, timeZone) {
  return {
    dateFrom,
    dateTo,
    from: localDateTimeToIso(dateFrom, "00:00:00", timeZone),
    to: localDateTimeToIso(dateTo, "23:59:59.999", timeZone),
  };
}
