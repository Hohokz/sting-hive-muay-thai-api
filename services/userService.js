const User = require("../models/User");
const bcrypt = require("bcryptjs");

/**
 * Get all users (excluding password field)
 */
exports.getAllUsers = async () => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ["password"] },
      order: [["created_date", "DESC"]],
    });
    return users;
  } catch (error) {
    throw new Error(`Error fetching users: ${error.message}`);
  }
};

exports.getAllJustUsers = async () => {
  try {
    const users = await User.findAll({
      where: { role: "USER" },
      attributes: { exclude: ["password"] },
      order: [["created_date", "DESC"]],
    });
    return users;
  } catch (error) {
    throw new Error(`Error fetching users: ${error.message}`);
  }
};

/**
 * Get user by ID (excluding password field)
 */
exports.getUserById = async (id) => {
  try {
    const user = await User.findByPk(id, {
      attributes: { exclude: ["password"] },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  } catch (error) {
    throw error;
  }
};

/**
 * Create new user
 */
exports.createUser = async (userData, createdBy) => {
  try {
    const { username, password, name, email, phone, role } = userData;

    // Check if username already exists
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      throw new Error("Username already exists");
    }

    // Check if email already exists (if provided)
    if (email) {
      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) {
        throw new Error("Email already exists");
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await User.create({
      username,
      password: hashedPassword,
      name,
      email,
      phone,
      role: role || "USER",
      is_active: true,
      created_by: createdBy,
      updated_by: createdBy,
    });

    // Return user without password
    const userResponse = newUser.toJSON();
    delete userResponse.password;

    return userResponse;
  } catch (error) {
    throw error;
  }
};

/**
 * Update user
 */
exports.updateUser = async (id, userData, updatedBy) => {
  try {
    const user = await User.findByPk(id);

    if (!user) {
      throw new Error("User not found");
    }

    const { username, password, name, email, phone, role, is_active } =
      userData;

    // Check if username is being changed and if it already exists
    if (username && username !== user.username) {
      const existingUser = await User.findOne({ where: { username } });
      if (existingUser) {
        throw new Error("Username already exists");
      }
    }

    // Check if email is being changed and if it already exists
    if (email && email !== user.email) {
      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) {
        throw new Error("Email already exists");
      }
    }

    // Prepare update data
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

    // Hash password if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Update user
    await user.update(updateData);

    // Return updated user without password
    const userResponse = user.toJSON();
    delete userResponse.password;

    return userResponse;
  } catch (error) {
    throw error;
  }
};

/**
 * Delete user (soft delete by setting is_active to false)
 */
exports.deleteUser = async (id, deletedBy) => {
  try {
    const user = await User.findByPk(id);

    if (!user) {
      throw new Error("User not found");
    }

    // Soft delete
    await user.update({
      is_active: false,
      updated_by: deletedBy,
      updated_date: new Date(),
    });

    return { message: "User deleted successfully" };
  } catch (error) {
    throw error;
  }
};
