const paymentService = require("../services/paymentService");
const { sendError } = require("../utils/httpError");

/**
 * [GET] Returns payment methods for the dropdown (active only, unless
 * ?include_inactive=true — used by the management list).
 */
exports.listPaymentMethods = async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === "true";
    const methods = await paymentService.listPaymentMethods({
      includeInactive,
    });
    res.status(200).json({ success: true, data: methods });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงข้อมูลวิธีชำระเงินได้");
  }
};

/**
 * [POST] Adds a new payment method.
 */
exports.createPaymentMethod = async (req, res) => {
  try {
    const method = await paymentService.createPaymentMethod(
      req.body.name,
      req.user,
    );
    res.status(201).json({ success: true, data: method });
  } catch (error) {
    sendError(res, error, "ไม่สามารถเพิ่มวิธีชำระเงินได้");
  }
};

/**
 * [PUT] Renames or activates/deactivates a payment method.
 */
exports.updatePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const method = await paymentService.updatePaymentMethod(
      id,
      req.body,
      req.user,
    );
    res.status(200).json({ success: true, data: method });
  } catch (error) {
    sendError(res, error, "ไม่สามารถแก้ไขวิธีชำระเงินได้");
  }
};

/**
 * [GET] Returns total rent/course amounts collected for one period, grouped
 * both by payment method and by class. `?period=day|week|month|year` picks
 * the granularity and `?value=...` is the matching date value (as produced
 * by the matching HTML date input — see paymentService's
 * `_getRangeForPeriod` for the exact expected shape per period).
 */
exports.getPaymentSummary = async (req, res) => {
  try {
    const { period, value } = req.query;
    const summary = await paymentService.getPaymentSummary({ period, value });
    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงข้อมูลสรุปยอดชำระเงินได้");
  }
};

/**
 * [GET] Exports the current period (same `?period=...&value=...` as the
 * summary above) to an .xlsx workbook — every payment entry, plus the
 * by-method/by-class totals.
 */
exports.exportPaymentSummary = async (req, res) => {
  try {
    const { period, value } = req.query;
    const { data, filename, contentType } = await paymentService.exportPaymentSummary(
      { period, value },
      req.user,
    );

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(data);
  } catch (error) {
    sendError(res, error, "เกิดข้อผิดพลาดในการส่งออกข้อมูล");
  }
};
