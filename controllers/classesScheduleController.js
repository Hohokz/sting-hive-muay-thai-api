const classesScheduleService = require("../services/classesScheduleService");

/**
 * [GET] ดึงตารางเรียนทั้งหมด
 */
exports.getSchedules = async (req, res) => {
  try {
    const { gym_enum } = req.query;
    const schedules = await classesScheduleService.getSchedules(gym_enum);
    res.json({ success: true, data: schedules });
  } catch (error) {
    console.error("[ScheduleController] getSchedules Error:", error);
    res.status(500).json({ success: false, message: "ไม่สามารถดึงตารางเรียนได้" });
  }
};

/**
 * [GET] ตรวจสอบคลาสว่างตามวันที่เลือก
 */
exports.getAvailableSchedulesByBookingDate = async (req, res) => {
  try {
    const { date, gym_enum } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: "กรุณาระบุวันที่ (date)" });
    }

    const availableSchedules = await classesScheduleService.getAvailableSchedulesByBookingDate(date, gym_enum);
    res.json({ success: true, data: availableSchedules });
  } catch (error) {
    console.error("[ScheduleController] getAvailableByDate Error:", error);
    res.status(500).json({ success: false, message: "ไม่สามารถตรวจสอบคลาสว่างได้" });
  }
};

/**
 * [POST] สร้างตารางเรียนใหม่
 */
exports.createSchedule = async (req, res) => {
  try {
    const result = await classesScheduleService.createSchedule(req.body);
    res.status(201).json({ success: true, message: "สร้างตารางเรียนสำเร็จ", data: result });
  } catch (error) {
    console.error("[ScheduleController] createSchedule Error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * [PUT] อัปเดตตารางเรียน
 */
exports.updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await classesScheduleService.updateSchedule(id, req.body);
    res.json({ success: true, message: "อัปเดตตารางเรียนสำเร็จ", data: result });
  } catch (error) {
    console.error("[ScheduleController] updateSchedule Error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * [DELETE] ลบตารางเรียน
 */
exports.deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    await classesScheduleService.deleteSchedule(id);
    res.json({ success: true, message: "ลบตารางเรียนสำเร็จ" });
  } catch (error) {
    console.error("[ScheduleController] deleteSchedule Error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * [GET] ตรวจสอบสถานะ Capacity แบบ Real-time (สำหรับหน้า Dashboard/Admin)
 */
exports.getScheduleRealtimeAvailability = async (req, res) => {
  try {
    const { schedule_id, date } = req.query;
    if (!schedule_id || !date) {
      return res.status(400).json({ success: false, message: "กรุณาระบุ schedule_id และ date" });
    }

    const availability = await classesScheduleService.getScheduleRealtimeAvailability(schedule_id, date);
    res.json({ success: true, data: availability });
  } catch (error) {
    console.error("[ScheduleController] getRealtime Error:", error);
    res.status(500).json({ success: false, message: "ไม่สามารถดึงข้อมูล Real-time ได้" });
  }
};

// --- Advanced Schedule Configurations (การตั้งค่าล่วงหน้า/วันหยุด) ---

/**
 * [GET] ดึงรายการการตั้งค่าล่วงหน้าทั้งหมด
 */
exports.getAdvancedSchedules = async (req, res) => {
  try {
    const advanced = await classesScheduleService.getAdvancedSchedules();
    res.json({ success: true, data: advanced });
  } catch (error) {
    console.error("[ScheduleController] getAdvanced Error:", error);
    res.status(500).json({ success: false, message: "ไม่สามารถดึงข้อมูลการตั้งค่าล่วงหน้าได้" });
  }
};

/**
 * [POST] สร้างการตั้งค่าล่วงหน้าใหม่
 */
exports.createAdvancedSchedule = async (req, res) => {
  try {
    const performedByUser = req.user;
    const result = await classesScheduleService.createAdvancedSchedule(req.body, performedByUser);
    res.status(201).json({ success: true, message: "สร้างการตั้งค่าล่วงหน้าสำเร็จ", data: result });
  } catch (error) {
    console.error("[ScheduleController] createAdvanced Error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * [PUT] อัปเดตการตั้งค่าล่วงหน้า
 */
exports.updateAdvancedSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const performedByUser = req.user;
    const result = await classesScheduleService.updateAdvancedSchedule(id, req.body, performedByUser);
    res.json({ success: true, message: "อัปเดตการตั้งค่าล่วงหน้าสำเร็จ", data: result });
  } catch (error) {
    console.error("[ScheduleController] updateAdvanced Error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * [DELETE] ลบการตั้งค่าล่วงหน้า
 */
exports.deleteAdvancedSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const performedByUser = req.user;
    await classesScheduleService.deleteAdvancedSchedule(id, performedByUser);
    res.json({ success: true, message: "ลบการตั้งค่าล่วงหน้าสำเร็จ" });
  } catch (error) {
    console.error("[ScheduleController] deleteAdvanced Error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};
