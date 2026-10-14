const express = require("express");
const router = express.Router();

const scheduleController = require("../controllers/classesScheduleController");
const {
  authenticateToken,
  authorizeRole,
} = require("../middlewares/authMiddleware");

// =================================================================
// SCHEDULE ENDPOINTS (API: /api/v1/schedules)
// =================================================================

// 1. [READ] GET /api/v1/schedules
router.get("/", scheduleController.getSchedules);

router.get("/available", scheduleController.getAvailableSchedulesByBookingDate);

// Public: GET /api/v1/schedules/closed-dates?gym_enum=&start_date=&end_date=
// Dates a gym is closed by an advance rule, so the booking calendar can disable them
router.get("/closed-dates", scheduleController.getGymClosedDates);

// [READ] GET /api/v1/schedules/:id/history — who changed this schedule and its advance rules
router.get(
  "/:id/history",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  scheduleController.getScheduleHistory,
);

// 2. [CREATE] POST /api/v1/schedules
// Creates a new schedule along with its capacity
router.post(
  "/",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  scheduleController.createSchedule,
);

// 3. [UPDATE] PUT /api/v1/schedules/:id
// Updates a schedule and its capacity by ID
router.put(
  "/:id",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  scheduleController.updateSchedule,
);

// 4. [DELETE] DELETE /api/v1/schedules/:id
router.delete(
  "/:id",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  scheduleController.deleteSchedule,
);

// 5. [CREATE] POST /api/v1/schedules/in-advance
// Creates/updates an advance config
router.post(
  "/in-advance",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  scheduleController.createAdvancedSchedule,
);

// 6. [READ] GET /api/v1/schedules/in-advance
// Reads advance configs, split by type
router.get(
  "/in-advance",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  scheduleController.getAdvancedSchedules,
);

// 7. [UPDATE] PUT /api/v1/schedules/in-advance/:id
router.put(
  "/in-advance/:id",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  scheduleController.updateAdvancedSchedule,
);

// 8. [DELETE] DELETE /api/v1/schedules/in-advance/:id
router.delete(
  "/in-advance/:id",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  scheduleController.deleteAdvancedSchedule,
);

module.exports = router;
