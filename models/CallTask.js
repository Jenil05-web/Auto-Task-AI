import mongoose from "mongoose";

const callTaskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true },
    naturalLanguageInput: { type: String, required: true },
    parsedIntent: {
      action: String,
      frequency: String,
      time: String,
      clients: [String],
      purpose: String,
    },
    schedule: {
      frequency: {
        type: String,
        enum: ["once", "daily", "weekly", "monthly"],
        required: true,
      },
      time: { type: String, required: true }, // HH:MM format
      daysOfWeek: [{ type: Number, min: 0, max: 6 }], // 0 = Sunday
      timezone: String,
    },
    callScript: {
      greeting: String,
      mainMessage: String,
      questions: [String],
      closingMessage: String,
    },
    isActive: { type: Boolean, default: true },
    nextExecutionTime: Date,
  },
  { timestamps: true }
);

const CallTask = mongoose.model("CallTask", callTaskSchema);
export default CallTask;
