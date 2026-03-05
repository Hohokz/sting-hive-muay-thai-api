const dashboardService = require("../services/dashboardService");

/**
 * [GET] ดึงข้อมูลสรุป Dashboard รายวัน (Capacity รวม, จำนวนคนจอง)
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
    console.error("[DashboardController] getSummary Error:", error);
    res.status(500).json({
      success: false,
      message: "ไม่สามารถโหลดข้อมูลสรุป Dashboard ได้",
      error: error.message
    });
  }
};

/**
 * [GET] ดึงรายการการจองทั้งหมดของวันที่เลือก (สำหรับตาราง Dashboard)
 */
const getDailyBookings = async (req, res) => {
  try {
    const { date } = req.query; // รับรูปแบบ YYYY-MM-DD
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
    console.error("[DashboardController] getDailyBookings Error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลรายการจอง",
    });
  }
};

module.exports = {
  getDashboardSummary,
  getDailyBookings
};
