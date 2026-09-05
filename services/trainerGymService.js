const { User, Gyms, TrainerGyms, ClassesBooking } = require("../models/Associations");
const { Op } = require("sequelize");
const activityLogService = require("./activityLogService");
const dayjs = require("dayjs");
const { BOOKING_STATUS, USER_ROLE } = require("../models/Enums");

/**
 * [READ] Returns the trainers linked to a gym (optionally filtering out ones already booked).
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

    if (!gym) {
      const error = new Error("ไม่พบข้อมูลยิมที่ระบุ");
      error.status = 404;
      throw error;
    }

    let trainers = gym.trainers;

    // If a date and schedule are given, filter out trainers already busy then
    if (options.date && options.classes_schedule_id) {
      const startOfDay = dayjs(options.date).startOf("day").toDate();
      const endOfDay = dayjs(options.date).endOf("day").toDate();

      // Bookings that named a trainer for that class on that day
      const bookings = await ClassesBooking.findAll({
        where: {
          classes_schedule_id: options.classes_schedule_id,
          booking_status: { [Op.ne]: BOOKING_STATUS.CANCELED },
          date_booking: { [Op.between]: [startOfDay, endOfDay] }
        }
      });

      if (bookings.length > 0) {
        // TODO(tech-debt): matches by trainer display name, not a trainer_id
        // FK — ClassesBooking.trainer is free text. Two trainers sharing a
        // name would incorrectly be treated as the same person. Fixing this
        // properly needs a trainer_id column + migration.
        const busyTrainerNames = bookings.map(b => b.trainer).filter(Boolean);

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
 * [READ] Returns all users eligible to be a trainer (role: USER).
 */
const getAvailableUsersForTrainer = async () => {
  try {
    const users = await User.findAll({
      where: { role: USER_ROLE.USER },
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
 * [CREATE] Assigns a trainer to a gym.
 */
const assignTrainerToGym = async (userId, gymId, performedByUser = null) => {
  try {
    // 1. Reject a duplicate assignment
    const existing = await TrainerGyms.findOne({
      where: { user_id: userId, gyms_id: gymId },
    });

    if (existing) {
      const error = new Error("เทรนเนอร์ท่านนี้ถูกเพิ่มเข้ายิมนี้อยู่แล้ว");
      error.status = 409;
      throw error;
    }

    // 2. Persist the relationship
    const record = await TrainerGyms.create({
      user_id: userId,
      gyms_id: gymId,
    });

    // 3. Fetch details for logging, in parallel
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
 * [DELETE] Unassigns a trainer from a gym.
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
      const error = new Error("ไม่พบความสัมพันธ์ที่ต้องการลบ");
      error.status = 404;
      throw error;
    }

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
