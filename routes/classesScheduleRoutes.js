const express = require("express");
const router = express.Router();

// นำเข้า Controller Functions ทั้งหมด
// Assume the controller file is located at '../controllers/classesScheduleController'
const scheduleController = require("../controllers/classesScheduleController");
const { authenticateToken, authorizeRole } = require("../middlewares/authMiddleware");

// =================================================================
// 🔗 SCHEDULE ENDPOINTS (API: /api/v1/schedules)
// =================================================================

// 1. [READ] GET /api/v1/schedules
// ดึงข้อมูล Schedule ทั้งหมด หรือตามช่วงเวลา (start_date, end_date ใน Query params)
router.get("/", scheduleController.getSchedules);

router.get("/available", scheduleController.getAvailableSchedules);

// 2. [CREATE] POST /api/v1/schedules
// สร้าง Schedule ใหม่ พร้อม Capacity
router.post("/", authenticateToken, authorizeRole(["ADMIN"]), scheduleController.createSchedule);

// 3. [UPDATE] PUT /api/v1/schedules/:id
// อัปเดต Schedule และ Capacity ด้วย ID
router.put("/:id", authenticateToken, authorizeRole(["ADMIN"]), scheduleController.updateSchedule);

// 4. [DELETE] DELETE /api/v1/schedules/:id
// ลบ Schedule ด้วย ID
router.delete("/:id", authenticateToken, authorizeRole(["ADMIN"]), scheduleController.deleteSchedule);

// 5. [CREATE] POST /api/v1/schedules/in-advance
// สร้าง/แก้ไข Advance Config
router.post("/in-advance", authenticateToken, authorizeRole(["ADMIN"]), scheduleController.createScheduleInAdvance);

// 6. [READ] GET /api/v1/schedules/in-advance
// อ่าน Advance Config แยกตามประเภท
router.get("/in-advance", authenticateToken, authorizeRole(["ADMIN"]), scheduleController.getAdvancedSchedules);

// 7. [UPDATE] PUT /api/v1/schedules/in-advance/:id
// แก้ไข Advance Config
router.put("/in-advance/:id", authenticateToken, authorizeRole(["ADMIN"]), scheduleController.updateAdvancedSchedule);

// 8. [DELETE] DELETE /api/v1/schedules/in-advance/:id
// ลบ Advance Config
router.delete("/in-advance/:id", authenticateToken, authorizeRole(["ADMIN"]), scheduleController.deleteAdvancedSchedule);

// 9. [READ] GET /api/v1/schedules/in-advance/:id
// แก้ไข Advance Config
router.get("/in-advance/active", authenticateToken, authorizeRole(["ADMIN"]), scheduleController.activeScheduleInAdvance);

module.exports = router;
