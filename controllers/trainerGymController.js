const trainerGymService = require("../services/trainerGymService");
const { sendError } = require("../utils/httpError");

/**
 * [GET] Returns trainers assigned to a gym
 */
const getTrainersByGym = async (req, res) => {
  try {
    const { gymId } = req.params;
    const { date, classes_schedule_id } = req.query;
    const trainers = await trainerGymService.getTrainersByGym(gymId, { date, classes_schedule_id });
    res.status(200).json({ success: true, data: trainers });
  } catch (error) {
    sendError(res, error, "เกิดข้อผิดพลาดในการดึงข้อมูลเทรนเนอร์");
  }
};

/**
 * [GET] Returns users eligible to be a trainer
 */
const getAvailableUsersForTrainer = async (req, res) => {
  try {
    const users = await trainerGymService.getAvailableUsersForTrainer();
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    sendError(res, error, "เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้ที่สามารถเป็นเทรนเนอร์ได้");
  }
};

/**
 * [POST] Assigns a trainer to a gym
 */
const assignTrainerToGym = async (req, res) => {
  try {
    const { userId, gymId } = req.body;
    const result = await trainerGymService.assignTrainerToGym(userId, gymId, req.user);
    res.status(201).json({ success: true, message: "เพิ่มเทรนเนอร์เข้ายิมสำเร็จ", data: result });
  } catch (error) {
    sendError(res, error, "ไม่สามารถเพิ่มเทรนเนอร์เข้ายิมได้");
  }
};

/**
 * [POST] Removes a trainer from a gym
 */
const removeTrainerFromGym = async (req, res) => {
  try {
    const { userId, gymId } = req.body;
    const result = await trainerGymService.removeTrainerFromGym(userId, gymId, req.user);
    res.status(200).json({ success: true, message: "ลบเทรนเนอร์ออกจากยิมสำเร็จ", data: result });
  } catch (error) {
    sendError(res, error, "ไม่สามารถลบเทรนเนอร์ออกจากยิมได้");
  }
};

module.exports = {
  getTrainersByGym,
  getAvailableUsersForTrainer,
  assignTrainerToGym,
  removeTrainerFromGym,
};
