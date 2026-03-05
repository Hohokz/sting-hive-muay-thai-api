const userService = require("../services/userService");

/**
 * [GET] ดึงรายชื่อผู้ใช้ทั้งหมด
 */
exports.getUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("[UserController] getUsers Error:", error);
    res.status(500).json({
      success: false,
      message: "ไม่สามารถดึงข้อมูลผู้ใช้ได้",
      error: error.message,
    });
  }
};

/**
 * [GET] ดึงรายชื่อเฉพาะผู้ใช้ทั่วไป (เทรนเนอร์/สมาชิก)
 */
exports.getAllJustUsers = async (req, res) => {
  try {
    const users = await userService.getAllJustUsers();
    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("[UserController] getAllJustUsers Error:", error);
    res.status(500).json({
      success: false,
      message: "ไม่สามารถดึงข้อมูลรายชื่อเทรนเนอร์/สมาชิกได้",
      error: error.message,
    });
  }
};

/**
 * [GET] ดึงข้อมูลผู้ใช้รายบุคคลตาม ID
 */
exports.getUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await userService.getUserById(id);

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("[UserController] getUser Error:", error);

    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้",
    });
  }
};

/**
 * [POST] สร้างผู้ใช้ใหม่
 */
exports.createUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "กรุณาระบุ Username และ Password",
      });
    }

    const createdBy = req.user?.username || "SYSTEM";
    const newUser = await userService.createUser(req.body, createdBy);

    res.status(201).json({
      success: true,
      message: "สร้างผู้ใช้สำเร็จแล้ว",
      data: newUser,
    });
  } catch (error) {
    console.error("[UserController] createUser Error:", error);

    // เช็คกรณีข้อมูลซ้ำ (Unique Constraint)
    if (error.message.includes("ถูกใช้งานไปแล้ว")) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "ไม่สามารถสร้างผู้ใช้ได้",
    });
  }
};

/**
 * [PUT] อัปเดตข้อมูลผู้ใช้
 */
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedBy = req.user?.username || "SYSTEM";

    const updatedUser = await userService.updateUser(id, req.body, updatedBy);

    res.json({
      success: true,
      message: "อัปเดตข้อมูลผู้ใช้สำเร็จแล้ว",
      data: updatedUser,
    });
  } catch (error) {
    console.error("[UserController] updateUser Error:", error);

    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes("ถูกใช้งานไปแล้ว")) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "ไม่สามารถอัปเดตข้อมูลผู้ใช้ได้",
    });
  }
};

/**
 * [DELETE] ลบผู้ใช้
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await userService.deleteUser(id);

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("[UserController] deleteUser Error:", error);

    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "ไม่สามารถลบผู้ใช้ได้",
    });
  }
};
