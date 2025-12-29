// test-archival-job.js
const { runMonthlyArchivalJob } = require("./job/monthlyArchivalJob");
const { connectDB } = require("./config/db");

// Force environment variables for testing logic if keys are missing (Mocking for dev if needed)
// But for real test, user needs .env set.

const runTest = async () => {
  console.log("🛠️ Starting Manual Test for Monthly Archival Job...");

  // 1. Connect DB first
  await connectDB();

  // 2. Run Job
  await runMonthlyArchivalJob();

  console.log("✅ Test Completed. Exiting...");
  process.exit(0);
};

runTest().catch((err) => {
  console.error("❌ Test Failed:", err);
  process.exit(1);
});
