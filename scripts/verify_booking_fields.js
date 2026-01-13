const { sequelize, connectDB } = require('../config/db');
const { ClassesSchedule, ClassesBooking } = require('../models/Associations');
const classesBookingService = require('../services/classesBookingService');
const dayjs = require('dayjs');

async function test() {
  try {
    console.log("--- Starting Robust Verification for Bookings ---");
    
    // Force dev mode for sync - DISABLED to avoid locks
    // process.env.NODE_ENV = 'development';
    await connectDB();

    // 1. Get or Create a valid schedule
    let schedule = await ClassesSchedule.findOne();
    if (!schedule) {
        console.log("No schedule found, creating a dummy one for testing...");
        // Need to create a schedule
        // But for now, assuming DB has one because user is testing
        // Creating one might fail due to missing params (gym_id etc).
        // Let's try to query one with gym_enum 'STING_CLUB' (id=1)
        schedule = await ClassesSchedule.create({
             start_time: '10:00',
             end_time: '11:00',
             gym_enum: 'STING_CLUB',
             description: 'Test Class',
             is_private_class: false,
             gyms_id: 1, 
             created_by: 'TEST_SCRIPT'
        });
        // Create capacity for it
        const { ClassesCapacity } = require('../models/Associations');
        await ClassesCapacity.create({
            classes_id: schedule.id,
            capacity: 10,
            created_by: 'TEST_SCRIPT'
        });
        console.log("Created dummy schedule:", schedule.id);
    }
    
    console.log(`Using Schedule ID: ${schedule.id}`);
    
    // 2. Scenario A: Booking with multipleStudents = true
    {
        const validDate = dayjs().add(5, 'day').toDate();
        const bookingData = {
            classes_schedule_id: schedule.id,
            client_name: "Test Scenario A",
            client_email: "test.A@example.com",
            capacity: 1,
            is_private: false,
            date_booking: validDate,
            multipleStudents: true
        };

        console.log("\n[Scenario A] Creating booking with multipleStudents: true...");
        try {
            const booking = await classesBookingService.createBooking(bookingData, { username: 'TEST_SCRIPT' });
            console.log("✅ [Scenario A] Success! multipleStudents:", booking.multipleStudents);
        } catch (e) {
            console.error("❌ [Scenario A] Failed:", e.message);
            if (e.status) console.error("   Status:", e.status);
        }
    }

    // 3. Scenario B: Booking WITHOUT multipleStudents (should default to false)
    {
        const validDate = dayjs().add(6, 'day').toDate();
        const bookingData = {
            classes_schedule_id: schedule.id,
            client_name: "Test Scenario B",
            client_email: "test.B@example.com",
            capacity: 1,
            is_private: false,
            date_booking: validDate,
            // multipleStudents MISSING
        };

        console.log("\n[Scenario B] Creating booking WITHOUT multipleStudents...");
        try {
            const booking = await classesBookingService.createBooking(bookingData, { username: 'TEST_SCRIPT' });
            console.log("✅ [Scenario B] Success! multipleStudents:", booking.multipleStudents);
            if (booking.multipleStudents === false) {
                 console.log("   (Correctly defaulted to false)");
            } else {
                 console.error("   (Incorrect value, expected false)");
            }
        } catch (e) {
            console.error("❌ [Scenario B] Failed:", e.message);
             if (e.status) console.error("   Status:", e.status);
        }
    }

    // 4. Scenario C: Booking with Past Date (Expect Valid fail)
    {
        const pastDate = dayjs().subtract(1, 'day').toDate();
        const bookingData = {
            classes_schedule_id: schedule.id,
            client_name: "Test Scenario C",
            client_email: "test.C@example.com",
            capacity: 1,
            is_private: false,
            date_booking: pastDate,
             multipleStudents: true
        };
        console.log("\n[Scenario C] Creating booking with PAST DATE (Expect Error)...");
        try {
            await classesBookingService.createBooking(bookingData, { username: 'TEST_SCRIPT' });
            console.error("❌ [Scenario C] Failed: Should have thrown error but SUCCEEDED.");
        } catch (e) {
            console.log("✅ [Scenario C] Success: Caught expected error:", e.message);
            if (e.status === 400) console.log("   Status is 400 (Correct)");
            else console.log("   Status is", e.status);
        }
    }

    console.log("\n--- Verification Finished ---");

  } catch (error) {
    console.error("General Test Failed:", error);
  } finally {
    await sequelize.close();
  }
}

test();
