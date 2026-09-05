const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { USER_ROLE } = require("../models/Enums");

/**
 * [READ] Returns all users (excluding password).
 */
exports.getAllUsers = async () => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ["password"] },
      order: [["created_date", "DESC"]],
    });
    return users;
  } catch (error) {
    console.error("[UserService] getAllUsers Error:", error);
    throw new Error(`ไม่สามารถดึงข้อมูลผู้ใช้ได้: ${error.message}`);
  }
};

/**
 * [READ] Returns only general users (role: USER).
 */
exports.getAllJustUsers = async () => {
  try {
    const users = await User.findAll({
      where: { role: USER_ROLE.USER },
      attributes: { exclude: ["password"] },
      order: [["created_date", "DESC"]],
    });
    return users;
  } catch (error) {
    console.error("[UserService] getAllJustUsers Error:", error);
    throw new Error(`ไม่สามารถดึงข้อมูลรายชื่อเทรนเนอร์/สมาชิกได้: ${error.message}`);
  }
};

/**
 * [READ] Returns a user by ID.
 */
exports.getUserById = async (id) => {
  const user = await User.findByPk(id, {
    attributes: { exclude: ["password"] },
  });

  if (!user) {
    const error = new Error("ไม่พบข้อมูลผู้ใช้");
    error.status = 404;
    throw error;
  }

  return user;
};

/**
 * [CREATE] Creates a new user.
 */
exports.createUser = async (userData, createdBy) => {
  const { username, password, name, email, phone, role } = userData;

  // 1. Reject a duplicate username
  const existingUser = await User.findOne({ where: { username } });
  if (existingUser) {
    const error = new Error("Username นี้ถูกใช้งานไปแล้ว");
    error.status = 409;
    throw error;
  }

  // 2. Reject a duplicate email
  if (email) {
    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      const error = new Error("Email นี้ถูกใช้งานไปแล้ว");
      error.status = 409;
      throw error;
    }
  }

  // 3. Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);

  // 4. Persist the new user
  const newUser = await User.create({
    username,
    password: hashedPassword,
    name,
    email,
    phone,
    role: role || USER_ROLE.USER,
    is_active: true,
    created_by: createdBy,
    updated_by: createdBy,
  });

  const userResponse = newUser.toJSON();
  delete userResponse.password;

  return userResponse;
};

/**
 * [UPDATE] Updates a user.
 */
exports.updateUser = async (id, userData, updatedBy) => {
  const user = await User.findByPk(id);
  if (!user) {
    const error = new Error("ไม่พบข้อมูลผู้ใช้");
    error.status = 404;
    throw error;
  }

  const { username, password, name, email, phone, role, is_active } = userData;

  // 1. Reject a username change to one already in use
  if (username && username !== user.username) {
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      const error = new Error("Username นี้ถูกใช้งานไปแล้ว");
      error.status = 409;
      throw error;
    }
  }

  // 2. Reject an email change to one already in use
  if (email && email !== user.email) {
    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      const error = new Error("Email นี้ถูกใช้งานไปแล้ว");
      error.status = 409;
      throw error;
    }
  }

  // 3. Build the update payload
  const updateData = {
    updated_by: updatedBy,
    updated_date: new Date(),
  };

  if (username) updateData.username = username;
  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (phone !== undefined) updateData.phone = phone;
  if (role) updateData.role = role;
  if (is_active !== undefined) updateData.is_active = is_active;

  if (password) {
    updateData.password = await bcrypt.hash(password, 10);
  }

  // 4. Persist
  await user.update(updateData);

  const userResponse = user.toJSON();
  delete userResponse.password;

  return userResponse;
};

/**
 * [DELETE] Deletes a user (hard delete).
 */
exports.deleteUser = async (id) => {
  const user = await User.findByPk(id);
  if (!user) {
    const error = new Error("ไม่พบข้อมูลผู้ใช้");
    error.status = 404;
    throw error;
  }

  await user.destroy();
  return { message: "ลบผู้ใช้สำเร็จแล้ว" };
};
