const activityLogService = require("../services/activityLogService");

/**
 * ดึงรายการ Activity Log (สำหรับ Admin)
 */
const getActivityLogs = async (req, res) => {
  try {
    const { service, action, user_id, limit, offset } = req.query;
    
    const logs = await activityLogService.getActivityLogs({
      service,
      action,
      user_id,
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error("[ActivityLogController] Get Logs Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve activity logs",
      error: error.message,
    });
  }
};

module.exports = {
  getActivityLogs,
};
