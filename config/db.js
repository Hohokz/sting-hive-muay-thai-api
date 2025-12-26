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

    if (process.env.NODE_ENV !== "production") {
      await sequelize.sync({ alter: true });
      console.log("✅ Database synced (Dev Mode)");
    }
  } catch (error) {
    console.error("❌ DB Error:", error);
    process.exit(1); // ✅ ถ้า DB พัง ให้ server ตายทันที
  }
};

module.exports = { connectDB, sequelize };
