const activityLogService = require("../services/activityLogService");
const { sendError } = require("../utils/httpError");

/**
 * [GET] Returns activity logs (with filters)
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
    sendError(res, error, "ไม่สามารถดึงข้อมูล Activity Log ได้");
  }
};

// Defaults to Excel (.xlsx); pass ?format=csv for the CSV export instead.
exports.exportLogs = async (req, res) => {
  try {
    const { data, filename, contentType } = await activityLogService.exportLogs(
      req.query,
      req.user,
    );

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(data);
  } catch (error) {
    sendError(res, error, "ไม่สามารถ export ข้อมูล Activity Log ได้");
  }
};

exports.getAvailableExportMonths = async (req, res) => {
  try {
    const months = await activityLogService.getAvailableExportMonths();
    res.status(200).json({ success: true, data: months });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงข้อมูลเดือนที่ export ได้");
  }
};

exports.getExportedMonths = async (req, res) => {
  try {
    const months = await activityLogService.getExportedMonths();
    res.status(200).json({ success: true, data: months });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงข้อมูลเดือนที่ export แล้วได้");
  }
};

exports.previewPurgeLogs = async (req, res) => {
  try {
    const { month } = req.query;
    const count = await activityLogService.previewPurgeLogsByMonth(month);
    res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    sendError(res, error, "ไม่สามารถตรวจสอบจำนวนข้อมูลที่จะลบได้");
  }
};

exports.purgeLogs = async (req, res) => {
  try {
    const { month } = req.query;
    const result = await activityLogService.purgeLogsByMonth(month, req.user);
    res.status(200).json({
      success: true,
      message: `ลบ Activity Log เดือน ${month} สำเร็จ (${result.deletedCount} รายการ)`,
      data: result,
    });
  } catch (error) {
    sendError(res, error, "ไม่สามารถลบข้อมูล Activity Log ได้");
  }
};
