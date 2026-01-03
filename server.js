require("dotenv").config(); // ✅ ต้องอยู่บนสุด

const express = require("express");
const { connectDB } = require("./config/db");
const cors = require("cors");
const { startAdvancedScheduleJob } = require("./job/advancedScheduleJob");
const { startMonthlyArchivalJob } = require("./job/monthlyArchivalJob");

const app = express();
const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = process.env.PORT || 5000;

let isDbConnected = false;

// -----------------------------------------------------------------
// A. MIDDLEWARES
// -----------------------------------------------------------------

// -----------------------------------------------------------------
// A. MIDDLEWARES
// -----------------------------------------------------------------

const allowedOrigins = [
  "http://localhost:5173",
  "https://sting-hive-muay-thai-web.vercel.app",
  "https://expert-space-giggle-jvqg649wp66cqrjq-5173.app.github.dev",
  "https://bookish-fishstick-qjpxr96g54wf9p9p-5173.app.github.dev" // ✅ เพิ่มตัวล่าสุดเข้าไป
];

app.use(
  cors({
    origin: (origin, callback) => {
      // 1. อนุญาตถ้าไม่มี origin (เช่นการเรียกผ่าน Postman หรือ Server-to-Server)
      // 2. อนุญาตถ้าอยู่ใน list allowedOrigins
      // 3. ✅ เทคนิคพิเศษ: ถ้าเป็น codespaces (ลงท้ายด้วย app.github.dev) ให้อนุญาตเลยในช่วง dev
      if (
        !origin || 
        allowedOrigins.includes(origin) || 
        origin.endsWith(".app.github.dev") // 🔥 เพิ่มบรรทัดนี้ จะได้ไม่ต้องคอยแก้ URL บ่อยๆ
      ) {
        return callback(null, true);
      }
      
      console.error(`CORS Error: Origin ${origin} not allowed`); // พ่น log บอกหน่อยว่าตัวไหนที่ติด
      callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  })
);


app.use(express.json());

// -----------------------------------------------------------------
// B. DATABASE CONNECTION (Safe for Render & Vercel)
// -----------------------------------------------------------------

const setupDatabase = async () => {
  if (isDbConnected) return;

  try {
    console.log("Attempting to connect to database...");
    await connectDB();

    isDbConnected = true;
    console.log("✅ Database connection successful.");

    // 2. เรียกใช้ Job ทันทีที่ DB พร้อม
    startAdvancedScheduleJob();
    startMonthlyArchivalJob(); // ✅ เริ่ม Job รายเดือน
    console.log(
      "⏰ Advanced Schedule & Monthly Archival Cron Jobs initialized."
    );
  } catch (error) {
    console.error("❌ [DB Setup Error]", error);
    isDbConnected = false;
  }
};

// ✅ เรียกครั้งเดียวตอน start
setupDatabase();

// -----------------------------------------------------------------
// C. ROUTES
// -----------------------------------------------------------------

app.use("/api/v1/schedules", require("./routes/classesScheduleRoutes"));
app.use("/api/v1/bookings", require("./routes/classesBookingRoutes"));
app.use("/api/v1/dashboard", require("./routes/dashBoardRoutes"));
app.use("/api/v1/auth", require("./routes/authRoutes")); // ✅ Auth Routes
app.use("/api/v1/users", require("./routes/userRoutes")); // ✅ User CRUD Routes (Admin Only)

app.get("/", (req, res) => {
  const dbStatus = isDbConnected ? "Connected" : "Error";

  if (!isDbConnected && NODE_ENV === "production") {
    return res.status(503).json({
      message:
        "Sting Hive Muay Thai Backend is operational, but Database is unavailable.",
      environment: NODE_ENV,
      db_status: dbStatus,
    });
  }

  res.status(200).json({
    message: "Sting Hive Muay Thai Backend is operational.",
    environment: NODE_ENV,
    db_status: dbStatus,
  });
});

// -----------------------------------------------------------------
// D. START SERVER (IMPORTANT FOR RENDER)
// -----------------------------------------------------------------

if (NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

module.exports = app; // ✅ ยังรองรับ Vercel ได้
