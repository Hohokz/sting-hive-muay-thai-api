const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { USER_ROLE } = require('./Enums');

const User = sequelize.define('USERS', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    username: {
        type: DataTypes.TEXT,
        unique: true,
        allowNull: false,
    },
    password: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    name: {
        type: DataTypes.TEXT,
    },
    email: {
        type: DataTypes.TEXT,
        unique: true,
    },
    phone: {
        type: DataTypes.STRING(20),
    },
    role: {
        // Values/order kept identical to before — sourced from the shared enum.
        type: DataTypes.ENUM({
            values: [USER_ROLE.ADMIN, USER_ROLE.USER],
            type: 'user_role'
        }),
        allowNull: false,
        defaultValue: USER_ROLE.USER,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Audit fields (Sequelize could manage created_at/updated_at itself, but
    // this project uses its own column names instead).
    created_date: {
        type: DataTypes.DATE(6), // TIMESTAMPTZ in Postgres
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    updated_date: {
        type: DataTypes.DATE(6),
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    created_by: {
        type: DataTypes.TEXT,
    },
    updated_by: {
        type: DataTypes.TEXT,
    }
}, {
    tableName: 'users',
    timestamps: false, // Sequelize's automatic timestamps are disabled
    underscored: true
});

module.exports = User;
