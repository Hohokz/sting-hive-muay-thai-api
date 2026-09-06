const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

// A booking can have multiple payment entries over time (e.g. a client
// pays rent this week and the course fee later) — so this is a history of
// payment line items per booking, not a single 1:1 record. Separate from
// the legacy, unused `payments` table (models/Payment.js) — that model was
// never wired into any service/controller and has its own foreign-key
// drift; this is a fresh, minimal table for the payment-breakdown feature
// instead of building on top of it.
const BookingPayment = sequelize.define(
  "BOOKING_PAYMENTS",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    classes_booking_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "classes_booking", key: "id" },
    },
    payment_method_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "payment_methods", key: "id" },
    },
    rent_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    course_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    created_date: {
      type: DataTypes.DATE(6),
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_date: {
      type: DataTypes.DATE(6),
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    created_by: DataTypes.TEXT,
    updated_by: DataTypes.TEXT,
  },
  { tableName: "booking_payments", timestamps: false },
);

module.exports = BookingPayment;
