const dashboardService = require("../services/dashboardService");

const getDashboardSummary = async (req, res) => {
  try {
    const summary = await dashboardService.getDashboardSummary();

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard summary",
    });
  }
};

const getDailyBookings = async (req, res) => {
  const { date } = req.query; // ✅ รับจาก ?date=YYYY-MM-DD

  if (!date) {
    return res.status(400).json({
      success: false,
      message: "date is required (YYYY-MM-DD)",
    });
  }

  try {
    const data = await dashboardService.getDailyBookingsByDate(date);

    return res.status(200).json({
      success: true,
      message: "Daily bookings retrieved successfully.",
      data,
    });
  } catch (error) {
    console.error("[Controller Error] getDailyBookings:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

module.exports = {
  getDashboardSummary,
  getDailyBookings
};
