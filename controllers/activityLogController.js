const activityLogService = require("../services/activityLogService");

/**
 * [GET] ดึงรายการ Activity Log ทั้งหมด (พร้อม Filters)
 */
exports.getActivityLogs = async (req, res) => {
  try {
    const logs = await activityLogService.getActivityLogs(req.query);

    res.status(200).json({
      success: true,
      data: logs.logs,
      total: logs.total,
    });
  } catch (error) {
    console.error("[ActivityLogController] getActivityLogs Error:", error);
    res.status(500).json({
      success: false,
      message: "ไม่สามารถดึงข้อมูล Activity Log ได้",
    });
  }
};
