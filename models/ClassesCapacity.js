const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ClassesCapacity = (sequelize) => {
    const model = sequelize.define('CLASSES_CAPACITY', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        // Foreign Key ที่อ้างอิงถึง CLASSES_SCHEDULE.id
        classes_id: { 
            type: DataTypes.UUID,
            allowNull: false,
            // ไม่ต้องใส่ unique: true เพราะ ClassesSchedule.hasOne จะบังคับความสัมพันธ์ 1:1 เอง
        },
        capacity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1 // ความจุเริ่มต้น
        },
        // สามารถเพิ่มข้อมูลอื่น ๆ ที่เกี่ยวข้องกับ Capacity ได้ที่นี่
        
        // Audit Fields
        created_by: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        updated_by: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    }, {
        tableName: 'CLASSES_CAPACITY',
        timestamps: true,
        underscored: true,
    });
    return model;
};

module.exports = ClassesCapacity;