const { DataTypes } = require('sequelize');

// TODO(tech-debt): this model is defined as a factory function (`(sequelize) => ...`)
// instead of the direct `sequelize.define(...)` pattern every other model uses,
// and its tableName is upper-case ('CLASSES_CAPACITY') unlike every sibling table
// ('classes_booking', 'classes_schedule', ...). Left as-is: Associations.js already
// depends on this factory shape, and renaming the table needs a migration.
const ClassesCapacity = (sequelize) => {
    const model = sequelize.define('CLASSES_CAPACITY', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        // Foreign key referencing CLASSES_SCHEDULE.id
        classes_id: {
            type: DataTypes.UUID,
            allowNull: false,
            // No unique: true needed — ClassesSchedule.hasOne already enforces the 1:1 relationship.
        },
        capacity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1 // default capacity
        },

        // Audit fields
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
