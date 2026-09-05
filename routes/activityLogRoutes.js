const express = require("express");
const router = express.Router();
const activityLogController = require("../controllers/activityLogController");
const {
  authenticateToken,
  authorizeRole,
} = require("../middlewares/authMiddleware");

router.use(authenticateToken);
router.use(authorizeRole(["ADMIN"]));

// Activity log routes (admin only)
router.get("/", activityLogController.getActivityLogs);
router.get("/export", activityLogController.exportLogs);
router.get("/export/months", activityLogController.getAvailableExportMonths);
router.get("/purge/exported-months", activityLogController.getExportedMonths);
router.get("/purge/preview", activityLogController.previewPurgeLogs);
router.delete("/purge", activityLogController.purgeLogs);

module.exports = router;
