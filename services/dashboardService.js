const { ClassesBooking, ClassesSchedule } = require("../models/Associations");
const { Op } = require("sequelize");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");

dayjs.extend(utc);

/**
 * [READ] สรุปข้อมูลหน้า Dashboard รายวัน
 * @param {Date|string} targetDate 
 */
const getDashboardSummary = async (targetDate = new Date()) => {
  try {
    const baseDate = dayjs(targetDate);
    const startOfDay = baseDate.startOf("day").toDate();
    const endOfDay = baseDate.endOf("day").toDate();

    // เงื่อนไขพื้นฐาน: สถานะสำเร็จ และอยู่ในวันที่กำหนด
    const commonWhere = {
      booking_status: "SUCCEED",
      date_booking: {
        [Op.between]: [startOfDay, endOfDay],
      },
    };

    // 1. ดึงข้อมูลพื้นฐานและผลรวมแบบขนาน (Parallel Fetch)
    const [todayCount, totalSum, groupSum, privateSum] = await Promise.all([
      // จำนวนรายการจองทั้งหมด
      ClassesBooking.count({ where: commonWhere }),

      // ยอดรวมจำนวนคนเข้าเรียนทั้งหมด
      ClassesBooking.sum("capacity", { where: commonWhere }),

      // ยอดรวมจำนวนคนเข้าเรียนเฉพาะ Group Class
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

      // ยอดรวมจำนวนคนเข้าเรียนเฉพาะ Private Class
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
 * [READ] ดึงรายการจองทั้งหมดของวันที่เลือก
 * @param {string} date - รูปแบบ YYYY-MM-DD
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

    // ปรับรูปแบบข้อมูล (Enrichment) ก่อนส่งคืน
    return bookings.map((booking) => {
      const b = booking.toJSON();
      return {
        ...b,
        schedule_id: b.schedule?.id, // แปะ ID ตารางเรียนไว้ชั้นนอกสุดเพื่อง่ายต่อการใช้งาน
      };
    });
  } catch (error) {
    console.error("[DashboardService] getDailyBookingsByDate Error:", error);
    throw error;
  }
};

module.exports = {
  getDashboardSummary,
  getDailyBookingsByDate,
};
