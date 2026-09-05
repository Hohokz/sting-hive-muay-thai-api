const { ClassesBooking, ClassesSchedule } = require("../models/Associations");
const { Op } = require("sequelize");
const { sequelize } = require("../config/db");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const { BOOKING_STATUS } = require("../models/Enums");

dayjs.extend(utc);

/**
 * [READ] Returns the daily dashboard summary.
 * @param {Date|string} targetDate
 */
const getDashboardSummary = async (targetDate = new Date()) => {
  try {
    const baseDate = dayjs(targetDate);
    const startOfDay = baseDate.startOf("day").toDate();
    const endOfDay = baseDate.endOf("day").toDate();

    // Base condition: succeeded bookings within the given day
    const commonWhere = {
      booking_status: BOOKING_STATUS.SUCCEED,
      date_booking: {
        [Op.between]: [startOfDay, endOfDay],
      },
    };

    // Fetch counts and sums in parallel
    const [todayCount, totalSum, groupSum, privateSum] = await Promise.all([
      // Total number of bookings
      ClassesBooking.count({ where: commonWhere }),

      // Total seats booked across all classes
      ClassesBooking.sum("capacity", { where: commonWhere }),

      // Total seats booked, group classes only
      ClassesBooking.sum("capacity", {
        where: commonWhere,
        include: [
          {
            model: ClassesSchedule,
            as: "schedule",
            required: true,
            where: { is_private_class: false },
            attributes: [],
          },
        ],
      }),

      // Total seats booked, private classes only
      ClassesBooking.sum("capacity", {
        where: commonWhere,
        include: [
          {
            model: ClassesSchedule,
            as: "schedule",
            required: true,
            where: { is_private_class: true },
            attributes: [],
          },
        ],
      }),
    ]);

    return {
      date: startOfDay,
      todayBooking: todayCount || 0,
      totalCapacityToday: totalSum || 0,
      isNotPrivateCapacity: groupSum || 0,
      isPrivateCapacity: privateSum || 0,
    };
  } catch (error) {
    console.error("[DashboardService] getDashboardSummary Error:", error);
    throw error;
  }
};

/**
 * [READ] Returns all bookings for a given date.
 * @param {string} date - Format: YYYY-MM-DD
 */
const getDailyBookingsByDate = async (date) => {
  try {
    const startOfDay = dayjs(date).startOf("day").toDate();
    const endOfDay = dayjs(date).endOf("day").toDate();

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
          attributes: ["id", "start_time", "end_time", "gym_enum"],
        },
      ],
      order: [["date_booking", "ASC"]],
    });

    // Reshape for the frontend
    return bookings.map((booking) => {
      const b = booking.toJSON();
      return {
        ...b,
        schedule_id: b.schedule?.id, // hoisted for convenience
      };
    });
  } catch (error) {
    console.error("[DashboardService] getDailyBookingsByDate Error:", error);
    throw error;
  }
};

/**
 * [READ] Returns the total database size in bytes, for the storage-usage
 * warning banner on the admin export/cleanup page.
 */
const getDatabaseSize = async () => {
  const [[row]] = await sequelize.query(
    `SELECT pg_database_size(current_database()) AS bytes;`,
  );
  return Number(row.bytes);
};

module.exports = {
  getDashboardSummary,
  getDailyBookingsByDate,
  getDatabaseSize,
};
