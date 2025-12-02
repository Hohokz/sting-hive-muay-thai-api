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
    if (!classes_schedule_id || !client_name || !client_email) {
        return res.status(400).json({ success: false, message: "Missing required fields: schedule_id, name, and email." });
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

const updateBooking = async (req, res) => {
    try {
        const { id } = req.params;     // booking id จาก URL
        const updateData = req.body;   // ข้อมูลที่ต้องการแก้ไข

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Booking ID is required."
            });
        }

        const updatedBooking = await bookingService.updateBooking(id, updateData);

        return res.status(200).json({
            success: true,
            message: "Booking updated successfully.",
            data: updatedBooking
        });

    } catch (error) {
        console.error("[Booking Controller] Update Error:", error);

        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Failed to update booking."
        });
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
    updateBooking,
    getBookings,
    cancelBooking
};