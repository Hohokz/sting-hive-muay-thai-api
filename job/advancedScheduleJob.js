const cron = require("node-cron");
const { Op, Sequelize } = require("sequelize");
const {
  ClassesSchedule,
  ClassesCapacity,
  ClassesBookingInAdvance
} = require("../models/Associations");

/**
 * [CRON JOB] Manages advance schedule configs.
 * - Opens/closes schedules per config (e.g. closing a gym for a holiday)
 * - Adjusts capacity for the configured date range
 */
const startAdvancedScheduleJob = () => {
  // Runs daily at 00:01 to prepare that day's data
  cron.schedule("01 00 * * *", async () => {
    console.log("[AdvancedJob] ⏰ Starting advance-schedule job...");
    await runAdvancedScheduleJob();
  });
};

const runAdvancedScheduleJob = async () => {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  console.log(`[AdvancedJob] 📅 Today: ${todayStr} | Yesterday: ${yesterdayStr}`);

  try {
    // -----------------------------------------------------------------
    // 1. Check configs that take effect "today"
    // -----------------------------------------------------------------

    // Gym closures (is_close_gym = true)
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

    // Per-schedule capacity adjustments
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

    // --- Action: close schedules (is_active = false) ---
    let closedCount = 0;
    for (const closure of activeClosures) {
      const [updated] = await ClassesSchedule.update(
        { is_active: false },
        { where: { gyms_id: closure.gyms_id } }
      );
      if (updated) closedCount += updated;
    }

    // --- Action: apply capacity adjustments ---
    let capUpdatedCount = 0;
    for (const config of activeCapacities) {
      const [updated] = await ClassesCapacity.update(
        { capacity: config.capacity },
        { where: { classes_id: config.classes_schedule_id } }
      );
      if (updated) capUpdatedCount++;
    }

    // -----------------------------------------------------------------
    // 2. Check configs that expired "yesterday" (need to be reverted)
    // -----------------------------------------------------------------

    // Gym closures that just ended
    const expiredClosures = await ClassesBookingInAdvance.findAll({
      where: {
        is_close_gym: true,
        classes_schedule_id: null,
        [Op.and]: [
          Sequelize.where(Sequelize.fn("DATE", Sequelize.col("end_date")), "=", yesterdayStr),
        ],
      },
    });

    // Capacity adjustments that just ended
    const expiredCapacities = await ClassesBookingInAdvance.findAll({
      where: {
        is_close_gym: false,
        classes_schedule_id: { [Op.not]: null },
        // TODO(tech-debt): column name has a typo ("capasity"); renaming needs a migration.
        old_capasity: { [Op.not]: null },
        [Op.and]: [
          Sequelize.where(Sequelize.fn("DATE", Sequelize.col("end_date")), "=", yesterdayStr),
        ],
      },
    });

    // --- Action: reopen schedules ---
    let reopenedCount = 0;
    for (const closure of expiredClosures) {
      // Skip reopening if another closure for this gym is still active
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

    // --- Action: restore the original capacity ---
    let capRevertedCount = 0;
    for (const config of expiredCapacities) {
      // Skip reverting if another config for this schedule is still active
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

    // --- Summary ---
    console.log("[AdvancedJob] 📊 Summary:");
    console.log(`  - 🔴 Closed gyms/schedules (today): ${closedCount}`);
    console.log(`  - ⚖️ Capacity adjustments (today): ${capUpdatedCount}`);
    console.log(`  - 🟢 Reopened gyms (expired): ${reopenedCount}`);
    console.log(`  - 🔄 Capacity reverted (expired): ${capRevertedCount}`);
    console.log("-------------------------------------------\n");

  } catch (error) {
    console.error("[AdvancedJob] ❌ Error:", error);
  }
};

module.exports = { startAdvancedScheduleJob, runAdvancedScheduleJob };
