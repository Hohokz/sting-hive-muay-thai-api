/**
 * Adds classes_booking.private_trainers — how many trainers a private booking
 * takes. A private slot's seats are standby trainers, so a private booking uses
 * private_trainers seats; NULL (every booking made before this) keeps the old
 * rule of using `capacity` seats, so past private slots still look as full as
 * they did.
 *
 * The project has no migration runner (config/db.js never alters tables), so
 * this runs by hand:
 *
 *   node scripts/migrations/add-private-trainers.js check   # read-only
 *   node scripts/migrations/add-private-trainers.js up
 *   node scripts/migrations/add-private-trainers.js down    # drops the column and its data
 *
 * Safe to re-run. Adding a nullable column with no default is metadata-only in
 * Postgres (no table rewrite). `up` runs in one REPEATABLE READ transaction and
 * compares a checksum of every existing row before/after the ALTER inside the
 * same snapshot, rolling back if anything but the new column changed.
 */
require("dotenv").config();
const { sequelize } = require("../../config/db");

const TABLE = "classes_booking";
const COLUMN = "private_trainers";

// Waits at most this long for the table lock instead of queueing behind (and
// blocking) live bookings; just re-run if it times out
const LOCK_TIMEOUT = "5s";

const columnExists = async (transaction) => {
  const [rows] = await sequelize.query(
    `SELECT data_type, is_nullable FROM information_schema.columns
     WHERE table_name = :table AND column_name = :column`,
    { replacements: { table: TABLE, column: COLUMN }, transaction },
  );
  return rows[0] || null;
};

// Row count + checksum of every row with the new column left out, so the
// before/after values match only if no existing data changed
const snapshot = async (transaction) => {
  const [[row]] = await sequelize.query(
    `SELECT count(*)::int AS rows,
            md5(coalesce(string_agg((to_jsonb(t) - '${COLUMN}')::text, '|' ORDER BY t.id), '')) AS checksum
     FROM ${TABLE} t`,
    { transaction },
  );
  return row;
};

const check = async () => {
  const col = await columnExists();
  const snap = await snapshot();
  console.log(`column ${COLUMN}:`, col ? `exists (${col.data_type}, nullable=${col.is_nullable})` : "missing");
  console.log(`${TABLE}: ${snap.rows} rows, checksum ${snap.checksum}`);
  if (col) {
    const [[counts]] = await sequelize.query(
      `SELECT count(${COLUMN})::int AS filled FROM ${TABLE}`,
    );
    console.log(`rows with ${COLUMN} set: ${counts.filled}`);
  }
};

const up = async () => {
  await sequelize.transaction(
    { isolationLevel: "REPEATABLE READ" },
    async (transaction) => {
      if (await columnExists(transaction)) {
        console.log(`column ${COLUMN} already exists — nothing to do`);
        return;
      }

      const before = await snapshot(transaction);
      console.log(`before: ${before.rows} rows, checksum ${before.checksum}`);

      await sequelize.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`, { transaction });
      await sequelize.query(`ALTER TABLE ${TABLE} ADD COLUMN ${COLUMN} INTEGER`, { transaction });

      const after = await snapshot(transaction);
      console.log(`after:  ${after.rows} rows, checksum ${after.checksum}`);

      if (before.rows !== after.rows || before.checksum !== after.checksum) {
        throw new Error("existing rows changed during ALTER — rolled back");
      }
      console.log(`✅ added ${TABLE}.${COLUMN}; existing rows unchanged`);
    },
  );
};

const down = async () => {
  await sequelize.transaction(async (transaction) => {
    await sequelize.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`, { transaction });
    await sequelize.query(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS ${COLUMN}`, { transaction });
  });
  console.log(`✅ dropped ${TABLE}.${COLUMN} (if it existed)`);
};

const commands = { check, up, down };

const main = async () => {
  const command = commands[process.argv[2]];
  if (!command) {
    console.error("usage: node scripts/migrations/add-private-trainers.js check|up|down");
    process.exitCode = 1;
    return;
  }
  try {
    await sequelize.authenticate();
    await command();
  } catch (error) {
    console.error("❌", error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

main();
