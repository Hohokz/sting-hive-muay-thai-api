const { DataTypes } = require('sequelize');

const ENUMS = {
    BOOKING_STATUS: DataTypes.ENUM('PENDING', 'SUCCEED', 'FAILED', 'CANCELED', 'RESCHEDULED', 'PAYMENTED'),
    PAYMENT_METHOD: DataTypes.ENUM('UNPAY', 'PAID'),
    PAYMENT_STATUS: DataTypes.ENUM('PENDING', 'PAID', 'CANCEL', 'ERROR'),
    GYM_ENUM: DataTypes.ENUM('STING_CLUB', 'STING_HIVE'),
    USER_ROLE: DataTypes.ENUM('ADMIN', 'USER')
};

module.exports = ENUMS;