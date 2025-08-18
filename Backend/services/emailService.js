import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter = null;

// Create email transporter
function createTransporter() {
  try {
    // Check if required environment variables are set
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('⚠️  Email service: SMTP credentials not configured. Email functionality will be disabled.');
      return null;
    }

    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    console.log('✅ Email service initialized successfully');
    return transporter;
  } catch (error) {
    console.error('❌ Email service initialization failed:', error.message);
    return null;
  }
}

// Initialize transporter
const emailTransporter = createTransporter();

// Send email function
export async function sendEmail({ to, subject, text, html }) {
  try {
    if (!emailTransporter) {
      console.log('Email service not available - skipping email send');
      return { success: false, error: 'Email service not configured' };
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      text,
      html,
    };

    const result = await emailTransporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    return { success: false, error: error.message };
  }
}

// Verify email service connection
export async function verifyEmailService() {
  try {
    if (!emailTransporter) {
      return { success: false, error: 'Email service not configured' };
    }

    await emailTransporter.verify();
    console.log('✅ Email service connection verified');
    return { success: true };
  } catch (error) {
    console.error('❌ Email service verification failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Convenience helper to send simple OTP emails
// Supports both positional and object-style arguments for broader compatibility
export async function sendOTP(toOrOptions, maybeOtp, maybeSubject) {
  try {
    let to;
    let otp;
    let subject;

    if (typeof toOrOptions === 'object' && toOrOptions !== null) {
      ({ to, otp, subject } = toOrOptions);
    } else {
      to = toOrOptions;
      otp = maybeOtp;
      subject = maybeSubject;
    }

    if (!to || !otp) {
      return { success: false, error: 'Missing required parameters: to, otp' };
    }

    const finalSubject = subject || `Your verification code: ${otp}`;
    const text = `Your verification code is ${otp}. It expires in 10 minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Your verification code is:</p>
        <div style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${otp}</div>
        <p style="color:#555;">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
      </div>
    `;

    return await sendEmail({ to, subject: finalSubject, text, html });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { sendEmail, verifyEmailService, sendOTP };