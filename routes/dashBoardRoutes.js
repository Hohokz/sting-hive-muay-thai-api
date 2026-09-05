const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const { authenticateToken, authorizeRole } = require("../middlewares/authMiddleware");

// Requires login (either role) — matches the frontend's /admin/dashboard
// route, which is gated requiresAuth: true, adminOnly: false.
router.use(authenticateToken);
router.use(authorizeRole(["ADMIN", "USER"]));

router.get("/summary", dashboardController.getDashboardSummary);
router.get("/daily", dashboardController.getDailyBookings);
// Admin only, layered on top of the router-wide ADMIN+USER check above
router.get("/db-size", authorizeRole(["ADMIN"]), dashboardController.getDatabaseSize);

module.exports = router;
