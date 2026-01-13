const { User, Gyms, TrainerGyms } = require("../models/Associations");
const { Op } = require("sequelize");
const activityLogService = require("./activityLogService");

/**
 * ดึงรายชื่อเทรนเนอร์ที่ผูกกับยิมที่เลือก
 * @param {number} gymId 
 */
const getTrainersByGym = async (gymId) => {
  try {
    const gym = await Gyms.findByPk(gymId, {
      include: [
        {
          model: User,
          as: "trainers",
          attributes: ["id", "username", "name", "email", "phone", "role"],
          through: { attributes: [] }, // ไม่เอาข้อมูลจาก table กลาง
        },
      ],
    });

    if (!gym) {
      throw new Error("Gym not found");
    }

    return gym.trainers;
  } catch (error) {
    console.error("[TrainerGymService] getTrainersByGym Error:", error);
    throw error;
  }
};

/**
 *ดึงรายชื่อ User ทั้งหมดที่มี role เป็น 'USER' (เพื่อเอามาเลือกเป็นเทรนเนอร์)
 */
const getAvailableUsersForTrainer = async () => {
  try {
    const users = await User.findAll({
      where: { role: "USER" },
      attributes: ["id", "username", "name", "email", "role"],
      order: [["name", "ASC"]],
    });
    return users;
  } catch (error) {
    console.error("[TrainerGymService] getAvailableUsersForTrainer Error:", error);
    throw error;
  }
};

/**
 * ผูก User เข้ากับยิม
 */
const assignTrainerToGym = async (userId, gymId, performedByUser = null) => {
  try {
    // 1. ตรวจสอบว่ามีอยู่แล้วหรือยัง
    const existing = await TrainerGyms.findOne({
      where: { user_id: userId, gyms_id: gymId },
    });

    if (existing) {
      throw new Error("This trainer is already assigned to this gym.");
    }

    // 2. สร้าง record ใหม่
    const record = await TrainerGyms.create({
      user_id: userId,
      gyms_id: gymId,
    });

    // 3. Log Activity
    const [user, gym] = await Promise.all([
      User.findByPk(userId),
      Gyms.findByPk(gymId)
    ]);

    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
      service: "TRAINER_GYM",
      action: "ASSIGN",
      details: {
        trainer_id: userId,
        trainer_name: user?.name,
        gym_id: gymId,
        gym_name: gym?.gym_name
      }
    });

    return record;
  } catch (error) {
    console.error("[TrainerGymService] assignTrainerToGym Error:", error);
    throw error;
  }
};

/**
 * ยกเลิกการผูก User กับยิม
 */
const removeTrainerFromGym = async (userId, gymId, performedByUser = null) => {
  try {
    const [user, gym] = await Promise.all([
      User.findByPk(userId),
      Gyms.findByPk(gymId)
    ]);

    const deletedCount = await TrainerGyms.destroy({
      where: { user_id: userId, gyms_id: gymId },
    });

    if (deletedCount === 0) {
      throw new Error("Relationship not found.");
    }

    // 3. Log Activity
    await activityLogService.createLog({
      user_id: performedByUser?.id || null,
      user_name: performedByUser?.name || performedByUser?.username || "ADMIN",
      service: "TRAINER_GYM",
      action: "REMOVE",
      details: {
        trainer_id: userId,
        trainer_name: user?.name,
        gym_id: gymId,
        gym_name: gym?.gym_name
      }
    });

    return { success: true, message: "Trainer removed from gym successfully." };
  } catch (error) {
    console.error("[TrainerGymService] removeTrainerFromGym Error:", error);
    throw error;
  }
};

module.exports = {
  getTrainersByGym,
  getAvailableUsersForTrainer,
  assignTrainerToGym,
  removeTrainerFromGym,
};
