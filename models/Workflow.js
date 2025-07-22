import mongoose from "mongoose";

const stepSchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // 'trigger', 'action', 'condition'
    config: { type: mongoose.Schema.Types.Mixed, required: true }, // step-specific config
  },
  { _id: false }
);

const workflowSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tenant",
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: "",
  },
  steps: [stepSchema],
  schedule: {
    type: String, // e.g. cron expression or 'daily', 'weekly', etc.
    default: "",
  },
  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Workflow = mongoose.model("Workflow", workflowSchema);
export default Workflow;
