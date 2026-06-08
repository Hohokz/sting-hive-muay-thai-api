const {
  ActivityLog,
  User,
  ClassesSchedule,
  ClassesCapacity,
} = require("../models/Associations");
const { Op } = require("sequelize");
const dayjs = require("dayjs");

/**
 * [CREATE] สร้าง Activity Log ใหม่
 */
const createLog = async (data) => {
  try {
    return await ActivityLog.create(data);
  } catch (error) {
    // ไม่ throw error เพื่อไม่ให้ขัดจังหวะ process หลัก (เช่น ถ้า log พัง แต่การจองสำเร็จ ก็ควรให้การจองผ่าน)
    console.error("[ActivityLogService] Create Log Error:", error.message);
  }
};

/**
 * [READ] ดึงรายการ Activity Log (พร้อมเติมข้อมูล Schedule ถ้ามี)
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

    // 1. รวบรวม Schedule IDs ทั้งหมดจาก details (เพื่อดึงข้อมูลแบบ Batch)
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

    // 2. ถ้ามี IDs ให้ไปดึงข้อมูล Schedule และ Capacity มาเติม (Enrichment)
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

        // ฟังก์ชันช่วยเติมข้อมูล
        const enrich = (target) => {
          if (!target) return;
          const sId = target.classes_schedule_id || target.schedule_id;
          if (sId && scheduleMap.has(sId)) {
            target.schedule_details = scheduleMap.get(sId);
          }
        };

        enrich(log.details.old_values);
        enrich(log.details.new_values);
        enrich(log.details); // สำหรับเคสที่เก็บ id ไว้ที่ชั้นนอกของ details
      });
    }

    return { total: count, logs };
  } catch (error) {
    console.error("[ActivityLogService] Get Logs Error:", error);
    throw error;
  }
};

const { Parser } = require("json2csv");

/**
 * [EXPORT] Export Activity Logs to CSV by date range
 */
const exportLogsToCSV = async ({ start_date, end_date }) => {
  if (!start_date || !end_date) {
    throw new Error("start_date and end_date are required");
  }

  const startOfRange = dayjs(start_date).startOf("day").toDate();
  const endOfRange = dayjs(end_date).add(1, "day").startOf("day").toDate();

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

    return { csv, filename };
  } catch (error) {
    console.error("[ActivityLogService] Export CSV Error:", error);
    throw error;
  }
};

module.exports = {
  createLog,
  getActivityLogs,
  exportLogsToCSV,
};
