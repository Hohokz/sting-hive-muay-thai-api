const classesScheduleService = require("../services/classesScheduleService");
const { sendError } = require("../utils/httpError");

/**
 * [GET] Returns all schedules
 */
exports.getSchedules = async (req, res) => {
  try {
    const schedules = await classesScheduleService.getSchedules();
    res.json({ success: true, data: schedules });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงตารางเรียนได้");
  }
};

/**
 * [GET] Checks class availability for a given date
 */
exports.getAvailableSchedulesByBookingDate = async (req, res) => {
  try {
    const { date, gym_enum, is_private_class } = req.query;
    if (!date) {
      return res
        .status(400)
        .json({ success: false, message: "กรุณาระบุวันที่ (date)" });
    }

    // Normalize to a real boolean (or undefined) as early as possible
    const isPrivateBool =
      is_private_class === "true"
        ? true
        : is_private_class === "false"
          ? false
          : undefined;

    const availableSchedules =
      await classesScheduleService.getAvailableSchedulesByBookingDate(
        date,
        gym_enum,
        isPrivateBool,
      );
    res.json({ success: true, data: availableSchedules });
  } catch (error) {
    sendError(res, error, "ไม่สามารถตรวจสอบคลาสว่างได้");
  }
};

/**
 * [POST] Creates a new schedule
 */
exports.createSchedule = async (req, res) => {
  try {
    const result = await classesScheduleService.createSchedule(req.body, req.user);
    res
      .status(201)
      .json({ success: true, message: "สร้างตารางเรียนสำเร็จ", data: result });
  } catch (error) {
    sendError(res, error, "ไม่สามารถสร้างตารางเรียนได้");
  }
};

/**
 * [PUT] Updates a schedule
 */
exports.updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await classesScheduleService.updateSchedule(id, req.body, req.user);
    res.json({
      success: true,
      message: "อัปเดตตารางเรียนสำเร็จ",
      data: result,
    });
  } catch (error) {
    sendError(res, error, "ไม่สามารถอัปเดตตารางเรียนได้");
  }
};

/**
 * [DELETE] Deletes a schedule
 */
exports.deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    await classesScheduleService.deleteSchedule(id, req.user);
    res.json({ success: true, message: "ลบตารางเรียนสำเร็จ" });
  } catch (error) {
    sendError(res, error, "ไม่สามารถลบตารางเรียนได้");
  }
};

/**
 * [GET] Checks real-time capacity status (for the dashboard/admin view)
 */
exports.getScheduleRealtimeAvailability = async (req, res) => {
  try {
    const { schedule_id, date } = req.query;
    if (!schedule_id || !date) {
      return res
        .status(400)
        .json({ success: false, message: "กรุณาระบุ schedule_id และ date" });
    }

    const availability =
      await classesScheduleService.getScheduleRealtimeAvailability(
        schedule_id,
        date,
      );
    res.json({ success: true, data: availability });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงข้อมูล Real-time ได้");
  }
};

// --- Advanced schedule configurations (advance settings / closures) ---

/**
 * [GET] Returns all advance configs
 */
exports.getAdvancedSchedules = async (req, res) => {
  try {
    const advanced = await classesScheduleService.getAdvancedSchedules();
    res.json({ success: true, data: advanced });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงข้อมูลการตั้งค่าล่วงหน้าได้");
  }
};

/**
 * [POST] Creates a new advance config
 */
exports.createAdvancedSchedule = async (req, res) => {
  try {
    const performedByUser = req.user;
    const result = await classesScheduleService.createAdvancedSchedule(
      req.body,
      performedByUser,
    );
    res.status(201).json({
      success: true,
      message: "สร้างการตั้งค่าล่วงหน้าสำเร็จ",
      data: result,
    });
  } catch (error) {
    sendError(res, error, "ไม่สามารถสร้างการตั้งค่าล่วงหน้าได้");
  }
};

/**
 * [PUT] Updates an advance config
 */
exports.updateAdvancedSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const performedByUser = req.user;
    const result = await classesScheduleService.updateAdvancedSchedule(
      id,
      req.body,
      performedByUser,
    );
    res.json({
      success: true,
      message: "อัปเดตการตั้งค่าล่วงหน้าสำเร็จ",
      data: result,
    });
  } catch (error) {
    sendError(res, error, "ไม่สามารถอัปเดตการตั้งค่าล่วงหน้าได้");
  }
};

/**
 * [DELETE] Deletes an advance config
 */
exports.deleteAdvancedSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const performedByUser = req.user;
    await classesScheduleService.deleteAdvancedSchedule(id, performedByUser);
    res.json({ success: true, message: "ลบการตั้งค่าล่วงหน้าสำเร็จ" });
  } catch (error) {
    sendError(res, error, "ไม่สามารถลบการตั้งค่าล่วงหน้าได้");
  }
};
