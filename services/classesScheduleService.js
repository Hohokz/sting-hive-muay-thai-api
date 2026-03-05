// services/classesScheduleService.js

const {
  Gyms,
  ClassesSchedule,
  ClassesCapacity,
  ClassesBooking,
  ClassesBookingInAdvance,
} = require("../models/Associations");
const { Op, Sequelize } = require("sequelize");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");

const activityLogService = require("./activityLogService");
const advancedScheduleJob = require("../job/advancedScheduleJob");
const cacheUtil = require("../utils/cacheUtility");

dayjs.extend(utc);


// =================================================================
// 1. HELPER / VALIDATION FUNCTIONS
// =================================================================

/**
 * ดึงช่วงเวลาเริ่มต้นและสิ้นสุดของวัน รวมถึงเวลาสำหรับเช็ค Config (07:00)
 * @param {string|Date} date 
 * @returns {object} { checkTime, startOfDay, endOfDay }
 */
const _getDateRange = (date) => {
  const targetDate = dayjs(date);
  return {
    // เวลาสำหรับเช็ค Config (ยึดตามมาตรฐานระบบที่ 07:00 AM)
    checkTime: targetDate.startOf("day").hour(7).toDate(),
    // เริ่มต้นวัน (00:00:00)
    startOfDay: targetDate.startOf("day").toDate(),
    // สิ้นสุดวัน (23:59:59)
    endOfDay: targetDate.endOf("day").toDate(),
  };
};

/**
 * ตรวจสอบความถูกต้องพื้นฐานของช่วงเวลา (Start ก่อน End) และความจุ (Capacity)
 */
const _validateScheduleInput = (newStartTime, newEndTime, capacity) => {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (!timeRegex.test(newStartTime) || !timeRegex.test(newEndTime)) {
    const error = new Error("รูปแบบเวลาไม่ถูกต้อง กรุณาใช้ HH:mm (เช่น 09:00)");
    error.status = 400;
    throw error;
  }

  // แปลงเวลาเป็นนาทีเพื่อเปรียบเทียบ
  const [startH, startM] = newStartTime.split(":").map(Number);
  const [endH, endM] = newEndTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (endMinutes <= startMinutes) {
    const error = new Error("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น");
    error.status = 400;
    throw error;
  }

  if (capacity !== undefined && (typeof capacity !== "number" || capacity <= 0)) {
    const error = new Error("ความจุ (Capacity) ต้องเป็นตัวเลขที่มากกว่า 0");
    error.status = 400;
    throw error;
  }
};

// =================================================================
// 2. CORE SERVICE FUNCTIONS (CRUD)
// =================================================================

/**
 * [CREATE] สร้างรายการ Schedule ใหม่ พร้อมกำหนดความจุ (Capacity)
 */
const createSchedule = async (scheduleData, performedByUser = null) => {
  const {
    start_time,
    end_time,
    gym_enum,
    description,
    user,
    capacity,
    is_private_class,
  } = scheduleData;

  _validateScheduleInput(start_time, end_time, capacity);

  const gyms_id = gym_enum === "STING_CLUB" ? 1 : 2;
  const transaction = await ClassesSchedule.sequelize.transaction();

  try {
    // 1. สร้าง Schedule Master
    const newSchedule = await ClassesSchedule.create(
      {
        start_time,
        end_time,
        gym_enum,
        description,
        is_private_class: is_private_class || false,
        created_by: performedByUser?.name || performedByUser?.username || user || "API_CALL",
        gyms_id,
      },
      { transaction }
    );

    // 2. สร้าง Capacity ผูกกับ Schedule
    await ClassesCapacity.create(
      {
        classes_id: newSchedule.id,
        capacity,
        created_by: performedByUser?.name || performedByUser?.username || user || "API_CALL",
      },
      { transaction }
    );

    // 3. บันทึก Log
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || user || "API_CALL",
      service: "SCHEDULE",
      action: "CREATE",
      details: { schedule_id: newSchedule.id, start_time, end_time, gym_enum, capacity },
    });

    await transaction.commit();

    // ✅ Invalidate Cache
    cacheUtil.clearByPrefix("schedules");
    cacheUtil.clearByPrefix("availability");

    return await ClassesSchedule.findByPk(newSchedule.id, {
      include: [{ model: ClassesCapacity, as: "capacity_data" }],
    });
  } catch (error) {
    await transaction.rollback();
    console.error("[DB Error] Failed to create schedule:", error);
    throw new Error("เกิดข้อผิดพลาดในการสร้างตารางเรียน");
  }
};

/**
 * [UPDATE] อัปเดตรายการ Schedule และความจุ (Capacity)
 */
const updateSchedule = async (id, updateData, performedByUser = null) => {
  const schedule = await ClassesSchedule.findByPk(id, {
    include: [{ model: ClassesCapacity, as: "capacity_data" }],
  });

  if (!schedule) {
    const error = new Error(`ไม่พบข้อมูลตารางเรียน ID ${id}`);
    error.status = 404;
    throw error;
  }

  const {
    start_time = schedule.start_time,
    end_time = schedule.end_time,
    gym_enum = schedule.gym_enum,
    capacity,
    is_private_class = schedule.is_private_class,
  } = updateData;

  const currentCapacity = schedule.capacity_data?.capacity || 0;
  const newCapacity = capacity !== undefined ? capacity : currentCapacity;

  _validateScheduleInput(start_time, end_time, newCapacity);

  const gyms_id = gym_enum === "STING_CLUB" ? 1 : 2;
  const transaction = await ClassesSchedule.sequelize.transaction();

  try {
    const oldValues = {
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      capacity: currentCapacity,
    };

    // 1. อัปเดต Schedule
    await schedule.update(
      {
        ...updateData,
        start_time,
        end_time,
        updated_by: performedByUser?.name || performedByUser?.username || updateData.user || "API_CALL",
        updated_date: new Date(),
        gyms_id,
      },
      { transaction }
    );

    // 2. อัปเดต Capacity (ถ้ามีการส่งค่ามา)
    if (capacity !== undefined) {
      await ClassesCapacity.update(
        {
          capacity: capacity,
          updated_by: performedByUser?.name || performedByUser?.username || updateData.user || "API_CALL",
        },
        { where: { classes_id: id }, transaction }
      );
    }

    // 3. บันทึก Log
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || updateData.user || "API_CALL",
      service: "SCHEDULE",
      action: "UPDATE",
      details: {
        schedule_id: id,
        old_values: oldValues,
        new_values: { start_time, end_time, capacity: newCapacity },
      },
    });

    await transaction.commit();

    // ✅ Invalidate Cache
    cacheUtil.clearByPrefix("schedules");
    cacheUtil.clearByPrefix("availability");

    return await ClassesSchedule.findByPk(id, {
      include: [{ model: ClassesCapacity, as: "capacity_data" }],
    });
  } catch (error) {
    await transaction.rollback();
    if (error.status) throw error;
    console.error("[DB Error] Failed to update schedule:", error);
    throw new Error("เกิดข้อผิดพลาดในการอัปเดตตารางเรียน");
  }
};

const getSchedulesById = async (id) => {
  if (!id) {
    const error = new Error("Schedule ID is required.");
    error.status = 400;
    throw error;
  }
  const whereCondition = { id };
  return await ClassesSchedule.findOne({
    where: whereCondition,
    include: [{ model: ClassesCapacity, as: "capacity_data" }],
  });
};

/**
 * [READ] ดึงข้อมูล Schedule ทั้งหมด หรือกรองตามช่วงเวลา
 */
const getSchedules = async (startDate, endDate) => {
  const whereCondition = {};

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      const error = new Error("รูปแบบวันที่ไม่ถูกต้อง");
      error.status = 400;
      throw error;
    }

    // ค้นหาตารางที่มีเวลาเริ่มหรือเวลาจบอยู่ในช่วงที่กำหนด
    whereCondition[Op.or] = [
      { start_time: { [Op.between]: [start, end] } },
      { end_time: { [Op.between]: [start, end] } },
    ];
  }

  try {
    const cacheKey = `schedules:${startDate || "all"}:${endDate || "all"}`;
    const cachedData = cacheUtil.get(cacheKey);
    if (cachedData) return cachedData;

    const schedules = await ClassesSchedule.findAll({
      where: whereCondition,
      order: [["start_time", "ASC"]],
      include: [{ model: ClassesCapacity, as: "capacity_data" }],
    });

    cacheUtil.set(cacheKey, schedules, 60000); // เก็บใน Cache 1 นาที
    return schedules;
  } catch (error) {
    console.error("[DB Error] Failed to retrieve schedules:", error);
    throw new Error("เกิดข้อผิดพลาดในการดึงข้อมูลตารางเรียน");
  }
};

/**
 * [READ] ดึงรายการตารางเรียนที่ว่างสำหรับวันที่ระบุ (Optimized with Cache)
 */
const getAvailableSchedulesByBookingDate = async (date, gymEnum, isPrivateClass) => {
  try {
    const { checkTime, startOfDay, endOfDay } = _getDateRange(date);

    // 0. ตรวจสอบ Cache ก่อน (เพื่อประหยัด Cost ของ Supabase)
    const cacheKey = `availability:${date}:${gymEnum || "all"}:${isPrivateClass}`;
    const cachedData = cacheUtil.get(cacheKey);
    if (cachedData) {
      console.log("--- Serving Available Schedules from Cache ---");
      return cachedData;
    }

    // 1. ดึงข้อมูลตารางเรียนพื้นฐาน (Schedules + Capacity)
    const whereSchedule = {};
    if (gymEnum) whereSchedule.gym_enum = gymEnum;
    if (isPrivateClass !== undefined) whereSchedule.is_private_class = isPrivateClass;

    const schedules = await ClassesSchedule.findAll({
      where: whereSchedule,
      include: [{ model: ClassesCapacity, as: "capacity_data" }],
      order: [["start_time", "ASC"]],
    });

    if (schedules.length === 0) return [];

    const scheduleIds = schedules.map((s) => s.id);
    const gymIds = [...new Set(schedules.map((s) => s.gyms_id))];

    // 2. ดึงข้อมูลประกอบแบบ Bulk: การปิดยิม, การตั้งค่าพิเศษ (Advance), และยอดการจอง
    const [gymClosures, advancedConfigs, bookingCounts] = await Promise.all([
      // A. ตรวจสอบการปิดยิม (ทั้งยิม)
      ClassesBookingInAdvance.findAll({
        where: {
          gyms_id: { [Op.in]: gymIds },
          is_close_gym: true,
          classes_schedule_id: null,
          start_date: { [Op.lte]: checkTime },
          end_date: { [Op.gte]: checkTime },
        },
      }),
      // B. ตรวจสอบการตั้งค่าพิเศษรายคลาส (เช่น เปลี่ยนความจุ หรือปิดบางคลาส)
      ClassesBookingInAdvance.findAll({
        where: {
          classes_schedule_id: { [Op.in]: scheduleIds },
          start_date: { [Op.lte]: checkTime },
          end_date: { [Op.gte]: checkTime },
        },
        order: [["created_date", "DESC"]],
      }),
      // C. นับยอดการจองที่เกิดขึ้นแล้ว
      ClassesBooking.findAll({
        attributes: [
          "classes_schedule_id",
          [Sequelize.fn("SUM", Sequelize.col("capacity")), "total_capacity"],
        ],
        where: {
          classes_schedule_id: { [Op.in]: scheduleIds },
          date_booking: { [Op.between]: [startOfDay, endOfDay] },
          booking_status: { [Op.notIn]: ["CANCELED", "FAILED"] },
        },
        group: ["classes_schedule_id"],
      }),
    ]);

    // 3. จัดการข้อมูลให้อยู่ในรูปแบบ Map เพื่อการค้นที่รวดเร็ว (O(1))
    const gymClosureMap = new Map(gymClosures.map((c) => [c.gyms_id, c]));
    const advancedConfigMap = new Map();
    advancedConfigs.forEach(config => {
      if (!advancedConfigMap.has(config.classes_schedule_id)) {
        advancedConfigMap.set(config.classes_schedule_id, config);
      }
    });
    const bookingCountMap = new Map(
      bookingCounts.map((b) => [
        b.classes_schedule_id,
        parseInt(b.get("total_capacity") || 0, 10),
      ])
    );

    // 4. ผสมข้อมูลเพื่อสร้างผลลัพธ์สุดท้าย
    const availableSchedules = schedules
      .filter((schedule) => !gymClosureMap.has(schedule.gyms_id)) // กรองยิมที่ปิดออก
      .map((schedule) => {
        const advConfig = advancedConfigMap.get(schedule.id);
        const currentBookingCount = bookingCountMap.get(schedule.id) || 0;
        
        let maxCapacity = schedule.capacity_data?.capacity || 0;
        let isClassClosed = false;

        // ถ้ามีการตั้งค่า Advance (เช่น ปรับลดคน หรือ ปิดคลาสเฉพาะกิจ) ให้ใช้ค่านั้นแทน
        if (advConfig) {
          if (advConfig.is_close_gym) {
            isClassClosed = true;
            maxCapacity = 0;
          } else {
            maxCapacity = advConfig.capacity;
          }
        }

        const availableSeats = Math.max(0, maxCapacity - currentBookingCount);

        return {
          id: schedule.id,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          gym_enum: schedule.gym_enum,
          gyms_id: schedule.gyms_id,
          capacity_data: {
            id: schedule.capacity_data?.id,
            capacity: maxCapacity,
          },
          booking_count: currentBookingCount,
          available_seats: availableSeats,
          is_full: availableSeats <= 0,
          is_class_closed: isClassClosed,
        };
      })
      .filter((s) => !s.is_class_closed); // กรองคลาสที่สั่งปิดรายวันออก

    // เก็บเข้า Cache 20 วินาที (ลดภาระ DB เมื่อมีคนรุมเข้าดูพร้อมกัน)
    cacheUtil.set(cacheKey, availableSchedules, 20000);
    
    return availableSchedules;
  } catch (error) {
    console.error("[Service Error] getAvailableSchedulesByBookingDate:", error);
    throw new Error("ไม่สามารถดึงข้อมูลตารางเรียนที่ว่างได้");
  }
};

/**
 * [DELETE] ลบรายการตารางเรียน
 */
const deleteSchedule = async (id, performedByUser = null) => {
  try {
    const scheduleToDelete = await ClassesSchedule.findByPk(id);
    if (scheduleToDelete) {
      await activityLogService.createLog({
        user_id: performedByUser?.id,
        user_name: performedByUser?.username || "ADMIN",
        service: "SCHEDULE",
        action: "DELETE",
        details: {
          schedule_id: id,
          start_time: scheduleToDelete.start_time,
          end_time: scheduleToDelete.end_time,
        },
      });
    }

    const deletedCount = await ClassesSchedule.destroy({ where: { id } });

    if (deletedCount === 0) {
      const error = new Error(`ไม่พบตารางเรียน ID ${id}`);
      error.status = 404;
      throw error;
    }

    // ✅ Invalidate Cache
    cacheUtil.clearByPrefix("schedules");
    cacheUtil.clearByPrefix("availability");

    return { message: `ลบตารางเรียน ID ${id} สำเร็จ` };
  } catch (error) {
    if (error.status) throw error;
    console.error("[DB Error] Failed to delete schedule:", error);

    if (error.name === "SequelizeForeignKeyConstraintError") {
      const fkError = new Error("ไม่สามารถลบตารางเรียนนี้ได้ เนื่องจากมีการจองค้างอยู่ กรุณายกเลิกการจองก่อน");
      fkError.status = 409;
      throw fkError;
    }
    throw new Error("เกิดข้อผิดพลาดในการลบตารางเรียน");
  }
};

// =================================================================
// 3. SHARED AVAILABILITY LOGIC
// =================================================================

/**
 * [SHARED] ฟังก์ชันดึงสถานะความว่างของ Schedule 1 รายการ
 * ใช้ทั้งในหน้าเว็บและตรวจสอบก่อนการจอง
 */
const getScheduleRealtimeAvailability = async (scheduleId, date, options = {}) => {
  const { transaction, lock } = options;
  const { checkTime, startOfDay, endOfDay } = _getDateRange(date);

  const queryOptions = { transaction };
  if (lock && transaction) {
    queryOptions.lock = transaction.LOCK.UPDATE;
  }

  // ดึงข้อมูล Schedule (ไม่ดึง Capacity แบบ join ตรงนี้เพื่อเลี่ยง Lock ปัญหาบน NULL table)
  const schedule = await ClassesSchedule.findByPk(scheduleId, queryOptions);
  if (!schedule) throw new Error(`ไม่พบตารางเรียน ID ${scheduleId}`);

  const gymId = schedule.gyms_id;

  // 1. ตรวจสอบว่ายิมปิดหรือไม่
  const gymClosed = await ClassesBookingInAdvance.findOne({
    where: {
      gyms_id: gymId,
      is_close_gym: true,
      classes_schedule_id: null,
      start_date: { [Op.lte]: checkTime },
      end_date: { [Op.gte]: checkTime },
    },
    order: [["created_date", "DESC"]],
    transaction,
  });

  if (gymClosed) {
    return {
      schedule,
      isCloseGym: true,
      isClassClosed: true,
      maxCapacity: 0,
      currentBookingCount: 0,
      availableSeats: 0,
      closuresReason: "Gym Closed",
    };
  }

  // 2. ตรวจสอบการตั้งค่าความจุพิเศษ (Advance Config)
  const advancedConfig = await ClassesBookingInAdvance.findOne({
    where: {
      classes_schedule_id: scheduleId,
      start_date: { [Op.lte]: checkTime },
      end_date: { [Op.gte]: checkTime },
    },
    order: [["created_date", "DESC"]],
    transaction,
  });

  let maxCapacity = 0;
  if (advancedConfig) {
    if (advancedConfig.is_close_gym) {
      return { schedule, isCloseGym: false, isClassClosed: true, maxCapacity: 0, currentBookingCount: 0, availableSeats: 0, closuresReason: "Class Closed" };
    }
    maxCapacity = advancedConfig.capacity;
  } else {
    // ใช้ความจุมาตรฐานจากฐานข้อมูล
    const capacityData = await ClassesCapacity.findOne({
      where: { classes_id: scheduleId },
      transaction
    });
    maxCapacity = capacityData?.capacity || 0;
  }

  // 3. นับจำนวนที่จองไปแล้ว
  const currentBookingCount = (await ClassesBooking.sum("capacity", {
    where: {
      classes_schedule_id: scheduleId,
      date_booking: { [Op.between]: [startOfDay, endOfDay] },
      booking_status: { [Op.notIn]: ["CANCELED", "FAILED"] },
    },
    transaction,
  })) || 0;

  return {
    schedule,
    isCloseGym: false,
    isClassClosed: false,
    maxCapacity,
    currentBookingCount,
    availableSeats: Math.max(0, maxCapacity - currentBookingCount),
  };
};

/**
 * [INTERNAL] ตรวจสอบความจุหักล้างกับการจองที่มีอยู่ (ใช้ตอนปรับ Advance Config)
 */
const _checkAvailability = async (startDate, endDate, classesScheduleId, isCloseGym, capacity, gymEnum, transaction) => {
  if (isCloseGym) return "ยิมถูกตั้งค่าให้ปิดในช่วงเวลาดังกล่าว";

  const lockOption = transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {};
  const schedule = await ClassesSchedule.findByPk(classesScheduleId, lockOption);
  if (!schedule) throw new Error("ไม่พบตารางเรียน");

  const capacityData = await ClassesCapacity.findOne({
    where: { classes_id: classesScheduleId },
    transaction,
  });
  if (!capacityData) throw new Error("ไม่พบข้อมูลความจุของคลาสนี้");

  const startOfDay = dayjs(startDate).startOf("day").toDate();
  const endOfDay = dayjs(endDate).endOf("day").toDate();

  const currentBookingCount = await ClassesBooking.sum("capacity", {
    where: {
      classes_schedule_id: classesScheduleId,
      date_booking: { [Op.between]: [startOfDay, endOfDay] },
      booking_status: { [Op.notIn]: ["CANCELED", "FAILED"] },
    },
    transaction,
  }) || 0;

  const maxCapacity = capacity !== undefined ? capacity : capacityData.capacity;

  if (currentBookingCount > maxCapacity) {
    return `ขณะนี้ยอดจอง (${currentBookingCount}) เกินความจุใหม่ (${maxCapacity}) โปรดตรวจสอบก่อนดำเนินการ`;
  }

  return null;
};

/**
 * [READ] ดึงข้อมูลการตั้งค่าล่วงหน้า (Advanced Schedules / Closures)
 */
const getAdvancedSchedules = async (filters = {}) => {
  const { start_date, end_date } = filters;
  const whereClause = {};

  if (start_date && end_date) {
    whereClause.start_date = { [Op.lte]: new Date(end_date) };
    whereClause.end_date = { [Op.gte]: new Date(start_date) };
  } else if (start_date) {
    whereClause.end_date = { [Op.gte]: new Date(start_date) };
  }

  const configs = await ClassesBookingInAdvance.findAll({
    where: whereClause,
    include: [
      {
        model: ClassesSchedule,
        as: "schedule",
        attributes: ["start_time", "end_time", "gym_enum"],
        required: false,
      },
    ],
    order: [["start_date", "ASC"]],
  });

  const gym_closures = [];
  const capacity_adjustments = [];

  for (const config of configs) {
    const item = config.toJSON();

    if (item.is_close_gym) {
      gym_closures.push({
        id: item.id,
        gyms_id: item.gyms_id,
        is_close_gym: true,
        start_date: item.start_date,
        end_date: item.end_date,
        description: item.classes_schedule_id
          ? `ปิดคลาส: ${item.schedule?.start_time}-${item.schedule?.end_time}`
          : "ปิดยิม (ทั้งวัน)",
      });
    } else {
      capacity_adjustments.push({
        id: item.id,
        schedule_id: item.classes_schedule_id,
        gym_enum: item.schedule?.gym_enum,
        time_slot: item.schedule ? `${item.schedule.start_time} - ${item.schedule.end_time}` : "ไม่ทราบช่วงเวลา",
        new_capacity: item.capacity,
        start_date: item.start_date,
        end_date: item.end_date,
      });
    }
  }

  return { gym_closures, capacity_adjustments };
};

const createAdvancedSchedule = async (scheduleData, performedByUser = null) => {

  console.log("[Service] createAdvancedSchedule hit.");

  if (!ClassesBookingInAdvance.sequelize) {
    throw new Error("Sequelize is not initialized yet.");
  }

  const t = await ClassesBookingInAdvance.sequelize.transaction();

  try {
    let gymsId = scheduleData.gyms_id;
    let currentCapacity = 0; // ค่า Default สำหรับ old_capasity

    // 1. หา gyms_id และ current capacity จาก Schedule
    if (scheduleData.schedule_id) {
      const schedule = await ClassesSchedule.findByPk(
        scheduleData.schedule_id,
        { transaction: t }
      );

      if (!schedule) {
        const error = new Error("Class schedule not found.");
        error.status = 404;
        throw error;
      }

      if (!gymsId) gymsId = schedule.gyms_id;
      
      // ดึงค่า Capacity ปัจจุบันจากตาราง ClassesCapacity มาใส่ old_capasity
      const capInfo = await ClassesCapacity.findOne({ 
          where: { classes_id: scheduleData.schedule_id }, 
          transaction: t 
      });
      if (capInfo) currentCapacity = capInfo.capacity;
      
      console.log(`[Service] Derived gyms_id ${gymsId} from schedule ${scheduleData.schedule_id}`);
    }

    // 2. Validate Gym Closure
    if (scheduleData.is_close_gym && !gymsId) {
      const error = new Error("gyms_id is required for gym closure.");
      error.status = 400;
      throw error;
    }

    // 3. Validate Gym Exists
    if (gymsId) {
      const gymExist = await Gyms.count({ where: { id: gymsId }, transaction: t });
      if (!gymExist) {
        const error = new Error("Gym not found");
        error.status = 404;
        throw error;
      }
    }

    // 4. Check Availability
    let warningMessage = null;
    if (!scheduleData.is_close_gym && scheduleData.schedule_id) {
      warningMessage = await _checkAvailability(
        scheduleData.start_date,
        scheduleData.end_date,
        scheduleData.schedule_id,
        scheduleData.is_close_gym,
        scheduleData.capacity,
        scheduleData.gym_enum,
        t
      );
    }

    // 5. Create Record
    const newRecord = await ClassesBookingInAdvance.create(
      {
        classes_schedule_id: scheduleData.schedule_id || null,
        start_date: scheduleData.start_date,
        end_date: scheduleData.end_date,
        capacity: scheduleData.capacity,
        old_capasity: currentCapacity, // ใช้ค่าที่ดึงมา
        is_close_gym: scheduleData.is_close_gym || false,
        gyms_id: gymsId,
        created_by: performedByUser?.name || performedByUser?.username || "ADMIN",
      },
      { transaction: t }
    );

    // 6. Log Activity
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
      service: "SCHEDULE",
      action: "CREATE_ADVANCED",
      details: {
        advanced_id: newRecord.id,
        schedule_id: scheduleData.schedule_id,
        capacity: scheduleData.capacity,
        is_close_gym: scheduleData.is_close_gym,
      },
    }, { transaction: t });

    // ✅ เรียกใช้ Helper Function
    await _updateRealTimeCapacityIfToday(
      newRecord.start_date,
      newRecord.is_close_gym,
      newRecord.classes_schedule_id,
      newRecord.capacity,
      performedByUser,
      t
    );

    await t.commit();

    console.log("------------------------------------------");
    console.log("[Success] Data created:", newRecord.toJSON());
    console.log("------------------------------------------");

    return {
      record: newRecord,
      warningMessage: warningMessage,
    };

  } catch (error) {
    if (t) await t.rollback();
    console.error("[Service Error]:", error.message);
    throw error;
  } 
};

const updateAdvancedSchedule = async (id, updateData, performedByUser = null) => {

  console.log(`[Service] updateAdvancedSchedule hit for ID: ${id}`);

  const t = await ClassesBookingInAdvance.sequelize.transaction();

  try {
    // 1. Find Record
    const config = await ClassesBookingInAdvance.findByPk(id, { transaction: t });
    
    if (!config) {
      const error = new Error("Advanced configuration not found.");
      error.status = 404;
      throw error;
    }

    // 2. Prepare Next Data
    const nextData = {
      start_date: updateData.start_date || config.start_date,
      end_date: updateData.end_date || config.end_date,
      capacity: updateData.capacity !== undefined ? updateData.capacity : config.capacity,
      is_close_gym: updateData.is_close_gym !== undefined ? updateData.is_close_gym : config.is_close_gym,
      classes_schedule_id: updateData.schedule_id || config.classes_schedule_id, 
      gyms_id: updateData.gyms_id || config.gyms_id,
    };

    // 3. Validation
    if (nextData.is_close_gym) {
      if (!nextData.gyms_id) {
        const error = new Error("gyms_id is required for gym closure.");
        error.status = 400;
        throw error;
      }
    } else {
      if (!nextData.classes_schedule_id) {
        const error = new Error("schedule_id is required for capacity adjustment.");
        error.status = 400;
        throw error;
      }

      // Check Availability if changed
      const isScheduleChanged = nextData.classes_schedule_id !== config.classes_schedule_id;
      const isDateChanged = 
          new Date(nextData.start_date).getTime() !== new Date(config.start_date).getTime() ||
          new Date(nextData.end_date).getTime() !== new Date(config.end_date).getTime();
      const isCapacityChanged = nextData.capacity !== config.capacity;

      if (isScheduleChanged || isDateChanged || isCapacityChanged) {
        await _checkAvailability(
          nextData.start_date,
          nextData.end_date,
          nextData.classes_schedule_id,
          nextData.is_close_gym,
          nextData.capacity,
          updateData.gym_enum, 
          t
        );
      }
    }

    // Keep old values for log
    const oldValues = {
      start_date: config.start_date,
      end_date: config.end_date,
      capacity: config.capacity,
      is_close_gym: config.is_close_gym,
      classes_schedule_id: config.classes_schedule_id,
      gyms_id: config.gyms_id,
    };

    // 4. Update Database
    await config.update(
      {
        start_date: nextData.start_date,
        end_date: nextData.end_date,
        capacity: nextData.capacity,
        is_close_gym: nextData.is_close_gym,
        classes_schedule_id: nextData.classes_schedule_id,
        gyms_id: nextData.gyms_id,
        updated_by: performedByUser?.name || performedByUser?.username || "ADMIN",
        updated_date: new Date(),
      },
      { transaction: t }
    );

    // 5. Log Activity
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
      service: "SCHEDULE",
      action: "UPDATE_ADVANCED",
      details: {
        advanced_id: id,
        old_values: oldValues,
        new_values: nextData,
      },
    }, { transaction: t });

    // ✅ เรียกใช้ Helper Function (ใช้ config ที่ update แล้ว)
    await _updateRealTimeCapacityIfToday(
      config.start_date,
      config.is_close_gym,
      config.classes_schedule_id,
      config.capacity,
      performedByUser,
      t
    );

    await t.commit();
    return config;

  } catch (error) {
    if (t) await t.rollback();
    throw error;
  }
};

/**
 * [HELPER] อัปเดต Capacity ในตาราง ClassesCapacity ทันที หากวันที่เริ่มต้นตรงกับวันนี้
 * @param {Date|string} startDate - วันที่เริ่มต้นของการตั้งค่าพิเศษ
 * @param {boolean} isCloseGym - เป็นการปิดยิมหรือไม่
 * @param {number} scheduleId - ID ของตารางเรียน (ถ้ามี)
 * @param {number} capacity - ความจุใหม่ที่ต้องการตั้งค่า
 * @param {object} performedByUser - ข้อมูลผู้ใช้งานที่ดำเนินการ
 * @param {object} t - Sequelize Transaction
 */
const _updateRealTimeCapacityIfToday = async (
  startDate,
  isCloseGym,
  scheduleId,
  capacity,
  performedByUser,
  t
) => {
  try {
    const todayStr = new Date().toISOString().split("T")[0];
    // แปลง startDate เป็น string (รองรับทั้ง Date object และ string)
    const startStr = new Date(startDate).toISOString().split("T")[0];

    // เงื่อนไข: วันที่ตรงกับวันนี้ + ไม่ใช่การปิดยิม + มี schedule_id
    if (startStr === todayStr && !isCloseGym && scheduleId) {
      console.log(`[Auto Update] Start date (${startStr}) is TODAY. Updating ClassesCapacity...`);
      
      const userName = performedByUser?.name || performedByUser?.username || "ADMIN";

      await ClassesCapacity.update(
        {
          capacity: capacity,
          updated_by: userName,
        },
        {
          where: { classes_id: scheduleId },
          transaction: t, // 🔥 สำคัญมาก: ต้องใช้ transaction เดียวกัน
        }
      );
    }
  } catch (error) {
    console.error("[Helper Error] Failed to auto-update capacity:", error.message);
    throw error; 
  }
};

/**
 * [DELETE] ลบการตั้งค่าพิเศษ
 */
const deleteAdvancedSchedule = async (id, performedByUser = null) => {
  const config = await ClassesBookingInAdvance.findByPk(id);
  if (!config) {
    const error = new Error(`ไม่พบข้อมูลการตั้งค่าพิเศษ ID ${id}`);
    error.status = 404;
    throw error;
  }

  await activityLogService.createLog({
    user_id: performedByUser?.id || null,
    user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
    service: "SCHEDULE",
    action: "DELETE_ADVANCED",
    details: { advanced_id: id },
  });

  await config.destroy();

  // ✅ Invalidate Cache
  cacheUtil.clearByPrefix("availability");

  return { message: "ลบการตั้งค่าพิเศษสำเร็จ" };
};

/**
 * [ACTION] บังคับให้ระบบประมวลผลการจองล่วงหน้าทันที (Manual Trigger Job)
 */
const activeScheduleInAdvance = async () => {
  return await advancedScheduleJob.runAdvancedScheduleJob();
};
// =================================================================
// 3. EXPORTS
// =================================================================

module.exports = {
  createSchedule,
  getSchedules,
  getSchedulesById,
  updateSchedule,
  deleteSchedule,
  getAvailableSchedulesByBookingDate,
  createAdvancedSchedule,
  getAdvancedSchedules,
  updateAdvancedSchedule,
  deleteAdvancedSchedule,
  getScheduleRealtimeAvailability, // Export Shared Logic
  activeScheduleInAdvance,
};
