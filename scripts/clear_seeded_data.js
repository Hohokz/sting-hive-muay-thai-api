const { connectDB, sequelize } = require('../config/db');
const { ClassesSchedule, ClassesBooking, ClassesCapacity } = require('../models/Associations');
const { Op } = require('sequelize');

const clearSeededData = async () => {
    try {
        await connectDB();
        console.log('🧹 Starting cleanup...');

        // 1. Delete Bookings
        const bookingResult = await ClassesBooking.destroy({
            where: {
                [Op.or]: [
                    { created_by: 'Seeder' },
                    { created_by: 'Script' },
                    {created_by: 'Seeder_V2'}
                ]
            }
        });
        console.log(`✅ Deleted ${bookingResult} bookings.`);

        // 2. Delete Schedules
        // Note: This will also delete related Capacities if configured with CASCADE (which Associations.js seemed to imply or we rely on DB constraint)
        // But ClassesCapacity was hasOne... let's check Associations.js again mentally.
        // ClassesSchedule.hasOne(ClassesCapacity, { onDelete: 'CASCADE' }); -> Correct.
        
        const scheduleResult = await ClassesSchedule.destroy({
            where: {
                description: {
                    [Op.in]: ['Seeded Class', 'Auto-generated class for testing']
                }
            }
        });
        console.log(`✅ Deleted ${scheduleResult} schedules (and related capacities).`);

    } catch (error) {
        console.error('❌ Error clearing data:', error);
    } finally {
        await sequelize.close();
    }
};

clearSeededData();
