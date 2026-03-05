const cron = require("node-cron");
const { Op, Sequelize } = require("sequelize");
const { 
  ClassesSchedule, 
  ClassesCapacity, 
  ClassesBookingInAdvance 
} = require("../models/Associations");

/**
 * [CRON JOB] ระบบจัดการตารางเรียนล่วงหน้า
 * - เปิด/ปิดตารางเรียนตาม Config (เช่น ปิดยิมวันหยุด)
 * - ปรับเปลี่ยน Capacity ตามช่วงเวลาที่กำหนด
 */
const startAdvancedScheduleJob = () => {
  // รันทุกวันเวลา 00:01 น. เพื่อเตรียมข้อมูลสำหรับวันนั้นๆ
  cron.schedule("01 00 * * *", async () => {
    console.log("[AdvancedJob] ⏰ เริ่มทำงานระบบตารางเรียนล่วงหน้า...");
    await runAdvancedScheduleJob();
  });
};

const runAdvancedScheduleJob = async () => {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0]; // รูปแบบ YYYY-MM-DD
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  console.log(`[AdvancedJob] 📅 วันนี้: ${todayStr} | เมื่อวาน: ${yesterdayStr}`);

  try {
    // -----------------------------------------------------------------
    // 1. ตรวจสอบ Config ที่เริ่มมีผล "วันนี้"
    // -----------------------------------------------------------------

    // ค้นหาคำสั่งปิดยิม (is_close_gym = true)
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

    // ค้นหาคำสั่งปรับ Capacity (ส่วนตัวรายบุคคล)
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

    // --- Action: ปิดตารางเรียน (is_active = false) ---
    let closedCount = 0;
    for (const closure of activeClosures) {
      const [updated] = await ClassesSchedule.update(
        { is_active: false },
        { where: { gyms_id: closure.gyms_id } }
      );
      if (updated) closedCount += updated;
    }

    // --- Action: ปรับ Capacity ---
    let capUpdatedCount = 0;
    for (const config of activeCapacities) {
      const [updated] = await ClassesCapacity.update(
        { capacity: config.capacity },
        { where: { classes_id: config.classes_schedule_id } }
      );
      if (updated) capUpdatedCount++;
    }

    // -----------------------------------------------------------------
    // 2. ตรวจสอบ Config ที่ "หมดอายุ" เมื่อวาน (ต้องคืนค่าเดิม)
    // -----------------------------------------------------------------

    // ค้นหาคำสั่งปิดยิมที่เพิ่งหมดเขต
    const expiredClosures = await ClassesBookingInAdvance.findAll({
      where: {
        is_close_gym: true,
        classes_schedule_id: null,
        [Op.and]: [
          Sequelize.where(Sequelize.fn("DATE", Sequelize.col("end_date")), "=", yesterdayStr),
        ],
      },
    });

    // ค้นหาคำสั่งปรับ Capacity ที่เพิ่งหมดเขต
    const expiredCapacities = await ClassesBookingInAdvance.findAll({
      where: {
        is_close_gym: false,
        classes_schedule_id: { [Op.not]: null },
        old_capasity: { [Op.not]: null },
        [Op.and]: [
          Sequelize.where(Sequelize.fn("DATE", Sequelize.col("end_date")), "=", yesterdayStr),
        ],
      },
    });

    // --- Action: เปิดตารางเรียนคืน (Reactivate) ---
    let reopenedCount = 0;
    for (const closure of expiredClosures) {
      // เช็คว่ามี Config อื่นที่สั่งปิดยิมนี้อยู่ซ้อนกันหรือไม่
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

    // --- Action: คืนค่า Capacity เดิม ---
    let capRevertedCount = 0;
    for (const config of expiredCapacities) {
      // เช็คว่ามี Config อื่นที่ปรับค่าตารางนี้ซ้อนกันหรือไม่
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
        const [updated] = await ClassesCapacity.update(
          { capacity: config.old_capasity },
          { where: { classes_id: config.classes_schedule_id } }
        );
        if (updated) capRevertedCount++;
      }
    }

    // --- รายงานผลการทำงาน ---
    console.log("[AdvancedJob] 📊 สรุปการทำงาน:");
    console.log(`  - 🔴 ปิดยิม/ตาราง (วันนี้): ${closedCount} รายการ`);
    console.log(`  - ⚖️ ปรับ Capacity (วันนี้): ${capUpdatedCount} รายการ`);
    console.log(`  - 🟢 เปิดยิมคืน (หมดอายุ): ${reopenedCount} รายการ`);
    console.log(`  - 🔄 คืนค่า Capacity (หมดอายุ): ${capRevertedCount} รายการ`);
    console.log("-------------------------------------------\n");

  } catch (error) {
    console.error("[AdvancedJob] ❌ เกิดข้อผิดพลาด:", error);
  }
};

module.exports = { startAdvancedScheduleJob, runAdvancedScheduleJob };
