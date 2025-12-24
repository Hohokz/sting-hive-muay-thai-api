// routes/classesBookingRoutes.js
const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/classesBookingController');

// GET /api/v1/bookings?classes_schedule_id=...
router.get('/', bookingController.getBookings);

// POST /api/v1/bookings
router.post('/', bookingController.createBooking);
router.put('/updateBookingTrainer/:id', bookingController.updateBookingTrainer);
router.put('/updateBookingNote/:id', bookingController.patchBookingNote);
router.put('/:id', bookingController.updateBooking);

router.patch('/:id/note', bookingController.patchBookingNote);

// PATCH /api/v1/bookings/:id/cancel
router.patch('/:id/cancel', bookingController.cancelBooking);

module.exports = router;