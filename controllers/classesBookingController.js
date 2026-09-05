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
 * [PATCH] Updates a booking's payment status
 */
exports.updateBookingPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const payment_status = req.body.is_paid;
    const performedByUser = req.user;

    const result = await classesBookingService.updateBookingPayment(
      id,
      payment_status,
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

exports.exportBookingsToCSV = async (req, res) => {
  try {
    const { csv, filename } = await classesBookingService.exportBookingsToCSV(
      req.query,
      req.user,
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.send(csv);
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
