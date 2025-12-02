const express = require('express');
// สมมติว่าไฟล์เหล่านี้อยู่ในโครงสร้างโปรเจกต์เดิมของคุณ
const { connectDB, sequelize } = require('./config/db');
require('dotenv').config();
const cors = require('cors');

// --- Initialization ---
const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3000; // เก็บไว้สำหรับรัน Local (ถึงแม้จะไม่ได้ใช้ app.listen ในโค้ดนี้)

// สถานะการเชื่อมต่อฐานข้อมูล
let isDbConnected = false;

// -----------------------------------------------------------------
// A. MIDDLEWARES
// -----------------------------------------------------------------

// CORS Configuration: Vercel จะต้องการ Origin ที่เป็น Production Domain ด้วย
const allowedOrigins = [
    'http://localhost:5173','https://sting-hive-muay-thai-web.vercel.app/'
    // *TODO: เพิ่ม Production Frontend Domain ของคุณที่นี่ (เช่น 'https://stinghive.vercel.app')
];

app.use(cors({
    origin: (origin, callback) => {
        // อนุญาตสำหรับ Origin ที่ไม่มี (เช่น Postman, Curl, หรือ Serverless Internal calls)
        if (!origin || allowedOrigins.includes(origin) || NODE_ENV !== 'production') {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
}));

// Body Parser for JSON
app.use(express.json());

// -----------------------------------------------------------------
// B. DATABASE CONNECTION AND SYNC (ปรับสำหรับ Serverless/Vercel)
// -----------------------------------------------------------------

/**
 * ฟังก์ชันนี้รับผิดชอบการเชื่อมต่อและซิงค์ฐานข้อมูล
 * จะถูกเรียกใช้ทันทีที่ Serverless Function Instance เริ่มทำงาน
 */
const setupDatabase = async () => {
    if (isDbConnected) {
        return;
    }
    try {
        console.log("Attempting to connect to database...");
        await connectDB();
        
        // *************************************************************
        // ** การซิงค์ตาราง: ห้ามใช้ใน Production **
        // *************************************************************
        if (NODE_ENV === 'development' || NODE_ENV === 'test') {
            // ใน Development: ซิงค์ตารางอัตโนมัติ (เพื่อความสะดวก)
            await sequelize.sync({ alter: true }); 
            console.log("Database models synchronized (Development Mode).");
        } else {
            // ใน Production/Vercel: ควรใช้ Migrations
            console.log("Database schema assumed to be up-to-date (Production Mode).");
        }

        isDbConnected = true;
        console.log("Database connection successful.");

    } catch (error) {
        console.error(' [DB Setup Error] Failed to connect or sync database:', error.message);
        // ไม่ต้อง process.exit(1) เพราะจะทำให้ Vercel function ตาย
        isDbConnected = false;
        // หากต้องการให้ Request ที่เข้ามา Fail ทันที สามารถ Throw Error ออกไปได้
        // throw error; 
    }
};

// เริ่มต้นเชื่อมต่อ DB ทันที
setupDatabase(); 

// -----------------------------------------------------------------
// C. ROUTES
// -----------------------------------------------------------------

app.use('/api/v1/schedules', require('./routes/classesScheduleRoutes'));
app.use('/api/v1/bookings', require('./routes/classesBookingRoutes'));

// Route ทดสอบสถานะ Server (Health Check)
app.get('/', (req, res) => {
    const dbStatus = isDbConnected ? 'Connected' : 'Error/Pending';
    
    // หาก DB มีปัญหาใน Production ควรแจ้งสถานะ 503 (Service Unavailable)
    if (!isDbConnected && NODE_ENV === 'production') {
        return res.status(503).json({ 
            message: 'Sting Hive Muay Thai Backend is operational, but critical services (Database) are unavailable.',
            environment: NODE_ENV,
            db_status: dbStatus
        });
    }

    res.status(200).json({ 
        message: 'Sting Hive Muay Thai Backend is operational.',
        environment: NODE_ENV,
        db_status: dbStatus
    });
});

// -----------------------------------------------------------------
// D. VERCEL DEPLOYMENT EXPORT (ส่วนสำคัญที่สุด)
// -----------------------------------------------------------------

// Vercel จะใช้ module.exports เพื่อเรียกใช้งาน Express App
module.exports = app;

// หมายเหตุ: หากต้องการรัน Local เพื่อทดสอบ ให้ใช้คำสั่ง "node index.js" ใน Development
// หรือใช้เครื่องมืออย่าง nodemon/ts-node แต่ไม่ต้องมี app.listen() ในไฟล์นี้
// หากต้องการรัน Local แบบเดิม ให้สร้างไฟล์ local_run.js แยกออกมาและ import app ไปใช้ listen()