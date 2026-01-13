const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TrainerGyms = sequelize.define('TRAINER_GYMS', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    gyms_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'gyms',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    created_at: {
        type: DataTypes.DATE(6),
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'trainer_gyms',
    timestamps: false,
    underscored: true
});

module.exports = TrainerGyms;
