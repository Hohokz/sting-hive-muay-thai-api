const { Sequelize } = require('sequelize');
require('dotenv').config();

// กำหนด Environment (Default เป็น 'development')
const NODE_ENV = process.env.NODE_ENV || 'development';

// ----------------------------------------------------------------------
// 1. SSL/TLS Configuration for Cloud Databases (e.g., Supabase, Render)
//    Vercel (Production) requires secure connection (SSL) to external DBs.
// ----------------------------------------------------------------------
const isProduction = NODE_ENV === 'production';

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    dialectOptions: {
        // ให้ใช้ UTC เป็น false หากฐานข้อมูลของคุณไม่ได้ตั้งเป็น UTC
        useUTC: false, 
        
        // *** Vercel/Production SSL Fix ***
        ssl: isProduction,
        ...(isProduction ? {
            // สำหรับ DB Hosts ส่วนใหญ่ (เช่น Supabase) อาจต้องตั้งค่านี้เป็น false
            // เพื่อหลีกเลี่ยงปัญหา Self-signed/Untrusted certificate
            rejectUnauthorized: false 
        } : {})
    },
    // ตั้งค่า logging ให้แสดงเฉพาะใน Development
    logging: NODE_ENV === 'development' ? console.log : false,
    // การจัดการ Connection Pooling สำหรับ Serverless Environment
    pool: {
        max: 5,   // จำนวน Connection สูงสุด
        min: 0,   // จำนวน Connection ต่ำสุด
        acquire: 30000,
        idle: 10000 // Release connection ที่ไม่ได้ใช้งาน
    }
});

const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log(`Connection to PostgreSQL has been established successfully in ${NODE_ENV} mode.`);
    } catch (error) {
        console.error('⚠️ Unable to connect to the database:', error);
        
        // *** Vercel Critical Fix ***
        // ลบ process.exit(1) ออก เพื่อไม่ให้ Serverless Function ตายทันที
        // ให้ Log Error ออกไปเฉยๆ และปล่อยให้ Express/Vercel จัดการ Request ต่อไป
    }
};

module.exports = { sequelize, connectDB };