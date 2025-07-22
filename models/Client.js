import mongoose from "mongoose";

const clientSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: String,
    tags: [String],
    notes: String,
    preferences: {
      bestTimeToCall: String,
      doNotCallTimes: [String],
      language: { type: String, default: "en-US" },
    },
    lastCalled: Date,
    callHistory: [
      {
        taskId: { type: mongoose.Schema.Types.ObjectId, ref: "CallTask" },
        calledAt: Date,
        duration: Number,
        status: {
          type: String,
          enum: ["completed", "no-answer", "busy", "failed"],
        },
        summary: String,
      },
    ],
  },
  { timestamps: true }
);

const Client = mongoose.model("Client", clientSchema);
export default Client;
