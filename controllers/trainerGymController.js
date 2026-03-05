const trainerGymService = require("../services/trainerGymService");

/**
 * [GET] ดึงรายชื่อเทรนเนอร์ที่สังกัดยิมนั้นๆ
 */
const getTrainersByGym = async (req, res) => {
  try {
    const { gymId } = req.params;
    const { date, classes_schedule_id } = req.query;
    const trainers = await trainerGymService.getTrainersByGym(gymId, { date, classes_schedule_id });
    res.status(200).json({ success: true, data: trainers });
  } catch (error) {
    console.error("[TrainerGymController] getTrainers Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * [GET] ดึงรายชื่อผู้ใช้ที่สามารถเป็นเทรนเนอร์ได้
 */
const getAvailableUsersForTrainer = async (req, res) => {
  try {
    const users = await trainerGymService.getAvailableUsersForTrainer();
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error("[TrainerGymController] getAvailableUsers Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * [POST] มอบหมายเทรนเนอร์ให้ยิม
 */
const assignTrainerToGym = async (req, res) => {
  try {
    const { userId, gymId } = req.body;
    const result = await trainerGymService.assignTrainerToGym(userId, gymId, req.user);
    res.status(201).json({ success: true, message: "เพิ่มเทรนเนอร์เข้ายิมสำเร็จ", data: result });
  } catch (error) {
    console.error("[TrainerGymController] assign Error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * [POST] ลบเทรนเนอร์ออกจากยิม
 */
const removeTrainerFromGym = async (req, res) => {
  try {
    const { userId, gymId } = req.body;
    const result = await trainerGymService.removeTrainerFromGym(userId, gymId, req.user);
    res.status(200).json({ success: true, message: "ลบเทรนเนอร์ออกจากยิมสำเร็จ", data: result });
  } catch (error) {
    console.error("[TrainerGymController] remove Error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  getTrainersByGym,
  getAvailableUsersForTrainer,
  assignTrainerToGym,
  removeTrainerFromGym,
};
