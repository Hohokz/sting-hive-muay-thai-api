const express = require("express");
const { connectDB, sequelize } = require('./config/db'); // ✅ ห้าม import sequelize ตรงๆ
require("dotenv").config();
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
// B. DATABASE CONNECTION (Safe for Vercel)
// -----------------------------------------------------------------

const setupDatabase = async () => {
  if (isDbConnected) return;

  try {
    console.log("Attempting to connect to database...");
    await connectDB();

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


// ✅ เรียกตอน Serverless instance start
setupDatabase();

// -----------------------------------------------------------------
// C. ROUTES
// -----------------------------------------------------------------

app.use("/api/v1/schedules", require("./routes/classesScheduleRoutes"));
app.use("/api/v1/bookings", require("./routes/classesBookingRoutes"));

app.get("/", (req, res) => {
  const dbStatus = isDbConnected ? "Connected" : "Error/Pending";

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
// D. VERCEL EXPORT
// -----------------------------------------------------------------

module.exports = app;
