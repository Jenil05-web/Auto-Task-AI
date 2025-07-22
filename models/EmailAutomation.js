import mongoose from "mongoose";

const EmailAutomationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  recipients: [{ type: String, required: true }],
  subject: { type: String, required: true },
  body: { type: String, required: true },
  schedule: { type: String, required: true }, // e.g., 'daily', 'weekly', 'custom'
  createdAt: { type: Date, default: Date.now },
});

const EmailAutomation = mongoose.model(
  "EmailAutomation",
  EmailAutomationSchema
);
export default EmailAutomation;
