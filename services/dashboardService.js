const { ClassesBooking, ClassesSchedule } = require("../models/Associations");

const { Op } = require("sequelize");

const getDashboardSummary = async () => {
  try {
    const today = new Date();

    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const today_booking = await ClassesBooking.count({
      where: {
        booking_status: "SUCCEED",
        date_booking: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
    });
    const todayBooking = today_booking;

    const capacity_today = await ClassesBooking.sum("capacity", {
      where: {
        booking_status: "SUCCEED",
        date_booking: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
    });

    // กัน null
    const totalCapacityToday = capacity_today || 0;

    

    const capacity_is_not_private_today = await ClassesBooking.sum("capacity", {
      where: {
        booking_status: "SUCCEED",
        date_booking: {
          [Op.gte]: startOfDay,
          [Op.lte]: endOfDay,
        },
      },
      include: [
        {
          model: ClassesSchedule,
          as: "schedule",
          required: true, // ✅ INNER JOIN เท่านั้น
          where: {
            is_private_class: false, // ✅ Group Class เท่านั้น
          },
          attributes: [], // ✅ กัน GROUP BY พัง
        },
      ],
    });
    const isNotPrivateCapacity = capacity_is_not_private_today || 0;

    const capacity_is_private_today = await ClassesBooking.sum("capacity", {
      where: {
        booking_status: "SUCCEED",
        date_booking: {
          [Op.gte]: startOfDay,
          [Op.lte]: endOfDay,
        },
      },
      include: [
        {
          model: ClassesSchedule,
          as: "schedule",
          required: true, // ✅ INNER JOIN เท่านั้น
          where: {
            is_private_class: false, // ✅ Group Class เท่านั้น
          },
          attributes: [], // ✅ กัน GROUP BY พัง
        },
      ],
    });
    const isPrivateCapacity = capacity_is_private_today || 0;

    return {
      todayBooking,
      totalCapacityToday,
      isNotPrivateCapacity,
      isPrivateCapacity,
    };
  } catch (error) {
    console.error("[DASHBOARD ERROR]:", error);
    throw error;
  }
};

const getDailyBookingsByDate = async (date) => {
  try {
    // แปลง YYYY-MM-DD → ช่วงเวลาของวันนั้น
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const bookings = await ClassesBooking.findAll({
      where: {
        date_booking: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
      include: [
        {
          model: ClassesSchedule,
          as: "schedule",
          attributes: ["start_time", "end_time", "gym_enum"],
        },
      ],
      order: [["date_booking", "ASC"]],
    });

    return bookings;
  } catch (error) {
    console.error("[Booking Service] Daily Booking Error:", error);
    throw error;
  }
};

module.exports = {
  getDashboardSummary,
  getDailyBookingsByDate
};
