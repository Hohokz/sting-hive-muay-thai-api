require("dotenv").config(); // Load environment variables immediately on startup

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
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

// Configure CORS (Cross-Origin Resource Sharing)
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5175",
  "https://sting-hive-muay-thai-web.vercel.app",
  "https://stingmuaythaichiangmai.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // 1. Allow requests with no origin (e.g. Postman or server-to-server calls)
      // 2. Allow anything in the allowedOrigins list
      // 3. Allow Codespaces (ends with app.github.dev), for local development convenience
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
    credentials: true, // allow sending cookies/auth headers
    exposedHeaders: ["Content-Disposition"], // so the frontend can read the export filename
  }),
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

    // Start the cron jobs as soon as the DB is ready
    startAdvancedScheduleJob();
    startMonthlyArchivalJob();
    console.log("⏰ [Server] Background Jobs initialized.");
  } catch (error) {
    console.error("❌ [Server] Database Setup Error:", error);
    isDbConnected = false;
  }
};

// Kick off the database connection
setupDatabase();

// -----------------------------------------------------------------
// C. API ROUTES
// -----------------------------------------------------------------

// Mount routes by module
app.use("/api/v1/auth", require("./routes/authRoutes"));
app.use("/api/v1/users", require("./routes/userRoutes"));
app.use("/api/v1/schedules", require("./routes/classesScheduleRoutes"));
app.use("/api/v1/bookings", require("./routes/classesBookingRoutes"));
app.use("/api/v1/dashboard", require("./routes/dashBoardRoutes"));
app.use("/api/v1/activity-logs", require("./routes/activityLogRoutes"));
app.use("/api/v1/trainer-gyms", require("./routes/trainerGymRoutes"));
app.use("/api/v1/payments", require("./routes/paymentRoutes"));

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

module.exports = app; // for testing, and for deploying on Vercel
