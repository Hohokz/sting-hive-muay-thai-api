const {
  ClassesBooking,
  ClassesSchedule,
  User,
  Gyms,
} = require("../models/Associations");
const { sequelize } = require("../config/db");
const { Op } = require("sequelize");
const fs = require("fs");
const path = require("path");
const { sendBookingConfirmationEmail } = require("../utils/emailService");
const {
  getSchedulesById,
  getScheduleRealtimeAvailability,
} = require("../services/classesScheduleService");
const activityLogService = require("./activityLogService");
const cacheUtil = require("../utils/cacheUtility");
const { isMonthDeletable, getMonthRange } = require("../utils/monthGuard");

const { BOOKING_STATUS, USER_ROLE } = require("../models/Enums");

// Identifies "bookings were exported for this range" log entries, so a purge
// can require "this month was exported first" — see activityLogService's
// hasExportBeenLogged/getMonthsExportedFor, which own the actual query since
// they own the ActivityLog model.
const EXPORT_LOG_ACTION = "EXPORT";

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");

dayjs.extend(utc);

// =================================================================
// 1. HELPER / VALIDATION FUNCTIONS
// =================================================================

/**
 * Resolves a real, human-identifiable name for the activity log — never a
 * meaningless placeholder like "ADMIN" when we actually know who this is.
 *
 * These booking-mutation routes use extractUserIfPresent (optional auth),
 * not mandatory login, because both staff (dashboard) AND customers (the
 * emailed self-service edit/cancel link) call the same endpoints. So "no
 * logged-in user" is an expected, common case here — not a bug — and it
 * almost always means a customer acting on their own booking. Falling back
 * to the booking's own client_name (instead of a generic "ADMIN") keeps the
 * log truthful in that case; "ADMIN" is only used as an absolute last resort
 * if somehow neither is available.
 */
const _resolveActorName = (user, fallbackName) => {
  return (
    user?.name ||
    user?.username ||
    (typeof user === "string" ? user : null) ||
    fallbackName ||
    "ADMIN"
  );
};

/**
 * Rejects a booking payload missing fields the rest of the flow assumes are
 * present. Without this, e.g. a missing `date_booking` silently falls back
 * to "now" (dayjs(undefined) parses as the current time, not an error), and
 * a missing `classes_schedule_id` only surfaces later as a confusing "class
 * not found" error instead of a clear, immediate validation message.
 */
const _validateRequiredFields = (bookingData) => {
  const { client_name, client_email, classes_schedule_id, date_booking, capacity } =
    bookingData;

  if (!client_email || !client_email.trim() || !client_name || !client_name.trim()) {
    const error = new Error("กรุณากรอกชื่อและอีเมลให้ครบถ้วน");
    error.status = 400;
    throw error;
  }

  if (!classes_schedule_id) {
    const error = new Error("กรุณาเลือกคลาสเรียน");
    error.status = 400;
    throw error;
  }

  if (!date_booking) {
    const error = new Error("กรุณาระบุวันที่จอง");
    error.status = 400;
    throw error;
  }

  if (!Number.isInteger(capacity) || capacity <= 0) {
    const error = new Error("จำนวนที่นั่งไม่ถูกต้อง");
    error.status = 400;
    throw error;
  }
};

/**
 * Validates a booking request (e.g. booking date not in the past, trainer only for private classes).
 */
const _validateBooking = (bookingData, performedByUser) => {
  const { is_private, date_booking, trainer } = bookingData;
  const isAdmin = performedByUser?.role === USER_ROLE.ADMIN;

  // 1. A trainer can only be chosen for private classes
  if (trainer && !is_private) {
    const error = new Error(
      "Trainer สามารถเลือกได้เฉพาะคลาสส่วนตัว (Private) เท่านั้น",
    );
    error.status = 400;
    throw error;
  }

  // 2. Booking date can't be in the past, unless the caller is an admin
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
 * Checks seat availability for a class.
 */
const _checkAvailability = async (
  classesScheduleId,
  transaction,
  previousQty,
  requestedSeats,
  bookingDate,
) => {
  const {
    maxCapacity,
    currentBookingCount,
    isCloseGym,
    isClassClosed,
    closuresReason,
  } = await getScheduleRealtimeAvailability(classesScheduleId, bookingDate, {
    transaction,
    lock: true,
  });

  if (isCloseGym || isClassClosed) {
    const error = new Error(
      closuresReason === "Gym Closed"
        ? "ยิมปิดให้บริการในวันที่เลือก"
        : "คลาสนี้นี้ปิดให้บริการในวันที่เลือก",
    );
    error.status = 409;
    throw error;
  }

  // Seats held by others, excluding the quantity we're currently replacing
  const seatsTakenByOthers = Math.max(0, currentBookingCount - previousQty);
  const totalAfterBooking = seatsTakenByOthers + requestedSeats;

  if (totalAfterBooking > maxCapacity) {
    const remainingSeats = Math.max(0, maxCapacity - seatsTakenByOthers);
    const error = new Error(
      `ที่นั่งไม่พอ: เหลือเพียง ${remainingSeats} ที่นั่ง (คุณต้องการ ${requestedSeats})`,
    );
    error.status = 409;
    throw error;
  }
};

/**
 * Sends a booking confirmation/reschedule/cancellation email.
 */
const sendEmailBookingConfirmation = async (
  clientEmail,
  clientName,
  isPrivate,
  dateBooking,
  booking,
  scheduleId,
  type,
  capacity,
) => {
  if (!clientEmail) return;

  const schedule = await getSchedulesById(scheduleId);
  if (!schedule) return;

  const gymName =
    schedule.gym_enum === "STING_HIVE"
      ? "Sting Hive Muay Thai Gym"
      : "Sting Club Muay Thai Gym";
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

    Object.keys(replacements).forEach((key) => {
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
 * [CREATE] Creates a new booking.
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

  // 0. Reject a payload missing required fields
  _validateRequiredFields(bookingData);

  // 1. Validate the booking request
  const normalizedBookingDate = _validateBooking(bookingData, performedByUser);

  const transaction = await sequelize.transaction();
  let newBooking = null;

  try {
    // 2. Check seat availability (locks the row to prevent a race condition)
    await _checkAvailability(
      classes_schedule_id,
      transaction,
      0,
      capacity,
      normalizedBookingDate,
    );

    // 3. Fetch the schedule
    const schedule = await getSchedulesById(classes_schedule_id);
    if (!schedule) {
      const error = new Error("ไม่พบตารางเรียนที่ระบุ");
      error.status = 404;
      throw error;
    }

    // 4. Create the booking
    newBooking = await ClassesBooking.create(
      {
        classes_schedule_id,
        client_name,
        client_email,
        client_phone,
        booking_status: BOOKING_STATUS.SUCCEED,
        capacity,
        is_private: is_private || false,
        date_booking: normalizedBookingDate,
        created_by:
          performedByUser?.name ||
          performedByUser?.username ||
          client_name ||
          "CLIENT_APP",
        gyms_id: schedule.gyms_id,
        gyms_enum: schedule.gym_enum,
        trainer: trainer || "",
        multipleStudents: multiple_students || false,
      },
      { transaction },
    );

    // 5. Log the action
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name:
        performedByUser?.name ||
        performedByUser?.username ||
        client_name ||
        "CLIENT_APP",
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

    cacheUtil.clearByPrefix("availability");

    return newBooking;
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("[Booking Service] Create Error:", error);
    throw error;
  } finally {
    // 6. Send the confirmation email outside the transaction
    if (newBooking) {
      sendEmailBookingConfirmation(
        client_email,
        client_name,
        is_private,
        date_booking,
        newBooking,
        classes_schedule_id,
        "N",
        capacity,
      );
    }
  }
};

/**
 * [UPDATE] Updates an existing booking.
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

  // 0. Reject a payload missing required fields
  _validateRequiredFields(updateData);

  // 1. Validate the new booking details
  const normalizedBookingDate = _validateBooking(updateData, performedByUser);

  const transaction = await sequelize.transaction();
  let updatedBooking = null;

  try {
    // 2. Confirm the existing booking exists
    const booking = await ClassesBooking.findByPk(bookingId, { transaction });
    if (!booking) {
      const error = new Error("ไม่พบข้อมูลการจองที่ต้องการแก้ไข");
      error.status = 404;
      throw error;
    }

    // 3. If the class, date, or seat count changed, re-check availability
    const isSameSlot =
      dayjs(date_booking).isSame(dayjs(booking.date_booking), "day") &&
      classes_schedule_id === booking.classes_schedule_id;

    if (capacity !== booking.capacity || !isSameSlot) {
      await _checkAvailability(
        classes_schedule_id,
        transaction,
        isSameSlot ? booking.capacity : 0,
        capacity,
        normalizedBookingDate,
      );
    }

    const schedule = await getSchedulesById(classes_schedule_id);
    if (!schedule) {
      const error = new Error("ไม่พบตารางเรียนใหม่ที่ระบุ");
      error.status = 404;
      throw error;
    }

    const oldValues = {
      classes_schedule_id: booking.classes_schedule_id,
      capacity: booking.capacity,
      date_booking: booking.date_booking,
    };

    // 4. Persist the update
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
        updated_by:
          performedByUser?.name ||
          performedByUser?.username ||
          client_name ||
          "CLIENT_APP",
        updated_date: new Date(),
      },
      { transaction },
    );

    // 5. Log the action
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name:
        performedByUser?.name ||
        performedByUser?.username ||
        client_name ||
        "CLIENT_APP",
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

    cacheUtil.clearByPrefix("availability");

    return updatedBooking;
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("[Booking Service] Update Error:", error);
    throw error;
  } finally {
    // 6. Send a reschedule notification outside the transaction
    if (updatedBooking) {
      sendEmailBookingConfirmation(
        updatedBooking.client_email,
        updatedBooking.client_name,
        updatedBooking.is_private,
        updatedBooking.date_booking,
        updatedBooking,
        updatedBooking.classes_schedule_id,
        "Y",
        capacity,
      );
    }
  }
};

/**
 * [UPDATE] Updates the admin note on a booking.
 */
const updateBookingNote = async (bookingId, note, performedByUser = null) => {
  try {
    const booking = await ClassesBooking.findByPk(bookingId);
    if (!booking) {
      const error = new Error("ไม่พบข้อมูลการจอง");
      error.status = 404;
      throw error;
    }

    const actorName = _resolveActorName(performedByUser, booking.client_name);

    await booking.update({
      admin_note: note,
      updated_by: actorName,
      updated_date: new Date(),
    });

    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: actorName,
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
 * [READ] Returns bookings, optionally filtered by schedule/user/status.
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
          attributes: ["start_time", "end_time", "gym_enum"],
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
 * [UPDATE STATUS] Changes a booking's status (e.g. cancel, confirm, restore).
 * Generic by design — see controllers/classesBookingController.js `cancelBooking`
 * for the only route currently wired up (cancel-only).
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
    const needSeatStatuses = [
      BOOKING_STATUS.PENDING,
      BOOKING_STATUS.SUCCEED,
      BOOKING_STATUS.RESCHEDULED,
    ];
    const noSeatStatuses = [BOOKING_STATUS.CANCELED, BOOKING_STATUS.FAILED];

    // If the booking previously held no seat (e.g. it was canceled) and is
    // being restored to a seat-holding status, re-check availability.
    if (
      noSeatStatuses.includes(oldStatus) &&
      needSeatStatuses.includes(newStatus)
    ) {
      await _checkAvailability(
        booking.classes_schedule_id,
        transaction,
        0,
        booking.capacity,
        booking.date_booking,
      );
    }

    const actorName = _resolveActorName(user, booking.client_name);

    updatedBooking = await booking.update(
      {
        booking_status: newStatus,
        updated_by: actorName,
        updated_date: new Date(),
      },
      { transaction },
    );

    await activityLogService.createLog({
      user_id: user?.id || null,
      user_name: actorName,
      service: "BOOKING",
      action: "UPDATE_STATUS",
      details: {
        booking_id: bookingId,
        old_status: oldStatus,
        new_status: newStatus,
      },
    });

    await transaction.commit();

    cacheUtil.clearByPrefix("availability");

    return updatedBooking;
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  } finally {
    // Notify the client by email when a booking is canceled
    if (updatedBooking && newStatus === BOOKING_STATUS.CANCELED) {
      sendEmailBookingConfirmation(
        updatedBooking.client_email,
        updatedBooking.client_name,
        updatedBooking.is_private,
        updatedBooking.date_booking,
        updatedBooking,
        updatedBooking.classes_schedule_id,
        "C", // cancellation flag
      );
    }
  }
};

/**
 * [UPDATE] Updates the trainer on a booking (private classes only).
 */
const updateBookingTrainer = async (
  bookingId,
  trainer,
  performedByUser = null,
) => {
  try {
    const booking = await ClassesBooking.findByPk(bookingId);
    if (!booking) {
      const error = new Error("ไม่พบข้อมูลการจอง");
      error.status = 404;
      throw error;
    }

    if (!booking.is_private && trainer) {
      const error = new Error("เทรนเนอร์สามารถระบุได้เฉพาะคลาสส่วนตัวเท่านั้น");
      error.status = 400;
      throw error;
    }

    const oldTrainer = booking.trainer;
    const actorName = _resolveActorName(performedByUser, booking.client_name);

    await booking.update({
      trainer: trainer || "",
      updated_by: actorName,
      updated_date: new Date(),
    });

    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: actorName,
      service: "BOOKING",
      action: "UPDATE_TRAINER",
      details: {
        booking_id: bookingId,
        old_trainer: oldTrainer,
        new_trainer: trainer,
      },
    });

    return { success: true, message: "อัปเดตเทรนเนอร์สำเร็จ" };
  } catch (error) {
    console.error("[Booking Service] Update Trainer Error:", error);
    throw error;
  }
};

/**
 * [UPDATE] Updates a booking's payment status.
 */
const updateBookingPayment = async (
  bookingId,
  payment_status,
  performedByUser = null,
) => {
  try {
    const booking = await ClassesBooking.findByPk(bookingId);
    if (!booking) {
      const error = new Error("ไม่พบข้อมูลการจอง");
      error.status = 404;
      throw error;
    }

    const oldStatus = booking.booking_status;
    const newStatus = payment_status
      ? BOOKING_STATUS.PAYMENTED
      : BOOKING_STATUS.SUCCEED;

    const actorName = _resolveActorName(performedByUser, booking.client_name);

    await booking.update({
      booking_status: newStatus,
      updated_by: actorName,
      updated_date: new Date(),
    });

    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: actorName,
      service: "BOOKING",
      action: "UPDATE_PAYMENT",
      details: {
        booking_id: bookingId,
        old_status: oldStatus,
        new_status: newStatus,
      },
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
      where: { role: USER_ROLE.USER },
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
        { [Op.like]: `%${name.toLowerCase()}%` },
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

const { Parser } = require("json2csv");

/**
 * [EXPORT] Exports bookings to CSV, filtered by date range (date_booking).
 */
const exportBookingsToCSV = async ({ start_date, end_date }, performedByUser = null) => {
  if (!start_date || !end_date) {
    const error = new Error("start_date and end_date are required");
    error.status = 400;
    throw error;
  }

  // Anchored in UTC, not local time, to match how getAvailableExportMonths
  // (TO_CHAR against Postgres's UTC session timezone) buckets rows by month —
  // otherwise this range is shifted by the local UTC offset and silently
  // drops/includes rows near the boundary of the selected range.
  const startOfRange = dayjs.utc(start_date).startOf("day").toDate();
  const endOfRange = dayjs.utc(end_date).add(1, "day").startOf("day").toDate();

  try {
    const rows = await ClassesBooking.findAll({
      where: {
        date_booking: {
          [Op.gte]: startOfRange,
          [Op.lt]: endOfRange,
        },
      },
      attributes: [
        "date_booking",
        "client_name",
        "client_email",
        "client_phone",
        "booking_status",
        "capacity",
        "admin_note",
        "trainer",
        "created_by",
        "created_date",
        "updated_by",
        "updated_date",
      ],
      include: [
        {
          model: ClassesSchedule,
          as: "schedule",
          attributes: ["start_time", "end_time", "is_private_class"],
          include: [
            {
              model: Gyms, // JOIN gyms via schedule → gyms_id
              as: "gyms",
              attributes: ["gym_name"],
            },
          ],
        },
      ],
      order: [["date_booking", "ASC"]],
      raw: false,
    });

    const data = rows.map((r) => {
      const b = r.get({ plain: true });
      return {
        date_booking: dayjs(b.date_booking).format("YYYY-MM-DD"),
        client_name: b.client_name ?? "",
        client_email: b.client_email ?? "",
        client_phone: b.client_phone ?? "",
        status: b.booking_status ?? "",
        capacity: b.capacity ?? "",
        admin_note: b.admin_note ?? "",
        trainer: b.trainer ?? "",
        start_time: b.schedule?.start_time ?? "",
        end_time: b.schedule?.end_time ?? "",
        gyms: b.schedule?.gyms?.gym_name ?? "",
        private: b.schedule?.is_private_class ? "Yes" : "No",
        created_by: b.created_by ?? "",
        created_date: b.created_date
          ? dayjs(b.created_date).format("YYYY-MM-DD HH:mm:ss")
          : "",
        updated_by: b.updated_by ?? "",
        updated_date: b.updated_date
          ? dayjs(b.updated_date).format("YYYY-MM-DD HH:mm:ss")
          : "",
      };
    });

    const fields = [
      { label: "Date Booking", value: "date_booking" },
      { label: "Client Name", value: "client_name" },
      { label: "Client Email", value: "client_email" },
      { label: "Client Phone", value: "client_phone" },
      { label: "Status", value: "status" },
      { label: "Capacity", value: "capacity" },
      { label: "Admin Note", value: "admin_note" },
      { label: "Trainer", value: "trainer" },
      { label: "Start Time", value: "start_time" },
      { label: "End Time", value: "end_time" },
      { label: "Gym", value: "gyms" },
      { label: "Private Class", value: "private" },
      { label: "Created By", value: "created_by" },
      { label: "Created Date", value: "created_date" },
      { label: "Updated By", value: "updated_by" },
      { label: "Updated Date", value: "updated_date" },
    ];

    const parser = new Parser({ fields, withBOM: true });
    const csv = parser.parse(data);
    const filename = `bookings_${dayjs(start_date).format("YYYYMMDD")}_${dayjs(end_date).format("YYYYMMDD")}.csv`;

    // Recorded so a purge can later require "this month was exported first"
    // (see hasMonthBeenExported) — not just an audit trail entry.
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
      service: "BOOKING",
      action: EXPORT_LOG_ACTION,
      details: { start_date, end_date },
    });

    return { csv, filename };
  } catch (error) {
    console.error("[Booking Service] Export CSV Error:", error);
    throw error;
  }
};

/**
 * [READ] Returns the months (YYYY-MM) that have at least one booking, so the
 * export month-picker can disable months with nothing to export.
 */
const getAvailableExportMonths = async () => {
  const [rows] = await sequelize.query(`
    SELECT DISTINCT TO_CHAR(date_booking, 'YYYY-MM') AS month
    FROM classes_booking
    WHERE date_booking IS NOT NULL
    ORDER BY month ASC;
  `);
  return rows.map((r) => r.month);
};

/**
 * [READ] Returns the months (YYYY-MM) that bookings have been exported for,
 * so the frontend can show which months are actually eligible for deletion.
 */
const getExportedMonths = async () => {
  return activityLogService.getMonthsExportedFor({
    service: "BOOKING",
    action: EXPORT_LOG_ACTION,
  });
};

const _assertMonthDeletable = async (month) => {
  if (!isMonthDeletable(month)) {
    const error = new Error(`รูปแบบเดือนไม่ถูกต้อง: ${month} (ต้องเป็น YYYY-MM)`);
    error.status = 400;
    throw error;
  }
  const exported = await activityLogService.hasExportBeenLogged({
    service: "BOOKING",
    action: EXPORT_LOG_ACTION,
    month,
  });
  if (!exported) {
    const error = new Error(
      `กรุณา export ข้อมูลเดือน ${month} ก่อน จึงจะลบได้ (ป้องกันข้อมูลหายโดยไม่มีสำเนา)`,
    );
    error.status = 400;
    throw error;
  }
};

/**
 * [READ] Counts how many bookings a purge of the given month would delete —
 * used to show the admin exactly what they're about to permanently remove
 * before they confirm.
 */
const previewPurgeBookingsByMonth = async (month) => {
  await _assertMonthDeletable(month);
  const { start, end } = getMonthRange(month);
  return ClassesBooking.count({
    where: { date_booking: { [Op.gte]: start, [Op.lt]: end } },
  });
};

/**
 * [DELETE] Permanently deletes every booking in the given month. Any month,
 * including the current one, is allowed — an explicit product decision.
 */
const purgeBookingsByMonth = async (month, performedByUser = null) => {
  await _assertMonthDeletable(month);
  const { start, end } = getMonthRange(month);

  const transaction = await sequelize.transaction();
  try {
    const deletedCount = await ClassesBooking.destroy({
      where: { date_booking: { [Op.gte]: start, [Op.lt]: end } },
      transaction,
    });

    await transaction.commit();

    cacheUtil.clearByPrefix("availability");

    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
      service: "BOOKING",
      action: "PURGE_MONTH",
      details: { month, deleted_count: deletedCount },
    });

    return { deletedCount };
  } catch (error) {
    await transaction.rollback();
    console.error("[Booking Service] Purge Error:", error);
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
  getTrainerForRequest,
  getBookingByName,
  exportBookingsToCSV,
  getAvailableExportMonths,
  getExportedMonths,
  previewPurgeBookingsByMonth,
  purgeBookingsByMonth,
};
