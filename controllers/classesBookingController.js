const classesBookingService = require("../services/classesBookingService");

/**
 * [POST] สร้างรายการจองคลาสเรียน
 */
exports.createBooking = async (req, res) => {
  try {
    const performedByUser = req.user;
    const result = await classesBookingService.createBooking(req.body, performedByUser);

    res.status(201).json({
      success: true,
      message: "สร้างการจองสำเร็จแล้ว",
      data: result.data,
    });
  } catch (error) {
    console.error("[BookingController] createBooking Error:", error);
    res.status(error.status || 400).json({
      success: false,
      message: error.message || "ไม่สามารถสร้างการจองได้",
    });
  }
};

/**
 * [PUT] อัปเดตข้อมูลการจอง (เช่น เปลี่ยนเวลา หรือจำนวนคน)
 */
exports.updateBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const performedByUser = req.user;
    const result = await classesBookingService.updateBooking(id, req.body, performedByUser);

    res.status(200).json({
      success: true,
      message: "อัปเดตการจองสำเร็จแล้ว",
      data: result.data,
    });
  } catch (error) {
    console.error("[BookingController] updateBooking Error:", error);
    res.status(error.status || 400).json({
      success: false,
      message: error.message || "ไม่สามารถอัปเดตการจองได้",
    });
  }
};

/**
 * [PATCH] อัปเดตสถานะการจอง (เช่น CANCEL, SUCCEED)
 */
exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { booking_status } = req.body;
    const performedByUser = req.user;

    const result = await classesBookingService.updateBookingStatus(id, booking_status, performedByUser);

    res.status(200).json({
      success: true,
      message: "อัปเดตสถานะการจองสำเร็จ",
      data: result.data,
    });
  } catch (error) {
    console.error("[BookingController] updateBookingStatus Error:", error);
    res.status(error.status || 400).json({
      success: false,
      message: error.message || "ไม่สามารถอัปเดตสถานะได้",
    });
  }
};

/**
 * [PATCH] อัปเดตบันทึกเพิ่มเติม (Admin Note)
 */
exports.updateBookingNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const performedByUser = req.user;

    const result = await classesBookingService.updateBookingNote(id, note, performedByUser);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("[BookingController] updateBookingNote Error:", error);
    res.status(error.status || 400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * [PATCH] อัปเดตผู้สอน (Trainer)
 */
exports.updateBookingTrainer = async (req, res) => {
  try {
    const { id } = req.params;
    const { trainer } = req.body;
    const performedByUser = req.user;

    const result = await classesBookingService.updateBookingTrainer(id, trainer, performedByUser);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("[BookingController] updateBookingTrainer Error:", error);
    res.status(error.status || 400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * [PATCH] อัปเดตสถานะการชำระเงิน
 */
exports.updateBookingPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_status } = req.body;
    const performedByUser = req.user;

    const result = await classesBookingService.updateBookingPayment(id, payment_status, performedByUser);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("[BookingController] updateBookingPayment Error:", error);
    res.status(error.status || 400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * [GET] ดึงข้อมูลการจองทั้งหมด
 */
exports.getBookings = async (req, res) => {
  try {
    const bookings = await classesBookingService.getBookings(req.query);
    res.status(200).json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    console.error("[BookingController] getBookings Error:", error);
    res.status(error.status || 400).json({
      success: false,
      message: error.message || "ไม่สามารถดึงข้อมูลการจองได้",
    });
  }
};

/**
 * [GET] ดึงข้อมูลผู้สอนสำหรับคำขอ
 */
exports.getTrainerForRequest = async (req, res) => {
  try {
    const trainers = await classesBookingService.getTrainerForRequest();
    res.status(200).json({ success: true, count: trainers.length, data: trainers });
  } catch (error) {
    console.error("[BookingController] getTrainerForRequest Error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูลผู้สอน" });
  }
};
