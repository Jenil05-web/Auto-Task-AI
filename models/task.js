import { Schema, model } from "mongoose";

const taskSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: "User",
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: "Tenant",
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  time: {
    type: String,
    required: true,
  },
  datetime: {
    type: Date,
  },
  frequency: {
    type: String,
    default: "daily",
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  deadline: {
    type: Date,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },

  // ✅ Email automation fields
  emailFrom: {
    type: String,
    validate: {
      validator: function (email) {
        if (!email) return true;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      },
      message: "Invalid email format for emailFrom",
    },
  },
  emailTo: [
    {
      type: String,
      validate: {
        validator: function (email) {
          if (!email) return true;
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(email);
        },
        message: "Invalid email format in emailTo array",
      },
    },
  ],
  emailSubject: {
    type: String,
    maxlength: 500,
  },
  emailBody: {
    type: String,
    maxlength: 10000,
  },
  // Add a new field to store the complete email configuration for n8n
  emailConfig: {
    type: Schema.Types.Mixed,
    default: null,
  },

  // ✅ NEW: Template system with variables
  template: {
    type: String,
    maxlength: 10000,
  },
  variables: {
    type: Schema.Types.Mixed,
    default: {},
  },

  // ✅ NEW: Version control for templates and configurations
  versionHistory: [
    {
      version: Number,
      timestamp: {
        type: Date,
        default: Date.now,
      },
      template: String,
      variables: Schema.Types.Mixed,
      emailConfig: Schema.Types.Mixed,
      changedBy: Schema.Types.ObjectId,
      changeDescription: String,
    },
  ],

  // ✅ NEW: Conditional logic rules
  conditionalRules: [
    {
      condition: String, // JavaScript expression as string
      action: String, // Action to take if condition is true
      parameters: Schema.Types.Mixed, // Parameters for the action
    },
  ],

  // ✅ Execution history for automation
  executionHistory: [
    {
      executedAt: {
        type: Date,
        default: Date.now,
      },
      status: {
        type: String,
        enum: ["success", "failed", "error"],
        required: true,
      },
      webhookUrl: {
        type: String,
        default: "https://jenil005.app.n8n.cloud/webhook/execute-task",
      },
      manualTrigger: {
        type: Boolean,
        default: false,
      },
      response: {
        type: Schema.Types.Mixed,
      },
      error: {
        type: String,
      },
      logs: {
        type: [String],
      },
      // ✅ NEW: Track which version was executed
      versionUsed: Number,
      // ✅ NEW: Store compiled template after variable substitution
      compiledTemplate: String,
      // ✅ NEW: Store which conditional rules were triggered
      triggeredRules: [Number],
    },
  ],

  // ✅ Feedback/corrections from users
  feedback: [
    {
      userId: { type: Schema.Types.ObjectId, ref: "User" },
      executionId: { type: Schema.Types.ObjectId }, // optional, link to executionHistory
      ruleIndex: { type: Number }, // optional, which rule
      feedback: { type: String }, // user feedback text
      correctionType: {
        type: String,
        enum: ["correction", "anomaly", "suggestion", "other"],
        default: "correction",
      },
      status: {
        type: String,
        enum: ["pending", "reviewed", "applied"],
        default: "pending",
      },
      createdAt: { type: Date, default: Date.now },
    },
  ],

  // ✅ NEW: Confidence score and review flag for human-in-the-loop
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 1,
  },
  needsReview: {
    type: Boolean,
    default: false,
  },
});

const Task = model("Task", taskSchema);

export default Task;
