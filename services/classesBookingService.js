const {
  ClassesBooking,
  ClassesSchedule,
  ClassesCapacity,
  ClassesBookingInAdvance,
} = require("../models/Associations");
const { sequelize } = require("../config/db");
const { Op } = require("sequelize");
const fs = require("fs");
const path = require("path");
const { sendBookingConfirmationEmail } = require("../utils/emailService");
const { getSchedulesById } = require("../services/classesScheduleService");
const { BOOKING_STATUS } = require("../models/Enums");

// =================================================================
// HELPER FUNCTIONS
// =================================================================

/**
 * ตรวจสอบที่ว่างในคลาส (Check Availability)
 * @param {string} scheduleId
 * @param {object} transaction - Database Transaction
 * @returns {Promise<void>} Throws error if full
 */
const _checkAvailability = async (
  classes_schedule_id,
  transaction,
  capacity,
  bookingData,
  gyms_id, // เพิ่ม parameter สำหรับเช็คปิดยิมทั้งยิม
  isUpdate
) => {
  // ✅ 1. LOCK เฉพาะ schedule (เพื่อความเป็นระเบียบในการเข้าถึง Row นี้)
  const schedule = await ClassesSchedule.findByPk(classes_schedule_id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!schedule) {
    const error = new Error("Class schedule not found.");
    error.status = 404;
    throw error;
  }

  // เตรียมวันที่สำหรับค้นหา
  const targetDate = new Date(bookingData);
  const startOfDay = new Date(targetDate).setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate).setHours(23, 59, 59, 999);

  // ✅ 1.5 เช็คก่อนว่ายิมปิดทั้งยิมหรือไม่
  const gymId = gyms_id || schedule.gyms_id;
  const gymClosed = await ClassesBookingInAdvance.findOne({
    where: {
      gyms_id: gymId,
      is_close_gym: true,
      classes_schedule_id: null, // ปิดทั้งยิม ไม่ระบุ schedule
      start_date: { [Op.lte]: targetDate },
      end_date: { [Op.gte]: targetDate },
    },
    transaction,
  });

  if (gymClosed) {
    const error = new Error("This gym is closed on the selected date.");
    error.status = 409;
    throw error;
  }

  // ✅ 2. หา Capacity: เริ่มจากหาใน Advanced Config ก่อน
  let maxCapacity;

  const advancedConfig = await ClassesBookingInAdvance.findOne({
    where: {
      classes_schedule_id,
      is_close_gym: false, // เฉพาะ config ที่ไม่ใช่ปิดยิม
      start_date: { [Op.lte]: targetDate },
      end_date: { [Op.gte]: targetDate },
    },
    transaction,
  });

  if (advancedConfig) {
    console.log(`[Check] Using Advanced Capacity: ${advancedConfig.capacity}`);
    maxCapacity = advancedConfig.capacity;

    // ถ้า Advanced ระบุว่าปิดคลาสนี้ ให้ Error ทันที
    if (advancedConfig.is_close_gym) {
      const error = new Error("This class is closed on the selected date.");
      error.status = 409;
      throw error;
    }
  } else {
    // ถ้าไม่มี Advanced Config ให้หาใน Capacity ปกติ
    const capacityData = await ClassesCapacity.findOne({
      where: { classes_id: classes_schedule_id },
      transaction,
    });

    if (!capacityData) {
      const error = new Error("Capacity not found for this class.");
      error.status = 404;
      throw error;
    }
    maxCapacity = capacityData.capacity;
  }

  // ✅ 3. นับจำนวน Booking ที่มีอยู่ในปัจจุบัน
  const currentBookingCount = await ClassesBooking.sum("capacity", {
    where: {
      classes_schedule_id,
      date_booking: {
        [Op.between]: [startOfDay, endOfDay],
      },
      booking_status: {
        [Op.notIn]: ["CANCELED", "FAILED"],
      },
    },
    transaction,
  });

  const usedCapacity = isUpdate
    ? currentBookingCount - capacity
    : currentBookingCount || 0;
  const totalAfterBooking = usedCapacity + capacity;

  // ✅ 4. ตรวจสอบเงื่อนไข
  if (usedCapacity >= maxCapacity) {
    const error = new Error("This class is already fully booked.");
    error.status = 409;
    throw error;
  }

  if (totalAfterBooking > maxCapacity) {
    const error = new Error(
      `Capacity exceeded: Only ${
        maxCapacity - usedCapacity
      } seats left (Requested ${capacity})`
    );
    error.status = 409;
    throw error;
  }

  return true;
};

const sendEmailBookingConfirmation = async (
  client_email,
  client_name,
  is_private,
  date_booking,
  newBooking,
  classes_schedule_id,
  update_flag,
  capacity
) => {
  const schedule = await getSchedulesById(classes_schedule_id);
  if (!schedule) {
    const error = new Error("Schedule not found.");
    error.status = 404;
    throw error;
  }

  let location;
  if ("STING_HIVE" === schedule.gym_enum) {
    location = "Sting Hive Muay Thai Gym";
  } else {
    location = "Sting Club Muay Thai Gym";
  }

  const url = process.env.FRONT_END_URL?.replace(/\/$/, "");
  let templatePath = "";
  let emailSubject = "";

  if (update_flag === "Y") {
    templatePath = "../templates/booking-reschedule-email.html";
    emailSubject = "Your Muay Thai Class — Rescheduled 🥊";
  } else if (update_flag === "C") {
    templatePath = "../templates/booking-cancel-email.html";
    emailSubject = "Your Muay Thai Class — Canceled ❌";
  } else {
    templatePath = "../templates/booking-confirmation-email.html";
    emailSubject = "Your Muay Thai Class — Booking Confirmed 🥊";
  }

  // ✅ เช็ค path ก่อนอ่านไฟล์ (กันพัง)
  const fullPath = path.join(__dirname, templatePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error("Email template not found: " + fullPath);
  }

  let emailTemplate = fs
    .readFileSync(fullPath, "utf8")
    .replace("{{client_name}}", client_name)
    .replace("{{class_type}}", is_private ? "Private Class" : "Group Class")
    .replace(
      "{{date_human}}",
      new Date(date_booking).toLocaleDateString("en-EN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    )
    .replace("{{time_human}}", `${schedule.start_time} - ${schedule.end_time}`)
    .replace("{{location}}", location)
    .replace("{{trainer_name}}", "Sting Coach")
    .replace(
      "{{action_url}}",
      `${url}/edit-booking/${encodeURIComponent(newBooking.id)}`
    )
    .replace("{{help_url}}", `https://stinggym.com/support`)
    .replace("{{location_map}}", `https://maps.google.com`)
    .replace("{{booking_url}}", `${url}/booking`)
    .replace("{{participant}}", capacity)
    .replace("{{location}}", location);

  if (client_email) {
    try {
      await sendBookingConfirmationEmail(
        client_email,
        emailSubject,
        emailTemplate
      );
      console.log("✅ [EMAIL SUCCESS] Confirmation sent to:", client_email);
    } catch (emailError) {
      console.error(
        "❌ [EMAIL ERROR] Failed to send email to:",
        client_email,
        emailError.message
      );
      throw emailError; // Re-throw to be caught by the service's catch/finally if needed
    }
  }
};

// =================================================================
// CORE SERVICE FUNCTIONS
// =================================================================

/**
 * [CREATE] สร้างการจองใหม่ (Booking)
 */
const createBooking = async (bookingData) => {
  const {
    classes_schedule_id,
    client_name,
    client_email,
    client_phone,
    capacity,
    is_private,
    date_booking,
  } = bookingData;

  const transaction = await sequelize.transaction();
  let newBooking = null; // ✅ ต้องอยู่นอก try

  try {
    // 1. เช็คที่นั่ง
    await _checkAvailability(
      classes_schedule_id,
      transaction,
      capacity,
      date_booking,
      null,
      false
    );

    // 2. กันจองซ้ำ
    if (client_email) {
      const existingBooking = await ClassesBooking.findOne({
        where: {
          classes_schedule_id,
          client_email,
          booking_status: { [Op.notIn]: ["CANCELED", "FAILED"] },
          date_booking,
        },
        transaction,
      });

      if (existingBooking && client_email !== "Stingcluboffice@gmail.com") {
        const error = new Error("You have already booked this class.");
        error.status = 409;
        throw error;
      }
    }

    const schedule = await getSchedulesById(classes_schedule_id);
    if (!schedule) {
      const error = new Error("Schedule not found.");
      error.status = 404;
      throw error;
    }

    // 3. Create booking
    newBooking = await ClassesBooking.create(
      {
        classes_schedule_id,
        client_name,
        client_email,
        client_phone,
        booking_status: "SUCCEED",
        capacity,
        is_private: is_private || false,
        date_booking,
        created_by: client_name || "CLIENT_APP",
        gyms_id: schedule.gyms_id,
        gyms_enum: schedule.gym_enum,
      },
      { transaction }
    );
    await transaction.commit();

    return newBooking;
  } catch (error) {
    await transaction.rollback();
    console.error("[Booking Service] Create Error:", error);
    throw error; // ✅ ส่ง error จริงกลับไป
  } finally {
    // ✅ ส่งเมลเฉพาะตอนสร้างสำเร็จเท่านั้น
    if (newBooking) {
      try {
        await sendEmailBookingConfirmation(
          client_email,
          client_name,
          is_private,
          date_booking,
          newBooking,
          classes_schedule_id,
          "N",
          capacity
        );
      } catch (mailErr) {
        console.error("📧 Email send failed:", mailErr);
        // ❗ ไม่ throw เพราะไม่ควรทับ error หลัก
      }
    }
  }
};

const updateBooking = async (bookingId, updateData) => {
  const {
    classes_schedule_id,
    client_name,
    client_email,
    client_phone,
    capacity,
    is_private,
    date_booking,
  } = updateData;

  console.log("[Booking Service] Updating booking:", bookingId, updateData);

  const transaction = await sequelize.transaction();
  let updatedBooking = null;

  try {
    // 1. เช็คว่า booking มีอยู่จริง
    const booking = await ClassesBooking.findByPk(bookingId, { transaction });

    if (!booking) {
      const error = new Error("Booking not found.");
      error.status = 404;
      throw error;
    }

    // 2. ถ้ามีการเปลี่ยน capacity หรือ date → ต้องเช็คที่นั่งใหม่
    if (
      capacity !== booking.capacity ||
      date_booking !== booking.date_booking ||
      classes_schedule_id !== booking.classes_schedule_id
    ) {
      await _checkAvailability(
        classes_schedule_id,
        transaction,
        capacity,
        date_booking,
        null,
        true
      );
    }

    const schedule = await getSchedulesById(classes_schedule_id);
    if (!schedule) {
      const error = new Error("Schedule not found.");
      error.status = 404;
      throw error;
    }
    // 4. Update
    updatedBooking = await booking.update(
      {
        classes_schedule_id,
        client_name,
        client_email,
        client_phone,
        capacity,
        is_private,
        date_booking,
        gyms_id: schedule.gyms_id,
        gyms_enum: schedule.gym_enum,
        updated_by: client_name || "CLIENT_APP",
      },
      { transaction }
    );

    await transaction.commit();
    return updatedBooking;
  } catch (error) {
    await transaction.rollback();
    console.error("[Booking Service] Update Error:", error);
    throw error;
  } finally {
    // ✅ ส่งเมลเฉพาะตอน UPDATE สำเร็จเท่านั้น
    if (updatedBooking) {
      try {
        await sendEmailBookingConfirmation(
          updatedBooking.client_email,
          updatedBooking.client_name,
          updatedBooking.is_private,
          updatedBooking.date_booking,
          updatedBooking,
          updatedBooking.classes_schedule_id,
          "Y",
          capacity // ✅ FLAG RESCHEDULE
        );
      } catch (mailErr) {
        console.error("📧 Email send failed:", mailErr);
      }
    }
  }
};

const updateBookingNote = async (bookingId, note) => {
  try {
    const booking = await ClassesBooking.findByPk(bookingId);

    if (!booking) {
      const error = new Error("Booking not found.");
      error.status = 404;
      throw error;
    }
    await booking.update({
      admin_note: note,
    });

    return { success: true, message: "Note updated successfully" };
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
 * การ Cancel จะทำให้ที่นั่งว่างลงโดยอัตโนมัติ เพราะ Logic _checkAvailability ไม่นับสถานะ CANCELED
 */
const updateBookingStatus = async (bookingId, newStatus, user) => {
  const transaction = await sequelize.transaction();
  let updatedBooking = null;

  try {
    const booking = await ClassesBooking.findByPk(bookingId, { transaction });

    if (!booking) {
      const error = new Error("Booking not found.");
      error.status = 404;
      throw error;
    }

    // ✅ ถ้ากำลัง "กู้คืนที่นั่ง" ต้องเช็ค capacity ใหม่
    const oldStatus = booking.booking_status;
    const needSeatStatuses = ["PENDING", "SUCCEED", "RESCHEDULED"];
    const noSeatStatuses = ["CANCELED", "FAILED"];

    if (
      noSeatStatuses.includes(oldStatus) &&
      needSeatStatuses.includes(newStatus)
    ) {
      await _checkAvailability(
        booking.classes_schedule_id,
        transaction,
        null,
        null,
        false
      );
    }

    updatedBooking = await booking.update(
      {
        booking_status: newStatus,
        updated_by: user || "ADMIN",
      },
      { transaction }
    );

    await transaction.commit();
    return updatedBooking;
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    // ✅ ส่งเมลเฉพาะตอน UPDATE สถานะสำเร็จจริง ๆ
    if (updatedBooking && newStatus === "CANCELED") {
      try {
        await sendEmailBookingConfirmation(
          updatedBooking.client_email,
          updatedBooking.client_name,
          updatedBooking.is_private,
          updatedBooking.date_booking,
          updatedBooking,
          updatedBooking.classes_schedule_id,
          "C" // ✅ FLAG CANCEL
        );
      } catch (mailErr) {
        console.error("📧 Email send failed:", mailErr);
      }
    }
  }
};

const updateBookingTrainer = async (bookingId, trainer) => {
  try {
    const booking = await ClassesBooking.findByPk(bookingId);

    if (!booking) {
      const error = new Error("Booking not found.");
      error.status = 404;
      throw error;
    }

    await booking.update({ trainer: trainer });
    console.log("[Booking Service] Trainer updated successfully");
    return { success: true, message: "Trainer updated successfully" };
  } catch (error) {
    console.error("[Booking Service] Update Trainer Error:", error);
    throw error;
  }
};

const updateBookingPayment = async (bookingId, payment_status) => {
  try {
    const booking = await ClassesBooking.findByPk(bookingId);
    if (!booking) {
      const error = new Error("Booking not found.");
      error.status = 404;
      throw error;
    }
    if (payment_status) {
      await booking.update({ booking_status: "PAYMENTED" });
    } else {
      await booking.update({ booking_status: "SUCCEED" });
    }
    return { success: true, message: "Payment status updated successfully" };
  } catch (error) {
    console.error("[Booking Service] Update Payment Error:", error);
    throw error;
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
};
