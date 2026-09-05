// routes/classesBookingRoutes.js
const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/classesBookingController");
const {
  extractUserIfPresent,
  authenticateToken,
  authorizeRole,
} = require("../middlewares/authMiddleware");

// GET /api/v1/bookings?classes_schedule_id=...
router.get("/", bookingController.getBookings);

// Literal routes must be registered before the "/:name" wildcard below,
// otherwise Express matches "/:name" first (e.g. name="trainers") and these
// never get reached.
// GET /api/v1/bookings/trainers
router.get("/trainers", bookingController.getTrainerForRequest);
// GET /api/v1/bookings/export — admin only, exports raw client data
router.get(
  "/export",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  bookingController.exportBookings,
);
// GET /api/v1/bookings/export/months — which months have data, for the export UI
router.get(
  "/export/months",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  bookingController.getAvailableExportMonths,
);

// GET /api/v1/bookings/purge/exported-months — which months are eligible
// for deletion (have been exported before)
router.get(
  "/purge/exported-months",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  bookingController.getExportedMonths,
);
// GET /api/v1/bookings/purge/preview — how many rows a purge would delete
router.get(
  "/purge/preview",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  bookingController.previewPurgeBookings,
);
// DELETE /api/v1/bookings/purge — permanently deletes a month's bookings
router.delete(
  "/purge",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  bookingController.purgeBookings,
);

// GET /api/v1/bookings/:name
router.get("/:name", extractUserIfPresent, bookingController.getBookingByName);

// POST /api/v1/bookings
router.post("/", extractUserIfPresent, bookingController.createBooking);
router.put(
  "/updateBookingTrainer/:id",
  extractUserIfPresent,
  bookingController.updateBookingTrainer,
);
router.put(
  "/updateBookingNote/:id",
  extractUserIfPresent,
  bookingController.updateBookingNote,
);
router.put("/:id", extractUserIfPresent, bookingController.updateBooking);
router.put(
  "/:id/payment",
  extractUserIfPresent,
  bookingController.updateBookingPayment,
);
router.patch(
  "/:id/note",
  extractUserIfPresent,
  bookingController.updateBookingNote,
);

// PATCH /api/v1/bookings/:id/cancel
router.patch(
  "/:id/cancel",
  extractUserIfPresent,
  bookingController.cancelBooking,
);

module.exports = router;
