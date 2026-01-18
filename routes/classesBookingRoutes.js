// routes/classesBookingRoutes.js
const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/classesBookingController");
const { extractUserIfPresent } = require("../middlewares/authMiddleware");

// GET /api/v1/bookings?classes_schedule_id=...
router.get("/", bookingController.getBookings);

// POST /api/v1/bookings
router.post("/", extractUserIfPresent, bookingController.createBooking);
router.put("/updateBookingTrainer/:id",extractUserIfPresent, bookingController.updateBookingTrainer);
router.put("/updateBookingNote/:id",extractUserIfPresent, bookingController.patchBookingNote);
router.put("/:id", extractUserIfPresent, bookingController.updateBooking);
router.put("/:id/payment", extractUserIfPresent, bookingController.updateBookingPayment);
router.patch("/:id/note", extractUserIfPresent, bookingController.patchBookingNote);

// PATCH /api/v1/bookings/:id/cancel
router.patch("/:id/cancel", extractUserIfPresent, bookingController.cancelBooking);

// GET /api/v1/bookings/trainers
router.get("/trainers", bookingController.getTrainerForRequest);

// GET /api/v1/bookings/:name
router.get("/:name", bookingController.getBookingByName);

module.exports = router;
