const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
// const verifyToken = require("../middlewares/verifyToken");
// const requireAdmin = require("../middlewares/requireAdmin");

router.get("/summary", dashboardController.getDashboardSummary);
router.get("/daily", dashboardController.getDailyBookings);

module.exports = router;
