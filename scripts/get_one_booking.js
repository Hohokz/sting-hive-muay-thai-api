const { connectDB, sequelize } = require('../config/db');
const { ClassesBooking } = require('../models/Associations');

const getOneBooking = async () => {
    try {
        await connectDB();
        const booking = await ClassesBooking.findOne({
            order: [['created_date', 'DESC']]
        });
        if (booking) {
            console.log('BOOKING_ID:', booking.id);
        } else {
            console.log('No bookings found.');
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
};

getOneBooking();
