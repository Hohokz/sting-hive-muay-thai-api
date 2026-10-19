// services/classesScheduleService.js

const {
  Gyms,
  ClassesSchedule,
  ClassesCapacity,
  ClassesBookingInAdvance,
} = require("../models/Associations");
const { Op } = require("sequelize");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");

const activityLogService = require("./activityLogService");
const cacheUtil = require("../utils/cacheUtility");
const { sumBookingSeats } = require("../utils/bookingSeats");
const { BOOKING_STATUS, GYM_ENUM } = require("../models/Enums");

dayjs.extend(utc);

const ACTIVE_BOOKING_STATUSES_EXCLUDED = [
  BOOKING_STATUS.CANCELED,
  BOOKING_STATUS.FAILED,
];

// =================================================================
// 1. HELPER / VALIDATION FUNCTIONS
// =================================================================

// The gym runs on Thai time (UTC+7), whatever timezone the server is in.
const BUSINESS_UTC_OFFSET_MINUTES = 7 * 60;

/**
 * Returns the gym's calendar date (YYYY-MM-DD) for a date. A plain
 * YYYY-MM-DD string is already a calendar date and is used as-is; anything
 * else (Date, ISO timestamp) is read in Thai time.
 */
const _toBusinessDateKey = (date) => {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return dayjs(date).utcOffset(BUSINESS_UTC_OFFSET_MINUTES).format("YYYY-MM-DD");
};

/**
 * Returns the start/end of a day, plus the time used to check advance configs.
 *
 * The admin form sends advance config dates as YYYY-MM-DD, which are stored
 * as midnight UTC of that calendar date — so checkTime is midnight UTC of
 * the requested calendar date too. Both ends of the range are inclusive, so
 * a config covers every day from start_date through end_date regardless of
 * the server's timezone. (Anchoring to 07:00 server-local time used to drop
 * the last day whenever the server ran in UTC.)
 * @param {string|Date} date
 * @returns {object} { checkTime, startOfDay, endOfDay }
 */
const _getDateRange = (date) => {
  const targetDate = dayjs(date);
  return {
    checkTime: dayjs.utc(_toBusinessDateKey(date)).toDate(),
    startOfDay: targetDate.startOf("day").toDate(),
    endOfDay: targetDate.endOf("day").toDate(),
  };
};

/**
 * Validates basic schedule input: start time before end time, and a positive capacity.
 */
const _validateScheduleInput = (newStartTime, newEndTime, capacity) => {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (!timeRegex.test(newStartTime) || !timeRegex.test(newEndTime)) {
    const error = new Error("รูปแบบเวลาไม่ถูกต้อง กรุณาใช้ HH:mm (เช่น 09:00)");
    error.status = 400;
    throw error;
  }

  // Convert to minutes for comparison
  const [startH, startM] = newStartTime.split(":").map(Number);
  const [endH, endM] = newEndTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (endMinutes <= startMinutes) {
    const error = new Error("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น");
    error.status = 400;
    throw error;
  }

  if (
    capacity !== undefined &&
    (typeof capacity !== "number" || capacity <= 0)
  ) {
    const error = new Error("ความจุ (Capacity) ต้องเป็นตัวเลขที่มากกว่า 0");
    error.status = 400;
    throw error;
  }
};

// =================================================================
// 2. CORE SERVICE FUNCTIONS (CRUD)
// =================================================================

/**
 * [CREATE] Creates a new schedule along with its capacity record.
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
    // 1. Create the schedule record
    const newSchedule = await ClassesSchedule.create(
      {
        start_time,
        end_time,
        gym_enum,
        description,
        is_private_class: is_private_class || false,
        created_by:
          performedByUser?.name ||
          performedByUser?.username ||
          user ||
          "API_CALL",
        gyms_id,
      },
      { transaction },
    );

    // 2. Create the capacity record tied to the schedule
    await ClassesCapacity.create(
      {
        classes_id: newSchedule.id,
        capacity,
        created_by:
          performedByUser?.name ||
          performedByUser?.username ||
          user ||
          "API_CALL",
      },
      { transaction },
    );

    // 3. Log the action
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name:
        performedByUser?.name ||
        performedByUser?.username ||
        user ||
        "API_CALL",
      service: "SCHEDULE",
      action: "CREATE",
      details: {
        schedule_id: newSchedule.id,
        start_time,
        end_time,
        gym_enum,
        capacity,
      },
    });

    await transaction.commit();

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
 * [UPDATE] Updates a schedule and its capacity.
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

  let {
    start_time = schedule.start_time,
    end_time = schedule.end_time,
    gym_enum = schedule.gym_enum,
    capacity,
  } = updateData;

  // Ensure time format is HH:mm for validation (in case it comes from DB as HH:mm:ss)
  if (typeof start_time === "string" && start_time.length > 5)
    start_time = start_time.substring(0, 5);
  if (typeof end_time === "string" && end_time.length > 5)
    end_time = end_time.substring(0, 5);

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

    // 1. Update the schedule
    await schedule.update(
      {
        ...updateData,
        start_time,
        end_time,
        updated_by:
          performedByUser?.name ||
          performedByUser?.username ||
          updateData.user ||
          "API_CALL",
        updated_date: new Date(),
        gyms_id,
      },
      { transaction },
    );

    // 2. Update capacity, if a new value was provided
    if (capacity !== undefined) {
      await ClassesCapacity.update(
        {
          capacity: capacity,
          updated_by:
            performedByUser?.name ||
            performedByUser?.username ||
            updateData.user ||
            "API_CALL",
        },
        { where: { classes_id: id }, transaction },
      );
    }

    // 3. Log the action
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name:
        performedByUser?.name ||
        performedByUser?.username ||
        updateData.user ||
        "API_CALL",
      service: "SCHEDULE",
      action: "UPDATE",
      details: {
        schedule_id: id,
        old_values: oldValues,
        new_values: { start_time, end_time, capacity: newCapacity },
      },
    });

    await transaction.commit();

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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * [READ] Change history of a schedule for the admin "History" view: who
 * created it (kept on the row itself, since the oldest schedules predate
 * activity logging) plus every SCHEDULE log that mentions it.
 */
const getScheduleHistory = async (id) => {
  if (!UUID_REGEX.test(id || "")) {
    const error = new Error("Schedule ID ไม่ถูกต้อง");
    error.status = 400;
    throw error;
  }

  const schedule = await ClassesSchedule.findByPk(id, {
    attributes: [
      "id", "gym_enum", "start_time", "end_time", "is_private_class",
      "created_by", "created_date", "updated_by", "updated_date",
    ],
  });
  if (!schedule) {
    const error = new Error(`ไม่พบตารางเรียน ID ${id}`);
    error.status = 404;
    throw error;
  }

  const logs = await activityLogService.getScheduleLogs(id);
  return { schedule, logs };
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
 * [READ] Returns all schedules, optionally filtered by a time range.
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

    // Match schedules whose start or end time falls within the given range
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

    cacheUtil.set(cacheKey, schedules, 60000); // cache for 1 minute
    return schedules;
  } catch (error) {
    console.error("[DB Error] Failed to retrieve schedules:", error);
    throw new Error("เกิดข้อผิดพลาดในการดึงข้อมูลตารางเรียน");
  }
};

/**
 * [READ] Returns available schedules for a given date (cache-optimized).
 */
const getAvailableSchedulesByBookingDate = async (
  date,
  gymEnum,
  isPrivateClass,
) => {
  try {
    // 1. Fetch base schedules
    const whereSchedule = {};
    if (gymEnum) whereSchedule.gym_enum = gymEnum;
    if (isPrivateClass !== undefined)
      whereSchedule.is_private_class = isPrivateClass;

    const schedules = await ClassesSchedule.findAll({
      where: whereSchedule,
      order: [["start_time", "ASC"]],
    });

    // 2. Iterate and calculate availability using the shared function
    const availableSchedules = [];

    for (const schedule of schedules) {
      // Note: this is an N+1 query pattern, but given the low N (classes per
      // day), it's acceptable in exchange for reusing the shared logic below.
      const availability = await getScheduleRealtimeAvailability(
        schedule.id,
        date,
      );

      // A gym-wide closure hides the schedule entirely; a class-level closure
      // still surfaces further down via is_full/available_seats.
      if (availability.isCloseGym) {
        continue;
      }

      availableSchedules.push({
        id: schedule.id,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        gym_enum: schedule.gym_enum,
        gyms_id: schedule.gyms_id,
        capacity_data: {
          id: schedule.capacity_data?.id,
          capacity: availability.maxCapacity,
        },
        booking_count: availability.currentBookingCount,
        available_seats: availability.availableSeats,
        is_full: availability.availableSeats <= 0,
        is_closed: availability.isClassClosed,
      });
    }

    return availableSchedules;
  } catch (error) {
    console.error(
      "[DB Error] getAvailableSchedulesByBookingDate:",
      error,
    );
    throw error;
  }
};

/**
 * [DELETE] Deletes a schedule.
 */
const deleteSchedule = async (id, performedByUser = null) => {
  try {
    const scheduleToDelete = await ClassesSchedule.findByPk(id);
    if (scheduleToDelete) {
      await activityLogService.createLog({
        user_id: performedByUser?.id,
        user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
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

    cacheUtil.clearByPrefix("schedules");
    cacheUtil.clearByPrefix("availability");

    return { message: `ลบตารางเรียน ID ${id} สำเร็จ` };
  } catch (error) {
    if (error.status) throw error;
    console.error("[DB Error] Failed to delete schedule:", error);

    if (error.name === "SequelizeForeignKeyConstraintError") {
      const fkError = new Error(
        "ไม่สามารถลบตารางเรียนนี้ได้ เนื่องจากมีการจองค้างอยู่ กรุณายกเลิกการจองก่อน",
      );
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
 * [SHARED] Returns the real-time availability of a single schedule.
 * Used both by the public availability view and the booking-time check.
 */
const getScheduleRealtimeAvailability = async (
  scheduleId,
  date,
  options = {},
) => {
  const { transaction, lock } = options;
  const { checkTime, startOfDay, endOfDay } = _getDateRange(date);

  const queryOptions = { transaction };
  if (lock && transaction) {
    queryOptions.lock = transaction.LOCK.UPDATE;
  }

  // Fetch the schedule without joining capacity here, to avoid locking issues on a null table.
  const schedule = await ClassesSchedule.findByPk(scheduleId, queryOptions);
  if (!schedule) {
    const error = new Error(`ไม่พบตารางเรียน ID ${scheduleId}`);
    error.status = 404;
    throw error;
  }

  const gymId = schedule.gyms_id;

  // 1. Check whether the whole gym is closed
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

  // 2. Check for an advance capacity/closure config
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
      return {
        schedule,
        isCloseGym: false,
        isClassClosed: true,
        maxCapacity: 0,
        currentBookingCount: 0,
        availableSeats: 0,
        closuresReason: "Class Closed",
      };
    }
    maxCapacity = advancedConfig.capacity;
  } else {
    // Fall back to the schedule's standard capacity
    const capacityData = await ClassesCapacity.findOne({
      where: { classes_id: scheduleId },
      transaction,
    });
    maxCapacity = capacityData?.capacity || 0;
  }

  // 3. Count seats already booked (private bookings take one per trainer)
  const currentBookingCount = await sumBookingSeats(
    {
      classes_schedule_id: scheduleId,
      date_booking: { [Op.between]: [startOfDay, endOfDay] },
      booking_status: { [Op.notIn]: ACTIVE_BOOKING_STATUSES_EXCLUDED },
    },
    { transaction },
  );

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
 * [INTERNAL] Checks whether an existing booking count still fits a new
 * capacity (used when adjusting an advance config).
 */
const _checkAvailability = async (
  startDate,
  endDate,
  classesScheduleId,
  isCloseGym,
  capacity,
  gymEnum,
  transaction,
) => {
  if (isCloseGym) return "ยิมถูกตั้งค่าให้ปิดในช่วงเวลาดังกล่าว";

  const lockOption = transaction
    ? { transaction, lock: transaction.LOCK.UPDATE }
    : {};
  const schedule = await ClassesSchedule.findByPk(
    classesScheduleId,
    lockOption,
  );
  if (!schedule) {
    const error = new Error("ไม่พบตารางเรียน");
    error.status = 404;
    throw error;
  }

  const capacityData = await ClassesCapacity.findOne({
    where: { classes_id: classesScheduleId },
    transaction,
  });
  if (!capacityData) {
    const error = new Error("ไม่พบข้อมูลความจุของคลาสนี้");
    error.status = 404;
    throw error;
  }

  const startOfDay = dayjs(startDate).startOf("day").toDate();
  const endOfDay = dayjs(endDate).endOf("day").toDate();

  const currentBookingCount = await sumBookingSeats(
    {
      classes_schedule_id: classesScheduleId,
      date_booking: { [Op.between]: [startOfDay, endOfDay] },
      booking_status: { [Op.notIn]: ACTIVE_BOOKING_STATUSES_EXCLUDED },
    },
    { transaction },
  );

  const maxCapacity = capacity !== undefined ? capacity : capacityData.capacity;

  if (currentBookingCount > maxCapacity) {
    return `ขณะนี้ยอดจอง (${currentBookingCount}) เกินความจุใหม่ (${maxCapacity}) โปรดตรวจสอบก่อนดำเนินการ`;
  }

  return null;
};

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CLOSED_DATES_RANGE_DAYS = 366;

/**
 * [READ] Returns the calendar dates (YYYY-MM-DD) on which a gym is closed by
 * a whole-gym advance rule, within [start_date, end_date]. Public — lets the
 * booking calendar disable those dates. Class-level closures aren't
 * included: the gym is still open for other classes on those days.
 */
const getGymClosedDates = async ({ gym_enum, start_date, end_date } = {}) => {
  if (!Object.values(GYM_ENUM).includes(gym_enum)) {
    const error = new Error("gym_enum ไม่ถูกต้อง");
    error.status = 400;
    throw error;
  }
  if (!DATE_KEY_REGEX.test(start_date || "") || !DATE_KEY_REGEX.test(end_date || "")) {
    const error = new Error("กรุณาระบุ start_date และ end_date ในรูปแบบ YYYY-MM-DD");
    error.status = 400;
    throw error;
  }

  // Rule dates are stored as midnight UTC of the calendar day, so work in UTC.
  const rangeStart = dayjs.utc(start_date);
  const rangeEnd = dayjs.utc(end_date);
  const rangeDays = rangeEnd.diff(rangeStart, "day");
  if (rangeDays < 0 || rangeDays > MAX_CLOSED_DATES_RANGE_DAYS) {
    const error = new Error(
      `ช่วงวันที่ต้องไม่ติดลบและไม่เกิน ${MAX_CLOSED_DATES_RANGE_DAYS} วัน`,
    );
    error.status = 400;
    throw error;
  }

  // "availability" prefix → cleared whenever an advance rule changes
  const cacheKey = `availability:closed-dates:${gym_enum}:${start_date}:${end_date}`;
  const cached = cacheUtil.get(cacheKey);
  if (cached) return cached;

  const gym = await Gyms.findOne({ where: { gym_enum }, attributes: ["id"] });
  if (!gym) return [];

  const closures = await ClassesBookingInAdvance.findAll({
    where: {
      gyms_id: gym.id,
      is_close_gym: true,
      classes_schedule_id: null,
      start_date: { [Op.lte]: rangeEnd.toDate() },
      end_date: { [Op.gte]: rangeStart.toDate() },
    },
    attributes: ["start_date", "end_date"],
  });

  const closedDates = new Set();
  for (const closure of closures) {
    let day = dayjs.utc(closure.start_date).startOf("day");
    if (day.isBefore(rangeStart)) day = rangeStart;
    let last = dayjs.utc(closure.end_date).startOf("day");
    if (last.isAfter(rangeEnd)) last = rangeEnd;

    while (!day.isAfter(last)) {
      closedDates.add(day.format("YYYY-MM-DD"));
      day = day.add(1, "day");
    }
  }

  const result = [...closedDates].sort();
  cacheUtil.set(cacheKey, result, 60000);
  return result;
};

/**
 * What an advance config does, derived from is_close_gym + classes_schedule_id:
 * - GYM_CLOSED:   is_close_gym, no schedule     → whole gym closed
 * - CLASS_CLOSED: is_close_gym, with schedule   → only that class closed
 * - CAPACITY:     not closing, with schedule    → that class's capacity overridden
 */
const RULE_TYPE = Object.freeze({
  GYM_CLOSED: "GYM_CLOSED",
  CLASS_CLOSED: "CLASS_CLOSED",
  CAPACITY: "CAPACITY",
});

const _getRuleType = (config) => {
  if (!config.is_close_gym) return RULE_TYPE.CAPACITY;
  return config.classes_schedule_id ? RULE_TYPE.CLASS_CLOSED : RULE_TYPE.GYM_CLOSED;
};

/**
 * [READ] Returns advance configs (closures / capacity adjustments).
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
    const common = {
      id: item.id,
      rule_type: _getRuleType(item),
      gyms_id: item.gyms_id,
      gym_enum: item.schedule?.gym_enum,
      schedule_id: item.classes_schedule_id,
      time_slot: item.schedule
        ? `${item.schedule.start_time} - ${item.schedule.end_time}`
        : null,
      is_close_gym: !!item.is_close_gym,
      start_date: item.start_date,
      end_date: item.end_date,
      created_date: item.created_date,
      created_by: item.created_by,
    };

    if (item.is_close_gym) {
      gym_closures.push({
        ...common,
        description: item.classes_schedule_id
          ? `ปิดคลาส: ${item.schedule?.start_time}-${item.schedule?.end_time}`
          : "ปิดยิม (ทั้งวัน)",
      });
    } else {
      capacity_adjustments.push({
        ...common,
        time_slot: common.time_slot || "ไม่ทราบช่วงเวลา",
        capacity: item.capacity,
        new_capacity: item.capacity,
        original_capacity: item.old_capasity,
      });
    }
  }

  return { gym_closures, capacity_adjustments };
};

/**
 * A capacity override needs a class and a whole-number capacity (0 is
 * allowed, though closing the class states that intent more clearly).
 */
const _validateCapacityOverride = (scheduleId, capacity) => {
  if (!scheduleId) {
    const error = new Error("schedule_id is required for capacity adjustment.");
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(capacity) || capacity < 0) {
    const error = new Error("capacity must be a whole number of 0 or more.");
    error.status = 400;
    throw error;
  }
};

const createAdvancedSchedule = async (scheduleData, performedByUser = null) => {
  if (!ClassesBookingInAdvance.sequelize) {
    throw new Error("Sequelize is not initialized yet.");
  }

  const t = await ClassesBookingInAdvance.sequelize.transaction();

  try {
    let gymsId = scheduleData.gyms_id;
    let currentCapacity = 0; // default for old_capasity

    // 1. Derive gyms_id and current capacity from the schedule
    if (scheduleData.schedule_id) {
      const schedule = await ClassesSchedule.findByPk(
        scheduleData.schedule_id,
        { transaction: t },
      );

      if (!schedule) {
        const error = new Error("Class schedule not found.");
        error.status = 404;
        throw error;
      }

      if (!gymsId) gymsId = schedule.gyms_id;

      // Snapshot the current capacity into old_capasity, so it can be
      // restored once this config expires.
      const capInfo = await ClassesCapacity.findOne({
        where: { classes_id: scheduleData.schedule_id },
        transaction: t,
      });
      if (capInfo) currentCapacity = capInfo.capacity;
    }

    // 2. Validate input
    if (scheduleData.is_close_gym && !gymsId) {
      const error = new Error("gyms_id is required for gym closure.");
      error.status = 400;
      throw error;
    }
    if (!scheduleData.is_close_gym) {
      _validateCapacityOverride(scheduleData.schedule_id, scheduleData.capacity);
    }

    // 3. Validate the gym exists (and keep its name/enum for the activity log)
    let gym = null;
    if (gymsId) {
      gym = await Gyms.findByPk(gymsId, {
        attributes: ["id", "gym_name", "gym_enum"],
        transaction: t,
      });
      if (!gym) {
        const error = new Error("Gym not found");
        error.status = 404;
        throw error;
      }
    }

    // 4. Check availability
    let warningMessage = null;
    if (!scheduleData.is_close_gym && scheduleData.schedule_id) {
      warningMessage = await _checkAvailability(
        scheduleData.start_date,
        scheduleData.end_date,
        scheduleData.schedule_id,
        scheduleData.is_close_gym,
        scheduleData.capacity,
        scheduleData.gym_enum,
        t,
      );
    }

    // 5. Create the record
    const newRecord = await ClassesBookingInAdvance.create(
      {
        classes_schedule_id: scheduleData.schedule_id || null,
        start_date: scheduleData.start_date,
        end_date: scheduleData.end_date,
        capacity: scheduleData.is_close_gym ? null : scheduleData.capacity,
        old_capasity: currentCapacity,
        is_close_gym: scheduleData.is_close_gym || false,
        gyms_id: gymsId,
        created_by:
          performedByUser?.name || performedByUser?.username || "ADMIN",
      },
      { transaction: t },
    );

    // 6. Log the action
    await activityLogService.createLog(
      {
        user_id: performedByUser?.id || null,
        user_name:
          performedByUser?.name || performedByUser?.username || "ADMIN",
        service: "SCHEDULE",
        action: "CREATE_ADVANCED",
        details: {
          advanced_id: newRecord.id,
          schedule_id: scheduleData.schedule_id,
          capacity: scheduleData.capacity,
          is_close_gym: scheduleData.is_close_gym,
          rule_type: _getRuleType({
            is_close_gym: scheduleData.is_close_gym,
            classes_schedule_id: scheduleData.schedule_id,
          }),
          start_date: scheduleData.start_date,
          end_date: scheduleData.end_date,
          gyms_id: gymsId,
          gym_name: gym?.gym_name,
          gym_enum: gym?.gym_enum,
        },
      },
      { transaction: t },
    );

    await t.commit();

    cacheUtil.clearByPrefix("availability");

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

const updateAdvancedSchedule = async (
  id,
  updateData,
  performedByUser = null,
) => {
  const t = await ClassesBookingInAdvance.sequelize.transaction();

  try {
    // 1. Find the record
    const config = await ClassesBookingInAdvance.findByPk(id, {
      transaction: t,
    });

    if (!config) {
      const error = new Error("Advanced configuration not found.");
      error.status = 404;
      throw error;
    }

    // 2. Prepare the next state
    const nextData = {
      start_date: updateData.start_date || config.start_date,
      end_date: updateData.end_date || config.end_date,
      capacity:
        updateData.capacity !== undefined
          ? updateData.capacity
          : config.capacity,
      is_close_gym:
        updateData.is_close_gym !== undefined
          ? updateData.is_close_gym
          : config.is_close_gym,
      // schedule_id: null/"" is meaningful here (e.g. class closure → whole-gym
      // closure), so only fall back to the stored value when it's omitted.
      classes_schedule_id:
        updateData.schedule_id !== undefined
          ? updateData.schedule_id || null
          : config.classes_schedule_id,
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
      _validateCapacityOverride(nextData.classes_schedule_id, nextData.capacity);

      // Re-check availability only if something relevant actually changed
      const isScheduleChanged =
        nextData.classes_schedule_id !== config.classes_schedule_id;
      const isDateChanged =
        new Date(nextData.start_date).getTime() !==
          new Date(config.start_date).getTime() ||
        new Date(nextData.end_date).getTime() !==
          new Date(config.end_date).getTime();
      const isCapacityChanged = nextData.capacity !== config.capacity;

      if (isScheduleChanged || isDateChanged || isCapacityChanged) {
        await _checkAvailability(
          nextData.start_date,
          nextData.end_date,
          nextData.classes_schedule_id,
          nextData.is_close_gym,
          nextData.capacity,
          updateData.gym_enum,
          t,
        );
      }
    }

    if (nextData.is_close_gym) nextData.capacity = null;

    // Keep old values for the log
    const oldValues = {
      start_date: config.start_date,
      end_date: config.end_date,
      capacity: config.capacity,
      is_close_gym: config.is_close_gym,
      classes_schedule_id: config.classes_schedule_id,
      gyms_id: config.gyms_id,
      old_capasity: config.old_capasity,
    };

    // 4. Persist the update
    await config.update(
      {
        start_date: nextData.start_date,
        end_date: nextData.end_date,
        capacity: nextData.capacity,
        is_close_gym: nextData.is_close_gym,
        classes_schedule_id: nextData.classes_schedule_id,
        gyms_id: nextData.gyms_id,
        updated_by:
          performedByUser?.name || performedByUser?.username || "ADMIN",
        updated_date: new Date(),
      },
      { transaction: t },
    );

    // 5. Log the action
    await activityLogService.createLog(
      {
        user_id: performedByUser?.id || null,
        user_name:
          performedByUser?.name || performedByUser?.username || "ADMIN",
        service: "SCHEDULE",
        action: "UPDATE_ADVANCED",
        details: {
          advanced_id: id,
          old_values: oldValues,
          new_values: nextData,
        },
      },
      { transaction: t },
    );

    await t.commit();

    cacheUtil.clearByPrefix("availability");
    return config;
  } catch (error) {
    if (t) await t.rollback();
    throw error;
  }
};

/**
 * [DELETE] Deletes an advance config. Configs only ever affect availability
 * for their own dates, so there's nothing in the normal schedule to restore.
 */
const deleteAdvancedSchedule = async (id, performedByUser = null) => {
  const t = await ClassesBookingInAdvance.sequelize.transaction();

  try {
    const config = await ClassesBookingInAdvance.findByPk(id, {
      transaction: t,
    });
    if (!config) {
      const error = new Error(`ไม่พบข้อมูลการตั้งค่าพิเศษ ID ${id}`);
      error.status = 404;
      throw error;
    }

    const gym = config.gyms_id
      ? await Gyms.findByPk(config.gyms_id, {
          attributes: ["id", "gym_name", "gym_enum"],
          transaction: t,
        })
      : null;

    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
      service: "SCHEDULE",
      action: "DELETE_ADVANCED",
      details: {
        advanced_id: id,
        schedule_id: config.classes_schedule_id,
        capacity: config.capacity,
        is_close_gym: config.is_close_gym,
        rule_type: _getRuleType(config),
        start_date: config.start_date,
        end_date: config.end_date,
        gyms_id: config.gyms_id,
        gym_name: gym?.gym_name,
        gym_enum: gym?.gym_enum,
      },
    });

    await config.destroy({ transaction: t });

    await t.commit();

    cacheUtil.clearByPrefix("availability");

    return { message: "ลบการตั้งค่าพิเศษสำเร็จ" };
  } catch (error) {
    if (t) await t.rollback();
    console.error("[Service Error] Failed to delete advanced schedule:", error.message);
    throw error;
  }
};

// =================================================================
// 4. EXPORTS
// =================================================================

module.exports = {
  createSchedule,
  getSchedules,
  getSchedulesById,
  getScheduleHistory,
  updateSchedule,
  deleteSchedule,
  getAvailableSchedulesByBookingDate,
  createAdvancedSchedule,
  getAdvancedSchedules,
  getGymClosedDates,
  updateAdvancedSchedule,
  deleteAdvancedSchedule,
  getScheduleRealtimeAvailability, // shared logic, also used by classesBookingService
};
