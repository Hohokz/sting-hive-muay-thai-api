require("dotenv").config(); // ✅ โหลด Environment Variables ทันทีที่เริ่ม

const express = require("express");
const cors = require("cors");
const cookieParser = require('cookie-parser');
const { connectDB } = require("./config/db");
const { startAdvancedScheduleJob } = require("./job/advancedScheduleJob");
const { startMonthlyArchivalJob } = require("./job/monthlyArchivalJob");

const app = express();
const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = process.env.PORT || 3000;

let isDbConnected = false;

// -----------------------------------------------------------------
// A. MIDDLEWARES
// -----------------------------------------------------------------
app.use(cookieParser());
app.use(express.json());

// ตั้งค่า CORS (Cross-Origin Resource Sharing)
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5175",
  "https://sting-hive-muay-thai-web.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // 1. อนุญาตถ้าไม่มี origin (เช่นการเรียกผ่าน Postman หรือ Server-to-Server)
      // 2. อนุญาตถ้าอยู่ใน list allowedOrigins
      // 3. อนุญาตถ้าเป็น codespaces (ลงท้ายด้วย app.github.dev) เพื่อความสะดวกในการพัฒนา
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith(".app.github.dev") 
      ) {
        return callback(null, true);
      }

      console.error(`[CORS Error] Origin ${origin} not allowed`);
      callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true, // อนุญาตให้ส่ง Cookie/Auth Header
  })
);

// -----------------------------------------------------------------
// B. DATABASE & BACKGROUND JOBS
// -----------------------------------------------------------------
const setupDatabase = async () => {
  if (isDbConnected) return;

  try {
    console.log("[Server] Connecting to database...");
    await connectDB();

    isDbConnected = true;
    console.log("✅ [Server] Database connected.");

    // เริ่มทำงาน Cron Jobs ทันทีเมื่อ DB พร้อม
    startAdvancedScheduleJob();
    startMonthlyArchivalJob();
    console.log("⏰ [Server] Background Jobs initialized.");
  } catch (error) {
    console.error("❌ [Server] Database Setup Error:", error);
    isDbConnected = false;
  }
};

// เริ่มต้นเชื่อมต่อฐานข้อมูล
setupDatabase();

// -----------------------------------------------------------------
// C. API ROUTES
// -----------------------------------------------------------------

// แบ่งกลุ่ม Routes ตามโมดูล
app.use("/api/v1/auth", require("./routes/authRoutes"));
app.use("/api/v1/users", require("./routes/userRoutes"));
app.use("/api/v1/schedules", require("./routes/classesScheduleRoutes"));
app.use("/api/v1/bookings", require("./routes/classesBookingRoutes"));
app.use("/api/v1/dashboard", require("./routes/dashBoardRoutes"));
app.use("/api/v1/activity-logs", require("./routes/activityLogRoutes"));
app.use("/api/v1/trainer-gyms", require("./routes/trainerGymRoutes"));

// Health Check Endpoint
app.get("/", (req, res) => {
  const dbStatus = isDbConnected ? "Connected" : "Disconnected (Error)";

  res.status(isDbConnected ? 200 : 503).json({
    message: "Sting Hive Muay Thai Backend is operational.",
    environment: NODE_ENV,
    db_status: dbStatus,
  });
});

// -----------------------------------------------------------------
// D. START SERVER
// -----------------------------------------------------------------
if (NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`🚀 [Server] Running on port ${PORT} (${NODE_ENV} mode)`);
  });
}

module.exports = app; // สำหรับการทำ Testing หรือ Deploy บน Vercel
