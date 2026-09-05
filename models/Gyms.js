const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { GYM_ENUM } = require('./Enums');

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
        // Value order kept identical to before (this column has its own
        // auto-named Postgres enum type, separate from ClassesSchedule's).
        // TODO(tech-debt): value order differs from ClassesSchedule.gym_enum;
        // aligning them into one Postgres enum type would need a migration.
        type: DataTypes.ENUM(GYM_ENUM.STING_HIVE, GYM_ENUM.STING_CLUB),
        allowNull: false
    }
}, { tableName: 'gyms', timestamps: false });

module.exports = Gyms;