const { User, Gyms, TrainerGyms, ClassesBooking } = require("../models/Associations");
const { Op } = require("sequelize");
const activityLogService = require("./activityLogService");
const dayjs = require("dayjs");

/**
 * [READ] ดึงรายชื่อเทรนเนอร์ที่ผูกกับยิมที่เลือก (และตรวจสอบคิวว่างถ้ามีการระบุวันที่/คลาส)
 * @param {number} gymId 
 * @param {object} options { date, classes_schedule_id }
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

    if (!gym) throw new Error("ไม่พบข้อมูลยิมที่ระบุ");

    let trainers = gym.trainers;

    // --- ถ้ามีการระบุวันที่และตารางเรียน ให้คัดกรองเทรนเนอร์ที่ติดสอนออก ---
    if (options.date && options.classes_schedule_id) {
      const startOfDay = dayjs(options.date).startOf("day").toDate();
      const endOfDay = dayjs(options.date).endOf("day").toDate();

      // ดึงการจองที่มีการระบุเทรนเนอร์ในวันนั้นและคลาสนั้น
      const bookings = await ClassesBooking.findAll({
        where: {
          classes_schedule_id: options.classes_schedule_id, 
          date_booking: { [Op.between]: [startOfDay, endOfDay] }
        }
      });

      if (bookings.length > 0) {
        const busyTrainerNames = bookings.map(b => b.trainer).filter(Boolean);
        
        // คัดออก: เทรนเนอร์ที่ชื่ออยู่ในรายการ busy
        trainers = trainers.filter(t => !busyTrainerNames.includes(t.name));
      }
    }

    return trainers;
  } catch (error) {
    console.error("[TrainerGymService] getTrainersByGym Error:", error);
    throw error;
  }
};

/**
 * [READ] ดึงรายชื่อ User ทั้งหมดที่มีสิทธิ์เป็นเทรนเนอร์ (Role: USER)
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
 * [CREATE] ผูกเทรนเนอร์เข้ากับยิม (Assign)
 */
const assignTrainerToGym = async (userId, gymId, performedByUser = null) => {
  try {
    // 1. ตรวจสอบว่ามีการผูกไว้อยู่แล้วหรือไม่
    const existing = await TrainerGyms.findOne({
      where: { user_id: userId, gyms_id: gymId },
    });

    if (existing) {
      throw new Error("เทรนเนอร์ท่านนี้ถูกเพิ่มเข้ายิมนี้อยู่แล้ว");
    }

    // 2. บันทึกความสัมพันธ์
    const record = await TrainerGyms.create({
      user_id: userId,
      gyms_id: gymId,
    });

    // 3. บันทึก Log แบบขนาน
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
 * [DELETE] ยกเลิกการผูกเทรนเนอร์ออกจากยิม (Unassign)
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
      throw new Error("ไม่พบความสัมพันธ์ที่ต้องการลบ");
    }

    // บันทึก Log
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

    return { success: true, message: "ลบเทรนเนอร์ออกจากยิมสำเร็จ" };
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
