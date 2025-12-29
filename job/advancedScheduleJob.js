const cron = require("node-cron");
const { Op, Sequelize } = require("sequelize");
const {
  ClassesBookingInAdvance,
  ClassesSchedule,
} = require("../models/Associations");

/**
 * Advanced Schedule Job
 * - ปิด/เปิด schedules ตาม config ที่ active
 * - Update is_active ของ schedules
 */
const startAdvancedScheduleJob = () => {
  // รันทุกวันเวลา 00:01 น.
  cron.schedule("01 00 * * *", async () => {
    await runAdvancedScheduleJob();
  });
};

// Export function แยกเพื่อให้ test ได้
const runAdvancedScheduleJob = async () => {
  console.log("===========================================");
  console.log("[Advanced Schedule Job] Starting...");
  console.log("===========================================");

  // ใช้วันที่ local
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;

  console.log(`[Job] Date: ${todayStr}`);

  try {
    // ========================================
    // 1. หา Gym Closures ที่ Active วันนี้
    // ========================================
    const gymClosures = await ClassesBookingInAdvance.findAll({
      where: {
        is_close_gym: true,
        classes_schedule_id: null, // ปิดทั้งยิม
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn("DATE", Sequelize.col("start_date")),
            "<=",
            todayStr
          ),
          Sequelize.where(
            Sequelize.fn("DATE", Sequelize.col("end_date")),
            ">=",
            todayStr
          ),
        ],
      },
    });

    console.log(`\n[Job] Active Gym Closures: ${gymClosures.length}`);

    // Deactivate schedules ของยิมที่ปิด
    for (const closure of gymClosures) {
      const [updatedCount] = await ClassesSchedule.update(
        { is_active: false },
        { where: { gyms_id: closure.gyms_id } }
      );
      console.log(
        `  🚫 Deactivated ${updatedCount} schedule(s) for Gym ID: ${closure.gyms_id}`
      );
    }

    // ========================================
    // 2. หา Gym Closures ที่หมดอายุเมื่อวาน → เปิดกลับ
    // ========================================
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(
      yesterday.getMonth() + 1
    ).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    const expiredClosures = await ClassesBookingInAdvance.findAll({
      where: {
        is_close_gym: true,
        classes_schedule_id: null,
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn("DATE", Sequelize.col("end_date")),
            "=",
            yesterdayStr
          ),
        ],
      },
    });

    console.log(
      `\n[Job] Expired Gym Closures (reopening): ${expiredClosures.length}`
    );

    // Reactivate schedules ของยิมที่เปิดกลับ
    for (const closure of expiredClosures) {
      // เช็คก่อนว่าไม่มี closure อื่นที่ยัง active อยู่
      const stillClosed = await ClassesBookingInAdvance.findOne({
        where: {
          gyms_id: closure.gyms_id,
          is_close_gym: true,
          classes_schedule_id: null,
          [Op.and]: [
            Sequelize.where(
              Sequelize.fn("DATE", Sequelize.col("start_date")),
              "<=",
              todayStr
            ),
            Sequelize.where(
              Sequelize.fn("DATE", Sequelize.col("end_date")),
              ">=",
              todayStr
            ),
          ],
        },
      });

      if (!stillClosed) {
        const [updatedCount] = await ClassesSchedule.update(
          { is_active: true },
          { where: { gyms_id: closure.gyms_id } }
        );
        console.log(
          `  ✅ Reactivated ${updatedCount} schedule(s) for Gym ID: ${closure.gyms_id}`
        );
      }
    }

    // ========================================
    // 3. Log Custom Capacity Configs
    // ========================================
    const capacityConfigs = await ClassesBookingInAdvance.findAll({
      where: {
        is_close_gym: false,
        classes_schedule_id: { [Op.not]: null },
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn("DATE", Sequelize.col("start_date")),
            "<=",
            todayStr
          ),
          Sequelize.where(
            Sequelize.fn("DATE", Sequelize.col("end_date")),
            ">=",
            todayStr
          ),
        ],
      },
      include: [
        {
          model: ClassesSchedule,
          as: "schedule",
          attributes: ["start_time", "end_time", "gym_enum"],
          required: false,
        },
      ],
    });

    if (capacityConfigs.length > 0) {
      console.log(`\n[Job] Active Capacity Configs: ${capacityConfigs.length}`);
      for (const config of capacityConfigs) {
        const scheduleInfo = config.schedule
          ? `${config.schedule.start_time}-${config.schedule.end_time} (${config.schedule.gym_enum})`
          : `Schedule ID: ${config.classes_schedule_id}`;
        console.log(`  📊 ${scheduleInfo} → Capacity: ${config.capacity}`);
      }
    }

    // ========================================
    // 4. Summary
    // ========================================
    console.log("\n===========================================");
    console.log("[Job] Summary:");
    console.log(`  - Gym closures active: ${gymClosures.length}`);
    console.log(`  - Gym closures expired: ${expiredClosures.length}`);
    console.log(`  - Capacity configs active: ${capacityConfigs.length}`);
    console.log("===========================================");
    console.log("[Advanced Schedule Job] Completed Successfully");
    console.log("===========================================\n");
  } catch (error) {
    console.error("[Job Error]:", error);
  }
};

module.exports = { startAdvancedScheduleJob, runAdvancedScheduleJob };
