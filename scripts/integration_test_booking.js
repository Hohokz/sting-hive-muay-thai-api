const { createBooking } = require("../services/classesBookingService");
const { connectDB, sequelize } = require("../config/db");

async function testIntegration() {
  try {
    console.log(
      "--- Starting Integration Test (NODE_ENV=production to skip sync) ---"
    );
    // We handle connection manually to avoid sync if needed, but connectDB is fine if env is production
    await sequelize.authenticate();
    console.log("✅ Database connection successful.");

    const VALID_ID = "06d75d65-044a-4aef-9370-50fc0b8665e0";

    // 1. Test Past Date (Should Fail)
    console.log(
      `\n[Test 1] Creating booking with past date (2025-01-01) for schedule ${VALID_ID}...`
    );
    try {
      await createBooking({
        classes_schedule_id: VALID_ID,
        client_name: "Test Past",
        client_email: "test@past.com",
        capacity: 1,
        date_booking: "2025-01-01",
      });
      console.log("❌ Test 1 Failed: Should have thrown error for past date.");
    } catch (err) {
      console.log("✅ Test 1 Passed: Caught expected error:", err.message);
    }

    // 2. Test Today's Date (Should Pass or fail with seat/schedule error, but NOT date validation error)
    const todayStr = new Date().toISOString().split("T")[0];
    console.log(
      `\n[Test 2] Creating booking with today's date (${todayStr})...`
    );
    try {
      await createBooking({
        classes_schedule_id: VALID_ID,
        client_name: "Test Today",
        client_email: "test@today123.com",
        capacity: 1,
        date_booking: todayStr,
      });
      console.log(
        "✅ Test 2 Passed: Successfully triggered service (might fail on email/existing but logic reached)."
      );
    } catch (err) {
      if (err.message === "Cannot book for a past date.") {
        console.log(
          "❌ Test 2 Failed: Incorrectly flagged today as past date."
        );
      } else {
        console.log(
          "✅ Test 2 Passed: (Caught other error as expected, e.g., 'already booked' or 'full', but NOT date error):",
          err.message
        );
      }
    }
  } catch (globalError) {
    console.error("Critical Test Failure:", globalError);
  } finally {
    await sequelize.close();
  }
}

testIntegration();
