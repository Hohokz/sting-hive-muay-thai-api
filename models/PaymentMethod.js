const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

// The admin-editable list backing the payment-method dropdown shown when a
// booking is marked as paid. Methods are soft-disabled (is_active) rather
// than deleted, since past BookingPayment rows may still reference them.
const PaymentMethod = sequelize.define(
  "PAYMENT_METHODS",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
  { tableName: "payment_methods", timestamps: false },
);

module.exports = PaymentMethod;
