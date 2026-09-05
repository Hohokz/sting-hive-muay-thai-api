const userService = require("../services/userService");
const { sendError } = require("../utils/httpError");

/**
 * [GET] Returns all users
 */
exports.getUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงข้อมูลผู้ใช้ได้");
  }
};

/**
 * [GET] Returns only general users (trainers/members)
 */
exports.getAllJustUsers = async (req, res) => {
  try {
    const users = await userService.getAllJustUsers();
    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    sendError(res, error, "ไม่สามารถดึงข้อมูลรายชื่อเทรนเนอร์/สมาชิกได้");
  }
};

/**
 * [GET] Returns a single user by ID
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
    sendError(res, error, "เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้");
  }
};

/**
 * [POST] Creates a new user
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
    sendError(res, error, "ไม่สามารถสร้างผู้ใช้ได้");
  }
};

/**
 * [PUT] Updates a user
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
    sendError(res, error, "ไม่สามารถอัปเดตข้อมูลผู้ใช้ได้");
  }
};

/**
 * [DELETE] Deletes a user
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
    sendError(res, error, "ไม่สามารถลบผู้ใช้ได้");
  }
};
