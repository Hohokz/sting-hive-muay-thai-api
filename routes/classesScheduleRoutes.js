const express = require('express');
const router = express.Router();

// นำเข้า Controller Functions ทั้งหมด
// Assume the controller file is located at '../controllers/classesScheduleController'
const scheduleController = require('../controllers/classesScheduleController');

// =================================================================
// 🔗 SCHEDULE ENDPOINTS (API: /api/v1/schedules)
// =================================================================

// 1. [READ] GET /api/v1/schedules
// ดึงข้อมูล Schedule ทั้งหมด หรือตามช่วงเวลา (start_date, end_date ใน Query params)
router.get('/', scheduleController.getSchedules);

// 2. [CREATE] POST /api/v1/schedules
// สร้าง Schedule ใหม่ พร้อม Capacity
router.post('/', scheduleController.createSchedule);

// 3. [UPDATE] PUT /api/v1/schedules/:id
// อัปเดต Schedule และ Capacity ด้วย ID
router.put('/:id', scheduleController.updateSchedule);

// 4. [DELETE] DELETE /api/v1/schedules/:id
// ลบ Schedule ด้วย ID
router.delete('/:id', scheduleController.deleteSchedule);

module.exports = router;