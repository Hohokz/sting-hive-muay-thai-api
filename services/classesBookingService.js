const { ClassesBooking, ClassesSchedule, ClassesCapacity } = require('../models/Associations');
const { sequelize } = require('../config/db');
const { Op } = require('sequelize');

// =================================================================
// HELPER FUNCTIONS
// =================================================================

/**
 * ตรวจสอบที่ว่างในคลาส (Check Availability)
 * @param {string} scheduleId
 * @param {object} transaction - Database Transaction
 * @returns {Promise<void>} Throws error if full
 */
const _checkAvailability = async (scheduleId, transaction) => {
    // 1. ดึงข้อมูล Schedule พร้อม Capacity
    const schedule = await ClassesSchedule.findByPk(scheduleId, {
        include: [{ model: ClassesCapacity, as: 'capacity_data' }],
        transaction,
        lock: transaction.LOCK.UPDATE // ล็อกแถวนี้ไว้ชั่วคราวป้องกันการแก้ไขซ้อนกัน (Concurrency Control)
    });

    if (!schedule) {
        const error = new Error("Class schedule not found.");
        error.status = 404;
        throw error;
    }

    if (!schedule.is_active) {
        const error = new Error("This class schedule is not active.");
        error.status = 400;
        throw error;
    }

    const maxCapacity = schedule.capacity_data ? schedule.capacity_data.capacity : 0;

    // 2. นับจำนวน Booking ที่มีอยู่แล้ว (นับเฉพาะสถานะที่จองที่นั่งได้จริง: PENDING, SUCCEED)
    const currentBookingsCount = await ClassesBooking.count({
        where: {
            classes_schedule_id: scheduleId,
            booking_status: {
                [Op.in]: ['PENDING', 'SUCCEED', 'RESCHEDULED'] // สถานะที่ถือว่าครองสิทธิ์ที่นั่ง
            }
        },
        transaction
    });

    // 3. เปรียบเทียบ
    if (currentBookingsCount >= maxCapacity) {
        const error = new Error(`Class is full. Capacity: ${maxCapacity}, Current Bookings: ${currentBookingsCount}`);
        error.status = 409; // Conflict
        throw error;
    }
};

// =================================================================
// CORE SERVICE FUNCTIONS
// =================================================================

/**
 * [CREATE] สร้างการจองใหม่ (Booking)
 */
const createBooking = async (bookingData) => {
    const { classes_schedule_id, client_name, client_email, client_phone, user } = bookingData;

    // เริ่ม Transaction เพื่อความปลอดภัยของข้อมูล (Atomic Operation)
    const transaction = await sequelize.transaction();

    try {
        // 1. ตรวจสอบว่าคลาสว่างหรือไม่ (Critical Step)
        await _checkAvailability(classes_schedule_id, transaction);

        // 2. ตรวจสอบว่า User คนนี้เคยจองคลาสนี้ไปแล้วหรือยัง (Optional: ป้องกันการจองซ้ำ)
        if (client_email) {
            const existingBooking = await ClassesBooking.findOne({
                where: {
                    classes_schedule_id,
                    client_email,
                    booking_status: { [Op.notIn]: ['CANCELED', 'FAILED'] }
                },
                transaction
            });
            
            if (existingBooking) {
                const error = new Error("You have already booked this class.");
                error.status = 409;
                throw error;
            }
        }

        // 3. สร้าง Booking Record
        const newBooking = await ClassesBooking.create({
            classes_schedule_id,
            client_name,
            client_email,
            client_phone,
            booking_status: 'PENDING', // เริ่มต้นเป็น Pending รอการชำระเงิน
            capacity: 1, // จอง 1 ที่นั่ง (ถ้า one-by-one)
            created_by: user || 'CLIENT_APP',
            // payment_id: ... (จะถูกอัปเดตหลังจากชำระเงิน หรือสร้างพร้อมกันใน Payment Service)
        }, { transaction });

        await transaction.commit();
        return newBooking;

    } catch (error) {
        await transaction.rollback();
        console.error("[Booking Service] Create Error:", error);
        throw error; // ส่งต่อ Error ให้ Controller จัดการ
    }
};

/**
 * [READ] ดึงข้อมูล Booking (Filter ตาม Schedule หรือ User ได้)
 */
const getBookings = async (filters) => {
    const { classes_schedule_id, client_email, status } = filters;
    const whereCondition = {};

    if (classes_schedule_id) whereCondition.classes_schedule_id = classes_schedule_id;
    if (client_email) whereCondition.client_email = client_email;
    if (status) whereCondition.booking_status = status;

    try {
        const bookings = await ClassesBooking.findAll({
            where: whereCondition,
            include: [
                { 
                    model: ClassesSchedule, 
                    as: 'schedule',
                    attributes: ['start_time', 'end_time', 'gym_enum'] // ดึงข้อมูลเวลาเรียนมาด้วย
                }
            ],
            order: [['created_date', 'DESC']]
        });
        return bookings;
    } catch (error) {
        console.error("[Booking Service] Get Error:", error);
        throw new Error("Failed to retrieve bookings.");
    }
};

/**
 * [UPDATE STATUS] เปลี่ยนสถานะการจอง (เช่น Cancel, Confirm)
 * การ Cancel จะทำให้ที่นั่งว่างลงโดยอัตโนมัติ เพราะ Logic _checkAvailability ไม่นับสถานะ CANCELED
 */
const updateBookingStatus = async (bookingId, newStatus, user) => {
    const transaction = await sequelize.transaction();
    try {
        const booking = await ClassesBooking.findByPk(bookingId, { transaction });

        if (!booking) {
            const error = new Error("Booking not found.");
            error.status = 404;
            throw error;
        }

        // ถ้าเปลี่ยนเป็น SUCCEED/RESCHEDULED ต้องเช็ค Capacity อีกรอบไหม?
        // ปกติ PENDING ถือว่าจองที่ไว้แล้ว ไม่ต้องเช็คซ้ำ แต่ถ้ากู้คืนจาก CANCELED -> PENDING ต้องเช็ค
        if (['CANCELED', 'FAILED'].includes(booking.booking_status) && ['PENDING', 'SUCCEED'].includes(newStatus)) {
             await _checkAvailability(booking.classes_schedule_id, transaction);
        }

        await booking.update({
            booking_status: newStatus,
            updated_by: user || 'ADMIN'
        }, { transaction });

        await transaction.commit();
        return booking;

    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

module.exports = {
    createBooking,
    getBookings,
    updateBookingStatus
};