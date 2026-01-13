const express = require("express");
const router = express.Router();
const activityLogController = require("../controllers/activityLogController");

// ✅ Activity Log Routes (Usually for Admin)
router.get("/", activityLogController.getActivityLogs);

module.exports = router;
