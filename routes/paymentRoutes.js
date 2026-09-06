// routes/paymentRoutes.js
const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { authenticateToken, authorizeRole } = require("../middlewares/authMiddleware");

// The booking dashboard (where the payment-method dropdown is used) is
// already admin-only (see /admin/bookings in the frontend router), so the
// whole payments API is admin-only too.
router.use(authenticateToken, authorizeRole(["ADMIN"]));

// GET /api/v1/payments/methods?include_inactive=true
router.get("/methods", paymentController.listPaymentMethods);
// POST /api/v1/payments/methods
router.post("/methods", paymentController.createPaymentMethod);
// PUT /api/v1/payments/methods/:id
router.put("/methods/:id", paymentController.updatePaymentMethod);

// GET /api/v1/payments/summary?period=day|week|month|year&value=...
router.get("/summary", paymentController.getPaymentSummary);
// GET /api/v1/payments/summary/export?period=...&value=... — same period, as .xlsx
router.get("/summary/export", paymentController.exportPaymentSummary);

module.exports = router;
