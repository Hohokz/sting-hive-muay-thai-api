const { Sequelize } = require('sequelize');
require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    dialectOptions: {
      ssl: isProduction,
      rejectUnauthorized: false
    },
    logging: NODE_ENV === 'development' ? console.log : false,
  }
);

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ DB Connected');
  } catch (err) {
    console.error('❌ DB Error:', err);
  }
};

module.exports = { sequelize, connectDB };
