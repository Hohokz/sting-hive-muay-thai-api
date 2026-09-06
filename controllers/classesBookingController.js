const classesBookingService = require("../services/classesBookingService");
const { sendError } = require("../utils/httpError");

/**
 * [POST] Creates a booking
 */
exports.createBooking = async (req, res) => {
  try {
    const performedByUser = req.user;
    const result = await classesBookingService.createBooking(
      req.body,
      performedByUser,
    );

    res.status(201).json({
      success: true,
      message: "สร้างการจองสำเร็จแล้ว",
      data: result,
    });
  } catch (error) {
    sendError(res, error, "ไม่สามารถสร้างการจองได้");
  }
};

/**
 * [PUT] Updates a booking (e.g. changes time or seat count)
 */
exports.updateBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const performedByUser = req.user;
    const result = await classesBookingService.updateBooking(
      id,
      req.body,
      performedByUser,
    );

    res.status(200).json({
      success: true,
      message: "อัปเดตการจองสำเร็จแล้ว",
      data: result,
    });
  } catch (error) {
    sendError(res, error, "ไม่สามารถอัปเดตการจองได้");
  }
};

/**
 * [PATCH] Cancels a booking. This route is cancel-only by design (see
 * routes/classesBookingRoutes.js's PATCH /:id/cancel) — the underlying
 * service call is generic, but only ever invoked here with "CANCELED".
 */
exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const booking_status = "CANCELED";
    const performedByUser = req.user;

    const result = await classesBookingService.updateBookingStatus(
      id,
      booking_status,
      performedByUser,
    );

    res.status(200).json({
      success: true,
      message: "อัปเดตสถานะการจองสำเร็จ",
      data: result,
    });
  } catch (error) {
    sendError(res, error, "ไม่สามารถอัปเดตสถานะได้");
  }
};

/**
 * [PATCH] Updates the admin note on a booking
 */
exports.updateBookingNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const performedByUser = req.user;

    const result = await classesBookingService.updateBookingNote(
      id,
      note,
      performedByUser,
    );

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    sendError(res, error, "ไม่สามารถอัปเดตบันทึกได้");
  }
};

/**
 * [PATCH] Updates the trainer on a booking
 */
exports.updateBookingTrainer = async (req, res) => {
  try {
    const { id } = req.params;
    const trainer = req.body.trainer_name;
    const performedByUser = req.user;

    const result = await classesBookingService.updateBookingTrainer(
      id,
      trainer,
      performedByUser,
    );

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    sendError(res, error, "ไม่สามารถอัปเดตเทรนเนอร์ได้");
  }
};

/**
 * [PATCH] Updates a booking's payment status, and (when marking as paid)
 * its rent/course amount breakdown and payment method.
 */
exports.updateBookingPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_paid, payment_method_id, rent_amount, course_amount, quantity } = req.body;
    const performedByUser = req.user;

    const result = await classesBookingService.updateBookingPayment(
      id,
      {
        payment_status: is_paid,
        payment_method_id,
        rent_amount,
        course_amount,
        quantity,
      },
      performedByUser,
    );

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    sendError(res, error, "ไม่สามารถอัปเดตสถานะการชำระเงินได้");
  }
};

/**
 * [GET] Returns a booking's saved payment breakdown (or null), so the
 * payment popup can pre-fill its fields when re-opened for editing.
 */
exports.getBookingPaymentDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const detail = await classesBookingService.getBookingPaymentDetail(id);
    res.status(200).json({ success: true, data: detail });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงข้อมูลรายละเอียดการชำระเงินได้");
  }
};

/**
 * [PUT] Edits one existing payment-history entry in place.
 */
exports.updateBookingPaymentEntry = async (req, res) => {
  try {
    const { entryId } = req.params;
    const { payment_method_id, rent_amount, course_amount } = req.body;
    const performedByUser = req.user;

    const result = await classesBookingService.updateBookingPaymentEntry(
      entryId,
      { payment_method_id, rent_amount, course_amount },
      performedByUser,
    );

    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    sendError(res, error, "ไม่สามารถแก้ไขรายการชำระเงินได้");
  }
};

/**
 * [DELETE] Permanently removes one payment-history entry.
 */
exports.deleteBookingPaymentEntry = async (req, res) => {
  try {
    const { entryId } = req.params;
    const performedByUser = req.user;

    const result = await classesBookingService.deleteBookingPaymentEntry(
      entryId,
      performedByUser,
    );

    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    sendError(res, error, "ไม่สามารถลบรายการชำระเงินได้");
  }
};

/**
 * [GET] Returns all bookings
 */
exports.getBookings = async (req, res) => {
  try {
    const bookings = await classesBookingService.getBookings(req.query);
    res
      .status(200)
      .json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงข้อมูลการจองได้");
  }
};

/**
 * [GET] Returns trainers available for a booking request
 */
exports.getTrainerForRequest = async (req, res) => {
  try {
    const trainers = await classesBookingService.getTrainerForRequest();
    res
      .status(200)
      .json({ success: true, count: trainers.length, data: trainers });
  } catch (error) {
    sendError(res, error, "เกิดข้อผิดพลาดในการดึงข้อมูลผู้สอน");
  }
};

exports.getBookingByName = async (req, res) => {
  try {
    const booking = await classesBookingService.getBookingByName(
      req.params.name,
    );
    return res.status(200).json({ success: true, data: booking });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงข้อมูลการจองได้");
  }
};

// Defaults to Excel (.xlsx); pass ?format=csv for the CSV export instead.
exports.exportBookings = async (req, res) => {
  try {
    const { data, filename, contentType } = await classesBookingService.exportBookings(
      req.query,
      req.user,
    );

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.send(data);
  } catch (error) {
    sendError(res, error, "เกิดข้อผิดพลาดในการส่งออกข้อมูล");
  }
};

exports.getAvailableExportMonths = async (req, res) => {
  try {
    const months = await classesBookingService.getAvailableExportMonths();
    res.status(200).json({ success: true, data: months });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงข้อมูลเดือนที่ export ได้");
  }
};

exports.getExportedMonths = async (req, res) => {
  try {
    const months = await classesBookingService.getExportedMonths();
    res.status(200).json({ success: true, data: months });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงข้อมูลเดือนที่ export แล้วได้");
  }
};

exports.previewPurgeBookings = async (req, res) => {
  try {
    const { month } = req.query;
    const count = await classesBookingService.previewPurgeBookingsByMonth(month);
    res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    sendError(res, error, "ไม่สามารถตรวจสอบจำนวนข้อมูลที่จะลบได้");
  }
};

exports.purgeBookings = async (req, res) => {
  try {
    const { month } = req.query;
    const result = await classesBookingService.purgeBookingsByMonth(
      month,
      req.user,
    );
    res.status(200).json({
      success: true,
      message: `ลบการจองเดือน ${month} สำเร็จ (${result.deletedCount} รายการ)`,
      data: result,
    });
  } catch (error) {
    sendError(res, error, "ไม่สามารถลบข้อมูลการจองได้");
  }
};
