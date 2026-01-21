const cron = require("node-cron");
const { Op, Sequelize } = require("sequelize");

// Import Models เพียงครั้งเดียว (ตรวจสอบ Path ให้ถูกต้องตาม Project Structure ของคุณ)
// สมมติว่า models อยู่ folder ถัดขึ้นไป 1 ชั้น
const { 
  ClassesSchedule, 
  ClassesCapacity, 
  ClassesBookingInAdvance 
} = require("../models/Associations");

/**
 * Advanced Schedule Job
 * - ปิด/เปิด schedules ตาม config ที่ active
 * - Update is_active ของ schedules
 * - Update/Revert Capacity
 */
const startAdvancedScheduleJob = () => {
  // รันทุกวันเวลา 00:01 น.
  cron.schedule("01 00 * * *", async () => {
    await runAdvancedScheduleJob();
  });
};

const runAdvancedScheduleJob = async () => {
  // กำหนดเวลาปัจจุบัน
  const now = new Date();
  // แปลงเป็น String YYYY-MM-DD (ระวังเรื่อง Timezone ของ Server ดีๆ ครับ แนะนำให้เช็คว่า Server เวลาตรงกับไทยไหม)
  const todayStr = now.toISOString().split("T")[0];
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  console.log("===========================================");
  console.log(`[Advanced Schedule Job] Date: ${todayStr}`);
  console.log("===========================================");

  try {
    // ----------------------------------------------------
    // 1. หา Gym Closures ที่ Active วันนี้
    // ----------------------------------------------------
    const activeClosures = await ClassesBookingInAdvance.findAll({
      where: {
        is_close_gym: true,
        classes_schedule_id: null,
        [Op.and]: [
          Sequelize.where(Sequelize.fn("DATE", Sequelize.col("start_date")), "<=", todayStr),
          Sequelize.where(Sequelize.fn("DATE", Sequelize.col("end_date")), ">=", todayStr),
        ],
      },
    });

    // ----------------------------------------------------
    // 2. หา Capacity Configs ที่ Active วันนี้
    // ----------------------------------------------------
    const activeCapacities = await ClassesBookingInAdvance.findAll({
      where: {
        is_close_gym: false,
        classes_schedule_id: { [Op.not]: null },
        capacity: { [Op.not]: null },
        [Op.and]: [
          Sequelize.where(Sequelize.fn("DATE", Sequelize.col("start_date")), "<=", todayStr),
          Sequelize.where(Sequelize.fn("DATE", Sequelize.col("end_date")), ">=", todayStr),
        ],
      },
    });

    // --- Action 1: Deactivate Schedules ---
    let closedCount = 0;
    for (const closure of activeClosures) {
      const [updated] = await ClassesSchedule.update(
        { is_active: false },
        { where: { gyms_id: closure.gyms_id } }
      );
      if (updated) closedCount += updated; // นับจำนวน row ที่ถูก update จริง
    }

    // --- Action 2: Update Capacity ---
    let capacityUpdatedCount = 0;
    for (const config of activeCapacities) {
      // อัปเดตตาราง CLASSES_CAPACITY โดยใช้ classes_id เป็นตัวเชื่อม
      const [updated] = await ClassesCapacity.update(
        { capacity: config.capacity },
        { where: { classes_id: config.classes_schedule_id } }
      );
      if (updated) capacityUpdatedCount++;
    }

    // ----------------------------------------------------
    // 3. หา Gym Closures ที่หมดอายุเมื่อวาน (เตรียมเปิดคืน)
    // ----------------------------------------------------
    const expiredClosures = await ClassesBookingInAdvance.findAll({
      where: {
        is_close_gym: true,
        classes_schedule_id: null,
        [Op.and]: [
          Sequelize.where(Sequelize.fn("DATE", Sequelize.col("end_date")), "=", yesterdayStr),
        ],
      },
    });

    // ----------------------------------------------------
    // 4. หา Capacity Configs ที่หมดอายุเมื่อวาน (เตรียมคืนค่าเดิม)
    // ----------------------------------------------------
    const expiredCapacities = await ClassesBookingInAdvance.findAll({
      where: {
        is_close_gym: false,
        classes_schedule_id: { [Op.not]: null },
        old_capasity: { [Op.not]: null }, // ต้องมีค่าเดิมให้คืน
        [Op.and]: [
          Sequelize.where(Sequelize.fn("DATE", Sequelize.col("end_date")), "=", yesterdayStr),
        ],
      },
    });

    // --- Action 3: Reactivate Schedules ---
    let reopenedCount = 0;
    for (const closure of expiredClosures) {
      // เช็คว่ายังมีคำสั่งปิดอื่นที่ Active อยู่หรือไม่
      const stillActive = await ClassesBookingInAdvance.count({
        where: {
          gyms_id: closure.gyms_id,
          is_close_gym: true,
          [Op.and]: [
            Sequelize.where(Sequelize.fn("DATE", Sequelize.col("start_date")), "<=", todayStr),
            Sequelize.where(Sequelize.fn("DATE", Sequelize.col("end_date")), ">=", todayStr),
          ],
        },
      });

      if (stillActive === 0) {
        const [updated] = await ClassesSchedule.update(
          { is_active: true },
          { where: { gyms_id: closure.gyms_id } }
        );
        if (updated) reopenedCount += updated;
      }
    }

    // --- Action 4: Revert Capacity ---
    let capacityRevertedCount = 0;
    for (const config of expiredCapacities) {
      // เช็คว่ายังมีคำสั่งปรับ Capacity อื่นที่ Active อยู่หรือไม่
      const stillActive = await ClassesBookingInAdvance.count({
        where: {
          classes_schedule_id: config.classes_schedule_id,
          capacity: { [Op.not]: null },
          [Op.and]: [
            Sequelize.where(Sequelize.fn("DATE", Sequelize.col("start_date")), "<=", todayStr),
            Sequelize.where(Sequelize.fn("DATE", Sequelize.col("end_date")), ">=", todayStr),
          ],
        },
      });

      if (stillActive === 0) {
        // คืนค่าจาก old_capasity
        const [updated] = await ClassesCapacity.update(
          { capacity: config.old_capasity },
          { where: { classes_id: config.classes_schedule_id } }
        );
        if (updated) capacityRevertedCount++;
      }
    }

    // --- Logging ---
    console.log("[Job] Summary Report:");
    console.log(` - Active Closures Found: ${activeClosures.length}`);
    console.log(` - Schedules Deactivated (Rows): ${closedCount}`);
    console.log(` - Active Capacities Found: ${activeCapacities.length}`);
    console.log(` - ClassesCapacity Updated: ${capacityUpdatedCount}`);
    console.log("-------------------------------------------");
    console.log(` - Expired Closures Found: ${expiredClosures.length}`);
    console.log(` - Schedules Reopened (Rows): ${reopenedCount}`);
    console.log(` - Expired Capacities Found: ${expiredCapacities.length}`);
    console.log(` - ClassesCapacity Reverted: ${capacityRevertedCount}`);
    console.log("===========================================\n");

  } catch (error) {
    console.error("[Job Error]:", error);
  }
};

module.exports = { startAdvancedScheduleJob, runAdvancedScheduleJob };