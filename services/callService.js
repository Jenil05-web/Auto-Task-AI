import 'dotenv/config'; // Add this line at the very top
import twilio from "twilio";
import OpenAI from "openai";

class CallService {
  constructor() {
    // Add validation for required environment variables
    if (!process.env.TWILIO_ACCOUNT_SID) {
      throw new Error('TWILIO_ACCOUNT_SID environment variable is required');
    }
    if (!process.env.TWILIO_AUTH_TOKEN) {
      throw new Error('TWILIO_AUTH_TOKEN environment variable is required');
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async initiateCall(clientPhone, callScript, taskId) {
    try {
      const call = await this.twilioClient.calls.create({
        twiml: this.generateTwiML(callScript),
        to: clientPhone,
        from: process.env.TWILIO_PHONE_NUMBER,
        statusCallback: `${process.env.BASE_URL}/webhooks/call-status`,
        statusCallbackEvent: ["initiated", "answered", "completed"],
        statusCallbackMethod: "POST",
      });

      return {
        callSid: call.sid,
        status: "initiated",
        taskId: taskId,
      };
    } catch (error) {
      throw new Error(`Call initiation failed: ${error.message}`);
    }
  }

  generateTwiML(script) {
    return `
      <Response>
        <Say voice="alice">${script.greeting}</Say>
        <Gather input="speech" action="/webhooks/voice-response" method="POST" timeout="5">
          <Say voice="alice">${script.mainMessage}</Say>
        </Gather>
        <Say voice="alice">${script.closingMessage}</Say>
      </Response>
    `;
  }

  async handleVoiceResponse(speechResult, conversationContext) {
    const prompt = `
    You are an AI making an automated call.

    Context: ${JSON.stringify(conversationContext)}
    User said: "${speechResult}"

    Respond naturally and appropriately. Keep it brief and professional.
    `;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    return response.choices[0].message.content;
  }
}

// Export the class instead of an instance
export default CallService