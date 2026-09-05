const dayjs = require("dayjs");
dayjs.extend(require("dayjs/plugin/utc"));

/**
 * Whether the given value is a well-formed "YYYY-MM" month — the only check
 * applied before purging. There is deliberately no recency/future
 * restriction: any month, including the current one, can be deleted (an
 * explicit product decision — the admin owns that tradeoff).
 */
const isMonthDeletable = (month) => {
  return /^\d{4}-\d{2}$/.test(month || "");
};

/**
 * Start (inclusive) / end (exclusive) Date bounds for a "YYYY-MM" month.
 * Anchored in UTC — not local time — because that's what Postgres's session
 * timezone (and therefore TO_CHAR(col, 'YYYY-MM') in getAvailableExportMonths)
 * actually uses to decide which calendar month a row belongs to. Computing
 * this in local time here would silently shift the boundary by the local
 * UTC offset and mismatch which rows "belong" to the month.
 */
const getMonthRange = (month) => {
  const start = dayjs.utc(`${month}-01`).startOf("month");
  const end = start.add(1, "month");
  return { start: start.toDate(), end: end.toDate() };
};

module.exports = { isMonthDeletable, getMonthRange };
