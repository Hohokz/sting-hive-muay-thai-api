const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ClassesBookingInAdvance = sequelize.define('CLASSES_BOOKING_IN_ADVANCE', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // FK 1: ClassesSchedule
    classes_schedule_id: { 
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'classes_schedule', key: 'id' } // กำหนด FK
    },
    date: { type: DataTypes.DATE(6) },
    is_close_gym: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    capacity: { type: DataTypes.INTEGER, allowNull: true },
    created_date: { type: DataTypes.DATE(6), allowNull: false, defaultValue: DataTypes.NOW },
    updated_date: { type: DataTypes.DATE(6), allowNull: false, defaultValue: DataTypes.NOW },
    created_by: DataTypes.TEXT,
    updated_by: DataTypes.TEXT,
}, { tableName: 'classes_booking_in_advance', timestamps: false });

module.exports = ClassesBookingInAdvance;