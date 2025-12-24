const { ClassesBooking, ClassesSchedule } = require("../models/Associations");

const { Op } = require("sequelize");

const getDashboardSummary = async (targetDate = new Date()) => { // <--- Default เป็นวันปัจจุบัน
  try {
    // สร้าง Instance ใหม่เพื่อไม่ให้กระทบกับ Object วันที่ที่ส่งเข้ามา
    const baseDate = new Date(targetDate);

    const startOfDay = new Date(baseDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(baseDate.setHours(23, 59, 59, 999));

    // เงื่อนไขพื้นฐานที่ใช้ซ้ำกัน
    const commonWhere = {
      booking_status: "SUCCEED",
      date_booking: {
        [Op.between]: [startOfDay, endOfDay],
      },
    };

    // 1. จำนวนจองทั้งหมด
    const todayBooking = await ClassesBooking.count({
      where: commonWhere,
    });

    // 2. Capacity รวม (ใช้ Promise.all เพื่อ Query พร้อมกัน)
    const [totalSum, groupSum, privateSum] = await Promise.all([
      // ทั้งหมด
      ClassesBooking.sum("capacity", { where: commonWhere }),
      
      // Group Class
      ClassesBooking.sum("capacity", {
        where: commonWhere,
        include: [{
          model: ClassesSchedule,
          as: "schedule",
          required: true,
          where: { is_private_class: false },
          attributes: [],
        }],
      }),

      // Private Class
      ClassesBooking.sum("capacity", {
        where: commonWhere,
        include: [{
          model: ClassesSchedule,
          as: "schedule",
          required: true,
          where: { is_private_class: true },
          attributes: [],
        }],
      }),
    ]);

    return {
      date: startOfDay,
      todayBooking: todayBooking || 0,
      totalCapacityToday: totalSum || 0,
      isNotPrivateCapacity: groupSum || 0,
      isPrivateCapacity: privateSum || 0,
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
          attributes: ["id", "start_time", "end_time", "gym_enum"],
        },
      ],
      order: [["date_booking", "ASC"]],
    });

    return bookings.map(booking => {
      const b = booking.toJSON(); // แปลงเป็น JSON ปกติก่อน
      return {
        ...b,
        schedule_id: b.schedule?.id // ดึง ID มาแปะไว้ที่ชั้นนอกสุด
      };
    });
  } catch (error) {
    console.error("[Booking Service] Daily Booking Error:", error);
    throw error;
  }
};

module.exports = {
  getDashboardSummary,
  getDailyBookingsByDate
};
