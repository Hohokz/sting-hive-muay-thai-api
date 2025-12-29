const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const ClassesBookingInAdvance = sequelize.define(
  "CLASSES_BOOKING_IN_ADVANCE",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // FK 1: ClassesSchedule (nullable สำหรับกรณีปิดยิมทั้งยิม)
    classes_schedule_id: {
      type: DataTypes.UUID,
      allowNull: true, // nullable เพราะกรณีปิดยิมทั้งยิมไม่ต้องระบุ schedule
      references: { model: "classes_schedule", key: "id" },
    },
    start_date: { type: DataTypes.DATE(6) },
    end_date: { type: DataTypes.DATE(6) },
    is_close_gym: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    capacity: { type: DataTypes.INTEGER, allowNull: true },
    gyms_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "gyms", key: "id" },
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
  { tableName: "classes_booking_in_advance", timestamps: false }
);

module.exports = ClassesBookingInAdvance;
