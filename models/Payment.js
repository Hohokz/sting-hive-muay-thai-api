const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { PAYMENT_METHOD, PAYMENT_STATUS } = require('./Enums');

const Payment = sequelize.define('PAYMENTS', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // FK เชื่อมกลับไปหา ClassesBooking (1:1)
    classes_booking_id: { 
        type: DataTypes.UUID,
        unique: true,
        allowNull: false,
        references: { model: 'classes_booking', key: 'id' }
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    payment_method: { type: PAYMENT_METHOD, allowNull: false },
    payment_status: { type: PAYMENT_STATUS, allowNull: false, defaultValue: 'PENDING' },
    attachment: DataTypes.TEXT,

    created_date: { type: DataTypes.DATE(6), allowNull: false, defaultValue: DataTypes.NOW },
    updated_date: { type: DataTypes.DATE(6), allowNull: false, defaultValue: DataTypes.NOW },
    created_by: DataTypes.TEXT,
    updated_by: DataTypes.TEXT
}, { tableName: 'payments', timestamps: false });

module.exports = Payment;