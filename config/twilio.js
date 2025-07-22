import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(`Missing required Twilio environment variables: ${missingVars.join(', ')}`);
}

// Initialize Twilio client
export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Configuration object
export const twilioConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  
  // Webhook URLs
  webhookUrl: `${process.env.BASE_URL}/webhooks`,
  statusCallback: `${process.env.BASE_URL}/webhooks/call-status`,
  voiceUrl: `${process.env.BASE_URL}/webhooks/voice-response`,
  
  // Call settings
  defaultVoice: process.env.DEFAULT_VOICE_GENDER || 'female',
  defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en-US',
  maxCallDuration: 600, // 10 minutes
  maxRetries: 3,
  retryDelay: 300000, // 5 minutes in milliseconds
  
  // Voice options mapping
  voices: {
    male: 'man',
    female: 'woman',
    alice: 'alice', // Twilio's premium voice
    polly: 'Polly.Joanna' // AWS Polly integration
  },
  
  // Supported languages
  supportedLanguages: [
    'en-US', 'en-GB', 'en-AU',
    'es-ES', 'es-MX', 'fr-FR',
    'de-DE', 'it-IT', 'pt-BR',
    'ja-JP', 'ko-KR', 'zh-CN'
  ]
};

// Helper function to validate phone number
export const validatePhoneNumber = (phoneNumber) => {
  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Check if it's a valid US number (10 digits) or international (7-15 digits)
  if (cleaned.length === 10) {
    return `+1${cleaned}`; // Add US country code
  } else if (cleaned.length >= 7 && cleaned.length <= 15) {
    return `+${cleaned}`;
  }
  
  throw new Error(`Invalid phone number format: ${phoneNumber}`);
};

// Helper function to generate TwiML
export const generateTwiML = (script, options = {}) => {
  const voice = options.voice || twilioConfig.defaultVoice;
  const language = options.language || twilioConfig.defaultLanguage;
  
  return `
    <Response>
      <Say voice="${voice}" language="${language}">${script.greeting}</Say>
      <Gather 
        input="speech" 
        action="${twilioConfig.voiceUrl}" 
        method="POST" 
        timeout="5"
        speechTimeout="3"
        language="${language}">
        <Say voice="${voice}" language="${language}">${script.mainMessage}</Say>
      </Gather>
      <Say voice="${voice}" language="${language}">${script.closingMessage}</Say>
    </Response>
  `.trim();
};

// Test Twilio connection
export const testTwilioConnection = async () => {
  try {
    const account = await twilioClient.api.accounts(twilioConfig.accountSid).fetch();
    console.log('✅ Twilio connection successful');
    console.log(`Account SID: ${account.sid}`);
    console.log(`Account Status: ${account.status}`);
    return true;
  } catch (error) {
    console.error('❌ Twilio connection failed:', error.message);
    return false;
  }
};

export default {
  twilioClient,
  twilioConfig,
  validatePhoneNumber,
  generateTwiML,
  testTwilioConnection
};