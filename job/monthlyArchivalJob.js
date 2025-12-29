const cron = require("node-cron");
const { Op, Sequelize } = require("sequelize");
const { google } = require("googleapis");
const {
  ClassesBooking,
  ClassesBookingInAdvance,
  ClassesSchedule,
  Gyms,
} = require("../models/Associations");

/**
 * Monthly Archival Job
 * - Runs on the 1st of every month at 01:00 AM
 * - Exports previous month's bookings to Google Sheets
 * - Deletes old ClassesBookingInAdvance records
 */
const startMonthlyArchivalJob = () => {
  // 0 1 1 * * = At 01:00 on day-of-month 1.
  cron.schedule("0 1 1 * *", async () => {
    await runMonthlyArchivalJob();
  });
};

const runMonthlyArchivalJob = async () => {
  console.log("===========================================");
  console.log("[Monthly Archival Job] STARTING...");
  console.log("===========================================");

  try {
    // 1. Calculate Date Range (Previous Month)
    const now = new Date();
    // Start of CURRENT month
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    // Start of PREVIOUS month
    const startOfPreviousMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    );
    // End of PREVIOUS month (Last ms before start of current month)
    const endOfPreviousMonth = new Date(startOfCurrentMonth.getTime() - 1);

    const prevMonthName = startOfPreviousMonth.toLocaleString("default", {
      month: "short",
      year: "numeric",
    });
    console.log(`[Job] Processing Month: ${prevMonthName}`);
    console.log(
      `      Range: ${startOfPreviousMonth.toISOString()} to ${endOfPreviousMonth.toISOString()}`
    );

    // 2. Fetch Bookings
    const bookings = await ClassesBooking.findAll({
      where: {
        date_booking: {
          [Op.between]: [startOfPreviousMonth, endOfPreviousMonth],
        },
        booking_status: "SUCCEED", // Only export successful bookings? Or all? Usually SUCCEED.
      },
      include: [
        {
          model: ClassesSchedule,
          as: "schedule",
          attributes: ["start_time", "end_time", "gym_enum"],
        },
        // If User model is linked, include it here.
        // Based on Associations.js, User-Booking link is commented out or implicit via client_name/email fields in Booking
        {
          model: Gyms,
          as: "gyms",
          attributes: ["gym_name"],
        },
      ],
      order: [
        ["date_booking", "ASC"],
        ["id", "ASC"],
      ],
    });

    console.log(`[Job] Found ${bookings.length} succeessful bookings.`);

    if (bookings.length > 0) {
      // 3. Export to Google Sheets
      await exportToGoogleSheets(bookings, prevMonthName);
    } else {
      console.log("[Job] No bookings to export.");
    }

    // 4. Cleanup Advance Configs (Old records)
    // Delete records where end_date < Start of PREVIOUS month (Keep last month's history? Or delete older?)
    // User request: "delete record out in schedule in advance"
    // Usually we keep history for audit, but let's delete anything older than Start of Current Month

    // Safety check: Delete configs ended before the START of the PREVIOUS month?
    // Or just clean up EVERYTHING older than TODAY/Current Month?
    // Let's safe side: Delete configs that ended before the start of the previous month.
    // (So we always keep ~1-2 months of history/active configs).

    const cleanupDate = startOfPreviousMonth; // Delete anything ended before previous month started

    console.log(
      `[Job] Cleaning up Advance Configs ended before ${cleanupDate.toISOString()}...`
    );

    const deletedCount = await ClassesBookingInAdvance.destroy({
      where: {
        end_date: { [Op.lt]: cleanupDate },
      },
    });

    console.log(`[Job] Cleanup complete. Deleted ${deletedCount} records.`);

    console.log("===========================================");
    console.log("[Monthly Archival Job] COMPLETED");
    console.log("===========================================\n");
  } catch (error) {
    console.error("[Job Error]:", error);
  }
};

const exportToGoogleSheets = async (bookings, sheetTitle) => {
  // Credentials from ENV
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Handle private key newlines
  const privateKey = process.env.GOOGLE_PRIVATE_KEY
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined;
  // Destination Folder ID (Optional, defaults to root)
  const folderId = process.env.GOOGLE_ARCHIVE_FOLDER_ID;

  if (!clientEmail || !privateKey) {
    console.error(
      "❌ [Google Auth] Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY"
    );
    return;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  try {
    // A. Create New Spreadsheet
    const resource = {
      properties: {
        title: `StingHive Bookings - ${sheetTitle}`,
      },
      // If folderId is provided, we can move it later or specify parents if using Drive API create
    };

    // Note: sheets.spreadsheets.create doesn't support 'parents' directly.
    // We create it, then move it, OR use Drive API to create metadata first.
    // Simpler: Create Sheet -> Get ID -> Move using Drive API.

    const spreadsheet = await sheets.spreadsheets.create({
      resource,
      fields: "spreadsheetId,spreadsheetUrl",
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    console.log(
      `[Google] Created Spreadsheet: ${spreadsheet.data.spreadsheetUrl}`
    );

    // B. Move to Folder (Optional)
    if (folderId) {
      // Find existing parents (usually 'root') to remove
      // Actually, just adding the new parent is enough for Drive API v3
      // But 'addParents' is the way.
      // Wait, 'create' puts it in root.
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: folderId,
        fields: "id, parents",
      });
      console.log(`[Google] Moved to Folder ID: ${folderId}`);
    }

    // C. Prepare Data
    const headerRow = [
      "Booking ID",
      "Booking Date",
      "Time Slot",
      "Class Type",
      "Gym",
      "Client Name",
      "Email",
      "Phone",
      "Capacity",
      "Status",
    ];

    const rows = bookings.map((b) => {
      const dateStr = b.date_booking.toISOString().split("T")[0];
      const timeSlot = b.schedule
        ? `${b.schedule.start_time} - ${b.schedule.end_time}`
        : "Unknown";
      const classType = b.is_private ? "Private" : "Group";
      const gymName = b.gyms ? b.gyms.gym_name : "Unknown";

      return [
        b.id,
        dateStr,
        timeSlot,
        classType,
        gymName,
        b.client_name,
        b.client_email,
        b.client_phone || "",
        b.capacity,
        b.booking_status,
      ];
    });

    const values = [headerRow, ...rows];

    // D. Write Data
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Sheet1!A1",
      valueInputOption: "RAW",
      resource: { values },
    });

    console.log(`[Google] Successfully exported ${rows.length} rows.`);
  } catch (err) {
    console.error("[Google Export Error]", err);
  }
};

module.exports = { startMonthlyArchivalJob, runMonthlyArchivalJob };
