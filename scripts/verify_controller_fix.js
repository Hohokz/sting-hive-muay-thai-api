const { updateBookingTrainer } = require('../controllers/classesBookingController');
const { connectDB, sequelize } = require('../config/db');

const verifyControllerFix = async () => {
    try {
        await connectDB();
        
        const bookingId = 'f124e58f-dfd5-4654-b399-def0059b2e74';
        const trainer = 'Kru Muay Thai';

        const req = {
            params: { id: bookingId },
            body: { trainer: trainer }
        };

        const res = {
            status: function(code) {
                console.log('Response Status:', code);
                return this;
            },
            json: function(data) {
                console.log('Response Data:', JSON.stringify(data, null, 2));
                return this;
            }
        };

        console.log('Testing updateBookingTrainer with ID:', bookingId);
        await updateBookingTrainer(req, res);

    } catch (error) {
        console.error('Test Error:', error);
    } finally {
        await sequelize.close();
    }
};

verifyControllerFix();
