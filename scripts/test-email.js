require('dotenv').config();
const nodemailer = require('nodemailer');

async function testConnection() {
    console.log("--- Testing Email Connection ---");
    console.log("EMAIL_HOST:", process.env.EMAIL_HOST);
    console.log("EMAIL_PORT:", process.env.EMAIL_PORT);
    console.log("EMAIL_USER:", process.env.EMAIL_USER);
    console.log("EMAIL_SECURE:", process.env.EMAIL_SECURE);
    console.log("MAIL_FROM:", process.env.MAIL_FROM);
    
    const secure = process.env.EMAIL_SECURE === "true" || Number(process.env.EMAIL_PORT) === 465;
    console.log("Effective Secure Setting:", secure);

    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT),
        secure: secure,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        connectionTimeout: 10000,
    });

    try {
        console.log("Starting verification...");
        await transporter.verify();
        console.log("✅ Connection SUCCESS: SMTP server is reachable and credentials are valid.");

        const recipient = process.argv[2];
        if (recipient) {
            console.log(`Sending test email to: ${recipient}...`);
            const info = await transporter.sendMail({
                from: process.env.MAIL_FROM || 'test@example.com',
                to: recipient,
                subject: 'Sting Gym — SMTP Test Email 🥊',
                text: 'This is a test email to verify SMTP configuration.',
                html: '<b>This is a test email to verify SMTP configuration. 🥊</b>'
            });
            console.log("✅ Email sent successfully!");
            console.log("Message ID:", info.messageId);
        }
    } catch (error) {
        console.error("❌ Connection FAILED:");
        console.error("Error Code:", error.code);
        console.error("Command:", error.command);
        console.error("Message:", error.message);
        
        if (error.code === 'ETIMEDOUT') {
            console.log("\nTIP: Port " + process.env.EMAIL_PORT + " might be blocked by your provider (Render blocks port 25). Try port 587 or 465.");
        }
    }
}

testConnection();
