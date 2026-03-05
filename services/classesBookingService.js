const {
  ClassesBooking,
  ClassesSchedule,
  ClassesCapacity,
  ClassesBookingInAdvance,
  User,
} = require("../models/Associations");
const { sequelize } = require("../config/db");
const { Op } = require("sequelize");
const fs = require("fs");
const path = require("path");
const { sendBookingConfirmationEmail } = require("../utils/emailService");
const { getSchedulesById, getScheduleRealtimeAvailability } = require("../services/classesScheduleService");
const activityLogService = require("../services/activityLogService");
const cacheUtil = require("../utils/cacheUtility");


const { BOOKING_STATUS } = require("../models/Enums");

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");

dayjs.extend(utc);

// =================================================================
// HELPER FUNCTIONS
// =================================================================

// =================================================================
// 1. HELPER / VALIDATION FUNCTIONS
// =================================================================

/**
 * ตรวจสอบความถูกต้องของการจอง (เช่น วันที่เป็นอดีต, ความเหมาะสมของ Trainer)
 */
const _validateBooking = (bookingData, performedByUser) => {
  const { is_private, date_booking, trainer } = bookingData;
  const isAdmin = performedByUser?.role === "ADMIN";

  // 1. Trainer ต้องเป็น Private Class เท่านั้น
  if (trainer && !is_private) {
    const error = new Error("Trainer สามารถเลือกได้เฉพาะคลาสส่วนตัว (Private) เท่านั้น");
    error.status = 400;
    throw error;
  }

  // 2. ตรวจสอบวันที่จอง (ห้ามจองย้อนหลัง เว้นแต่เป็น Admin)
  const today = dayjs().startOf("day");
  const bookingDateObj = dayjs(date_booking).startOf("day").hour(7);

  if (!isAdmin && bookingDateObj.isBefore(today)) {
    const error = new Error("ไม่สามารถจองคลาสในวันที่ผ่านมาแล้วได้");
    error.status = 400;
    throw error;
  }

  return bookingDateObj.toDate();
};

/**
 * ตรวจสอบที่ว่างในคลาส (Check Availability)
 */
const _checkAvailability = async (classesScheduleId, transaction, previousQty, requestedSeats, bookingDate) => {
  const { 
    maxCapacity, 
    currentBookingCount, 
    isCloseGym, 
    isClassClosed, 
    closuresReason 
  } = await getScheduleRealtimeAvailability(classesScheduleId, bookingDate, { transaction, lock: true });

  if (isCloseGym || isClassClosed) {
    const error = new Error(closuresReason === "Gym Closed" ? "ยิมปิดให้บริการในวันที่เลือก" : "คลาสนี้นี้ปิดให้บริการในวันที่เลือก");
    error.status = 409;
    throw error;
  }

  // คำนวณยอดจองของผู้อื่น (ไม่รวมยอดเดิมที่เรากำลังจะอัปเดต)
  const seatsTakenByOthers = Math.max(0, currentBookingCount - previousQty);
  const totalAfterBooking = seatsTakenByOthers + requestedSeats;

  if (totalAfterBooking > maxCapacity) {
    const remainingSeats = Math.max(0, maxCapacity - seatsTakenByOthers);
    const error = new Error(`ที่นั่งไม่พอ: เหลือเพียง ${remainingSeats} ที่นั่ง (คุณต้องการ ${requestedSeats})`);
    error.status = 409;
    throw error;
  }
};

/**
 * ส่งอีเมลยืนยันการจอง/เปลี่ยนแปลง/ยกเลิก
 */
const sendEmailBookingConfirmation = async (clientEmail, clientName, isPrivate, dateBooking, booking, scheduleId, type, capacity) => {
  if (!clientEmail) return;

  const schedule = await getSchedulesById(scheduleId);
  if (!schedule) return;

  const gymName = schedule.gym_enum === "STING_HIVE" ? "Sting Hive Muay Thai Gym" : "Sting Club Muay Thai Gym";
  const baseUrl = (process.env.FRONT_END_URL || "").replace(/\/$/, "");

  let templateFile = "booking-confirmation-email.html";
  let subject = "Your Muay Thai Class — Booking Confirmed 🥊";

  if (type === "Y") {
    templateFile = "booking-reschedule-email.html";
    subject = "Your Muay Thai Class — Rescheduled 🥊";
  } else if (type === "C") {
    templateFile = "booking-cancel-email.html";
    subject = "Your Muay Thai Class — Canceled ❌";
  }

  const templatePath = path.join(__dirname, "../templates", templateFile);
  if (!fs.existsSync(templatePath)) {
    console.error("Email template not found:", templatePath);
    return;
  }

  try {
    let html = fs.readFileSync(templatePath, "utf8");
    const replacements = {
      "{{client_name}}": clientName,
      "{{class_type}}": isPrivate ? "Private Class" : "Group Class",
      "{{date_human}}": dayjs(dateBooking).format("MMMM D, YYYY"),
      "{{time_human}}": `${schedule.start_time} - ${schedule.end_time}`,
      "{{trainer_name}}": booking.trainer || "Sting Coach",
      "{{action_url}}": `${baseUrl}/edit-booking/${encodeURIComponent(booking.id)}`,
      "{{help_url}}": "https://stinggym.com/support",
      "{{location_map}}": "https://maps.google.com",
      "{{booking_url}}": `${baseUrl}/booking`,
      "{{participant}}": capacity,
      "{{location}}": gymName,
    };

    Object.keys(replacements).forEach(key => {
      html = html.split(key).join(replacements[key]);
    });

    await sendBookingConfirmationEmail(clientEmail, subject, html);
    console.log(`[Email] Sent ${type} confirmation to ${clientEmail}`);
  } catch (err) {
    console.error("[Email Error] Failed to send email:", err.message);
  }
};

// =================================================================
// CORE SERVICE FUNCTIONS
// =================================================================

/**
 * [CREATE] สร้างการจองใหม่ (Booking)
 */
const createBooking = async (bookingData, performedByUser = null) => {
  const {
    classes_schedule_id,
    client_name,
    client_email,
    client_phone,
    capacity,
    is_private,
    date_booking,
    trainer,
    multiple_students,
  } = bookingData;

  // 1. ตรวจสอบเงื่อนไขการจอง
  const normalizedBookingDate = _validateBooking(bookingData, performedByUser);

  const transaction = await sequelize.transaction();
  let newBooking = null;

  try {
    // 2. ตรวจสอบที่นั่งว่าง (Lock แถวเพื่อกัน Race Condition)
    await _checkAvailability(classes_schedule_id, transaction, 0, capacity, normalizedBookingDate);

    // 3. ดึงข้อมูลตารางเรียน
    const schedule = await getSchedulesById(classes_schedule_id);
    if (!schedule) {
      const error = new Error("ไม่พบตารางเรียนที่ระบุ");
      error.status = 404;
      throw error;
    }

    // 4. บันทึกการจอง
    newBooking = await ClassesBooking.create(
      {
        classes_schedule_id,
        client_name,
        client_email,
        client_phone,
        booking_status: "SUCCEED",
        capacity,
        is_private: is_private || false,
        date_booking: normalizedBookingDate,
        created_by: performedByUser?.name || performedByUser?.username || client_name || "CLIENT_APP",
        gyms_id: schedule.gyms_id,
        gyms_enum: schedule.gym_enum,
        trainer: trainer || "",
        multipleStudents: multiple_students || false,
      },
      { transaction }
    );

    // 5. บันทึก Log
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || client_name || "CLIENT_APP",
      service: "BOOKING",
      action: "CREATE",
      details: { booking_id: newBooking.id, client_name, date_booking: normalizedBookingDate, capacity },
    });

    await transaction.commit();

    // ✅ Invalidate Availability Cache
    cacheUtil.clearByPrefix("availability");

    return newBooking;
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("[Booking Service] Create Error:", error);
    throw error;
  } finally {
    // 6. ส่งเมลยืนยันการจอง (กระทำนอก Transaction)
    if (newBooking) {
      sendEmailBookingConfirmation(
        client_email,
        client_name,
        is_private,
        date_booking,
        newBooking,
        classes_schedule_id,
        "N",
        capacity
      );
    }
  }
};

/**
 * [UPDATE] อัปเดตข้อมูลการจอง
 */
const updateBooking = async (bookingId, updateData, performedByUser = null) => {
  const {
    classes_schedule_id,
    client_name,
    client_email,
    client_phone,
    capacity,
    is_private,
    date_booking,
    trainer,
    multiple_students,
  } = updateData;

  // 1. ตรวจสอบเงื่อนไขใหม่
  const normalizedBookingDate = _validateBooking(updateData, performedByUser);

  const transaction = await sequelize.transaction();
  let updatedBooking = null;

  try {
    // 2. ตรวจสอบว่ามีข้อมูลการจองเดิมอยู่จริง
    const booking = await ClassesBooking.findByPk(bookingId, { transaction });
    if (!booking) {
      const error = new Error("ไม่พบข้อมูลการจองที่ต้องการแก้ไข");
      error.status = 404;
      throw error;
    }

    // 3. ถ้ามีการเปลี่ยนคลาสหรือวันที่ หรือเพิ่มจำนวนคน → ต้องเช็คที่นั่งใหม่
    const isSameSlot = dayjs(date_booking).isSame(dayjs(booking.date_booking), "day") && classes_schedule_id === booking.classes_schedule_id;
    
    if (capacity !== booking.capacity || !isSameSlot) {
      await _checkAvailability(
        classes_schedule_id, 
        transaction, 
        isSameSlot ? booking.capacity : 0, 
        capacity, 
        normalizedBookingDate
      );
    }

    const schedule = await getSchedulesById(classes_schedule_id);
    if (!schedule) throw new Error("ไม่พบตารางเรียนใหม่ที่ระบุ");

    const oldValues = {
      classes_schedule_id: booking.classes_schedule_id,
      capacity: booking.capacity,
      date_booking: booking.date_booking,
    };

    // 4. บันทึกการอัปเดต
    updatedBooking = await booking.update(
      {
        classes_schedule_id,
        client_name,
        client_email,
        client_phone,
        capacity,
        is_private,
        date_booking: normalizedBookingDate,
        gyms_id: schedule.gyms_id,
        gyms_enum: schedule.gym_enum,
        trainer: trainer || "",
        multipleStudents: multiple_students || false,
        updated_by: performedByUser?.name || performedByUser?.username || client_name || "CLIENT_APP",
        updated_date: new Date(),
      },
      { transaction }
    );

    // 5. บันทึก Log
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || client_name || "CLIENT_APP",
      service: "BOOKING",
      action: "UPDATE",
      details: { booking_id: booking.id, old_values: oldValues, new_values: { classes_schedule_id, capacity, date_booking: normalizedBookingDate } },
    });

    await transaction.commit();

    // ✅ Invalidate Availability Cache
    cacheUtil.clearByPrefix("availability");

    return updatedBooking;
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("[Booking Service] Update Error:", error);
    throw error;
  } finally {
    // 6. ส่งเมลแจ้งเลื่อนนัด (กระทำนอก Transaction)
    if (updatedBooking) {
      sendEmailBookingConfirmation(
        updatedBooking.client_email,
        updatedBooking.client_name,
        updatedBooking.is_private,
        updatedBooking.date_booking,
        updatedBooking,
        updatedBooking.classes_schedule_id,
        "Y",
        capacity
      );
    }
  }
};

/**
 * [UPDATE] อัปเดตบันทึกเพิ่มเติมโดย Admin
 */
const updateBookingNote = async (bookingId, note, performedByUser = null) => {
  try {
    const booking = await ClassesBooking.findByPk(bookingId);
    if (!booking) {
      const error = new Error("ไม่พบข้อมูลการจอง");
      error.status = 404;
      throw error;
    }

    await booking.update({
      admin_note: note,
      updated_by: performedByUser?.name || performedByUser?.username || "ADMIN",
      updated_date: new Date(),
    });

    // บันทึก Log
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
      service: "BOOKING",
      action: "UPDATE_NOTE",
      details: { booking_id: bookingId, note },
    });

    return { success: true, message: "อัปเดตบันทึกสำเร็จ" };
  } catch (error) {
    console.error("[Booking Service] Update Note Error:", error);
    throw error;
  }
};

/**
 * [READ] ดึงข้อมูล Booking (Filter ตาม Schedule หรือ User ได้)
 */
const getBookings = async (filters) => {
  const { classes_schedule_id, classes_booking_id, client_email, status } =
    filters;
  const whereCondition = {};

  if (classes_schedule_id)
    whereCondition.classes_schedule_id = classes_schedule_id;
  if (client_email) whereCondition.client_email = client_email;
  if (status) whereCondition.booking_status = status;
  if (classes_booking_id) whereCondition.id = classes_booking_id;

  try {
    const bookings = await ClassesBooking.findAll({
      where: whereCondition,
      include: [
        {
          model: ClassesSchedule,
          as: "schedule",
          attributes: ["start_time", "end_time", "gym_enum"], // ดึงข้อมูลเวลาเรียนมาด้วย
        },
      ],
      order: [["created_date", "DESC"]],
    });
    return bookings;
  } catch (error) {
    console.error("[Booking Service] Get Error:", error);
    throw new Error("Failed to retrieve bookings.");
  }
};

/**
 * [UPDATE STATUS] เปลี่ยนสถานะการจอง (เช่น Cancel, Confirm)
 */
const updateBookingStatus = async (bookingId, newStatus, user) => {
  const transaction = await sequelize.transaction();
  let updatedBooking = null;

  try {
    const booking = await ClassesBooking.findByPk(bookingId, { transaction });
    if (!booking) {
      const error = new Error("ไม่พบข้อมูลการจอง");
      error.status = 404;
      throw error;
    }

    const oldStatus = booking.booking_status;
    const needSeatStatuses = ["PENDING", "SUCCEED", "RESCHEDULED"];
    const noSeatStatuses = ["CANCELED", "FAILED"];

    // ถ้าเดิมไม่มีที่นั่ง (เช่น ยกเลิกไปแล้ว) แล้วต้องการกู้คืนกลับมา → ต้องเช็คที่ว่างใหม่
    if (noSeatStatuses.includes(oldStatus) && needSeatStatuses.includes(newStatus)) {
      await _checkAvailability(booking.classes_schedule_id, transaction, 0, booking.capacity, booking.date_booking);
    }

    updatedBooking = await booking.update(
      {
        booking_status: newStatus,
        updated_by: user?.name || user?.username || (typeof user === 'string' ? user : "ADMIN"),
        updated_date: new Date(),
      },
      { transaction }
    );

    // บันทึก Log
    await activityLogService.createLog({
      user_id: user?.id || null,
      user_name: user?.name || user?.username || (typeof user === 'string' ? user : "ADMIN"),
      service: "BOOKING",
      action: "UPDATE_STATUS",
      details: { booking_id: bookingId, old_status: oldStatus, new_status: newStatus },
    });

    await transaction.commit();

    // ✅ Invalidate Availability Cache
    cacheUtil.clearByPrefix("availability");

    return updatedBooking;
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  } finally {
    // ถ้าเป็นการยกเลิก ให้ส่งเมลแจ้งลูกค้า
    if (updatedBooking && newStatus === "CANCELED") {
      sendEmailBookingConfirmation(
        updatedBooking.client_email,
        updatedBooking.client_name,
        updatedBooking.is_private,
        updatedBooking.date_booking,
        updatedBooking,
        updatedBooking.classes_schedule_id,
        "C"  // FLAG CANCEL
      );
    }
  }
};

/**
 * [UPDATE] อัปเดตเทรนเนอร์ (เฉพาะ Private Class)
 */
const updateBookingTrainer = async (bookingId, trainer, performedByUser = null) => {
  try {
    const booking = await ClassesBooking.findByPk(bookingId);
    if (!booking) {
      const error = new Error("ไม่พบข้อมูลการจอง");
      error.status = 404;
      throw error;
    }

    if (!booking.is_private && trainer) {
      throw new Error("เทรนเนอร์สามารถระบุได้เฉพาะคลาสส่วนตัวเท่านั้น");
    }

    const oldTrainer = booking.trainer;
    await booking.update({
      trainer: trainer || "",
      updated_by: performedByUser?.name || performedByUser?.username || "ADMIN",
      updated_date: new Date(),
    });

    // บันทึก Log
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
      service: "BOOKING",
      action: "UPDATE_TRAINER",
      details: { booking_id: bookingId, old_trainer: oldTrainer, new_trainer: trainer },
    });

    return { success: true, message: "อัปเดตเทรนเนอร์สำเร็จ" };
  } catch (error) {
    console.error("[Booking Service] Update Trainer Error:", error);
    throw error;
  }
};

/**
 * [UPDATE] อัปเดตสถานะการชำระเงิน
 */
const updateBookingPayment = async (bookingId, payment_status, performedByUser = null) => {
  try {
    const booking = await ClassesBooking.findByPk(bookingId);
    if (!booking) {
      const error = new Error("ไม่พบข้อมูลการจอง");
      error.status = 404;
      throw error;
    }

    const oldStatus = booking.booking_status;
    const newStatus = payment_status ? "PAYMENTED" : "SUCCEED";

    await booking.update({
      booking_status: newStatus,
      updated_by: performedByUser?.name || performedByUser?.username || "ADMIN",
      updated_date: new Date(),
    });

    // บันทึก Log
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
      service: "BOOKING",
      action: "UPDATE_PAYMENT",
      details: { booking_id: bookingId, old_status: oldStatus, new_status: newStatus },
    });

    return { success: true, message: "อัปเดตสถานะการชำระเงินสำเร็จ" };
  } catch (error) {
    console.error("[Booking Service] Update Payment Error:", error);
    throw error;
  }
};

const getTrainerForRequest = async () => {
  try {
    const trainers = await User.findAll({
      where: { role: "USER" },
      attributes: { exclude: ["password"] },
      order: [["created_date", "DESC"]],
    });
    return trainers;
  } catch (error) {
    console.error("[Booking Service] Error fetching trainers:", error);
    throw new Error(`Error fetching trainers: ${error.message}`);
  }
};

const getBookingByName = async (name) => {
  try {
    const booking = await ClassesBooking.findAll({
      where: sequelize.where(
        sequelize.fn("LOWER", sequelize.col("client_name")),
        { [Op.like]: `%${name.toLowerCase()}%` }
      ),
      include: [
        {
          model: ClassesSchedule,
          as: "schedule",
          attributes: ["start_time", "end_time", "gym_enum"],
        },
      ],
      attributes: { exclude: ["password"] },
      order: [["created_date", "DESC"]],
    });
    return booking;
  } catch (error) {
    console.error("[Booking Service] Error fetching booking:", error);
    throw new Error(`Error fetching booking: ${error.message}`);
  }
};

module.exports = {
  createBooking,
  updateBooking,
  getBookings,
  updateBookingStatus,
  updateBookingNote,
  updateBookingTrainer,
  updateBookingPayment,
  getTrainerForRequest,
  getBookingByName,
};
