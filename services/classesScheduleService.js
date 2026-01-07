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

dayjs.extend(utc);

// =================================================================
// 1. HELPER / VALIDATION FUNCTIONS
// =================================================================

/**
 * ตรวจสอบความถูกต้องพื้นฐานของช่วงเวลา (Start ก่อน End) และ Capacity
 */
const _validateScheduleInput = (newStartTime, newEndTime, capacity) => {
  // ✅ Validate format HH:mm
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (!timeRegex.test(newStartTime) || !timeRegex.test(newEndTime)) {
    const error = new Error(
      "Invalid time format. Use HH:mm (e.g. 09:00, 18:30)"
    );
    error.status = 400;
    throw error;
  }

  // ✅ แปลงเวลาเป็น "นาที" เพื่อเอาไปเปรียบเทียบ
  const [startH, startM] = newStartTime.split(":").map(Number);
  const [endH, endM] = newEndTime.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // ✅ เช็กว่า end ต้องมากกว่า start
  if (endMinutes <= startMinutes) {
    const error = new Error(
      "Invalid time range: End time must be strictly after start time."
    );
    error.status = 400;
    throw error;
  }

  // ✅ Validate capacity
  if (
    capacity !== undefined &&
    (typeof capacity !== "number" || capacity <= 0)
  ) {
    const error = new Error("Capacity must be a positive number.");
    error.status = 400;
    throw error;
  }
};

// =================================================================
// 2. CORE SERVICE FUNCTIONS (CRUD)
// =================================================================

/**
 * [CREATE] สร้างรายการ Schedule ใหม่ พร้อม Capacity
 */
const createSchedule = async (scheduleData) => {
  const {
    start_time,
    end_time,
    gym_enum,
    description,
    user,
    capacity,
    is_private_class,
  } = scheduleData;
  console.log("--- Service: createSchedule Start ---");
  console.log("Input data:", JSON.stringify(scheduleData, null, 2));

  _validateScheduleInput(start_time, end_time, capacity);
  console.log("Validation passed.");

  const gyms_id = gym_enum === "STING_CLUB" ? 1 : 2;

  // const existingOverlap = await _checkOverlap(start_time, end_time, gym_enum, null, is_private_class);

  // if (existingOverlap) {
  //     const error = new Error("Time conflict: A schedule already exists in this time slot.");
  //     error.status = 409; // Conflict
  //     throw error;
  // }

  // ใช้ Transaction เพื่อให้มั่นใจว่าทั้ง Schedule และ Capacity ถูกสร้างพร้อมกัน
  const transaction = await ClassesSchedule.sequelize.transaction();

  try {
    // 1. สร้าง Schedule Master
    const newSchedule = await ClassesSchedule.create(
      {
        start_time: start_time,
        end_time: end_time,
        gym_enum,
        description,
        is_private_class: is_private_class || false,
        created_by: user || "API_CALL",
        gyms_id: gyms_id,
      },
      { transaction }
    );

    // 2. สร้าง Capacity ผูกกับ Schedule
    await ClassesCapacity.create(
      {
        classes_id: newSchedule.id,
        capacity: capacity,
        created_by: user || "API_CALL",
      },
      { transaction }
    );

    await transaction.commit();

    // ดึงข้อมูลพร้อม Capacity กลับไป
    return await ClassesSchedule.findByPk(newSchedule.id, {
      include: [{ model: ClassesCapacity, as: "capacity_data" }],
    });
  } catch (error) {
    await transaction.rollback();
    console.error("[DB Error] Failed to create schedule and capacity:", error);
    throw new Error("Internal server error during schedule creation.");
  }
};

/**
 * [UPDATE] อัปเดตรายการ Schedule ที่มีอยู่ พร้อม Capacity
 */
const updateSchedule = async (id, updateData) => {
  const schedule = await ClassesSchedule.findByPk(id, {
    include: [{ model: ClassesCapacity, as: "capacity_data" }],
  });

  if (!schedule) {
    const error = new Error(`Schedule with ID ${id} not found.`);
    error.status = 404; // Not Found
    throw error;
  }

  const newStartTimeStr = updateData.start_time || schedule.start_time;
  const newEndTimeStr = updateData.end_time || schedule.end_time;
  const newGymEnum = updateData.gym_enum || schedule.gym_enum;
  const newIsPrivateClass =
    updateData.is_private_class !== undefined
      ? updateData.is_private_class
      : schedule.is_private_class;
  const currentCapacity = schedule.capacity_data
    ? schedule.capacity_data.capacity
    : 0;
  const newCapacity =
    updateData.capacity !== undefined ? updateData.capacity : currentCapacity;

  const gyms_id = newGymEnum === "STING_CLUB" ? 1 : 2;

  console.log(
    "[Service] updateSchedule validation:",
    newStartTimeStr,
    newEndTimeStr,
    newCapacity
  );

  // ตรวจสอบความถูกต้องของ Input
  _validateScheduleInput(newStartTimeStr, newEndTimeStr, newCapacity);

  // ตรวจสอบการทับซ้อน โดยยกเว้น ID ของ Schedule ที่กำลังอัปเดต
  // const existingOverlap = await _checkOverlap(newStartTimeStr, newEndTimeStr, newGymEnum, id, newIsPrivateClass);

  // if (existingOverlap) {
  //     const error = new Error("Time conflict: The updated time slot overlaps with an existing schedule.");
  //     error.status = 409; // Conflict
  //     throw error;
  // }

  const transaction = await ClassesSchedule.sequelize.transaction();

  try {
    // 1. อัปเดต Schedule Master
    await schedule.update(
      {
        ...updateData,
        start_time: newStartTimeStr,
        end_time: newEndTimeStr,
        updated_by: updateData.user || "API_CALL",
        gyms_id: gyms_id,
      },
      { transaction }
    );

    // 2. อัปเดต Capacity ถ้ามีการส่งค่า capacity มา
    if (updateData.capacity !== undefined) {
      await ClassesCapacity.update(
        {
          capacity: updateData.capacity,
          updated_by: updateData.user || "API_CALL",
        },
        {
          where: { classes_id: id },
          transaction,
        }
      );
    }

    await transaction.commit();

    // ดึงข้อมูลล่าสุดกลับไป
    return await ClassesSchedule.findByPk(id, {
      include: [{ model: ClassesCapacity, as: "capacity_data" }],
    });
  } catch (error) {
    await transaction.rollback();
    if (error.status) throw error;

    console.error("[DB Error] Failed to update schedule and capacity:", error);
    throw new Error("Internal server error during schedule update.");
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
 * [READ] ดึงข้อมูล Schedule ทั้งหมด หรือตามช่วงเวลา พร้อม Capacity
 */
const getSchedules = async (startDate, endDate) => {
  const whereCondition = {};

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      const error = new Error("Invalid date format for filtering.");
      error.status = 400;
      throw error;
    }

    // ค้นหา Schedule ที่ start_time หรือ end_time อยู่ในช่วงที่กำหนด
    whereCondition[Op.or] = [
      { start_time: { [Op.between]: [start, end] } },
      { end_time: { [Op.between]: [start, end] } },
    ];
  }

  try {
    return await ClassesSchedule.findAll({
      where: whereCondition,
      order: [["start_time", "ASC"]],
      include: [{ model: ClassesCapacity, as: "capacity_data" }], // ดึง Capacity มาด้วย
    });
  } catch (error) {
    console.error("[DB Error] Failed to retrieve schedules:", error);
    throw new Error("Internal server error during schedule retrieval.");
  }
};

const getAvailableSchedulesByBookingDate = async (
  date,
  gymEnum,
  isPrivateClass
) => {
  try {
    const targetDate = dayjs(date);

    // ✅ คำนวณ Start/End of Day ไว้ก่อนเลย เพื่อใช้ในการ Query Advance Config
    const startOfDay = targetDate.startOf("day").toDate();
    const endOfDay = targetDate.endOf("day").toDate();

    console.log("--------------- DEBUG AVAILABLE SCHEDULES ---------------");
    console.log("Input Date:", date);
    console.log("Target Date:", targetDate.toISOString());
    console.log("StartOfDay:", startOfDay.toISOString());
    console.log("EndOfDay:", endOfDay.toISOString());
    console.log("GymEnum:", gymEnum);

    // 1. เช็คก่อนว่ายิมปิดทั้งยิมไหม
    // ใช้ startOfDay เพื่อให้เวลา (Time component) ไม่ส่งผลต่อการหา (เช่น ส่งมา 03:00 น. แต่ใน DB เก็บ 00:00 น.)
    const gymClosures = await ClassesBookingInAdvance.findAll({
      where: {
        is_close_gym: true,
        classes_schedule_id: null, // ปิดทั้งยิม
        start_date: { [Op.lte]: startOfDay },
        end_date: { [Op.gte]: startOfDay },
      },
    });

    // สร้าง Set ของ gyms_id ที่ปิด
    const closedGymIds = new Set(gymClosures.map((g) => g.gyms_id));
    console.log("Found Gym Closures:", gymClosures.length);
    console.log("Closed Gym IDs:", Array.from(closedGymIds));

    // 2. ดึง schedules ทั้งหมด
    const whereSchedule = {};
    if (gymEnum) {
      whereSchedule.gym_enum = gymEnum;
    }
    if (isPrivateClass !== undefined) {
      whereSchedule.is_private_class = isPrivateClass;
    }

    const schedules = await ClassesSchedule.findAll({
      where: whereSchedule,
      include: [
        {
          model: ClassesCapacity,
          as: "capacity_data",
          required: true,
          attributes: ["id", "capacity"],
        },
      ],
      attributes: ["id", "start_time", "end_time", "gyms_id", "gym_enum"],
      order: [["start_time", "ASC"]],
    });
    console.log("Found Base Schedules:", schedules.length);

    // 3. ดึง advance configs ที่ active ในวันนี้
    // เช่นกัน ใช้ startOfDay ในการ query เพื่อความแม่นยำ
    const advanceConfigs = await ClassesBookingInAdvance.findAll({
      where: {
        classes_schedule_id: { [Op.not]: null }, // เฉพาะ config ที่ระบุ schedule
        is_close_gym: false,
        start_date: { [Op.lte]: startOfDay },
        end_date: { [Op.gte]: startOfDay },
      },
    });

    // สร้าง map ของ schedule_id -> capacity
    const advanceCapacityMap = new Map();
    for (const config of advanceConfigs) {
      advanceCapacityMap.set(config.classes_schedule_id, config.capacity);
    }

    console.log("advanceCapacityMap", advanceCapacityMap);

    // 4. ดึง booking counts สำหรับวันนี้
    // startOfDay, endOfDay คำนวณไว้ข้างบนแล้ว

    const bookingCounts = await ClassesBooking.findAll({
      where: {
        booking_status: { [Op.notIn]: ["CANCELED", "FAILED"] },
        date_booking: { [Op.between]: [startOfDay, endOfDay] },
      },
      attributes: [
        "classes_schedule_id",
        [Sequelize.fn("SUM", Sequelize.col("capacity")), "total_booked"],
      ],
      group: ["classes_schedule_id"],
      raw: true,
    });

    // สร้าง map ของ schedule_id -> booked count
    const bookedMap = new Map();
    for (const b of bookingCounts) {
      bookedMap.set(b.classes_schedule_id, parseInt(b.total_booked) || 0);
    }

    // 5. Filter และ map ผลลัพธ์
    const availableSchedules = [];
    console.log("closedGymIds", closedGymIds);
    for (const schedule of schedules) {
      if (closedGymIds.has(schedule.gyms_id)) {
        continue;
      }

      const maxCapacity = advanceCapacityMap.has(schedule.id)
        ? advanceCapacityMap.get(schedule.id)
        : schedule.capacity_data?.capacity || 0;

      const bookedCount = bookedMap.get(schedule.id) || 0;

      // ✅ เอา if (bookedCount < maxCapacity) ออก
      // แล้ว push ลง array ตรงๆ เลย
      availableSchedules.push({
        id: schedule.id,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        gym_enum: schedule.gym_enum,
        gyms_id: schedule.gyms_id,
        capacity_data: {
          id: schedule.capacity_data?.id,
          capacity: maxCapacity,
        },
        booking_count: bookedCount,
        available_seats: Math.max(0, maxCapacity - bookedCount),
        // เพิ่ม flag นี้ไปให้หน้าบ้านเช็คง่ายๆ
        is_full: bookedCount >= maxCapacity,
      });
    }

    return availableSchedules;
  } catch (error) {
    console.error(
      "[SUPABASE DB ERROR] getAvailableSchedulesByBookingDate:",
      error
    );
    throw error;
  }
};

/**
 * [DELETE] ลบรายการ Schedule ที่มีอยู่
 */
const deleteSchedule = async (id) => {
  // *TODO: ก่อนลบ ควรตรวจสอบว่ามี ClassesBooking ผูกอยู่กับ Schedule นี้หรือไม่

  try {
    const deletedCount = await ClassesSchedule.destroy({
      where: { id },
    });

    if (deletedCount === 0) {
      const error = new Error(`Schedule with ID ${id} not found.`);
      error.status = 404; // Not Found
      throw error;
    }

    return { message: `Schedule ID ${id} deleted successfully.` };
  } catch (error) {
    if (error.status) throw error;

    console.error("[DB Error] Failed to delete schedule:", error);

    // จัดการ Foreign Key Constraint Error (ถ้ามี Booking ผูกอยู่)
    if (error.name === "SequelizeForeignKeyConstraintError") {
      const fkError = new Error(
        "Cannot delete schedule: It is currently linked to existing bookings. Please delete related bookings first."
      );
      fkError.status = 409;
      throw fkError;
    }
    throw new Error("Internal server error during schedule deletion.");
  }
};

const createAdvancedSchedule = async (scheduleData) => {
  console.log("[Service] createAdvancedSchedule hit.");

  if (!ClassesBookingInAdvance.sequelize) {
    throw new Error("Sequelize is not initialized yet.");
  }

  const t = await ClassesBookingInAdvance.sequelize.transaction();

  try {
    let gymsId = scheduleData.gyms_id;

    // ✅ ถ้ามี schedule_id แต่ไม่มี gyms_id → หา gyms_id จาก schedule
    if (scheduleData.schedule_id && !gymsId) {
      const schedule = await ClassesSchedule.findByPk(
        scheduleData.schedule_id,
        { transaction: t }
      );

      if (!schedule) {
        const error = new Error("Class schedule not found.");
        error.status = 404;
        throw error;
      }

      gymsId = schedule.gyms_id;
      console.log(
        `[Service] Derived gyms_id ${gymsId} from schedule ${scheduleData.schedule_id}`
      );
    }

    // ✅ กรณีปิดยิมทั้งยิม → ต้องมี gyms_id
    if (scheduleData.is_close_gym && !gymsId) {
      const error = new Error("gyms_id is required for gym closure.");
      error.status = 400;
      throw error;
    }

    // ✅ Validate gym exists
    if (gymsId) {
      const gymExist = await Gyms.count({
        where: { id: gymsId },
        transaction: t,
      });
      if (!gymExist) {
        const error = new Error("Gym not found");
        error.status = 404;
        throw error;
      }
    }

    // ✅ เช็ค availability (ถ้าไม่ใช่ปิดยิม)
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

    const newRecord = await ClassesBookingInAdvance.create(
      {
        classes_schedule_id: scheduleData.schedule_id || null,
        start_date: scheduleData.start_date,
        end_date: scheduleData.end_date,
        capacity: scheduleData.capacity,
        is_close_gym: scheduleData.is_close_gym || false,
        gyms_id: gymsId,
      },
      { transaction: t }
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

const _checkAvailability = async (
  startDate,
  endDate,
  classesScheduleId,
  isCloseGym,
  capacity,
  gymEnum,
  transaction
) => {
  if (isCloseGym) {
    return "Gym is closed.";
  }

  console.log("[Service] Checking availability for ID:", classesScheduleId);

  // ✅ แก้ไข: ตรวจสอบว่ามี transaction และเข้าถึง LOCK ได้ถูกต้อง
  const lockOption = transaction
    ? { transaction, lock: transaction.LOCK.UPDATE }
    : {};

  const schedule = await ClassesSchedule.findByPk(
    classesScheduleId,
    lockOption
  );

  if (!schedule) {
    const error = new Error("Class schedule not found.");
    error.status = 404;
    throw error;
  }

  // ✅ แก้ไข: เปลี่ยนชื่อตัวแปรให้ตรงกับ parameter (classesScheduleId)
  const capacityData = await ClassesCapacity.findOne({
    where: { classes_id: classesScheduleId },
    transaction,
  });

  if (!capacityData) {
    const error = new Error("Capacity not found for this class.");
    error.status = 404;
    throw error;
  }

  const startOfDay = new Date(startDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  const currentBookingCount = await ClassesBooking.sum("capacity", {
    where: {
      classes_schedule_id: classesScheduleId, // ✅ แก้ชื่อตัวแปร
      date_booking: {
        [Op.between]: [startOfDay, endOfDay],
      },
      booking_status: {
        [Op.notIn]: ["CANCELED", "FAILED"],
      },
    },
    transaction,
  });

  const usedCapacity = currentBookingCount || 0;
  // ✅ ใช้ capacity ที่ส่งมา (ถ้ามี) เป็น maxCapacity ถ้าไม่มีให้ใช้จาก DB
  const maxCapacity = capacity !== undefined ? capacity : capacityData.capacity;

  if (usedCapacity > maxCapacity) {
    return `ขณะนี้มีการจองเกินความจุใหม่: ${usedCapacity}/${maxCapacity} (จองแล้ว ${usedCapacity} แต่ปรับลดเหลือ ${maxCapacity}) โปรแจ้งลูกค้าเพื่อทำการย้ายคลาสหรือยกเลิก`;
  }

  return null;
};

const getAdvancedSchedules = async (filters = {}) => {
  const { start_date, end_date, gym_enum } = filters;
  const whereClause = {};

  if (start_date && end_date) {
    whereClause.start_date = { [Op.lte]: new Date(end_date) };
    whereClause.end_date = { [Op.gte]: new Date(start_date) };
  } else if (start_date) {
    whereClause.end_date = { [Op.gte]: new Date(start_date) };
  }

  // ถ้ามีการกรองด้วย gym_enum อาจจะต้อง join กับ Gyms หรือ Schedule
  // แต่ในที่นี้เรา query จาก BookingInAdvance โดยตรง

  const configs = await ClassesBookingInAdvance.findAll({
    where: whereClause,
    include: [
      {
        model: ClassesSchedule, // Join เพื่อเอาข้อมูล Schedule
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
    // แปลงเป็น plain object
    const item = config.toJSON();

    if (item.is_close_gym) {
      gym_closures.push({
        id: item.id,
        gyms_id: item.gyms_id,
        is_close_gym: true,
        start_date: item.start_date,
        end_date: item.end_date,
        description: item.classes_schedule_id
          ? `Closed Class: ${item.schedule?.start_time}-${item.schedule?.end_time}`
          : "Gym Closed (All Day)",
      });
    } else {
      capacity_adjustments.push({
        id: item.id,
        schedule_id: item.classes_schedule_id,
        gym_enum: item.schedule?.gym_enum,
        time_slot: item.schedule
          ? `${item.schedule.start_time} - ${item.schedule.end_time}`
          : "Unknown",
        original_capacity: null, // ไม่มีเก็บไว้แล้ว
        new_capacity: item.capacity,
        start_date: item.start_date,
        end_date: item.end_date,
      });
    }
  }

  return {
    gym_closures,
    capacity_adjustments,
  };
};

const updateAdvancedSchedule = async (id, updateData) => {
  console.log(`[Service] updateAdvancedSchedule hit for ID: ${id}`);

  const config = await ClassesBookingInAdvance.findByPk(id);
  if (!config) {
    const error = new Error("Advanced configuration not found.");
    error.status = 404;
    throw error;
  }

  const t = await ClassesBookingInAdvance.sequelize.transaction();

  try {
    // Merge existing data with updates for validation
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
      classes_schedule_id: updateData.schedule_id || config.classes_schedule_id, // allow mapping schedule_id from body
      gyms_id: updateData.gyms_id || config.gyms_id,
    };

    // If switching to gym closure, enforce rules
    if (nextData.is_close_gym) {
      // Must have gyms_id (usually already there)
      if (!nextData.gyms_id) {
        const error = new Error("gyms_id is required for gym closure.");
        error.status = 400;
        throw error;
      }
      // Should clear schedule if it was set? Or just ignore it?
      // Best to nullify schedule_id if closing gym entirely?
      // User logic: "case 2: close gym -> schedule_id invalid/null"
      // Let's force null if closing gym
      // nextData.classes_schedule_id = null; // Optional: Enforce this policy?
    } else {
      // Not closing gym -> must have schedule_id
      if (!nextData.classes_schedule_id) {
        const error = new Error(
          "schedule_id is required for capacity adjustment."
        );
        error.status = 400;
        throw error;
      }

      // Validation check availability
      // Only check if relevant fields changed
      const isScheduleChanged =
        updateData.schedule_id &&
        updateData.schedule_id !== config.classes_schedule_id;
      const isDateChanged = updateData.start_date || updateData.end_date;
      const isCapacityChanged = updateData.capacity !== undefined;

      if (isScheduleChanged || isDateChanged || isCapacityChanged) {
        await _checkAvailability(
          nextData.start_date,
          nextData.end_date,
          nextData.classes_schedule_id,
          nextData.is_close_gym,
          nextData.capacity,
          updateData.gym_enum, // might be missing if not passed, but _check doesn't strictly need it for error logic inside
          t
        );
      }
    }

    await config.update(
      {
        start_date: nextData.start_date,
        end_date: nextData.end_date,
        capacity: nextData.capacity,
        is_close_gym: nextData.is_close_gym,
        classes_schedule_id: nextData.classes_schedule_id,
        gyms_id: nextData.gyms_id,
      },
      { transaction: t }
    );

    await t.commit();
    return config;
  } catch (error) {
    if (t) await t.rollback();
    throw error;
  }
};

const deleteAdvancedSchedule = async (id) => {
  console.log(`[Service] deleteAdvancedSchedule hit for ID: ${id}`);
  const deletedCount = await ClassesBookingInAdvance.destroy({
    where: { id },
  });

  if (deletedCount === 0) {
    const error = new Error("Advanced configuration not found.");
    error.status = 404;
    throw error;
  }

  return { message: "Configuration deleted successfully." };
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
  updateAdvancedSchedule, // ✅ export
  deleteAdvancedSchedule, // ✅ export
};
