const nodemailer = require("nodemailer");

/**
 * ตั้งค่าการเชื่อมต่อกับระบบส่งอีเมล (Email Transport)
 * ใช้ข้อมูลจาก Node Environment (.env)
 */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === "true" || Number(process.env.EMAIL_PORT) === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // ตั้งค่า Timeout เพื่อป้องกันปัญหาค้างเมื่อเชื่อมต่อไม่ได้
  connectionTimeout: 10000, // 10 วินาที
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

/**
 * ฟังก์ชันหลักสำหรับส่งอีเมลยืนยันการจอง
 * @param {string} to - อีเมลผู้รับ
 * @param {string} subject - หัวข้ออีเมล
 * @param {string} html - เนื้อหาอีเมลรูปแบบ HTML
 */
const sendBookingConfirmationEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      html,
    });
    console.log(`[EmailService] ✅ ส่งอีเมลสำเร็จ: ${to}`);
  } catch (err) {
    console.error("[EmailService] ❌ เกิดข้อผิดพลาดในการส่งอีเมล:");
    console.error(`  - จาก: ${process.env.MAIL_FROM}`);
    console.error(`  - ถึง: ${to}`);
    console.error(`  - สาเหตุ: ${err.message}`);
    
    // Throw error เพื่อให้ Service ต้นทางรับทราบและจัดการต่อ (เช่น บันทึกลง Log)
    throw err; 
  }
};

module.exports = { sendBookingConfirmationEmail };
