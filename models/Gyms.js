const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Gyms = sequelize.define('gyms', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    gym_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    gym_enum: {
        type: DataTypes.ENUM('STING_HIVE', 'STING_CLUB'),
        allowNull: false
    }
}, { tableName: 'gyms', timestamps: false });

module.exports = Gyms;