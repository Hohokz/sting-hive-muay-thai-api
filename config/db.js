const { Sequelize } = require("sequelize");
require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

let sequelize; // ✅ ยังไม่สร้างทันที

function initDB() {
  if (!sequelize) {
    sequelize = new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASSWORD, // ✅ ใช้ชื่อนี้ให้ตรง Vercel
      {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        dialect: "postgres",
        dialectOptions: isProduction
          ? {
              ssl: {
                require: true,
                rejectUnauthorized: false,
              },
            }
          : {},
        logging: NODE_ENV === "development" ? console.log : false,
        pool: {
          max: 5,
          min: 0,
          acquire: 30000,
          idle: 10000,
        },
      }
    );
  }

  return sequelize;
}

async function connectDB() {
  try {
    const db = initDB();
    await db.authenticate();
    console.log(`✅ PostgreSQL connected in ${NODE_ENV} mode.`);
  } catch (error) {
    console.error("⚠️ DB connection failed:", error);
  }
}

module.exports = {
  initDB,
  connectDB,
};
