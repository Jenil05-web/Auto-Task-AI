import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    callSid: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
    status: { type: String },
    duration: { type: Number },
    startedAt: { type: Date },
    endedAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

const CallLog = mongoose.model("CallLog", callLogSchema);
export default CallLog;
