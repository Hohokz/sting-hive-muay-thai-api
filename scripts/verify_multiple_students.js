const { sequelize, connectDB } = require('../config/db');
const { ClassesSchedule, ClassesBooking } = require('../models/Associations');
const classesBookingService = require('../services/classesBookingService');
const dayjs = require('dayjs');

async function test() {
  try {
    console.log("--- Starting Verification for multipleStudents ---");
    
    // Force dev mode to trigger sequelize.sync({ alter: true })
    // process.env.NODE_ENV = 'development'; // DISABLED TO AVOID LOCKS
    
    // 1. Connect and Sync
    await connectDB();

    // 2. Create a FRESH schedule to ensure capacity
    console.log("Creating a temporary schedule for testing...");
    const scheduleId = require('crypto').randomUUID(); // If ID is UUID
    // actually let's use the service or just raw create if we know structure. 
    // Easier: find one, if full, create one. 
    // Let's just create one.
    
    // We need a valid gyms_id. Let's assume 1 exists or find one.
    const { Gyms } = require('../models/Associations');
    let gym = await Gyms.findOne();
    if (!gym) {
       // Create dummy gym if needed or just fail
       console.log("No gym found, creating dummy gym...");
       gym = await Gyms.create({ name: 'Test Gym', gym_enum: 'STING_CLUB' });
    }

    const testSchedule = await ClassesSchedule.create({
        start_time: '08:00',
        end_time: '09:00',
        gym_enum: gym.gym_enum || 'STING_CLUB',
        gyms_id: gym.id,
        is_private_class: false,
        created_by: 'TEST_SCRIPT'
    });
    
    // Create Capacity
    const { ClassesCapacity } = require('../models/Associations');
    await ClassesCapacity.create({
        classes_id: testSchedule.id,
        capacity: 10, // Plenty of space
        created_by: 'TEST_SCRIPT'
    });

    const anySchedule = testSchedule;
    console.log(`Created Test Schedule ID: ${anySchedule.id}`);

    // 3. Create a Booking with multipleStudents: true
    // Need a future date to avoid "past date" error
    const validDate = dayjs().add(5, 'day').toDate();

    const bookingData = {
        classes_schedule_id: anySchedule.id,
        client_name: "Test MultipleStudents Feature",
        client_email: "test.feature@example.com",
        client_phone: "0000000000",
        capacity: 1,
        is_private: false,
        date_booking: validDate,
        multipleStudents: true // <--- THE FIELD TO TEST
    };

    console.log("Attempting to create booking with multipleStudents: true...");
    
    // Mock user for logging
    const mockUser = { username: "TEST_SCRIPT" };

    const newBooking = await classesBookingService.createBooking(bookingData, mockUser);
    
    console.log("---------------------------------------------------");
    console.log("Booking created successfully. ID:", newBooking.id);
    console.log("Result multipleStudents value:", newBooking.multipleStudents);
    
    let success = true;

    if (newBooking.multipleStudents === true) {
        console.log("✅ Check 1 Passed: createBooking returned object with multipleStudents = true");
    } else {
        console.error("❌ Check 1 Failed: createBooking returned object with multipleStudents =", newBooking.multipleStudents);
        success = false;
    }

    // 4. Retrieve from DB (fresh fetch) to verify persistence
    const fetchedBooking = await ClassesBooking.findByPk(newBooking.id);
    console.log("Fetched from DB multipleStudents value:", fetchedBooking.multipleStudents);

    if (fetchedBooking.multipleStudents === true) {
         console.log("✅ Check 2 Passed: Data persisted in DB correctly.");
    } else {
         console.error("❌ Check 2 Failed: Data in DB is NOT true.");
         success = false;
    }
    console.log("---------------------------------------------------");

    // Clean up
    await fetchedBooking.destroy();
    console.log("Test data cleaned up.");

    if (success) {
        console.log("🎉 VERIFICATION SUCCESSFUL");
    } else {
        console.log("⚠️ VERIFICATION FAILED");
    }

  } catch (error) {
    console.error("Test Failed with Exception:", error);
  } finally {
    await sequelize.close();
  }
}

test();
