const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ClassesBooking = sequelize.define('CLASSES_BOOKING', {
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
    // FK 2: Payment (จะกำหนดความสัมพันธ์ในไฟล์ Associations.js)
    payment_id: {
        type: DataTypes.UUID,
        unique: true
    },
    client_name: { type: DataTypes.TEXT, allowNull: false },
    client_email: DataTypes.TEXT,
    client_phone: DataTypes.STRING(20),
    booking_status: {
        type: DataTypes.ENUM({
            values: ['PENDING', 'SUCCEED', 'FAILED', 'CANCELED', 'RESCHEDULED', 'PAYMENTED'],
            type: 'booking_status'
        }), 
        allowNull: false, 
        defaultValue: 'PENDING'
    },
    capacity: { type: DataTypes.INTEGER, allowNull: false },
    admin_note: DataTypes.TEXT,
    is_private: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    date_booking: { type: DataTypes.DATE(6) },
    
    created_date: { type: DataTypes.DATE(6), allowNull: false, defaultValue: DataTypes.NOW },
    updated_date: { type: DataTypes.DATE(6), allowNull: false, defaultValue: DataTypes.NOW },
    created_by: DataTypes.TEXT,
    updated_by: DataTypes.TEXT,
    trainer: DataTypes.TEXT,
    gyms_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
}, { tableName: 'classes_booking', timestamps: false });

module.exports = ClassesBooking;