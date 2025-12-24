const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === "true" || Number(process.env.EMAIL_PORT) === 465, // True for 465, false for 587/25
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // Add timeout settings to catch connection issues early
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

const sendBookingConfirmationEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      html,
    });
    console.log("✅ Email sent successfully to:", to);
  } catch (err) {
    console.error("❌ Email transport error:");
    console.error("  From:", process.env.MAIL_FROM);
    console.error("  To:", to);
    console.error("  Error message:", err.message);
    console.error("  Full error:", err);
    throw err; // Rethrow to let the service know it failed
  }
};

module.exports = { sendBookingConfirmationEmail };
