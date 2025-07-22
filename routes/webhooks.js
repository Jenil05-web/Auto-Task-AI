import express from "express";
const router = express.Router();
import CallLog from "../models/CallLog.js";
import CallService from "../services/callService.js";

// Twilio call status webhook
router.post("/call-status", async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration, To, From } = req.body;

    // Log call status
    const callLog = new CallLog({
      callSid: CallSid,
      status: CallStatus,
      duration: CallDuration || 0,
      clientPhone: To,
      fromPhone: From,
      timestamp: new Date(),
    });

    await callLog.save();

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Error");
  }
});

// Voice response webhook
router.post("/voice-response", async (req, res) => {
  try {
    const { SpeechResult, CallSid } = req.body;

    // Process speech and generate AI response
    const aiResponse = await CallService.handleVoiceResponse(SpeechResult, {
      callSid: CallSid,
    });

    const twiml = `
      <Response>
        <Say voice="alice">${aiResponse}</Say>
        <Hangup/>
      </Response>
    `;

    res.type("text/xml");
    res.send(twiml);
  } catch (error) {
    console.error("Voice response error:", error);
    res.status(500).send("Error");
  }
});

export default router;
