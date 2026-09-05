const nodemailer = require("nodemailer");

/**
 * Configures the email transport, using values from the environment (.env).
 */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === "true" || Number(process.env.EMAIL_PORT) === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // Timeouts to avoid hanging when the connection can't be established
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

/**
 * Sends a booking confirmation email.
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - Email body (HTML)
 */
const sendBookingConfirmationEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      html,
    });
    console.log(`[EmailService] Sent: ${to}`);
  } catch (err) {
    console.error("[EmailService] Failed to send email:");
    console.error(`  - From: ${process.env.MAIL_FROM}`);
    console.error(`  - To: ${to}`);
    console.error(`  - Reason: ${err.message}`);

    // Re-thrown so the calling service is aware and can react (e.g. log it)
    throw err;
  }
};

module.exports = { sendBookingConfirmationEmail };
