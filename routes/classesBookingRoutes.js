// routes/classesBookingRoutes.js
const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/classesBookingController");
const {
  extractUserIfPresent,
  authenticateToken,
  authorizeRole,
} = require("../middlewares/authMiddleware");

// Staff-only (dashboard) routes: they expose other clients' data or edit
// payments, so an anonymous caller must not reach them.
const requireStaff = [authenticateToken, authorizeRole(["ADMIN", "USER"])];

// GET /api/v1/bookings?classes_schedule_id=...
// Public, but an anonymous caller must filter by their own booking id or
// email — see bookingController.getBookings.
router.get("/", extractUserIfPresent, bookingController.getBookings);

// Literal routes must be registered before the "/:name" wildcard below,
// otherwise Express matches "/:name" first (e.g. name="trainers") and these
// never get reached.
// GET /api/v1/bookings/trainers
router.get("/trainers", requireStaff, bookingController.getTrainerForRequest);
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
router.get("/:name", requireStaff, bookingController.getBookingByName);

// POST /api/v1/bookings
router.post("/", extractUserIfPresent, bookingController.createBooking);
router.put(
  "/updateBookingTrainer/:id",
  requireStaff,
  bookingController.updateBookingTrainer,
);
router.put(
  "/updateBookingNote/:id",
  requireStaff,
  bookingController.updateBookingNote,
);
router.put("/:id", extractUserIfPresent, bookingController.updateBooking);
router.put(
  "/:id/payment",
  requireStaff,
  bookingController.updateBookingPayment,
);
router.get(
  "/:id/payment",
  requireStaff,
  bookingController.getBookingPaymentDetail,
);
// PUT /api/v1/bookings/payment-entry/:entryId — edits one payment-history
// entry in place (registered before the "/:name" wildcard below, since
// literal 2-segment routes never collide with it, but kept alongside the
// other payment routes for readability).
router.put(
  "/payment-entry/:entryId",
  requireStaff,
  bookingController.updateBookingPaymentEntry,
);
// DELETE /api/v1/bookings/payment-entry/:entryId
router.delete(
  "/payment-entry/:entryId",
  requireStaff,
  bookingController.deleteBookingPaymentEntry,
);
router.patch(
  "/:id/note",
  requireStaff,
  bookingController.updateBookingNote,
);

// PATCH /api/v1/bookings/:id/cancel
router.patch(
  "/:id/cancel",
  extractUserIfPresent,
  bookingController.cancelBooking,
);

module.exports = router;
