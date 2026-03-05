const cron = require("node-cron");
const { Op } = require("sequelize");
const { google } = require("googleapis");
const {
  ClassesBooking,
  ClassesBookingInAdvance,
  ClassesSchedule,
  Gyms,
} = require("../models/Associations");

/**
 * [CRON JOB] ระบบจัดการข้อมูลประจำเดือน
 * - ทำงานทุกวันที่ 1 ของเดือน เวลา 01:00 น.
 * - ส่งออกข้อมูลการจองของเดือนที่แล้วไปยัง Google Sheets เพื่อสำรองข้อมูล
 * - ล้างข้อมูลการตั้งค่าล่วงหน้าที่เก่าเกินไปออกเพื่อประหยัดพื้นที่
 */
const startMonthlyArchivalJob = () => {
  cron.schedule("0 1 1 * *", async () => {
    console.log("[ArchivalJob] ⏰ เริ่มงานสำรองข้อมูลประจำเดือน...");
    await runMonthlyArchivalJob();
  });
};

const runMonthlyArchivalJob = async () => {
  try {
    // 1. คำนวณช่วงเวลา (เดือนที่แล้ว)
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPreviousMonth = new Date(startOfCurrentMonth.getTime() - 1);

    const prevMonthLabel = startOfPreviousMonth.toLocaleString("default", {
      month: "short",
      year: "numeric",
    });

    console.log(`[ArchivalJob] 📅 กำลังจัดการข้อมูลเดือน: ${prevMonthLabel}`);

    // 2. ดึงข้อมูลการจองที่สำเร็จแล้วของเดือนที่แล้ว
    const bookings = await ClassesBooking.findAll({
      where: {
        date_booking: {
          [Op.between]: [startOfPreviousMonth, endOfPreviousMonth],
        },
        booking_status: "SUCCEED",
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

    console.log(`[ArchivalJob] 🔍 พบรายการจองที่ต้องสำรอง: ${bookings.length} รายการ`);

    if (bookings.length > 0) {
      // 3. ส่งออกไปยัง Google Sheets
      await exportToGoogleSheets(bookings, prevMonthLabel);
    }

    // 4. ล้างข้อมูล Advance Configs ที่เก่าเกินไป
    // (ลบข้อมูลที่สิ้นสุดก่อนวันที่เริ่มเดือนที่แล้ว - เก็บไว้ประมาณ 1-2 เดือน)
    const cleanupDate = startOfPreviousMonth;

    console.log(`[ArchivalJob] 🧹 กำลังลบ Config เก่าที่สิ้นสุดก่อน ${cleanupDate.toDateString()}...`);

    const deletedCount = await ClassesBookingInAdvance.destroy({
      where: {
        end_date: { [Op.lt]: cleanupDate },
      },
    });

    console.log(`[ArchivalJob] ✅ ลบเรียบร้อย: ${deletedCount} รายการ`);
    console.log("[ArchivalJob] 🏁 เสร็จสิ้นภารกิจประจำเดือน\n");

  } catch (error) {
    console.error("[ArchivalJob] ❌ เกิดข้อผิดพลาด:", error);
  }
};

/**
 * ฟังก์ชันส่งออกข้อมูลไปยัง Google Sheets
 */
const exportToGoogleSheets = async (bookings, sheetTitle) => {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const folderId = process.env.GOOGLE_ARCHIVE_FOLDER_ID;

  if (!clientEmail || !privateKey) {
    console.error("[GoogleExport] ❌ ขาด GOOGLE_SERVICE_ACCOUNT_EMAIL หรือ GOOGLE_PRIVATE_KEY");
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
    // A. สร้าง Spreadsheet ใหม่
    const resource = {
      properties: { title: `StingHive Bookings - ${sheetTitle}` },
    };

    const spreadsheet = await sheets.spreadsheets.create({
      resource,
      fields: "spreadsheetId,spreadsheetUrl",
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    console.log(`[GoogleExport] 📄 สร้างไฟล์สำเร็จ: ${spreadsheet.data.spreadsheetUrl}`);

    // B. ย้ายไฟล์เข้า Folder (ถ้ากำหนดไว้)
    if (folderId) {
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: folderId,
        fields: "id, parents",
      });
      console.log(`[GoogleExport] 📁 ย้ายเข้า Folder ID: ${folderId}`);
    }

    // C. เตรียมข้อมูล (Headers & Rows)
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

    // D. บันทึกข้อมูลลงใน Sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Sheet1!A1",
      valueInputOption: "RAW",
      resource: { values },
    });

    console.log(`[GoogleExport] ✅ เขียนข้อมูลลงไฟล์สำเร็จ ${rows.length} แถว`);
  } catch (err) {
    console.error("[GoogleExport] ❌ Error:", err);
  }
};

module.exports = { startMonthlyArchivalJob, runMonthlyArchivalJob };
