const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER, // เช่น yourmail@gmail.com
    pass: process.env.MAIL_PASS  // App Password เท่านั้น!
  }
});

const sendBookingConfirmationEmail = async (to, subject, html) => {
  await transporter.sendMail({
    from: `"Sting Gym" <${process.env.MAIL_USER}>`,
    to,
    subject,
    html,
  });
};

module.exports = { sendBookingConfirmationEmail };
