// test-job.js - Script for testing the Advanced Schedule Job manually
const { runAdvancedScheduleJob } = require("./job/advancedScheduleJob");

runAdvancedScheduleJob()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
