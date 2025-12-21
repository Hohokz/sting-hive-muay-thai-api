const { connectDB, sequelize } = require('../config/db');
const { ClassesSchedule, ClassesBooking, ClassesCapacity } = require('../models/Associations');

const createBooking = async () => {
    try {
        await connectDB();

        const targetDate = '2025-12-21';
        const startTime = '15:00:00';
        const endTime = '16:00:00';

        // 1. Find or Create Schedule
        let schedule = await ClassesSchedule.findOne({
            where: {
                start_time: startTime,
                gym_enum: 'STING_HIVE' // Defaulting to STING_HIVE
            }
        });

        if (!schedule) {
            console.log('Schedule not found, creating new schedule...');
            schedule = await ClassesSchedule.create({
                start_time: startTime,
                end_time: endTime,
                gym_enum: 'STING_HIVE',
                description: 'Auto-generated class for testing',
                is_active: true,
                is_private_class: false
            });

            // Create Capacity
            await ClassesCapacity.create({
                classes_id: schedule.id,
                capacity: 10
            });
            console.log('Created new schedule:', schedule.id);
        } else {
            console.log('Found existing schedule:', schedule.id);
        }

        // 2. Create Booking
        const booking = await ClassesBooking.create({
            classes_schedule_id: schedule.id,
            client_name: 'Test Setup User',
            client_email: 'test@example.com',
            client_phone: '0999999999',
            booking_status: 'SUCCEED',
            capacity: 1,
            is_private: false,
            date_booking: targetDate,
            created_by: 'Script',
            updated_by: 'Script'
        });

        console.log('✅ Booking created successfully!');
        console.log(JSON.stringify(booking.toJSON(), null, 2));

    } catch (error) {
        console.error('❌ Error creating booking:', error);
    } finally {
        await sequelize.close();
    }
};

createBooking();
