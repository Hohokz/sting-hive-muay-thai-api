// controllers/classesBookingController.js
const bookingService = require('../services/classesBookingService');

const handleServiceError = (res, error) => {
    const statusCode = error.status || 500;
    const message = statusCode === 500 ? 'Internal Server Error' : error.message;
    return res.status(statusCode).json({ success: false, message });
};

// [POST] Create Booking
const createBooking = async (req, res) => {
    // Validation
    const { classes_schedule_id, client_name, client_email } = req.body;
    if (!classes_schedule_id || !client_name) {
        return res.status(400).json({ success: false, message: "Missing required fields: schedule_id and name." });
    }

    try {
        const booking = await bookingService.createBooking(req.body);
        res.status(201).json({
            success: true,
            message: "Booking created successfully.",
            data: booking
        });
    } catch (error) {
        handleServiceError(res, error);
    }
};

// [GET] List Bookings
const getBookings = async (req, res) => {
    try {
        const bookings = await bookingService.getBookings(req.query);
        res.status(200).json({ success: true, count: bookings.length, data: bookings });
    } catch (error) {
        handleServiceError(res, error);
    }
};

// [PATCH] Cancel Booking (Shortcut endpoint)
const cancelBooking = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await bookingService.updateBookingStatus(id, 'CANCELED', 'API_USER');
        res.status(200).json({ success: true, message: "Booking canceled.", data: result });
    } catch (error) {
        handleServiceError(res, error);
    }
};

module.exports = {
    createBooking,
    getBookings,
    cancelBooking
};