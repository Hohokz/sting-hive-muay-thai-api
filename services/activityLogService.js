const {
  ActivityLog,
  User,
  ClassesSchedule,
  ClassesCapacity,
} = require("../models/Associations");
const { Op } = require("sequelize");
const dayjs = require("dayjs");
dayjs.extend(require("dayjs/plugin/utc"));
const { Parser } = require("json2csv");
const { isMonthDeletable, getMonthRange } = require("../utils/monthGuard");

// Identifies "activity logs were exported for this range" entries, so a
// purge can require "this month was exported first" (see
// hasMonthBeenExported). There's no ACTIVITY_LOG/SYSTEM value in the
// `service` enum (BOOKING, SCHEDULE, USER, TRAINER_GYM — see
// models/Enums.js), so USER is used as the closest fit, same as
// PURGE_LOGS_MONTH.
const EXPORT_LOG_SERVICE = "USER";
const EXPORT_LOG_ACTION = "EXPORT_LOGS";

/**
 * [CREATE] Creates a new activity log entry.
 */
const createLog = async (data) => {
  try {
    return await ActivityLog.create(data);
  } catch (error) {
    // Intentionally not re-thrown: a failed log write shouldn't derail the
    // main action (e.g. a booking should still succeed even if its log doesn't).
    console.error("[ActivityLogService] Create Log Error:", error.message);
  }
};

/**
 * [READ] Returns activity logs, enriched with schedule details where relevant.
 */
const getActivityLogs = async (filters = {}) => {
  const { service, action, user_id, limit = 50, offset = 0, date } = filters;
  const whereCondition = {};

  if (service) whereCondition.service = service;
  if (action) whereCondition.action = action;
  if (user_id) whereCondition.user_id = user_id;
  if (date) {
    const startOfDay = dayjs(date).startOf("day").toDate();
    const endOfDay = dayjs(date).endOf("day").toDate();
    whereCondition.created_at = {
      [Op.between]: [startOfDay, endOfDay],
    };
  }

  try {
    const { count, rows } = await ActivityLog.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "username", "name"],
        },
      ],
      order: [["created_at", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const logs = rows.map((r) => r.get({ plain: true }));
    const scheduleIds = new Set();

    // 1. Collect every schedule ID referenced in `details` (for a batch fetch)
    logs.forEach((log) => {
      if (!log.details) return;
      const possibleIds = [
        log.details.classes_schedule_id,
        log.details.schedule_id,
        log.details.new_values?.classes_schedule_id,
        log.details.new_values?.schedule_id,
        log.details.old_values?.classes_schedule_id,
        log.details.old_values?.schedule_id,
      ].filter(Boolean);
      possibleIds.forEach((id) => scheduleIds.add(id));
    });

    // 2. If any were found, fetch schedule + capacity data to enrich the logs
    if (scheduleIds.size > 0) {
      const schedules = await ClassesSchedule.findAll({
        where: { id: Array.from(scheduleIds) },
        include: [
          {
            model: ClassesCapacity,
            as: "capacity_data",
            attributes: ["capacity"],
          },
        ],
        attributes: ["id", "start_time", "end_time", "gym_enum"],
      });

      const scheduleMap = new Map(schedules.map((s) => [s.id, s.toJSON()]));

      logs.forEach((log) => {
        if (!log.details) return;

        const enrich = (target) => {
          if (!target) return;
          const sId = target.classes_schedule_id || target.schedule_id;
          if (sId && scheduleMap.has(sId)) {
            target.schedule_details = scheduleMap.get(sId);
          }
        };

        enrich(log.details.old_values);
        enrich(log.details.new_values);
        enrich(log.details); // for logs that stored the ID at the top level of details
      });
    }

    return { total: count, logs };
  } catch (error) {
    console.error("[ActivityLogService] Get Logs Error:", error);
    throw error;
  }
};

/**
 * [EXPORT] Exports activity logs to CSV, filtered by date range.
 */
const exportLogsToCSV = async ({ start_date, end_date }, performedByUser = null) => {
  if (!start_date || !end_date) {
    const error = new Error("start_date and end_date are required");
    error.status = 400;
    throw error;
  }

  // Anchored in UTC, not local time — see getAvailableExportMonths, which
  // buckets rows by TO_CHAR(created_at, ...) under Postgres's UTC session
  // timezone. Using local time here would shift the boundary and silently
  // drop/include rows near the edge of the selected range.
  const startOfRange = dayjs.utc(start_date).startOf("day").toDate();
  const endOfRange = dayjs.utc(end_date).add(1, "day").startOf("day").toDate();

  try {
    const rows = await ActivityLog.findAll({
      where: {
        created_at: {
          [Op.gte]: startOfRange,
          [Op.lt]: endOfRange,
        },
      },
      // No JOIN needed — user_name is a direct column on activity_logs
      attributes: [
        "id",
        "user_id",
        "user_name",
        "service",
        "action",
        "details",
        "ip_address",
        "created_at",
      ],
      order: [["created_at", "ASC"]],
      raw: true, // raw: true is enough since no associations needed
    });

    const data = rows.map((log) => ({
      id: log.id,
      user_id: log.user_id ?? "",
      user_name: log.user_name ?? "",
      service: log.service ?? "",
      action: log.action ?? "",
      details: log.details ? JSON.stringify(log.details) : "",
      ip_address: log.ip_address ?? "",
      created_at: dayjs(log.created_at).format("YYYY-MM-DD HH:mm:ss"),
    }));

    const fields = [
      { label: "ID", value: "id" },
      { label: "User ID", value: "user_id" },
      { label: "User Name", value: "user_name" },
      { label: "Service", value: "service" },
      { label: "Action", value: "action" },
      { label: "Details", value: "details" },
      { label: "IP Address", value: "ip_address" },
      { label: "Created At", value: "created_at" },
    ];

    const parser = new Parser({ fields, withBOM: true });
    const csv = parser.parse(data);

    const filename = `activity_logs_${dayjs(start_date).format("YYYYMMDD")}_${dayjs(end_date).format("YYYYMMDD")}.csv`;

    // Recorded so a purge can later require "this month was exported first"
    // (see hasMonthBeenExported) — not just an audit trail entry.
    await createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
      service: EXPORT_LOG_SERVICE,
      action: EXPORT_LOG_ACTION,
      details: { start_date, end_date },
    });

    return { csv, filename };
  } catch (error) {
    console.error("[ActivityLogService] Export CSV Error:", error);
    throw error;
  }
};

/**
 * [READ] Returns the months (YYYY-MM) that have at least one activity log,
 * so the export month-picker can disable months with nothing to export.
 */
const getAvailableExportMonths = async () => {
  const [rows] = await ActivityLog.sequelize.query(`
    SELECT DISTINCT TO_CHAR(created_at, 'YYYY-MM') AS month
    FROM activity_logs
    ORDER BY month ASC;
  `);
  return rows.map((r) => r.month);
};

/**
 * Whether an EXPORT-type log for this exact month exists, for the given
 * service/action pair — required before that month can be purged, so
 * deleting always has a CSV backup on record first. Shared across
 * activityLogService and classesBookingService (neither purge feature
 * introduces its own separate tracking mechanism).
 */
const hasExportBeenLogged = async ({ service, action, month }) => {
  const { start, end } = getMonthRange(month);
  const startStr = dayjs.utc(start).format("YYYY-MM-DD");
  const endStr = dayjs.utc(end).subtract(1, "day").format("YYYY-MM-DD");

  const count = await ActivityLog.count({
    where: {
      service,
      action,
      details: { [Op.contains]: { start_date: startStr, end_date: endStr } },
    },
  });
  return count > 0;
};

/**
 * [READ] Returns the months (YYYY-MM) that have a matching EXPORT log, for
 * the frontend to show which months are actually eligible for deletion.
 */
const getMonthsExportedFor = async ({ service, action }) => {
  const [rows] = await ActivityLog.sequelize.query(
    `
    SELECT DISTINCT TO_CHAR((details->>'start_date')::date, 'YYYY-MM') AS month
    FROM activity_logs
    WHERE service = :service AND action = :action AND details->>'start_date' IS NOT NULL
    ORDER BY month ASC;
  `,
    { replacements: { service, action } },
  );
  return rows.map((r) => r.month);
};

/**
 * [READ] Returns the months (YYYY-MM) that activity logs have been exported
 * for — the specific pairing used by this service's own purge feature.
 */
const getExportedMonths = async () => {
  return getMonthsExportedFor({ service: EXPORT_LOG_SERVICE, action: EXPORT_LOG_ACTION });
};

const _assertMonthDeletable = async (month) => {
  if (!isMonthDeletable(month)) {
    const error = new Error(`รูปแบบเดือนไม่ถูกต้อง: ${month} (ต้องเป็น YYYY-MM)`);
    error.status = 400;
    throw error;
  }
  const exported = await hasExportBeenLogged({
    service: EXPORT_LOG_SERVICE,
    action: EXPORT_LOG_ACTION,
    month,
  });
  if (!exported) {
    const error = new Error(
      `กรุณา export ข้อมูลเดือน ${month} ก่อน จึงจะลบได้ (ป้องกันข้อมูลหายโดยไม่มีสำเนา)`,
    );
    error.status = 400;
    throw error;
  }
};

/**
 * [READ] Counts how many activity logs a purge of the given month would
 * delete — used to show the admin exactly what they're about to permanently
 * remove before they confirm.
 */
const previewPurgeLogsByMonth = async (month) => {
  await _assertMonthDeletable(month);
  const { start, end } = getMonthRange(month);
  return ActivityLog.count({
    where: { created_at: { [Op.gte]: start, [Op.lt]: end } },
  });
};

/**
 * [DELETE] Permanently deletes every activity log in the given month. Only
 * allowed once that month has been exported at least once.
 */
const purgeLogsByMonth = async (month, performedByUser = null) => {
  await _assertMonthDeletable(month);
  const { start, end } = getMonthRange(month);

  const deletedCount = await ActivityLog.destroy({
    where: { created_at: { [Op.gte]: start, [Op.lt]: end } },
  });

  // No ACTIVITY_LOG/SYSTEM value exists in the `service` enum (BOOKING,
  // SCHEDULE, USER, TRAINER_GYM — see models/Enums.js), so this admin-account
  // action is logged under USER, the closest fit.
  await createLog({
    user_id: performedByUser?.id || null,
    user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
    service: "USER",
    action: "PURGE_LOGS_MONTH",
    details: { month, deleted_count: deletedCount },
  });

  return { deletedCount };
};

module.exports = {
  createLog,
  getActivityLogs,
  exportLogsToCSV,
  getAvailableExportMonths,
  getExportedMonths,
  previewPurgeLogsByMonth,
  purgeLogsByMonth,
  // Shared with classesBookingService, which has its own EXPORT log
  // service/action pair but no direct access to the ActivityLog model.
  hasExportBeenLogged,
  getMonthsExportedFor,
};
