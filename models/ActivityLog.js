const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const ActivityLog = sequelize.define(
  "ACTIVITY_LOG",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true, // Nullable for public bookings or system actions
      references: {
        model: "users",
        key: "id",
      },
    },
    user_name: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    service: {
      type: DataTypes.ENUM("BOOKING", "SCHEDULE", "USER", "TRAINER_GYM"),
      allowNull: false,
    },
    action: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    ip_address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE(6),
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "activity_logs",
    timestamps: false,
    underscored: true,
  }
);

module.exports = ActivityLog;
