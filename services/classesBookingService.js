const {
  ClassesBooking,
  ClassesSchedule,
  ClassesCapacity,
} = require("../models/Associations");
const { sequelize } = require("../config/db");
const { Op } = require("sequelize");
const fs = require("fs");
const path = require("path");
const { sendBookingConfirmationEmail } = require("../utils/emailService");
const { getSchedulesById } = require("../services/classesScheduleService");

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
  bookingData
) => {
  // ✅ 1. LOCK เฉพาะ schedule
  const schedule = await ClassesSchedule.findByPk(classes_schedule_id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  console.log(`bookingData : ${bookingData}`)

  if (!schedule) {
    const error = new Error("Class schedule not found.");
    error.status = 404;
    throw error;
  }

  // ✅ 2. ดึง capacity
  const capacityData = await ClassesCapacity.findOne({
    where: { classes_id: classes_schedule_id },
    transaction,
  });

  if (!capacityData) {
    const error = new Error("Capacity not found for this class.");
    error.status = 404;
    throw error;
  }

  // ✅ 3. นับ booking ที่ยัง active
  const startOfDay = new Date(bookingData);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(bookingData);
  endOfDay.setHours(23, 59, 59, 999);

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

  const usedCapacity = currentBookingCount || 0;
  const maxCapacity = capacityData.capacity;
  const totalAfterBooking = usedCapacity + capacity;

  console.log(`REQUEST: ${capacity}`);
  console.log(`USED: ${usedCapacity}`);
  console.log(`MAX: ${maxCapacity}`);
  console.log(`AFTER BOOKING: ${totalAfterBooking}`);

  // ✅ 4. เช็คว่าจองเกินหรือไม่ (logic ที่ถูกต้อง)
  if (totalAfterBooking > maxCapacity) {
    const error = new Error(
      `Capacity exceeded: ${usedCapacity}/${maxCapacity} (request ${capacity})`
    );
    error.status = 409;
    throw error;
  }

  // ✅ 5. เช็คว่าเต็มพอดีแล้ว (กันเผื่อ edge case)
  if (usedCapacity >= maxCapacity) {
    const error = new Error("This class is fully booked.");
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
  update_flag
) => {
  const schedule = await getSchedulesById(classes_schedule_id);
  if (!schedule) {
    const error = new Error("Schedule not found.");
    error.status = 404;
    throw error;
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
      new Date(date_booking).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    )
    .replace("{{time_human}}", `${schedule.start_time} - ${schedule.end_time}`)
    .replace("{{location}}", "Sting Club Muay Thai Gym")
    .replace("{{trainer_name}}", "Sting Coach")
    .replace(
      "{{action_url}}",
      `${url}/edit-booking/${encodeURIComponent(newBooking.id)}`
    )
    .replace("{{help_url}}", `https://stinggym.com/support`)
    .replace("{{location_map}}", `https://maps.google.com`)
    .replace("{{booking_url}}", `${url}/booking`);

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

  console.log("[Booking Service] Creating booking for:", bookingData);

  const transaction = await sequelize.transaction();
  let newBooking = null; // ✅ ต้องอยู่นอก try

  try {
    // 1. เช็คที่นั่ง
    await _checkAvailability(
      classes_schedule_id,
      transaction,
      capacity,
      date_booking
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

      if (existingBooking) {
        const error = new Error("You have already booked this class.");
        error.status = 409;
        throw error;
      }
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
          "N"
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

    const classes_schedule_id = booking.classes_schedule_id;

    // 2. ถ้ามีการเปลี่ยน capacity หรือ date → ต้องเช็คที่นั่งใหม่
    console.log(
      `capacity : ${capacity}, booking.capacity : ${booking.capacity}, date_booking : ${booking.capacity}, booking.date_booking : ${booking.date_booking}`
    );
    if (
      capacity !== booking.capacity ||
      date_booking !== booking.date_booking
    ) {
      await _checkAvailability(
        classes_schedule_id,
        transaction,
        capacity,
        date_booking
      );
    }

    // 4. Update
    updatedBooking = await booking.update(
      {
        client_name,
        client_email,
        client_phone,
        capacity,
        is_private,
        date_booking,
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
          "Y" // ✅ FLAG RESCHEDULE
        );
      } catch (mailErr) {
        console.error("📧 Email send failed:", mailErr);
      }
    }
  }
};

const updateBookingNote = async (bookingId, note) => {
  console.log("[Booking Service] Updating note for booking:", bookingId);

  try {
    // 1. เช็คว่ามีรายการนี้จริงไหม
    const booking = await ClassesBooking.findByPk(bookingId);

    if (!booking) {
      const error = new Error("Booking not found.");
      error.status = 404;
      throw error;
    }

    // 2. Update เฉพาะ Note (ไม่ต้องใช้ Transaction เพราะเป็น Operation เดียวที่เรียบง่าย)
    // และไม่ต้องเช็ค Availability เพราะไม่ได้เปลี่ยนวันหรือจำนวนคน
    await booking.update({
      note: note,
      updated_by: "ADMIN_QUICK_NOTE" // หรือดึงจาก user session ก็ได้ครับ
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
      await _checkAvailability(booking.classes_schedule_id, transaction);
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

module.exports = {
  createBooking,
  updateBooking,
  getBookings,
  updateBookingStatus,
  updateBookingNote
};
