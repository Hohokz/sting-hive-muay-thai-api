const User = require("../models/User");
const bcrypt = require("bcryptjs");

/**
 * [READ] ดึงรายชื่อผู้ใช้ทั้งหมด (ไม่รวมรหัสผ่าน)
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
 * [READ] ดึงรายชื่อเฉพาะผู้ใช้ทั่วไป (Role: USER)
 */
exports.getAllJustUsers = async () => {
  try {
    const users = await User.findAll({
      where: { role: "USER" },
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
 * [READ] ดึงข้อมูลผู้ใช้ตาม ID
 */
exports.getUserById = async (id) => {
  try {
    const user = await User.findByPk(id, {
      attributes: { exclude: ["password"] },
    });

    if (!user) {
      const error = new Error("ไม่พบข้อมูลผู้ใช้");
      error.status = 404;
      throw error;
    }

    return user;
  } catch (error) {
    throw error;
  }
};

/**
 * [CREATE] สร้างผู้ใช้ใหม่
 */
exports.createUser = async (userData, createdBy) => {
  try {
    const { username, password, name, email, phone, role } = userData;

    // 1. ตรวจสอบ Username ซ้ำ
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      throw new Error("Username นี้ถูกใช้งานไปแล้ว");
    }

    // 2. ตรวจสอบ Email ซ้ำ
    if (email) {
      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) {
        throw new Error("Email นี้ถูกใช้งานไปแล้ว");
      }
    }

    // 3. แฮชรหัสผ่าน
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. บันทึกข้อมูล
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

    const userResponse = newUser.toJSON();
    delete userResponse.password;

    return userResponse;
  } catch (error) {
    throw error;
  }
};

/**
 * [UPDATE] อัปเดตข้อมูลผู้ใช้
 */
exports.updateUser = async (id, userData, updatedBy) => {
  try {
    const user = await User.findByPk(id);
    if (!user) {
      const error = new Error("ไม่พบข้อมูลผู้ใช้");
      error.status = 404;
      throw error;
    }

    const { username, password, name, email, phone, role, is_active } = userData;

    // 1. ตรวจสอบการเปลี่ยน Username
    if (username && username !== user.username) {
      const existingUser = await User.findOne({ where: { username } });
      if (existingUser) {
        throw new Error("Username นี้ถูกใช้งานไปแล้ว");
      }
    }

    // 2. ตรวจสอบการเปลี่ยน Email
    if (email && email !== user.email) {
      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) {
        throw new Error("Email นี้ถูกใช้งานไปแล้ว");
      }
    }

    // 3. เตรียมข้อมูลอัปเดต
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

    // 4. บันทึก
    await user.update(updateData);

    const userResponse = user.toJSON();
    delete userResponse.password;

    return userResponse;
  } catch (error) {
    throw error;
  }
};

/**
 * [DELETE] ลบผู้ใช้ (Hard Delete)
 */
exports.deleteUser = async (id) => {
  try {
    const user = await User.findByPk(id);
    if (!user) {
      const error = new Error("ไม่พบข้อมูลผู้ใช้");
      error.status = 404;
      throw error;
    }

    await user.destroy();
    return { message: "ลบผู้ใช้สำเร็จแล้ว" };
  } catch (error) {
    throw error;
  }
};
