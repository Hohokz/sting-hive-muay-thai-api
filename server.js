const express = require('express');
const { connectDB, sequelize } = require('./config/db');
require('dotenv').config();

// นำเข้าโมเดลและกำหนด Associations
const models = require('./models/Associations'); 

// --- SWAGGER SETUP (แบบใหม่) ---
const swaggerUi = require('swagger-ui-express');
// โหลดไฟล์ JSON ที่ swagger-autogen สร้างให้
const swaggerDocument = require('./swagger-output.json'); 

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// -----------------------------------------------------------------
// A. PRODUCTION MIDDLEWARES (ถ้าใช้)
// -----------------------------------------------------------------

// 1. Security: เพิ่ม Headers ด้านความปลอดภัย (CORS, CSP, XSS protection)
// app.use(helmet()); 
// 2. CORS: จำกัดว่าใครเข้าถึง API ได้บ้าง
// app.use(cors({ origin: 'https://yourfrontenddomain.com' })); 

// 3. Body Parser: ใช้สำหรับรับข้อมูล JSON ใน Request Body


app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/api/v1/schedules', require('./routes/classesScheduleRoutes'));
app.use('/api/v1/bookings', require('./routes/classesBookingRoutes'));
// -----------------------------------------------------------------
// B. ROUTES (ตัวอย่าง)
// -----------------------------------------------------------------

// Route ทดสอบสถานะ Server
app.get('/', (req, res) => {
    res.status(200).json({ 
        message: 'Sting Hive Muay Thai Backend is operational.',
        environment: NODE_ENV 
    });
});

// *TODO: เพิ่ม Routes อื่นๆ ที่นี่ (เช่น app.use('/api/users', require('./routes/userRoutes')));

// -----------------------------------------------------------------
// C. STARTUP FUNCTION
// -----------------------------------------------------------------

const startServer = async () => {
    try {
        // 1. เชื่อมต่อฐานข้อมูล Supabase
        await connectDB();
        
        // *************************************************************
        // ** IMPORTANT PRODUCTION CHANGE **
        // *************************************************************
        if (NODE_ENV === 'development') {
            // ใน Development: ซิงค์ตารางอัตโนมัติ (เพื่อความสะดวกในการ dev)
            await sequelize.sync({ alter: true }); 
            console.log("Database models synchronized (Development Mode).");
        } else {
            // ใน Production: ห้ามใช้ sync() เด็ดขาด! (ใช้ Migrations แทน)
            console.log("Database schema assumed to be up-to-date (Production Mode).");
        }
        // *************************************************************
        
        // 2. เริ่มต้น Express Server
        app.listen(PORT, () => {
            console.log(` Server (${NODE_ENV}) running on http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error(' Server failed to start due to database or other error:', error.message);
        // Exit process หากเกิด Error ที่รุนแรง
        process.exit(1); 
    }
};

startServer();