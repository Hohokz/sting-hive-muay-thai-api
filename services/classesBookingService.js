const {
  ClassesBooking,
  ClassesSchedule,
  ClassesCapacity,
} = require("../models/Associations");
const { sequelize } = require("../config/db");
const { Op, fn, col, literal } = require("sequelize");
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
  capacity
) => {
  // ✅ 1. LOCK เฉพาะ schedule
  const schedule = await ClassesSchedule.findByPk(classes_schedule_id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

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
  const currentBookingCount = await ClassesBooking.sum("capacity", {
    where: {
      classes_schedule_id,
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
  const fs = require("fs");
  const path = require("path");
  const schedule = await getSchedulesById(classes_schedule_id);
  if (schedule == null) {
    const error = new Error("Schedule not found.");
    error.status = 404;
    throw error;
  }
  const url = process.env.FRONT_END_URL;
  let templatePath = "";

  if (update_flag === "Y") {
    // ✅ RESCHEDULE
    templatePath = "../templates/booking-reschedule-email.html";
  } else if (update_flag === "C") {
    // ✅ CANCEL
    templatePath = "../templates/booking-cancellation-email.html";
  } else {
    // ✅ CONFIRM
    templatePath = "../templates/booking-confirmation-email.html";
  }

  emailTemplate = fs
    .readFileSync(path.join(__dirname, templatePath), "utf8")
    .replace("{{client_name}}", client_name)
    .replace("{{class_type}}", is_private ? "Private Class" : "Group Class")
    .replace("{{date_human}}", new Date(date_booking).toDateString())
    .replace("{{time_human}}", `${schedule.start_time} - ${schedule.end_time}`)
    .replace("{{location}}", "Sting Club Muay Thai Gym")
    .replace("{{trainer_name}}", "Sting Coach")
    .replace("{{action_url}}", `${url}/edit-booking/${newBooking.id}`)
    .replace("{{help_url}}", `https://stinggym.com/support`)
    .replace("{{location_map}}", `https://maps.google.com`);

  // ✅ 6. ส่งอีเมล
  if (client_email) {
    try {
      await sendBookingConfirmationEmail(
        client_email,
        "Your Muay Thai Class — Booking Confirmed 🥊",
        emailTemplate
      );
    } catch (emailError) {
      console.error(
        "[EMAIL ERROR] Send failed but booking success:",
        emailError
      );
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
    await _checkAvailability(classes_schedule_id, transaction, capacity);

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

  try {
    // 1. เช็คว่า booking มีอยู่จริง
    let booking = await ClassesBooking.findByPk(bookingId, { transaction });

    if (!booking) {
      const error = new Error("Booking not found.");
      error.status = 404;
      throw error;
    }

    // 2. (Optional) กัน email ซ้ำในคลาสเดิม ถ้ามีการแก้ email
    if (client_email !== booking.client_email) {
      const error = new Error("This email not booked this class.");
      error.status = 409;
      throw error;
    }

    // 3. อัปเดตข้อมูล
    booking = await booking.update(
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
    return booking;
  } catch (error) {
    await transaction.rollback();
    console.error("[Booking Service] Update Error:", error);
    throw error;
  } finally {
    // ✅ ส่งเมลเฉพาะตอนสร้างสำเร็จเท่านั้น
    if (booking) {
      try {
        await sendEmailBookingConfirmation(
          client_email,
          client_name,
          is_private,
          date_booking,
          booking,
          classes_schedule_id,
          "Y"
        );
      } catch (mailErr) {
        console.error("📧 Email send failed:", mailErr);
        // ❗ ไม่ throw เพราะไม่ควรทับ error หลัก
      }
    }
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
  try {
    let booking = await ClassesBooking.findByPk(bookingId, { transaction });

    if (!booking) {
      const error = new Error("Booking not found.");
      error.status = 404;
      throw error;
    }

    // ถ้าเปลี่ยนเป็น SUCCEED/RESCHEDULED ต้องเช็ค Capacity อีกรอบไหม?
    // ปกติ PENDING ถือว่าจองที่ไว้แล้ว ไม่ต้องเช็คซ้ำ แต่ถ้ากู้คืนจาก CANCELED -> PENDING ต้องเช็ค
    if (
      ["CANCELED", "FAILED"].includes(booking.booking_status) &&
      ["PENDING", "SUCCEED"].includes(newStatus)
    ) {
      await _checkAvailability(booking.classes_schedule_id, transaction);
    }

    booking = await booking.update(
      {
        booking_status: newStatus,
        updated_by: user || "ADMIN",
      },
      { transaction }
    );

    await transaction.commit();
    return booking;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }finally {
    // ✅ ส่งเมลเฉพาะตอนสร้างสำเร็จเท่านั้น
    if (booking) {
      try {
        await sendEmailBookingConfirmation(
          client_email,
          client_name,
          is_private,
          date_booking,
          booking,
          classes_schedule_id,
          "C"
        );
      } catch (mailErr) {
        console.error("📧 Email send failed:", mailErr);
        // ❗ ไม่ throw เพราะไม่ควรทับ error หลัก
      }
    }
  }
};

module.exports = {
  createBooking,
  updateBooking,
  getBookings,
  updateBookingStatus,
};
