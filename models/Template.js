import mongoose from "mongoose";

// ✅ Template Variable Schema
const templateVariableSchema = new mongoose.Schema({
  name: { type: String, required: true }, // {{name}}, {{company}}, etc.
  type: { 
    type: String, 
    enum: ['text', 'email', 'date', 'number', 'boolean', 'select', 'multi-select'],
    default: 'text'
  },
  defaultValue: { type: mongoose.Schema.Types.Mixed },
  options: [{ type: String }], // For select/multi-select types
  required: { type: Boolean, default: false },
  description: { type: String },
  validation: {
    pattern: { type: String }, // Regex pattern
    minLength: { type: Number },
    maxLength: { type: Number },
    min: { type: Number },
    max: { type: Number }
  }
});

// ✅ Template Version Schema for Version Control
const templateVersionSchema = new mongoose.Schema({
  version: { type: String, required: true }, // v1.0, v1.1, etc.
  subject: { type: String, required: true },
  body: { type: String, required: true },
  variables: [templateVariableSchema],
  changelog: { type: String },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  performanceMetrics: {
    usageCount: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 },
    userRating: { type: Number, default: 0 }
  }
});

// ✅ Conditional Logic Schema for Rules Engine
const conditionalLogicSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  conditions: [{
    field: { type: String, required: true }, // Variable or system field
    operator: { 
      type: String, 
      enum: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'],
      required: true 
    },
    value: { type: mongoose.Schema.Types.Mixed },
    logicalOperator: { type: String, enum: ['AND', 'OR'], default: 'AND' }
  }],
  actions: [{
    type: { 
      type: String, 
      enum: ['show_field', 'hide_field', 'set_value', 'send_email', 'create_task', 'trigger_workflow', 'use_template_version'],
      required: true 
    },
    target: { type: String }, // Field name or action target
    value: { type: mongoose.Schema.Types.Mixed },
    parameters: { type: mongoose.Schema.Types.Mixed }
  }],
  priority: { type: Number, default: 0 }, // Higher priority rules execute first
  isActive: { type: Boolean, default: true }
});

// ✅ Main Template Schema
const templateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String },
  category: { 
    type: String, 
    enum: ['email', 'task', 'workflow', 'meeting', 'follow-up', 'reminder', 'custom'],
    default: 'email'
  },
  tags: [{ type: String, trim: true }],
  
  // ✅ Current active version
  currentVersion: { type: String, default: 'v1.0' },
  
  // ✅ All versions for version control
  versions: [templateVersionSchema],
  
  // ✅ Template variables
  variables: [templateVariableSchema],
  
  // ✅ Conditional logic and rules
  conditionalLogic: [conditionalLogicSchema],
  
  // ✅ Configuration settings
  configuration: {
    allowVersioning: { type: Boolean, default: true },
    requireApproval: { type: Boolean, default: false },
    maxVersions: { type: Number, default: 10 },
    autoArchive: { type: Boolean, default: true },
    learningEnabled: { type: Boolean, default: true },
    adaptiveOptimization: { type: Boolean, default: true }
  },
  
  // ✅ Ownership and permissions
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  permissions: {
    canView: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    canEdit: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    canDelete: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isPublic: { type: Boolean, default: false }
  },
  
  // ✅ Analytics and ML data
  analytics: {
    totalUsage: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 },
    userRatings: { type: Number, default: 0 },
    lastUsed: { type: Date },
    popularVariables: [{ 
      name: String, 
      usageCount: Number, 
      successRate: Number 
    }],
    performanceTrends: [{
      date: { type: Date, default: Date.now },
      usageCount: { type: Number, default: 0 },
      successRate: { type: Number, default: 0 },
      averageResponseTime: { type: Number, default: 0 }
    }]
  },
  
  // ✅ AI Learning data
  aiLearning: {
    patterns: [{
      pattern: { type: String },
      frequency: { type: Number, default: 1 },
      context: { type: mongoose.Schema.Types.Mixed },
      effectiveness: { type: Number, default: 0 }
    }],
    suggestions: [{
      type: { type: String, enum: ['variable', 'content', 'timing', 'format'] },
      suggestion: { type: String },
      confidence: { type: Number, default: 0 },
      implemented: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now }
    }],
    optimizations: [{
      type: { type: String },
      description: { type: String },
      impact: { type: Number, default: 0 },
      implementedAt: { type: Date, default: Date.now }
    }]
  },
  
  // ✅ System fields
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  isArchived: { type: Boolean, default: false }
});

// ✅ Indexes for performance
templateSchema.index({ name: 1, tenantId: 1 });
templateSchema.index({ category: 1, isActive: 1 });
templateSchema.index({ owner: 1, isActive: 1 });
templateSchema.index({ tags: 1 });
templateSchema.index({ 'analytics.lastUsed': -1 });

// ✅ Middleware to update updatedAt
templateSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// ✅ Methods for version control
templateSchema.methods.createVersion = function(versionData, userId) {
  const versionNumber = this.generateVersionNumber();
  
  const newVersion = {
    version: versionNumber,
    subject: versionData.subject,
    body: versionData.body,
    variables: versionData.variables || this.variables,
    changelog: versionData.changelog || 'New version created',
    createdBy: userId,
    createdAt: new Date(),
    isActive: true
  };
  
  // Deactivate previous versions if needed
  this.versions.forEach(v => v.isActive = false);
  
  this.versions.push(newVersion);
  this.currentVersion = versionNumber;
  
  // Keep only max versions
  if (this.versions.length > this.configuration.maxVersions) {
    this.versions = this.versions.slice(-this.configuration.maxVersions);
  }
  
  return this.save();
};

templateSchema.methods.rollbackToVersion = function(version) {
  const targetVersion = this.versions.find(v => v.version === version);
  if (!targetVersion) {
    throw new Error(`Version ${version} not found`);
  }
  
  this.versions.forEach(v => v.isActive = false);
  targetVersion.isActive = true;
  this.currentVersion = version;
  
  return this.save();
};

templateSchema.methods.generateVersionNumber = function() {
  if (this.versions.length === 0) return 'v1.0';
  
  const latestVersion = this.versions[this.versions.length - 1].version;
  const versionParts = latestVersion.replace('v', '').split('.');
  const major = parseInt(versionParts[0]);
  const minor = parseInt(versionParts[1]) + 1;
  
  return `v${major}.${minor}`;
};

// ✅ Methods for variable processing
templateSchema.methods.processVariables = function(data) {
  const activeVersion = this.versions.find(v => v.version === this.currentVersion) || this.versions[this.versions.length - 1];
  if (!activeVersion) return { subject: '', body: '' };
  
  let { subject, body } = activeVersion;
  
  // Replace variables in subject and body
  this.variables.forEach(variable => {
    const value = data[variable.name] || variable.defaultValue || '';
    const regex = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
    subject = subject.replace(regex, value);
    body = body.replace(regex, value);
  });
  
  return { subject, body };
};

// ✅ Methods for conditional logic
templateSchema.methods.evaluateConditions = function(data) {
  const applicableRules = this.conditionalLogic
    .filter(rule => rule.isActive)
    .sort((a, b) => b.priority - a.priority);
  
  const results = {
    actions: [],
    hiddenFields: [],
    shownFields: [],
    setValue: {},
    templateVersion: this.currentVersion
  };
  
  applicableRules.forEach(rule => {
    const conditionsMet = this.evaluateRuleConditions(rule.conditions, data);
    
    if (conditionsMet) {
      rule.actions.forEach(action => {
        switch (action.type) {
          case 'show_field':
            results.shownFields.push(action.target);
            break;
          case 'hide_field':
            results.hiddenFields.push(action.target);
            break;
          case 'set_value':
            results.setValue[action.target] = action.value;
            break;
          case 'use_template_version':
            results.templateVersion = action.value;
            break;
          default:
            results.actions.push(action);
        }
      });
    }
  });
  
  return results;
};

templateSchema.methods.evaluateRuleConditions = function(conditions, data) {
  if (!conditions || conditions.length === 0) return true;
  
  let result = true;
  let currentLogicalOperator = 'AND';
  
  conditions.forEach(condition => {
    const conditionResult = this.evaluateCondition(condition, data);
    
    if (currentLogicalOperator === 'AND') {
      result = result && conditionResult;
    } else {
      result = result || conditionResult;
    }
    
    currentLogicalOperator = condition.logicalOperator || 'AND';
  });
  
  return result;
};

templateSchema.methods.evaluateCondition = function(condition, data) {
  const fieldValue = data[condition.field];
  const conditionValue = condition.value;
  
  switch (condition.operator) {
    case 'equals':
      return fieldValue === conditionValue;
    case 'not_equals':
      return fieldValue !== conditionValue;
    case 'contains':
      return String(fieldValue).includes(String(conditionValue));
    case 'not_contains':
      return !String(fieldValue).includes(String(conditionValue));
    case 'greater_than':
      return Number(fieldValue) > Number(conditionValue);
    case 'less_than':
      return Number(fieldValue) < Number(conditionValue);
    case 'starts_with':
      return String(fieldValue).startsWith(String(conditionValue));
    case 'ends_with':
      return String(fieldValue).endsWith(String(conditionValue));
    case 'is_empty':
      return !fieldValue || fieldValue === '';
    case 'is_not_empty':
      return fieldValue && fieldValue !== '';
    default:
      return false;
  }
};

// ✅ Methods for analytics and ML
templateSchema.methods.updateAnalytics = function(usageData) {
  this.analytics.totalUsage++;
  this.analytics.lastUsed = new Date();
  
  if (usageData.success !== undefined) {
    const totalSuccess = (this.analytics.successRate * (this.analytics.totalUsage - 1)) + (usageData.success ? 1 : 0);
    this.analytics.successRate = totalSuccess / this.analytics.totalUsage;
  }
  
  if (usageData.responseTime) {
    this.analytics.averageResponseTime = (this.analytics.averageResponseTime + usageData.responseTime) / 2;
  }
  
  if (usageData.rating) {
    this.analytics.userRatings = (this.analytics.userRatings + usageData.rating) / 2;
  }
  
  // Update performance trends
  const today = new Date().toISOString().split('T')[0];
  let todayTrend = this.analytics.performanceTrends.find(t => 
    t.date.toISOString().split('T')[0] === today
  );
  
  if (!todayTrend) {
    todayTrend = {
      date: new Date(),
      usageCount: 0,
      successRate: 0,
      averageResponseTime: 0
    };
    this.analytics.performanceTrends.push(todayTrend);
  }
  
  todayTrend.usageCount++;
  if (usageData.success !== undefined) {
    todayTrend.successRate = (todayTrend.successRate + (usageData.success ? 1 : 0)) / todayTrend.usageCount;
  }
  if (usageData.responseTime) {
    todayTrend.averageResponseTime = (todayTrend.averageResponseTime + usageData.responseTime) / 2;
  }
  
  return this.save();
};

const Template = mongoose.models.Template || mongoose.model("Template", templateSchema);
export default Template;