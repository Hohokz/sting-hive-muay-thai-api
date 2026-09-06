const { sequelize } = require("../config/db");
const { PaymentMethod } = require("../models/Associations");
const activityLogService = require("./activityLogService");
const { getMonthRange } = require("../utils/monthGuard");
const { GYM_ENUM } = require("../models/Enums");
const ExcelJS = require("exceljs");

const dayjs = require("dayjs");
dayjs.extend(require("dayjs/plugin/utc"));
dayjs.extend(require("dayjs/plugin/isoWeek"));

// The activity_logs.service column is a hard Postgres ENUM (BOOKING,
// SCHEDULE, USER, TRAINER_GYM — see models/ActivityLog.js) that can't be
// extended without a migration, so payment-method management is logged
// under USER, the same "closest fit" convention already used for other
// admin-account-level actions with no dedicated category (e.g. PURGE_LOGS_MONTH
// in activityLogService.js).
const LOG_SERVICE = "USER";

const MONTH_FORMAT = /^\d{4}-\d{2}$/;
const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_FORMAT = /^(\d{4})-W(\d{2})$/;
const YEAR_FORMAT = /^\d{4}$/;

/**
 * Turns a (period, value) pair from the Payment Summary page's Day/Week/
 * Month/Year tabs into a [start, end) date range, anchored in UTC like the
 * bookings export (Postgres's session timezone is UTC — see
 * _fetchBookingsForExport in classesBookingService.js for the same
 * reasoning). `value`'s expected shape comes straight from the matching
 * HTML date input: "YYYY-MM-DD" (day), "YYYY-Www" (week, ISO 8601), "YYYY-MM"
 * (month), "YYYY" (year).
 */
const _getRangeForPeriod = (period, value) => {
  const invalid = (expected) => {
    const error = new Error(`ค่า ${period} ไม่ถูกต้อง: ${value} (ต้องเป็น ${expected})`);
    error.status = 400;
    throw error;
  };

  if (period === "day") {
    if (!DAY_FORMAT.test(value || "")) invalid("YYYY-MM-DD");
    const start = dayjs.utc(value).startOf("day");
    return { start: start.toDate(), end: start.add(1, "day").toDate() };
  }

  if (period === "week") {
    const match = WEEK_FORMAT.exec(value || "");
    if (!match) invalid("YYYY-Www");
    const [, year, week] = match;
    const start = dayjs
      .utc()
      .year(Number(year))
      .isoWeek(Number(week))
      .startOf("isoWeek");
    return { start: start.toDate(), end: start.add(1, "week").toDate() };
  }

  if (period === "month") {
    if (!MONTH_FORMAT.test(value || "")) invalid("YYYY-MM");
    return getMonthRange(value);
  }

  if (period === "year") {
    if (!YEAR_FORMAT.test(value || "")) invalid("YYYY");
    const start = dayjs.utc(`${value}-01-01`).startOf("year");
    return { start: start.toDate(), end: start.add(1, "year").toDate() };
  }

  const error = new Error(`ช่วงเวลาไม่ถูกต้อง: ${period} (ต้องเป็น day, week, month หรือ year)`);
  error.status = 400;
  throw error;
};

/**
 * Validates an optional gym/branch filter — undefined/empty means "every
 * branch", anything else must be a real GYM_ENUM value.
 */
const _assertValidGym = (gym) => {
  if (!gym) return;
  if (!Object.values(GYM_ENUM).includes(gym)) {
    const error = new Error(
      `สาขาไม่ถูกต้อง: ${gym} (ต้องเป็น ${Object.values(GYM_ENUM).join(" หรือ ")})`,
    );
    error.status = 400;
    throw error;
  }
};

/**
 * [READ] Returns payment methods for the dropdown. Inactive methods are
 * excluded by default (they're kept for history, not for new selection).
 */
const listPaymentMethods = async ({ includeInactive = false } = {}) => {
  return PaymentMethod.findAll({
    where: includeInactive ? {} : { is_active: true },
    order: [["name", "ASC"]],
  });
};

/**
 * [CREATE] Adds a new payment method, addable directly from the payment
 * popup's dropdown or from the Payment Summary page's management list.
 */
const createPaymentMethod = async (name, performedByUser = null) => {
  const trimmed = (name || "").trim();
  if (!trimmed) {
    const error = new Error("กรุณาระบุชื่อวิธีชำระเงิน");
    error.status = 400;
    throw error;
  }

  const actorName =
    performedByUser?.name || performedByUser?.username || "ADMIN";

  const method = await PaymentMethod.create({
    name: trimmed,
    created_by: actorName,
    updated_by: actorName,
  });

  await activityLogService.createLog({
    user_id: performedByUser?.id || null,
    user_name: actorName,
    service: LOG_SERVICE,
    action: "CREATE_PAYMENT_METHOD",
    details: { payment_method_id: method.id, name: trimmed },
  });

  return method;
};

/**
 * [UPDATE] Renames or activates/deactivates a payment method.
 */
const updatePaymentMethod = async (
  id,
  { name, is_active },
  performedByUser = null,
) => {
  const method = await PaymentMethod.findByPk(id);
  if (!method) {
    const error = new Error("ไม่พบวิธีชำระเงินนี้");
    error.status = 404;
    throw error;
  }

  const actorName =
    performedByUser?.name || performedByUser?.username || "ADMIN";

  const updates = { updated_by: actorName, updated_date: new Date() };
  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) {
      const error = new Error("กรุณาระบุชื่อวิธีชำระเงิน");
      error.status = 400;
      throw error;
    }
    updates.name = trimmed;
  }
  if (is_active !== undefined) updates.is_active = is_active;

  await method.update(updates);

  await activityLogService.createLog({
    user_id: performedByUser?.id || null,
    user_name: actorName,
    service: LOG_SERVICE,
    action: "UPDATE_PAYMENT_METHOD",
    details: { payment_method_id: id, ...updates },
  });

  return method;
};

const _sumEntries = (rows) =>
  rows.reduce(
    (acc, r) => ({
      payment_count: acc.payment_count + r.payment_count,
      total_rent: acc.total_rent + r.total_rent,
      total_course: acc.total_course + r.total_course,
    }),
    { payment_count: 0, total_rent: 0, total_course: 0 },
  );

/**
 * [READ] Totals rent/course amounts collected for one day/week/month/year
 * (by the booking's own date_booking, same as the bookings export),
 * grouped two ways: by payment method, and by class (the specific
 * schedule slot a booking was for — gym + time + private/group). Optionally
 * scoped to one branch (`gym`) — omitting it summarizes every branch.
 */
const getPaymentSummary = async ({ period, value, gym } = {}) => {
  const { start, end } = _getRangeForPeriod(period, value);
  _assertValidGym(gym);

  const [methodRows] = await sequelize.query(
    `
    SELECT
      pm.id AS payment_method_id,
      COALESCE(pm.name, 'ไม่ระบุวิธีชำระ') AS payment_method_name,
      COUNT(bp.id)::int AS payment_count,
      COALESCE(SUM(bp.rent_amount), 0)::float AS total_rent,
      COALESCE(SUM(bp.course_amount), 0)::float AS total_course
    FROM booking_payments bp
    JOIN classes_booking cb ON cb.id = bp.classes_booking_id
    JOIN classes_schedule cs ON cs.id = cb.classes_schedule_id
    LEFT JOIN payment_methods pm ON pm.id = bp.payment_method_id
    WHERE cb.date_booking >= :start AND cb.date_booking < :end
      AND (:gym::text IS NULL OR cs.gym_enum = :gym)
    GROUP BY pm.id, pm.name
    ORDER BY pm.name ASC NULLS LAST;
    `,
    { replacements: { start, end, gym: gym || null } },
  );

  const [classRows] = await sequelize.query(
    `
    SELECT
      cs.id AS schedule_id,
      cs.gym_enum,
      cs.start_time,
      cs.end_time,
      cs.is_private_class,
      COUNT(bp.id)::int AS payment_count,
      COALESCE(SUM(bp.rent_amount), 0)::float AS total_rent,
      COALESCE(SUM(bp.course_amount), 0)::float AS total_course
    FROM booking_payments bp
    JOIN classes_booking cb ON cb.id = bp.classes_booking_id
    JOIN classes_schedule cs ON cs.id = cb.classes_schedule_id
    WHERE cb.date_booking >= :start AND cb.date_booking < :end
      AND (:gym::text IS NULL OR cs.gym_enum = :gym)
    GROUP BY cs.id, cs.gym_enum, cs.start_time, cs.end_time, cs.is_private_class
    ORDER BY cs.gym_enum ASC, cs.start_time ASC;
    `,
    { replacements: { start, end, gym: gym || null } },
  );

  const byMethod = methodRows.map((r) => ({
    payment_method_id: r.payment_method_id,
    payment_method_name: r.payment_method_name,
    payment_count: r.payment_count,
    total_rent: r.total_rent,
    total_course: r.total_course,
    total_amount: r.total_rent + r.total_course,
  }));

  const byClass = classRows.map((r) => ({
    schedule_id: r.schedule_id,
    gym_enum: r.gym_enum,
    start_time: r.start_time,
    end_time: r.end_time,
    is_private_class: r.is_private_class,
    payment_count: r.payment_count,
    total_rent: r.total_rent,
    total_course: r.total_course,
    total_amount: r.total_rent + r.total_course,
  }));

  // Both breakdowns are derived from the same underlying rows for the same
  // range, so their grand totals always agree — computed once from
  // whichever came back (byMethod is never missing a row byClass has, since
  // every booking_payments row has a booking, and every booking has a
  // schedule).
  const totals = _sumEntries(byMethod);

  return {
    period,
    value,
    gym: gym || null,
    by_method: byMethod,
    by_class: byClass,
    totals: { ...totals, total_amount: totals.total_rent + totals.total_course },
  };
};

const _formatGymName = (gymEnum) =>
  gymEnum === "STING_HIVE" ? "Sting Hive" : gymEnum === "STING_CLUB" ? "Sting Club" : "";

/**
 * Fetches every individual payment entry in the range (not aggregated) —
 * used both for the export's "Details" sheet (no scheduleId) and for the
 * By Class table's click-to-drill-down (scheduleId scopes it to just that
 * one class).
 */
const _fetchPaymentDetailsForExport = async (start, end, gym, scheduleId) => {
  const [rows] = await sequelize.query(
    `
    SELECT
      cb.client_name,
      cb.date_booking,
      cs.gym_enum,
      cs.start_time,
      cs.end_time,
      cs.is_private_class,
      COALESCE(pm.name, 'ไม่ระบุวิธีชำระ') AS payment_method_name,
      bp.rent_amount,
      bp.course_amount,
      bp.created_date
    FROM booking_payments bp
    JOIN classes_booking cb ON cb.id = bp.classes_booking_id
    JOIN classes_schedule cs ON cs.id = cb.classes_schedule_id
    LEFT JOIN payment_methods pm ON pm.id = bp.payment_method_id
    WHERE cb.date_booking >= :start AND cb.date_booking < :end
      AND (:gym::text IS NULL OR cs.gym_enum = :gym)
      AND (:scheduleId::uuid IS NULL OR cs.id = :scheduleId)
    ORDER BY cb.date_booking ASC, bp.created_date ASC;
    `,
    { replacements: { start, end, gym: gym || null, scheduleId: scheduleId || null } },
  );

  return rows.map((r) => ({
    date_booking: dayjs.utc(r.date_booking).format("YYYY-MM-DD"),
    client_name: r.client_name ?? "",
    gym: _formatGymName(r.gym_enum),
    start_time: (r.start_time || "").slice(0, 5),
    end_time: (r.end_time || "").slice(0, 5),
    class_type: r.is_private_class ? "Private" : "Group",
    payment_method: r.payment_method_name,
    rent_amount: Number(r.rent_amount),
    course_amount: Number(r.course_amount),
    total_amount: Number(r.rent_amount) + Number(r.course_amount),
    created_date: dayjs(r.created_date).format("YYYY-MM-DD HH:mm:ss"),
  }));
};

/**
 * [READ] Returns every individual payment entry for one specific class
 * (schedule) within the given period/branch — the drill-down shown when
 * clicking a row in the Payment Summary page's By Class table.
 */
const getClassPaymentDetails = async ({ period, value, gym, scheduleId }) => {
  const { start, end } = _getRangeForPeriod(period, value);
  _assertValidGym(gym);
  if (!scheduleId) {
    const error = new Error("กรุณาระบุคลาสที่ต้องการดูรายละเอียด");
    error.status = 400;
    throw error;
  }
  return _fetchPaymentDetailsForExport(start, end, gym, scheduleId);
};

/**
 * [EXPORT] Exports the Payment Summary page's current period (whichever
 * Day/Week/Month/Year tab is selected) to an .xlsx workbook: every
 * individual payment entry, plus the same by-method and by-class totals
 * shown on screen. Optionally scoped to one branch (`gym`), same as
 * getPaymentSummary.
 */
const exportPaymentSummary = async ({ period, value, gym }, performedByUser = null) => {
  const { start, end } = _getRangeForPeriod(period, value);
  _assertValidGym(gym);
  const [summary, details] = await Promise.all([
    getPaymentSummary({ period, value, gym }),
    _fetchPaymentDetailsForExport(start, end, gym),
  ]);

  const workbook = new ExcelJS.Workbook();

  const detailSheet = workbook.addWorksheet("Details");
  detailSheet.columns = [
    { header: "Date Booking", key: "date_booking", width: 14 },
    { header: "Client Name", key: "client_name", width: 20 },
    { header: "Gym", key: "gym", width: 12 },
    { header: "Start Time", key: "start_time", width: 10 },
    { header: "End Time", key: "end_time", width: 10 },
    { header: "Class Type", key: "class_type", width: 10 },
    { header: "Payment Method", key: "payment_method", width: 18 },
    { header: "ค่าเช่า", key: "rent_amount", width: 12 },
    { header: "ค่าคอร์ส", key: "course_amount", width: 12 },
    { header: "Total", key: "total_amount", width: 12 },
    { header: "Recorded At", key: "created_date", width: 18 },
  ];
  detailSheet.getRow(1).font = { bold: true };
  detailSheet.addRows(details);

  const methodSheet = workbook.addWorksheet("By Method");
  methodSheet.columns = [
    { header: "Payment Method", key: "payment_method_name", width: 20 },
    { header: "Count", key: "payment_count", width: 10 },
    { header: "ค่าเช่า", key: "total_rent", width: 14 },
    { header: "ค่าคอร์ส", key: "total_course", width: 14 },
    { header: "Total", key: "total_amount", width: 14 },
  ];
  methodSheet.getRow(1).font = { bold: true };
  methodSheet.addRows(summary.by_method);
  methodSheet.addRow({
    payment_method_name: "Total",
    payment_count: summary.totals.payment_count,
    total_rent: summary.totals.total_rent,
    total_course: summary.totals.total_course,
    total_amount: summary.totals.total_amount,
  }).font = { bold: true };

  const classSheet = workbook.addWorksheet("By Class");
  classSheet.columns = [
    { header: "Gym", key: "gym", width: 12 },
    { header: "Start Time", key: "start_time", width: 10 },
    { header: "End Time", key: "end_time", width: 10 },
    { header: "Class Type", key: "class_type", width: 10 },
    { header: "Count", key: "payment_count", width: 10 },
    { header: "ค่าเช่า", key: "total_rent", width: 14 },
    { header: "ค่าคอร์ส", key: "total_course", width: 14 },
    { header: "Total", key: "total_amount", width: 14 },
  ];
  classSheet.getRow(1).font = { bold: true };
  classSheet.addRows(
    summary.by_class.map((r) => ({
      gym: _formatGymName(r.gym_enum),
      start_time: (r.start_time || "").slice(0, 5),
      end_time: (r.end_time || "").slice(0, 5),
      class_type: r.is_private_class ? "Private" : "Group",
      payment_count: r.payment_count,
      total_rent: r.total_rent,
      total_course: r.total_course,
      total_amount: r.total_amount,
    })),
  );
  classSheet.addRow({
    gym: "Total",
    payment_count: summary.totals.payment_count,
    total_rent: summary.totals.total_rent,
    total_course: summary.totals.total_course,
    total_amount: summary.totals.total_amount,
  }).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `payment_summary_${period}_${value}${gym ? `_${gym}` : ""}.xlsx`;

  await activityLogService.createLog({
    user_id: performedByUser?.id || null,
    user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
    service: LOG_SERVICE,
    action: "EXPORT_PAYMENT_SUMMARY",
    details: { period, value, gym: gym || null },
  });

  return {
    data: buffer,
    filename,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
};

module.exports = {
  listPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  getPaymentSummary,
  exportPaymentSummary,
  getClassPaymentDetails,
};
