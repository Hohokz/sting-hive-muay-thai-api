require('dotenv').config();
const { sequelize } = require('../config/db');
const User = require('../models/User');
const authService = require('../services/authService');

const createTestUser = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // Ensure table exists (sync might be needed if not running server)
        // await sequelize.sync(); 

        const hashedPassword = await authService.hashPassword('password123');

        const [user, created] = await User.findOrCreate({
            where: { username: 'testadmin' },
            defaults: {
                password: hashedPassword,
                role: 'ADMIN',
                is_active: true,
                email: 'testadmin@example.com'
            }
        });

        if (!created) {
            user.password = hashedPassword;
            user.role = 'ADMIN';
            await user.save();
            console.log('User updated.');
        } else {
            console.log('User created.');
        }

        console.log('Test User: testadmin / password123');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

createTestUser();
