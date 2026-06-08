const express = require("express");
const router = express.Router();
const activityLogController = require("../controllers/activityLogController");
const {
  authenticateToken,
  authorizeRole,
} = require("../middlewares/authMiddleware");

router.use(authenticateToken);
router.use(authorizeRole(["ADMIN"]));

// ✅ Activity Log Routes (Usually for Admin)
router.get("/", activityLogController.getActivityLogs);
router.get("/export", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "start_date and end_date are required (YYYY-MM-DD)",
      });
    }
    const { csv, filename } = await activityLogController.exportLogsToCSV({
      start_date,
      end_date,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
