const cron = require("node-cron");
const { Op } = require("sequelize");
const { google } = require("googleapis");
const {
  ClassesBooking,
  ClassesBookingInAdvance,
  ClassesSchedule,
  Gyms,
} = require("../models/Associations");
const { BOOKING_STATUS } = require("../models/Enums");

/**
 * [CRON JOB] Monthly data archival.
 * - Runs on the 1st of each month at 01:00
 * - Exports last month's bookings to Google Sheets as a backup
 * - Clears advance configs old enough that they're no longer needed
 */
const startMonthlyArchivalJob = () => {
  cron.schedule("0 1 1 * *", async () => {
    console.log("[ArchivalJob] ⏰ Starting monthly archival job...");
    await runMonthlyArchivalJob();
  });
};

const runMonthlyArchivalJob = async () => {
  try {
    // 1. Compute the previous month's range
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPreviousMonth = new Date(startOfCurrentMonth.getTime() - 1);

    const prevMonthLabel = startOfPreviousMonth.toLocaleString("default", {
      month: "short",
      year: "numeric",
    });

    console.log(`[ArchivalJob] 📅 Processing month: ${prevMonthLabel}`);

    // 2. Fetch last month's succeeded bookings
    const bookings = await ClassesBooking.findAll({
      where: {
        date_booking: {
          [Op.between]: [startOfPreviousMonth, endOfPreviousMonth],
        },
        booking_status: BOOKING_STATUS.SUCCEED,
      },
      include: [
        {
          model: ClassesSchedule,
          as: "schedule",
          attributes: ["start_time", "end_time", "gym_enum"],
        },
        {
          model: Gyms,
          as: "gyms",
          attributes: ["gym_name"],
        },
      ],
      order: [["date_booking", "ASC"], ["id", "ASC"]],
    });

    console.log(`[ArchivalJob] 🔍 Bookings to archive: ${bookings.length}`);

    if (bookings.length > 0) {
      // 3. Export to Google Sheets
      await exportToGoogleSheets(bookings, prevMonthLabel);
    }

    // 4. Clear advance configs that are old enough (keep roughly 1-2 months)
    const cleanupDate = startOfPreviousMonth;

    console.log(`[ArchivalJob] 🧹 Deleting configs ending before ${cleanupDate.toDateString()}...`);

    const deletedCount = await ClassesBookingInAdvance.destroy({
      where: {
        end_date: { [Op.lt]: cleanupDate },
      },
    });

    console.log(`[ArchivalJob] ✅ Deleted: ${deletedCount}`);
    console.log("[ArchivalJob] 🏁 Monthly job complete\n");

  } catch (error) {
    console.error("[ArchivalJob] ❌ Error:", error);
  }
};

/**
 * Exports bookings to Google Sheets.
 */
const exportToGoogleSheets = async (bookings, sheetTitle) => {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const folderId = process.env.GOOGLE_ARCHIVE_FOLDER_ID;

  if (!clientEmail || !privateKey) {
    console.error("[GoogleExport] ❌ Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");
    return;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  try {
    // A. Create the spreadsheet
    const resource = {
      properties: { title: `StingHive Bookings - ${sheetTitle}` },
    };

    const spreadsheet = await sheets.spreadsheets.create({
      resource,
      fields: "spreadsheetId,spreadsheetUrl",
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    console.log(`[GoogleExport] 📄 Created: ${spreadsheet.data.spreadsheetUrl}`);

    // B. Move it into the archive folder, if configured
    if (folderId) {
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: folderId,
        fields: "id, parents",
      });
      console.log(`[GoogleExport] 📁 Moved into folder: ${folderId}`);
    }

    // C. Prepare the header row and data rows.
    // Header labels are kept in Thai deliberately — this sheet is read by
    // Thai-speaking gym staff, not a developer-facing artifact.
    const headerRow = [
      "ID", "วันที่จอง", "ช่วงเวลา", "ประเภท", "สาขา", "ชื่อลูกค้า", "อีเมล", "เบอร์โทร", "จำนวน", "สถานะ"
    ];

    const rows = bookings.map((b) => {
      const dateStr = b.date_booking.toISOString().split("T")[0];
      const timeSlot = b.schedule ? `${b.schedule.start_time} - ${b.schedule.end_time}` : "-";
      return [
        b.id, dateStr, timeSlot, b.is_private ? "Private" : "Group",
        b.gyms?.gym_name || "-", b.client_name, b.client_email,
        b.client_phone || "-", b.capacity, b.booking_status,
      ];
    });

    const values = [headerRow, ...rows];

    // D. Write the data into the sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Sheet1!A1",
      valueInputOption: "RAW",
      resource: { values },
    });

    console.log(`[GoogleExport] ✅ Wrote ${rows.length} rows`);
  } catch (err) {
    console.error("[GoogleExport] ❌ Error:", err);
  }
};

module.exports = { startMonthlyArchivalJob, runMonthlyArchivalJob };
