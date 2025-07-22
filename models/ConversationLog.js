import mongoose from "mongoose";
const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    sender: { type: String, enum: ["ai", "client", "system"], required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const actionSchema = new Schema(
  {
    type: { type: String, required: true }, // e.g., 'booking', 'sms', 'transfer', etc.
    details: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    client: { type: Schema.Types.ObjectId, ref: "Client", required: true },
    callTask: { type: Schema.Types.ObjectId, ref: "CallTask", required: true },
    transcript: [messageSchema],
    actions: [actionSchema],
    status: {
      type: String,
      enum: ["completed", "failed", "transferred", "in_progress"],
      default: "in_progress",
    },
  },
  { timestamps: true }
);

const ConversationLog = mongoose.model("ConversationLog", conversationLogSchema);

// Export using ES module syntax
export default ConversationLog;