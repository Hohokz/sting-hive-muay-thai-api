const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const saltRounds = 10;

/**
 * [HELPER] แฮชรหัสผ่าน (Password Hashing)
 */
exports.hashPassword = async (password) => {
  return await bcrypt.hash(password, saltRounds);
};

/**
 * [HELPER] ตรวจสอบรหัสผ่าน (Password Comparison)
 */
exports.comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * [TOKEN] สร้าง Access Token (อายุสั้น สำหรับใช้งานทั่วไป)
 */
exports.generateAccessToken = (user) => {
  const payload = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30m", 
  });
};

/**
 * [TOKEN] สร้าง Refresh Token (อายุยาว สำหรับขอ Access Token ใหม่)
 */
exports.generateRefreshToken = (user) => {
  const payload = {
    id: user.id,
  };

  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "1d", 
  });
};

/**
 * [TOKEN] สร้าง Token ทั้งคู่ในครั้งเดียว
 */
exports.generateTokens = (user) => {
  const accessToken = this.generateAccessToken(user);
  const refreshToken = this.generateRefreshToken(user);
  return { accessToken, refreshToken };
};

/**
 * [VERIFY] ตรวจสอบความถูกต้องของ Access Token
 */
exports.verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * [VERIFY] ตรวจสอบความถูกต้องของ Refresh Token
 */
exports.verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};
