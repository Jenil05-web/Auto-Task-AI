/**
 * Email Service Fix for auth.js files
 * 
 * If you're getting "emailService.sendOTP is not a function" error,
 * replace your emailService import with one of these patterns:
 */

// SOLUTION 1: Correct import path (most common issue)
// Make sure your import path is correct relative to your auth.js file location

// If your auth.js is in backend/routes/auth.js:
// import emailService from '../services/emailService.js';

// If your auth.js is in routes/auth.js:
// import emailService from '../Backend/services/emailService.js';

// SOLUTION 2: Use absolute path import (if relative path doesn't work)
// import emailService from './Backend/services/emailService.js';

// SOLUTION 3: Named import (alternative approach)
// import { sendOTP } from '../Backend/services/emailService.js';
// Then use: await sendOTP({ to, otp, purpose });

// SOLUTION 4: Dynamic import (if static imports fail)
// const emailService = await import('../Backend/services/emailService.js');
// await emailService.default.sendOTP({ to, otp, purpose });

/**
 * EXAMPLE: Complete resend OTP function
 * Copy this to your auth.js file and adjust the import path
 */

// Adjust this import path based on your file structure
import emailService from '../Backend/services/emailService.js';

export async function resendOTP(req, res) {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }
    
    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP in your database/cache here
    // await storeOTP(email, otp, 10 * 60 * 1000); // 10 minutes expiry
    
    console.log(`Resending OTP to ${email}`);
    
    // Send OTP email - this should work now
    const result = await emailService.sendOTP({
      to: email,
      otp: otp,
      purpose: 'OTP Resend'
    });
    
    if (result.success) {
      console.log('✅ OTP resent successfully');
      res.status(200).json({
        success: true,
        message: 'OTP resent successfully'
      });
    } else {
      console.error('❌ Failed to resend OTP:', result.error);
      res.status(500).json({
        success: false,
        error: 'Failed to resend OTP',
        details: result.error
      });
    }
  } catch (error) {
    console.error('💥 Error in resendOTP:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

/**
 * DEBUGGING: Test your import
 * Add this to your auth.js file temporarily to debug:
 */
/*
console.log('emailService:', emailService);
console.log('emailService.sendOTP:', typeof emailService?.sendOTP);
console.log('Available methods:', Object.keys(emailService || {}));

if (!emailService?.sendOTP) {
  console.error('❌ emailService.sendOTP is not available!');
  console.error('Check your import path and make sure emailService.js exports correctly');
}
*/