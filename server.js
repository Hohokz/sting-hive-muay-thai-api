const express = require('express');
const { connectDB, initDB } = require('./config/db'); // ✅ FIX
require('dotenv').config();
const cors = require('cors');

const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';

let isDbConnected = false;

const setupDatabase = async () => {
  if (isDbConnected) return;

  try {
    console.log("Attempting to connect to database...");
    await connectDB();

    const sequelize = initDB(); // ✅ FIX สำคัญที่สุด

    if (NODE_ENV === 'development' || NODE_ENV === 'test') {
      await sequelize.sync({ alter: true });
      console.log("Database models synchronized (Development Mode).");
    } else {
      console.log("Database schema assumed to be up-to-date (Production Mode).");
    }

    isDbConnected = true;
    console.log("Database connection successful.");

  } catch (error) {
    console.error('[DB Setup Error]', error.message);
    isDbConnected = false;
  }
};

setupDatabase();
