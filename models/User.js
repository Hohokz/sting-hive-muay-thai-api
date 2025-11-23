const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const User = sequelize.define('USERS', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4, // ใช้ UUIDV4 เพื่อสร้าง UUID ใหม่
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
        type: DataTypes.ENUM({
            values: ['ADMIN', 'USER'],
            type: 'user_role'
        }),
        allowNull: false,
        defaultValue: 'USER',
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Audit Fields (Sequelize จะจัดการ created_at/updated_at เอง แต่เราใช้ชื่อที่กำหนดเอง)
    created_date: {
        type: DataTypes.DATE(6), // TIMESTAMPTZ ใน Postgres
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
    timestamps: false, // ปิดการใช้งาน timestamps อัตโนมัติของ Sequelize
    underscored: true // ตั้งชื่อคอลัมน์แบบ underscore (ถ้าจำเป็น)
});

module.exports = User;