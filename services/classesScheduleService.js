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
        created_by: performedByUser?.name || performedByUser?.username || user || "API_CALL",
        gyms_id: gyms_id,


      },
      { transaction }
    );

    // 2. สร้าง Capacity ผูกกับ Schedule
    await ClassesCapacity.create(
      {
        classes_id: newSchedule.id,
        capacity: capacity,
        created_by: performedByUser?.name || performedByUser?.username || user || "API_CALL",


      },
      { transaction }
    );

    // ✅ Log Activity
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || user || "API_CALL",
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
const updateSchedule = async (id, updateData, performedByUser = null) => {

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
    // 3. Preserve old values for logging
    const oldValues = {
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      capacity: currentCapacity,
    };

    // 1. อัปเดต Schedule Master
    await schedule.update(
      {
        ...updateData,
        start_time: newStartTimeStr,
        end_time: newEndTimeStr,
        updated_by: performedByUser?.name || performedByUser?.username || updateData.user || "API_CALL",
        updated_date: new Date(),


        gyms_id: gyms_id,
      },
      { transaction }
    );

    // 2. อัปเดต Capacity ถ้ามีการส่งค่า capacity มา
    if (updateData.capacity !== undefined) {
      await ClassesCapacity.update(
        {
          capacity: updateData.capacity,
          updated_by: performedByUser?.name || performedByUser?.username || updateData.user || "API_CALL",
        },
        {
          where: { classes_id: id },
          transaction,
        }
      );
    }

    // ✅ Log Activity
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || updateData.user || "API_CALL",
      service: "SCHEDULE",
      action: "UPDATE",
      details: {
        schedule_id: id,
        old_values: oldValues,
        new_values: {
          start_time: newStartTimeStr,
          end_time: newEndTimeStr,
          capacity: newCapacity,
        },
      },
    });
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
const deleteSchedule = async (id, performedByUser = null) => {
  // *TODO: ก่อนลบ ควรตรวจสอบว่ามี ClassesBooking ผูกอยู่กับ Schedule นี้หรือไม่

  try {
    // ✅ Log Activity (Before Delete)
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

const deleteAdvancedSchedule = async (id, performedByUser = null) => {
  console.log(`[Service] deleteAdvancedSchedule hit for ID: ${id}`);
  
  // ✅ Log Activity (Before Delete)
  const configToDelete = await ClassesBookingInAdvance.findByPk(id);
  if (configToDelete) {
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
      service: "SCHEDULE",
      action: "DELETE_ADVANCED",
      details: {
        advanced_id: id,
      },
    });

  }


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
