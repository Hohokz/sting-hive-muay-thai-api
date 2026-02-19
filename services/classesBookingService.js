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


const { BOOKING_STATUS } = require("../models/Enums");

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");

dayjs.extend(utc);

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
  newBookingCapacity,
  bookingData,
  gyms_id,
  isUpdate
) => {
  // ✅ 1. Use Shared Availability Logic
  // This handles: Lock, Gym Closure, Advance Config, Capacity Check, Current Bookings
  const { 
    maxCapacity, 
    currentBookingCount, 
    isCloseGym, 
    isClassClosed, 
    closuresReason 
  } = await getScheduleRealtimeAvailability(
    classes_schedule_id, 
    bookingData, 
    { transaction, lock: true }
  );

  // ✅ 2. Validate Closures
  if (isCloseGym || isClassClosed) {
    const error = new Error(
      closuresReason === "Gym Closed" 
        ? "This gym is closed on the selected date." 
        : "This class is closed on the selected date."
    );
    error.status = 409;
    throw error;
  }

  // ✅ 3. Capacity Calculation (Swap Logic for Update)
  // -------------------------------------------------------------

  // ยอดเดิมใน DB (Previous/Old):
  const previousQty = isUpdate ? capacity : 0;

  // ยอดใหม่ที่ขอจอง (Requested/New):
  const requestedSeats = newBookingCapacity;

  // -------------------------------------------------------------

  // คำนวณที่นั่งที่ถูกคนอื่นแย่งไปแล้ว
  // สูตร: ยอดรวมใน DB - ยอดเก่าของเรา
  const seatsTakenByOthers = Math.max(0, currentBookingCount - previousQty);

  // คำนวณยอดรวมสุทธิ (ที่นั่งคนอื่น + ที่นั่งใหม่ที่เราขอ)
  const totalAfterBooking = seatsTakenByOthers + requestedSeats;

  // -------------------------------------------------------------

  console.log("----------------Debug Capacity (Shared Logic)----------------");
  console.log("Date Checked:", bookingData);
  console.log("Current DB Count (Total):", currentBookingCount);
  console.log("My Old Qty (To remove):", previousQty);
  console.log("Seats taken by others:", seatsTakenByOthers);
  console.log("My New Request (To add):", requestedSeats);
  console.log("Total after this booking:", totalAfterBooking);
  console.log("Max Capacity:", maxCapacity);
  console.log("-------------------------------------------------------------");

  if (totalAfterBooking > maxCapacity) {
    // คำนวณที่นั่งที่เหลือจริงๆ ให้ User เห็น (Max - คนอื่นจอง)
    const remainingSeats = Math.max(0, maxCapacity - seatsTakenByOthers);

    const error = new Error(
      `Capacity exceeded: Only ${remainingSeats} seats left (Requested ${requestedSeats})`
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
      new Date(date_booking).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    )
    .replace("{{time_human}}", `${schedule.start_time} - ${schedule.end_time}`)
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

  console.log("🚀 [Booking Data]", bookingData);


  // Validation: Trainer can only be assigned to private classes
  if (trainer && !is_private) {
    const error = new Error("Trainer can only be assigned to private classes.");
    error.status = 400;
    throw error;
  }

  // ✅ [PAST DATE VALIDATION] Move to the top for efficiency
  const today = dayjs().startOf("day");
  const bookingDateObj = dayjs(date_booking).startOf("day").hour(7);

  if (bookingDateObj.isBefore(today)) {
    const error = new Error("Cannot book for a past date.");
    error.status = 400;
    throw error;
  }

  const normalizedBookingDate = bookingDateObj.toDate();
  const transaction = await sequelize.transaction();
  let newBooking = null; // ✅ ต้องอยู่นอก try

  try {
    // 1. เช็คที่นั่ง
    // Arg 3: Previous Qty (0 for create)
    // Arg 4: Requested Qty (capacity)
    await _checkAvailability(
      classes_schedule_id,
      transaction,
      0, 
      capacity, 
      normalizedBookingDate,
      null,
      false
    );

    // 2. กันจองซ้ำ
    // if (client_email) {
    //   const existingBooking = await ClassesBooking.findOne({
    //     where: {
    //       classes_schedule_id,
    //       client_email,
    //       booking_status: { [Op.notIn]: ["CANCELED", "FAILED"] },
    //       date_booking: normalizedBookingDate,
    //     },
    //     transaction,
    //   });

    //   if (existingBooking && client_email !== "Stingcluboffice@gmail.com") {
    //     const error = new Error("You have already booked this class.");
    //     error.status = 409;
    //     throw error;
    //   }
    // }

    const schedule = await getSchedulesById(classes_schedule_id);
    if (!schedule) {
      const error = new Error("Schedule not found.");
      error.status = 404;
      throw error;
    }

    // ✅ Ensure is_private matches the actual schedule type
    const finalIsPrivate = schedule.is_private_class;

    console.log("performerName", performedByUser);

    // 3. Create booking
    newBooking = await ClassesBooking.create(
      {
        classes_schedule_id,
        client_name,
        client_email,
        client_phone,
        booking_status: "SUCCEED",
        capacity,
        is_private: finalIsPrivate,
        date_booking: normalizedBookingDate,
        created_by: performedByUser?.name || performedByUser?.username || client_name || "CLIENT_APP",
        gyms_id: schedule.gyms_id,
        gyms_enum: schedule.gym.gym_enum, // Fixed from schedule.gym_enum to be consistent with associations if needed, or kept if it works
        trainer: trainer || "",
        multipleStudents: multiple_students || false, 
      },
      { transaction }
    );

    // ✅ Log Activity
    const performerName = performedByUser?.name || performedByUser?.username || (client_name ? `${client_name}` : "CLIENT_APP");


    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performerName,
      service: "BOOKING",
      action: "CREATE",
      details: {
        booking_id: newBooking.id,
        client_name,
        date_booking: normalizedBookingDate,
        capacity,
      },
    });

    await transaction.commit();




    return newBooking;
  } catch (error) {
    await transaction.rollback();
    console.error("[Booking Service] Create Error:", error);
    throw error; // ✅ ส่ง error จริงกลับไป
  } finally {
    // ✅ ส่งเมลเฉพาะตอนสร้างสำเร็จเท่านั้น
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
      ).catch((mailErr) => {
        console.error("📧 Email send failed:", mailErr);
      });
    }
  }
};

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

  console.log("---------------- [UPDATE] Update Booking DEBUG ----------------");
  console.log("👤 Performed By (performedByUser):", performedByUser); 
  console.log("📦 Request Body:", JSON.stringify(updateData, null, 2));

  // Validation: Trainer can only be assigned to private classes
  if (trainer && !is_private) {
    const error = new Error("Trainer can only be assigned to private classes.");
    error.status = 400;
    throw error;
  }

  // ✅ [PAST DATE VALIDATION] Move to the top
  const today = dayjs().startOf("day");
  const bookingDateObj = dayjs(date_booking).startOf("day").hour(7);

  if (bookingDateObj.isBefore(today)) {
    const error = new Error("Cannot book for a past date.");
    error.status = 400;
    throw error;
  }

  const normalizedBookingDate = bookingDateObj.toDate();


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
    const isSameSlot =
      dayjs(date_booking).isSame(dayjs(booking.date_booking), "day") &&
      classes_schedule_id === booking.classes_schedule_id;

    if (
      capacity !== booking.capacity ||
      !isSameSlot
    ) {
      await _checkAvailability(
        classes_schedule_id,
        transaction,
        isSameSlot ? booking.capacity : 0,
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

    // ✅ [VALIDATION] Ensure provided gym matches the schedule's gym
    if (updateData.gym_enum && updateData.gym_enum !== schedule.gym_enum) {
      const error = new Error(
        `Branch mismatch: The selected session belongs to ${schedule.gym_enum}, but you specified ${updateData.gym_enum}.`
      );
      error.status = 400;
      throw error;
    }

    // ✅ Ensure is_private matches the actual schedule type on update
    const finalIsPrivate = schedule.is_private_class;

    // 3. Preserve old values for logging
    const oldValues = {
      classes_schedule_id: booking.classes_schedule_id,
      capacity: booking.capacity,
      date_booking: booking.date_booking,
    };

    // 4. Update
    updatedBooking = await booking.update(
      {
        classes_schedule_id,
        client_name,
        client_email,
        client_phone,
        capacity,
        is_private: finalIsPrivate,
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

    // ✅ Log Activity
    const performerName = performedByUser?.username || (typeof performedByUser === 'string' ? performedByUser : null) || `${booking.client_name} (GUEST)`;

    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performerName,
      service: "BOOKING",
      action: "UPDATE",
      details: {

        booking_id: booking.id,
        old_values: oldValues,
        new_values: {
          classes_schedule_id,
          capacity,
          date_booking: normalizedBookingDate,
        },
      },
    });

    await transaction.commit();


    return updatedBooking;
  } catch (error) {
    await transaction.rollback();
    console.error("[Booking Service] Update Error:", error);
    throw error;
  } finally {
    // ✅ ส่งเมลเฉพาะตอน UPDATE สำเร็จเท่านั้น
    if (updatedBooking) {
      sendEmailBookingConfirmation(
        updatedBooking.client_email,
        updatedBooking.client_name,
        updatedBooking.is_private,
        updatedBooking.date_booking,
        updatedBooking,
        updatedBooking.classes_schedule_id,
        "Y",
        capacity // ✅ FLAG RESCHEDULE
      ).catch((mailErr) => {
        console.error("📧 Email send failed:", mailErr);
      });
    }
  }
};

const updateBookingNote = async (bookingId, note, performedByUser = null) => {
  try {
    const booking = await ClassesBooking.findByPk(bookingId);

    if (!booking) {
      const error = new Error("Booking not found.");
      error.status = 404;
      throw error;
    }
    await booking.update({
      admin_note: note,
      updated_by: performedByUser?.username || "ADMIN",
      updated_date: new Date(),
    });


    // ✅ Log Activity
    const performerName = performedByUser?.name || performedByUser?.username || 
                         "SYSTEM (GUEST)";


    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performerName,
      service: "BOOKING",
      action: "UPDATE_NOTE",
      details: {
        booking_id: bookingId,
        note: note,
      },
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
        null, // capacity
        null, // newBookingCapacity
        booking.date_booking,
        null, // gyms_id
        false // isUpdate
      );
    }



    updatedBooking = await booking.update(
      {
        booking_status: newStatus,
        updated_by: user?.name || user?.username || (typeof user === 'string' ? user : "ADMIN"),

        updated_date: new Date(),
      },
      { transaction }
    );


    // ✅ Log Activity
    const performerName = user?.name || user?.username || 
                         (typeof user === 'string' ? user : null) || 
                         `${booking.client_name} (GUEST)`;


    await activityLogService.createLog({
      user_id: user?.id || null,
      user_name: performerName,
      service: "BOOKING",
      action: "UPDATE_STATUS",
      details: {
        booking_id: bookingId,
        old_status: oldStatus,
        new_status: newStatus,
      },
    });

    await transaction.commit();



    return updatedBooking;
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    // ✅ ส่งเมลเฉพาะตอน UPDATE สถานะสำเร็จจริง ๆ
    if (updatedBooking && newStatus === "CANCELED") {
      sendEmailBookingConfirmation(
        updatedBooking.client_email,
        updatedBooking.client_name,
        updatedBooking.is_private,
        updatedBooking.date_booking,
        updatedBooking,
        updatedBooking.classes_schedule_id,
        "C" // ✅ FLAG CANCEL
      ).catch((mailErr) => {
        console.error("📧 Email send failed:", mailErr);
      });
    }
  }
};

const updateBookingTrainer = async (bookingId, trainer, performedByUser = null) => {
  try {
    const booking = await ClassesBooking.findByPk(bookingId);

    if (!booking) {
      const error = new Error("Booking not found.");
      error.status = 404;
      throw error;
    }

    const oldTrainer = booking.trainer;
    await booking.update({
      trainer: trainer,
      updated_by: performedByUser?.name || performedByUser?.username || "ADMIN",
      updated_date: new Date(),
    });

    // ✅ Log Activity
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
      service: "BOOKING",
      action: "UPDATE_TRAINER",
      details: {
        booking_id: bookingId,
        old_trainer: oldTrainer,
        new_trainer: trainer,
      },
    });

    return { success: true, message: "Trainer updated successfully" };
  } catch (error) {
    console.error("[Booking Service] Update Trainer Error:", error);
    throw error;
  }
};

const updateBookingPayment = async (bookingId, payment_status, performedByUser = null) => {
  try {
    const booking = await ClassesBooking.findByPk(bookingId);
    if (!booking) {
      const error = new Error("Booking not found.");
      error.status = 404;
      throw error;
    }

    const oldStatus = booking.booking_status;

    if (payment_status) {
      await booking.update({
        booking_status: "PAYMENTED",
        updated_by: performedByUser?.name || performedByUser?.username || "ADMIN",
        updated_date: new Date(),
      });
    } else {
      await booking.update({
        booking_status: "SUCCEED",
        updated_by: performedByUser?.name || performedByUser?.username || "ADMIN",
        updated_date: new Date(),
      });
    }



    // ✅ Log Activity
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
      service: "BOOKING",
      action: "UPDATE_PAYMENT",
      details: {
        booking_id: bookingId,
        old_status: oldStatus,
        new_status: payment_status ? "PAYMENTED" : "SUCCEED",
      },
    });


    return { success: true, message: "Payment status updated successfully" };

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
