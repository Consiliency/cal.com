const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST,
  port: parseInt(process.env.EMAIL_SERVER_PORT, 10),
  secure: process.env.EMAIL_SERVER_PORT === "465", // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_SERVER_USER,
    pass: process.env.EMAIL_SERVER_PASSWORD,
  },
});

const mailOptions = {
  from: "info@frontierstrategies.ai",
  to: "jenner@consiliency.io", // You can change this to any test recipient
  subject: "Nodemailer SMTP Test from info@frontierstrategies.ai",
  text: "This is a test email sent from a local script using the group email as the sender.",
  replyTo: "info@frontierstrategies.ai",
};

transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    return console.error("Error sending email:", error);
  }
  console.log("Email sent:", info.response);
});
