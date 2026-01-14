const { User, Gyms, TrainerGyms, ClassesBooking, ClassesSchedule } = require("../models/Associations");
const { Op } = require("sequelize");
const { sequelize } = require("../config/db");
const activityLogService = require("./activityLogService");
const { getDailyBookings } = require("../controllers/dashboardController");

/**
 * ดึงรายชื่อเทรนเนอร์ที่ผูกกับยิมที่เลือก
 * @param {number} gymId 
 */
const getTrainersByGym = async (gymId, options = {}) => {
  try {
    const gym = await Gyms.findByPk(gymId, {
      include: [
        {
          model: User,
          as: "trainers",
          attributes: ["id", "username", "name", "email", "phone", "role"],
          through: { attributes: [] },
        },
      ],
    });

    if (!gym) {
      throw new Error("Gym not found");
    }

    let trainers = gym.trainers;

    // -------------------------------------------------------------
    // Filter trainers if date & schedule are provided
    // -------------------------------------------------------------
    if (options.date && options.classes_schedule_id) {
      const targetDate = new Date(options.date);

    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
    console.log("startOfDay", startOfDay);
    console.log("endOfDay", endOfDay);
      // Fetch Schedule Time
    const bookings = await ClassesBooking.findAll({
        where: {
            // หากต้องการหา "ทุกการจอง" ในวันที่นั้นของ Schedule นี้
            classes_schedule_id: options.classes_schedule_id, 
            date_booking: { 
                [Op.between]: [startOfDay, endOfDay]
            }
        },
        // (Optional) เรียงลำดับตามเวลาจองจากน้อยไปมาก
        order: [['date_booking', 'ASC']] 
    });

    if(bookings.length === 0){
      return trainers;
    }

    const busyTrainers = [];

      for (const b of bookings) {
        if(b.trainer){
          busyTrainers.push(b.trainer);
        }
      }

      console.log("busyTrainers", busyTrainers);

      trainers = trainers.filter(t => {
        if (busyTrainers.includes(t.name)) return false; 
        return true;
      });
    }

    return trainers;
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
