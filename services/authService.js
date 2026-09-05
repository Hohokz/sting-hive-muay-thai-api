const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const saltRounds = 10;

/**
 * [HELPER] Hashes a password.
 */
exports.hashPassword = async (password) => {
  return await bcrypt.hash(password, saltRounds);
};

/**
 * [HELPER] Compares a plaintext password against a hash.
 */
exports.comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * [TOKEN] Generates a short-lived access token for general API use.
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
 * [TOKEN] Generates a long-lived refresh token, used to request a new access token.
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
 * [TOKEN] Generates both tokens at once.
 */
exports.generateTokens = (user) => {
  const accessToken = exports.generateAccessToken(user);
  const refreshToken = exports.generateRefreshToken(user);
  return { accessToken, refreshToken };
};

/**
 * [VERIFY] Verifies an access token.
 */
exports.verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * [VERIFY] Verifies a refresh token.
 */
exports.verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};
