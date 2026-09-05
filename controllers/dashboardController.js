const dashboardService = require("../services/dashboardService");
const { sendError } = require("../utils/httpError");

/**
 * [GET] Returns the daily dashboard summary (total capacity, booking count)
 */
const getDashboardSummary = async (req, res) => {
  try {
    const { date } = req.query;
    const summary = await dashboardService.getDashboardSummary(date);

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    sendError(res, error, "ไม่สามารถโหลดข้อมูลสรุป Dashboard ได้");
  }
};

/**
 * [GET] Returns all bookings for a given date (for the dashboard table)
 */
const getDailyBookings = async (req, res) => {
  try {
    const { date } = req.query; // format: YYYY-MM-DD
    if (!date) {
      return res.status(400).json({
        success: false,
        message: "กรุณาระบุวันที่ (YYYY-MM-DD)",
      });
    }

    const data = await dashboardService.getDailyBookingsByDate(date);

    return res.status(200).json({
      success: true,
      message: "ดึงข้อมูลรายการจองสำเร็จ",
      data,
    });
  } catch (error) {
    sendError(res, error, "เกิดข้อผิดพลาดในการดึงข้อมูลรายการจอง");
  }
};

/**
 * [GET] Returns the total database size in bytes
 */
const getDatabaseSize = async (req, res) => {
  try {
    const bytes = await dashboardService.getDatabaseSize();
    res.status(200).json({ success: true, data: { bytes } });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงข้อมูลขนาดฐานข้อมูลได้");
  }
};

module.exports = {
  getDashboardSummary,
  getDailyBookings,
  getDatabaseSize,
};
