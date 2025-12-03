const { Sequelize } = require("sequelize");
require("dotenv").config();

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: "postgres",
      protocol: "postgres",
      logging: false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    })
  : new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASSWORD,
      {
        host: process.env.DB_HOST,
        dialect: "postgres",
        logging: false,
      }
    );

const connectDB = async () => {
  try {
    console.log("Attempting to connect to database...");
    await sequelize.authenticate();
    console.log("✅ Database connection successful.");
    await sequelize.sync();
  } catch (error) {
    console.error("❌ DB Error:", error);
    process.exit(1); // ❗ สำคัญ
  }
};

module.exports = { connectDB, sequelize };