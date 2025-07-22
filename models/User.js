import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    default: "",
    trim: true,
  },
  company: {
    type: String,
    default: "",
    trim: true,
  },
  avatar: {
    type: String,
    default: "",
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tenant",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  role: {
    type: String,
    enum: ["admin", "member"],
    default: "member",
  },

  // ✅ Enhanced Multi-Gmail OAuth config
  gmailAccounts: [
    {
      email: { type: String, required: true },
      accessToken: { type: String },
      refreshToken: { type: String },
      expiryDate: { type: Number },
      clientId: { type: String },
      clientSecret: { type: String },
      isActive: { type: Boolean, default: true },
      addedAt: { type: Date, default: Date.now },
      displayName: { type: String }, // For dropdown display
      isDefault: { type: Boolean, default: false }, // Primary account
    },
  ],

  // ✅ Primary Gmail (backward compatibility)
  gmail: {
    accessToken: { type: String },
    refreshToken: { type: String },
    expiryDate: { type: Number },
    email: { type: String },
    clientId: { type: String },
    clientSecret: { type: String },
  },

  // ✅ AI Learning preferences
  aiPreferences: {
    learningEnabled: { type: Boolean, default: true },
    autoSuggestTemplates: { type: Boolean, default: true },
    adaptiveScheduling: { type: Boolean, default: true },
    personalizedInsights: { type: Boolean, default: true },
    taskPatternAnalysis: { type: Boolean, default: true },
  },

  // ✅ Email automation preferences
  emailPreferences: {
    defaultSignature: { type: String, default: "" },
    defaultSubjectFormat: {
      type: String,
      default: "[AutoTask-AI] {{subject}}",
    },
    timezone: { type: String, default: "UTC" },
    preferredSendTime: { type: String, default: "09:00" },
    batchEmailLimit: { type: Number, default: 50 },
    useReadableFormat: { type: Boolean, default: true },
  },

  // ✅ User activity tracking for ML learning
  activityLog: [
    {
      action: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      details: { type: mongoose.Schema.Types.Mixed },
      category: {
        type: String,
        enum: ["email", "task", "template", "workflow"],
      },
    },
  ],

  // ✅ Template usage analytics
  templateUsage: [
    {
      templateId: { type: mongoose.Schema.Types.ObjectId, ref: "Template" },
      usageCount: { type: Number, default: 0 },
      lastUsed: { type: Date, default: Date.now },
      successRate: { type: Number, default: 0 }, // For ML learning
      averageResponseTime: { type: Number, default: 0 },
    },
  ],

  // Track dismissed suggestion taskIds
  dismissedSuggestions: [{ type: String }],
});

// ✅ Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ tenantId: 1 });
userSchema.index({ "gmailAccounts.email": 1 });
userSchema.index({ "activityLog.timestamp": -1 });

// ✅ Methods for Gmail account management
userSchema.methods.addGmailAccount = function (accountData) {
  const existingAccount = this.gmailAccounts.find(
    (acc) => acc.email === accountData.email
  );

  if (existingAccount) {
    // Update existing account
    Object.assign(existingAccount, accountData);
  } else {
    // Add new account
    this.gmailAccounts.push({
      ...accountData,
      addedAt: new Date(),
      isActive: true,
    });
  }

  // Set as default if it's the first account
  if (this.gmailAccounts.length === 1) {
    this.gmailAccounts[0].isDefault = true;
  }

  return this.save();
};

userSchema.methods.removeGmailAccount = function (email) {
  this.gmailAccounts = this.gmailAccounts.filter((acc) => acc.email !== email);

  // Set new default if removed account was default
  if (
    this.gmailAccounts.length > 0 &&
    !this.gmailAccounts.some((acc) => acc.isDefault)
  ) {
    this.gmailAccounts[0].isDefault = true;
  }

  return this.save();
};

userSchema.methods.getActiveGmailAccounts = function () {
  return this.gmailAccounts.filter((acc) => acc.isActive);
};

userSchema.methods.getDefaultGmailAccount = function () {
  return (
    this.gmailAccounts.find((acc) => acc.isDefault) || this.gmailAccounts[0]
  );
};

// ✅ Method to log user activity for ML learning
userSchema.methods.logActivity = function (
  action,
  details,
  category = "general"
) {
  this.activityLog.push({
    action,
    details,
    category,
    timestamp: new Date(),
  });

  // Keep only last 1000 activities for performance
  if (this.activityLog.length > 1000) {
    this.activityLog = this.activityLog.slice(-1000);
  }

  return this.save();
};

// ✅ Method to update template usage for ML learning
userSchema.methods.updateTemplateUsage = function (
  templateId,
  success = true,
  responseTime = 0
) {
  const usage = this.templateUsage.find((u) => u.templateId.equals(templateId));

  if (usage) {
    usage.usageCount++;
    usage.lastUsed = new Date();
    usage.averageResponseTime = (usage.averageResponseTime + responseTime) / 2;

    if (success) {
      usage.successRate =
        (usage.successRate * (usage.usageCount - 1) + 1) / usage.usageCount;
    } else {
      usage.successRate =
        (usage.successRate * (usage.usageCount - 1)) / usage.usageCount;
    }
  } else {
    this.templateUsage.push({
      templateId,
      usageCount: 1,
      lastUsed: new Date(),
      successRate: success ? 1 : 0,
      averageResponseTime: responseTime,
    });
  }

  return this.save();
};

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
