const { updateBooking } = require('../services/classesBookingService');
const { ClassesBooking, ClassesSchedule, ClassesCapacity } = require('../models/Associations');
const { sequelize } = require('../config/db');
const scheduleService = require('../services/classesScheduleService');
const activityLogService = require('../services/activityLogService');
const dayjs = require('dayjs');

async function verifyFix() {
    console.log("--- STARTING DYNAMIC VERIFICATION ---\n");

    const mockBookingId = '1e4dfee3-78cc-47cb-9ac8-f9b0ee686f57';
    const oldScheduleId = 'old-id';
    const newScheduleId = 'new-id';
    const bookingDate = '2030-01-01'; // Future
    
    // 1. Mock Booking
    const mockBooking = {
        id: mockBookingId,
        classes_schedule_id: oldScheduleId,
        capacity: 2,
        date_booking: bookingDate,
        client_name: 'Test Client',
        client_email: 'test@example.com',
        update: async function(data) {
            console.log("   [Mock] booking.update called");
            return Object.assign({}, this, data);
        }
    };

    // 2. Mock Schedule
    const mockSchedule = {
        id: newScheduleId,
        gyms_id: 1,
        gym_enum: 'STING_CLUB',
        start_time: '16:00',
        end_time: '17:00'
    };

    // 3. Mock Model Methods
    ClassesBooking.findByPk = async () => mockBooking;
    ClassesSchedule.findByPk = async () => mockSchedule;
    
    // 4. Mock Service Methods
    scheduleService.getSchedulesById = async () => mockSchedule;
    scheduleService.getScheduleRealtimeAvailability = async () => ({
        maxCapacity: 5,
        currentBookingCount: 4, // 1 seat left
        isCloseGym: false,
        isClassClosed: false
    });
    
    activityLogService.createLog = async () => console.log("   [Mock] Activity Log created");

    // 5. Mock Sequelize Transaction
    sequelize.transaction = async () => ({
        commit: async () => console.log("   [Mock] Transaction committed."),
        rollback: async () => console.log("   [Mock] Transaction rolled back."),
        LOCK: { UPDATE: 'UPDATE' }
    });

    console.log("CASE 1: Move from Slot A to Slot B (Should treat old capacity as 0)");
    console.log("   - Slot B has 4/5 seats occupied (1 left).");
    console.log("   - Attempting to move a 2-person booking to Slot B.");
    console.log("   - EXPECTED: Should FAIL because 4 + 2 > 5.");
    
    try {
        await updateBooking(mockBookingId, {
            classes_schedule_id: newScheduleId, // DIFFERENT
            capacity: 2,
            date_booking: bookingDate,
            client_name: 'Test Client',
            client_email: 'test@example.com',
            is_private: false
        });
        console.log("❌ CASE 1 FAILED: Update succeeded when it should have failed.");
    } catch (e) {
        console.log("✅ CASE 1 PASSED: Caught expected error:", e.message);
    }

    console.log("\nCASE 2: Same Slot, No capacity change");
    console.log("   - EXPECTED: Should PASS because (4 - 2) + 2 = 4 (<= 5).");
    try {
        // Mocking currentBookingCount as 4 (including the current booking's 2)
        // seatsTakenByOthers = 4 - 2 = 2
        // totalAfterBooking = 2 + 2 = 4
        await updateBooking(mockBookingId, {
            classes_schedule_id: oldScheduleId, // SAME
            capacity: 2, // SAME
            date_booking: bookingDate,
            client_name: 'Test Client Update',
            client_email: 'test@example.com',
            is_private: false
        });
        console.log("✅ CASE 2 PASSED: Update succeeded as expected.");
    } catch (e) {
        console.log("❌ CASE 2 FAILED: Update failed:", e.message);
    }

    console.log("\n--- VERIFICATION FINISHED ---");
    process.exit(0);
}

verifyFix();
