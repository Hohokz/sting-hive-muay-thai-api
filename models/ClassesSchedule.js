const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ClassesSchedule = sequelize.define('CLASSES_SCHEDULE', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    start_time: {
        type: DataTypes.DATE(6),
        allowNull: false,
    },
    end_time: {
        type: DataTypes.DATE(6),
        allowNull: false,
    },
    gym_enum: {
        type: DataTypes.ENUM({
            values: ['STING_CLUB', 'STING_HIVE'],
            type: 'gym_enum' 
        }),
        allowNull: false,
    },
    description: DataTypes.TEXT,
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    created_date: { type: DataTypes.DATE(6), allowNull: false, defaultValue: DataTypes.NOW },
    updated_date: { type: DataTypes.DATE(6), allowNull: false, defaultValue: DataTypes.NOW },
    created_by: DataTypes.TEXT,
    updated_by: DataTypes.TEXT
}, { tableName: 'classes_schedule', timestamps: false });

module.exports = ClassesSchedule;