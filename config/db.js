const { Sequelize } = require("sequelize");
require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  protocol: "postgres",
  logging: false,
  dialectOptions: isProduction ? {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  } : {},
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

const connectDB = async () => {
  try {
    console.log("Attempting to connect to database...");
    await sequelize.authenticate();
    console.log("✅ Database connection successful.");

    // NOTE: intentionally not calling `sequelize.sync({ alter: true })` here.
    // It used to run on every dev-mode restart and, over months of repeated
    // restarts against this same shared database, silently piled up over
    // 2,200 duplicate unique constraints on users.email/username and
    // classes_booking.payment_id (Sequelize's alter-diffing didn't recognize
    // the existing constraint as satisfying the model each time) — which had
    // made every INSERT/UPDATE on those tables ~100x slower than it should
    // be, since Postgres must maintain every one of those indexes on every
    // write. Plain `sync()` (no alter) only creates tables that don't exist
    // yet — safe for a fresh local setup — and never touches existing ones.
    if (process.env.NODE_ENV !== "production") {
      await sequelize.sync();
      console.log("✅ Database synced (Dev Mode, no alter)");
    }
  } catch (error) {
    console.error("❌ DB Error:", error);
    process.exit(1); // Fail fast: if the DB can't connect, the server shouldn't stay up
  }
};

module.exports = { connectDB, sequelize };
