require("dotenv").config(); // ✅ ต้องอยู่บนสุด

const express = require("express");
const { connectDB } = require("./config/db");
const cors = require("cors");

const app = express();
const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = process.env.PORT || 3000;

let isDbConnected = false;

// -----------------------------------------------------------------
// A. MIDDLEWARES
// -----------------------------------------------------------------

const allowedOrigins = [
  "http://localhost:5173",
  "https://sting-hive-muay-thai-web.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || NODE_ENV !== "production") {
        return callback(null, true);
      }
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
    await connectDB(); // ✅ connect + sync อยู่ใน db.js เท่านั้น

    isDbConnected = true;
    console.log("✅ Database connection successful.");
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
