const { ActivityLog, User, ClassesSchedule, ClassesCapacity } = require("../models/Associations");

/**
 * สร้าง Activity Log ใหม่
 * @param {Object} data 
 * @param {string} data.user_id - UUID ของผู้ใช้ (ถ้ามี)
 * @param {string} data.user_name - ชื่อผู้ใช้ที่ทำรายการ
 * @param {string} data.service - 'BOOKING', 'SCHEDULE', 'USER'
 * @param {string} data.action - Action เช่น 'CREATE', 'UPDATE', 'DELETE'
 * @param {Object} data.details - ข้อมูลเพิ่มเติม (Old vs New values)
 * @param {string} data.ip_address - IP Address ของผู้ทำรายการ
 */
const createLog = async (data) => {
  try {
    const log = await ActivityLog.create(data);
    return log;
  } catch (error) {
    console.error("[ActivityLogService] Create Log Error:", error);
    // ไม่ throw error เพื่อไม่ให้ขัดจังหวะ process หลัก
  }
};

/**
 * ดึงรายการ Activity Log
 * @param {Object} filters 
 */
const getActivityLogs = async (filters = {}) => {
  const { service, action, user_id, limit = 50, offset = 0 } = filters;
  const whereCondition = {};

  if (service) whereCondition.service = service;
  if (action) whereCondition.action = action;
  if (user_id) whereCondition.user_id = user_id;

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

    // --- Enrichment: Add schedule details if present in details ---
    const logs = rows.map(r => r.get({ plain: true }));
    const scheduleIds = new Set();

    logs.forEach(log => {
      if (log.details) {
        // Collect all possible IDs to fetch in batch
        const ids = [
          log.details.classes_schedule_id,
          log.details.schedule_id,
          log.details.new_values?.classes_schedule_id,
          log.details.new_values?.schedule_id,
          log.details.old_values?.classes_schedule_id,
          log.details.old_values?.schedule_id
        ].filter(Boolean);
        ids.forEach(id => scheduleIds.add(id));
      }
    });

    if (scheduleIds.size > 0) {
      console.log("🔍 [ActivityLogService] Found IDs to enrich:", Array.from(scheduleIds));
      const schedules = await ClassesSchedule.findAll({
        where: { id: Array.from(scheduleIds) },
        include: [{ model: ClassesCapacity, as: "capacity_data", attributes: ["capacity"] }],
        attributes: ["id", "start_time", "end_time", "gym_enum"]
      });

      console.log("✅ [ActivityLogService] Fetched schedules count:", schedules.length);
      const scheduleMap = new Map(schedules.map(s => [s.id, s.toJSON()]));

      logs.forEach(log => {
        if (log.details) {
          // 1. Enrich old_values
          if (log.details.old_values) {
            const sId = log.details.old_values.classes_schedule_id || log.details.old_values.schedule_id;
            if (sId && scheduleMap.has(sId)) {
              log.details.old_values.schedule_details = scheduleMap.get(sId);
            }
          }

          // 2. Enrich new_values
          if (log.details.new_values) {
            const sId = log.details.new_values.classes_schedule_id || log.details.new_values.schedule_id;
            if (sId && scheduleMap.has(sId)) {
              log.details.new_values.schedule_details = scheduleMap.get(sId);
            }
          }

          // 3. Enrich top-level details (if it's a create/delete without old/new split)
          const topSId = log.details.classes_schedule_id || log.details.schedule_id;
          if (topSId && scheduleMap.has(topSId)) {
            log.details = {
              ...log.details,
              schedule_details: scheduleMap.get(topSId)
            };
          }
        }
      });
    }

    return {
      total: count,
      logs: logs,
    };
  } catch (error) {
    console.error("[ActivityLogService] Get Logs Error:", error);
    throw error;
  }
};

module.exports = {
  createLog,
  getActivityLogs,
};
