const {
  ClassesSchedule,
  ClassesBookingInAdvance,
  sequelize,
} = require("./models/Associations");
const { Op, Sequelize } = require("sequelize");

const restoreState = async () => {
  console.log("===========================================");
  console.log("[Restore State] STARTING...");
  console.log("===========================================");

  try {
    // 1. Delete the test Gym Closure record
    // Assumes the test record was for Gym 2 and today
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    console.log(`[Restore] Removing closure for Gym 2 on ${todayStr}...`);

    const deleteCount = await ClassesBookingInAdvance.destroy({
      where: {
        gyms_id: 2,
        is_close_gym: true,
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn("DATE", Sequelize.col("start_date")),
            "=",
            todayStr
          ),
          Sequelize.where(
            Sequelize.fn("DATE", Sequelize.col("end_date")),
            "=",
            todayStr
          ),
        ],
      },
    });

    console.log(`[Restore] Deleted ${deleteCount} test records.`);

    // 2. Reactivate Schedules for Gym 2
    console.log(`[Restore] Reactivating schedules for Gym 2...`);

    const [updatedCount] = await ClassesSchedule.update(
      { is_active: true },
      { where: { gyms_id: 2 } }
    );

    console.log(`[Restore] Reactivated ${updatedCount} schedules.`);
    console.log("===========================================");
    console.log("[Restore State] COMPLETED");
    console.log("===========================================");

    process.exit(0);
  } catch (error) {
    console.error("[Restore Error]:", error);
    process.exit(1);
  }
};

restoreState();
