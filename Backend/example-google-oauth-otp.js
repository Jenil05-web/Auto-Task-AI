// Example implementation of Google OAuth with OTP verification
import emailService from './services/emailService.js';

// Function to generate a 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Example Google OAuth route with OTP (this would go in your auth routes)
export async function handleGoogleOAuthWithOTP(req, res) {
  try {
    // This would be called after successful Google OAuth
    const { email, name, googleId } = req.user; // From Google OAuth callback
    
    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP in database or cache (with expiration)
    // For example, using Redis or temporary storage
    // await storeOTP(email, otp, 10 * 60 * 1000); // 10 minutes expiry
    
    // Send OTP email
    console.log(`Sending OTP to ${email} for Google OAuth verification`);
    const emailResult = await emailService.sendOTP({
      to: email,
      otp: otp,
      purpose: 'Google OAuth verification'
    });
    
    if (emailResult.success) {
      console.log('✅ OTP email sent successfully');
      res.status(200).json({
        success: true,
        message: 'OTP sent to your email. Please verify to complete authentication.',
        email: email,
        // Don't send the actual OTP in the response for security
      });
    } else {
      console.error('❌ Failed to send OTP email:', emailResult.error);
      res.status(500).json({
        success: false,
        error: 'Failed to send OTP email',
        details: emailResult.error
      });
    }
  } catch (error) {
    console.error('Error in Google OAuth OTP flow:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

// Example OTP verification route
export async function verifyOTP(req, res) {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Email and OTP are required'
      });
    }
    
    // Verify OTP from database/cache
    // const storedOTP = await getStoredOTP(email);
    // const isValidOTP = storedOTP && storedOTP === otp && !isExpired(email);
    
    // For demo purposes, let's assume OTP is valid
    // In real implementation, you'd check against stored OTP
    
    console.log(`Verifying OTP ${otp} for email ${email}`);
    
    // If OTP is valid, complete the authentication
    // Generate JWT token, create user session, etc.
    
    res.status(200).json({
      success: true,
      message: 'OTP verified successfully. Authentication complete.',
      // Include JWT token or redirect URL
    });
    
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

// Example usage in your existing auth routes:
/*
// In your authRoutes.js or similar file:

import { handleGoogleOAuthWithOTP, verifyOTP } from './example-google-oauth-otp.js';

// Google OAuth callback route (modify your existing one)
router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  handleGoogleOAuthWithOTP  // Add OTP step instead of direct redirect
);

// OTP verification route
router.post("/auth/verify-otp", verifyOTP);
*/