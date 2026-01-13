// controllers/classesScheduleController.js

const scheduleService = require("../services/classesScheduleService");

// =================================================================
// HELPER: ERROR RESPONSE
// =================================================================

/**
 * ฟังก์ชันช่วยเหลือสำหรับการจัดการ Error Response จาก Service Layer
 * โดยจะใช้ status ที่กำหนดไว้ใน error (400, 409, 404) หรือ 500 เป็น default
 */
const handleServiceError = (res, error) => {
  // ดึง status code ที่เรากำหนดใน Service (error.status)
  const statusCode = error.status || 500;

  // สำหรับ 500 Internal Error, ป้องกันการเปิดเผยรายละเอียด Stack Trace
  const message =
    statusCode === 500 && error.message.includes("Internal server error")
      ? "Internal Server Error"
      : error.message;

  return res.status(statusCode).json({
    success: false,
    message: message,
  });
};

// =================================================================
// CONTROLLER FUNCTIONS (รับผิดชอบ HTTP Request/Response)
// =================================================================

// [CREATE] POST /api/v1/schedules
const createSchedule = async (req, res) => {
  const { start_time, end_time, gym_enum, capacity } = req.body;
  console.log("[Controller] createSchedule hit. Body:", req.body);

  // 1. Validation ขั้นต้น (Controller Responsibility)
  if (!start_time || !end_time || !gym_enum || capacity === undefined) {
    console.log("[Controller] Validation failed: Missing required fields");
    return res.status(400).json({
      success: false,
      message:
        "Missing required fields: start_time, end_time, gym_enum, and capacity are required.",
    });
  }

  try {
    // 2. เรียกใช้ Service Layer
    console.log("[Controller] Calling service.createSchedule...");
    const newSchedule = await scheduleService.createSchedule(req.body, req.user);


    // 3. ส่ง Response สำเร็จ
    return res.status(201).json({
      success: true,
      message: "Class Schedule created successfully.",
      data: newSchedule,
    });
  } catch (error) {
    // 4. จัดการ Error
    console.error("[Controller] Error in createSchedule:", error.message);
    handleServiceError(res, error);
  }
};

// [UPDATE] PUT /api/v1/schedules/:id
const updateSchedule = async (req, res) => {
  const { id } = req.params;

  // Validation ขั้นต้น
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({
      success: false,
      message: "Request body cannot be empty for update.",
    });
  }

  try {
    const updatedSchedule = await scheduleService.updateSchedule(id, req.body, req.user);


    return res.status(200).json({
      success: true,
      message: `Schedule ID ${id} updated successfully.`,
      data: updatedSchedule,
    });
  } catch (error) {
    handleServiceError(res, error);
  }
};
// [READ] GET /api/v1/schedules
const getSchedules = async (req, res) => {
  // รับค่ากรองช่วงเวลาจาก Query parameters
  const { start_date, end_date } = req.query;

  try {
    const schedules = await scheduleService.getSchedules(start_date, end_date);

    return res.status(200).json({
      success: true,
      count: schedules.length,
      data: schedules,
    });
  } catch (error) {
    handleServiceError(res, error);
  }
};

const getAvailableSchedules = async (req, res) => {
  const { date, gym_enum, is_private_class } = req.query;
  console.log("[Controller] getAvailableSchedules hit with query:", req.query);

  if (!date) {
    return res.status(400).json({
      success: false,
      message: "date is required (YYYY-MM-DD)",
    });
  }

  try {
    const data = await scheduleService.getAvailableSchedulesByBookingDate(
      date,
      gym_enum,
      is_private_class
    );

    return res.status(200).json({
      success: true,
      message: "Available schedules retrieved successfully.",
      data,
    });
  } catch (error) {
    // ✅ ถ้าคุณมี handleServiceError อยู่แล้ว
    if (typeof handleServiceError === "function") {
      return handleServiceError(res, error);
    }

    // ✅ fallback กรณีไม่มี util
    console.error("[Controller Error] getAvailableSchedules:", error);

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// [DELETE] DELETE /api/v1/schedules/:id
const deleteSchedule = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await scheduleService.deleteSchedule(id, req.user);


    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    handleServiceError(res, error);
  }
};

const createScheduleInAdvance = async (req, res) => {
  const { schedule_id, start_date, end_date, gyms_id, capacity, is_close_gym } =
    req.body;

  // 1. Validation ขั้นต้น
  // - ต้องมี start_date และ end_date เสมอ
  // - ถ้าเป็นปิดยิม (is_close_gym = true) → ต้องมี gyms_id
  // - ถ้าไม่ใช่ปิดยิม → ต้องมี schedule_id (gyms_id หาได้จาก schedule)
  if (!start_date || !end_date) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: start_date and end_date are required.",
    });
  }

  if (is_close_gym && !gyms_id) {
    return res.status(400).json({
      success: false,
      message: "gyms_id is required when closing a gym.",
    });
  }

  if (!is_close_gym && !schedule_id) {
    return res.status(400).json({
      success: false,
      message: "schedule_id is required for capacity adjustment.",
    });
  }

  try {
    // 2. เรียกใช้ Service Layer
    const result = await scheduleService.createAdvancedSchedule(req.body, req.user);


    // 3. ส่ง Response
    if (result.warningMessage) {
      return res.status(201).json({
        success: true,
        message: `Config created successfully. Warning: ${result.warningMessage}`,
        data: result.record,
      });
    } else {
      return res.status(201).json({
        success: true,
        message: "Config created successfully.",
        data: result.record,
      });
    }
  } catch (error) {
    console.error(
      "[Controller] Error in createScheduleInAdvance:",
      error.message
    );
    handleServiceError(res, error);
  }
};

const getAdvancedSchedules = async (req, res) => {
  try {
    const filters = {
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      gym_enum: req.query.gym_enum,
    };

    const result = await scheduleService.getAdvancedSchedules(filters);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[Controller] Error in getAdvancedSchedules:", error.message);
    handleServiceError(res, error);
  }
};

const updateAdvancedSchedule = async (req, res) => {
  const { id } = req.params;

  // Validation: body cannot be empty
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({
      success: false,
      message: "Request body cannot be empty for update.",
    });
  }

  try {
    const updatedConfig = await scheduleService.updateAdvancedSchedule(
      id,
      req.body,
      req.user
    );



    return res.status(200).json({
      success: true,
      message: `Advanced schedule config ID ${id} updated successfully.`,
      data: updatedConfig,
    });
  } catch (error) {
    console.error(
      "[Controller] Error in updateAdvancedSchedule:",
      error.message
    );
    handleServiceError(res, error);
  }
};

const deleteAdvancedSchedule = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await scheduleService.deleteAdvancedSchedule(id, req.user);


    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error(
      "[Controller] Error in deleteAdvancedSchedule:",
      error.message
    );
    handleServiceError(res, error);
  }
};

module.exports = {
  createSchedule,
  getSchedules,
  updateSchedule,
  deleteSchedule,
  getAvailableSchedules,
  createScheduleInAdvance,
  getAdvancedSchedules,
  updateAdvancedSchedule,
  deleteAdvancedSchedule,
};
