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

// Send OTP email function
export async function sendOTP({ to, otp, purpose = 'verification' }) {
  try {
    if (!emailTransporter) {
      console.log('Email service not available - skipping OTP email send');
      return { success: false, error: 'Email service not configured' };
    }

    const subject = `Your OTP for ${purpose}`;
    const text = `Your OTP code is: ${otp}. This code is valid for 10 minutes. Do not share this code with anyone.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">OTP Verification</h2>
        <p>Your OTP code for ${purpose} is:</p>
        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #007bff; letter-spacing: 5px; margin: 0;">${otp}</h1>
        </div>
        <p style="color: #666; font-size: 14px;">
          This code is valid for 10 minutes. Do not share this code with anyone.
        </p>
        <p style="color: #666; font-size: 12px;">
          If you didn't request this code, please ignore this email.
        </p>
      </div>
    `;

    const result = await sendEmail({ to, subject, text, html });
    
    if (result.success) {
      console.log('✅ OTP email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
    } else {
      console.error('❌ Failed to send OTP email:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('❌ Failed to send OTP email:', error.message);
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

export default { sendEmail, sendOTP, verifyEmailService };