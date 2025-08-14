import cron from "node-cron";
import Task from "../models/task.js";
import Handlebars from "handlebars";
import { sendEmail } from "./services/emailService.js";

// ✅ NEW: Helper to compile template with variables
function compileTemplate(template, variables) {
  try {
    if (!template) return "";

    // Register helper for date formatting
    Handlebars.registerHelper("formatDate", function (date, format) {
      if (!date) return "";
      const d = new Date(date);
      // Simple format implementation - expand as needed
      return d.toLocaleString();
    });

    // Register helper for conditional logic
    Handlebars.registerHelper("ifCond", function (v1, operator, v2, options) {
      switch (operator) {
        case "==":
          return v1 == v2 ? options.fn(this) : options.inverse(this);
        case "===":
          return v1 === v2 ? options.fn(this) : options.inverse(this);
        case "!=":
          return v1 != v2 ? options.fn(this) : options.inverse(this);
        case "!==":
          return v1 !== v2 ? options.fn(this) : options.inverse(this);
        case "<":
          return v1 < v2 ? options.fn(this) : options.inverse(this);
        case "<=":
          return v1 <= v2 ? options.fn(this) : options.inverse(this);
        case ">":
          return v1 > v2 ? options.fn(this) : options.inverse(this);
        case ">=":
          return v1 >= v2 ? options.fn(this) : options.inverse(this);
        default:
          return options.inverse(this);
      }
    });

    const compiledTemplate = Handlebars.compile(template);
    return compiledTemplate(variables);
  } catch (error) {
    console.error("Template compilation error:", error);
    return `Error in template: ${error.message}`;
  }
}

// ✅ NEW: Safe condition evaluation to prevent code injection
function evaluateConditionSafely(condition, context) {
  // Allowlist of safe operators and properties
  const allowedOperators = ['==', '===', '!=', '!==', '<', '<=', '>', '>=', '&&', '||', '!'];
  const allowedProperties = [
    'task.description', 'task.frequency', 'task.progress', 'task.isActive',
    'execution.timestamp', 'execution.executionType', 'execution.previousExecutions',
    'date.now', 'date.dayOfWeek', 'date.hour', 'date.minute'
  ];
  
  // Basic validation - ensure condition only contains safe patterns
  const conditionStr = String(condition).trim();
  
  // Block dangerous patterns
  const dangerousPatterns = [
    /function\s*\(/i,
    /eval\s*\(/i,
    /require\s*\(/i,
    /import\s+/i,
    /process\./i,
    /global\./i,
    /console\./i,
    /setTimeout/i,
    /setInterval/i,
    /new\s+Function/i,
    /\.__proto__/i,
    /\.constructor/i
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(conditionStr)) {
      throw new Error(`Unsafe condition detected: ${conditionStr}`);
    }
  }
  
  // Simple expression evaluator for basic comparisons
  try {
    // For now, just evaluate simple expressions safely
    // In production, use a proper expression parser library
    return evaluateSimpleExpression(conditionStr, context);
  } catch (error) {
    console.error('Condition evaluation error:', error);
    return false;
  }
}

// Simple expression evaluator for basic conditions
function evaluateSimpleExpression(expr, context) {
  // Replace context variables with actual values
  let evaluatedExpr = expr;
  
  // Replace known safe context paths
  evaluatedExpr = evaluatedExpr.replace(/task\.isActive/g, context.task.isActive);
  evaluatedExpr = evaluatedExpr.replace(/task\.progress/g, context.task.progress);
  evaluatedExpr = evaluatedExpr.replace(/date\.hour/g, context.date.hour);
  evaluatedExpr = evaluatedExpr.replace(/date\.dayOfWeek/g, context.date.dayOfWeek);
  evaluatedExpr = evaluatedExpr.replace(/execution\.previousExecutions/g, context.execution.previousExecutions);
  
  // Simple boolean evaluation for common patterns
  if (evaluatedExpr === 'true') return true;
  if (evaluatedExpr === 'false') return false;
  
  // Basic numeric comparisons
  const numericPattern = /^(\d+)\s*(==|===|!=|!==|<|<=|>|>=)\s*(\d+)$/;
  const match = evaluatedExpr.match(numericPattern);
  if (match) {
    const [, left, operator, right] = match;
    const leftVal = parseInt(left);
    const rightVal = parseInt(right);
    
    switch (operator) {
      case '==':
      case '===':
        return leftVal === rightVal;
      case '!=':
      case '!==':
        return leftVal !== rightVal;
      case '<':
        return leftVal < rightVal;
      case '<=':
        return leftVal <= rightVal;
      case '>':
        return leftVal > rightVal;
      case '>=':
        return leftVal >= rightVal;
      default:
        return false;
    }
  }
  
  // Default to false for unrecognized patterns
  return false;
}

// ✅ NEW: Evaluate conditional rules
function evaluateConditionalRules(task, executionContext) {
  const triggeredRules = [];

  if (!task.conditionalRules || !Array.isArray(task.conditionalRules)) {
    return { triggeredRules, shouldProceed: true };
  }

  // Create a safe evaluation context
  const context = {
    task: {
      description: task.description,
      frequency: task.frequency,
      progress: task.progress,
      isActive: task.isActive,
    },
    execution: executionContext,
    date: {
      now: new Date(),
      dayOfWeek: new Date().getDay(),
      hour: new Date().getHours(),
      minute: new Date().getMinutes(),
    },
    // Add any other safe context variables here
  };

  let shouldProceed = true;

  // Evaluate each rule
  task.conditionalRules.forEach((rule, index) => {
    try {
      // Safe condition evaluation using allowlisted operators and properties
      const conditionResult = evaluateConditionSafely(rule.condition, context);

      if (conditionResult) {
        triggeredRules.push(index);

        // Handle actions based on the rule
        if (rule.action === "skip") {
          shouldProceed = false;
        }
        // Add other action types as needed
      }
    } catch (error) {
      console.error(`Error evaluating rule ${index}:`, error);
    }
  });

  return { triggeredRules, shouldProceed };
}

// ✅ NEW: Direct email task execution function (replaces triggerTaskWebhook)
async function executeEmailTask(task, payload) {
  try {
    console.log(`📧 Executing email task: ${task.description}`);

    // Validate email configuration
    if (!task.emailConfig || !task.emailConfig.from || !task.emailConfig.to) {
      throw new Error("Invalid email configuration: missing from or to addresses");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(task.emailConfig.from)) {
      throw new Error(`Invalid 'from' email format: ${task.emailConfig.from}`);
    }

    const toEmails = Array.isArray(task.emailConfig.to) ? task.emailConfig.to : [task.emailConfig.to];
    for (const email of toEmails) {
      if (!emailRegex.test(email)) {
        throw new Error(`Invalid 'to' email format: ${email}`);
      }
    }

    // Prepare variables for template compilation
    const now = new Date();
    const variables = {
      ...task.variables,
      executionTime: now.toLocaleString(),
      taskName: task.description,
      frequency: task.frequency,
      nextExecution: getNextExecutionTime(task),
      taskId: task._id.toString(),
      executionCount: task.executionHistory?.length || 0,
      date: now.toISOString().slice(0, 10), // YYYY-MM-DD
      time: now.toTimeString().slice(0, 5), // HH:MM
      day: now.toLocaleDateString(undefined, { weekday: "long" }), // Monday
      datetime: now.toLocaleString(), // Full date and time
    };

    // Compile template with variables
    const compiledTemplate = task.template
      ? compileTemplate(task.template, variables)
      : task.emailConfig?.message ||
        `Your scheduled task "${task.description}" has been executed.`;

    console.log(`📧 Email Details:`);
    console.log(`   From: ${task.emailConfig.from}`);
    console.log(`   To: ${toEmails.join(", ")}`);
    console.log(`   Subject: ${task.emailConfig.subject || `Task Notification: ${task.description}`}`);
    console.log(`   Template Used: ${task.template ? "Yes" : "No"}`);
    console.log(`   Message Length: ${compiledTemplate?.length || 0} characters`);

    // Send email directly
    const emailResult = await sendEmail({
      to: toEmails.join(", "),
      subject: task.emailConfig.subject || `Task Notification: ${task.description}`,
      text: compiledTemplate,
      html: task.emailConfig.htmlMessage || compiledTemplate
    });

    if (emailResult.success) {
      console.log(`✅ Email sent successfully for task: ${task.description}`);
      console.log(`📧 Message ID: ${emailResult.messageId}`);

      // Log successful execution
      await Task.findByIdAndUpdate(task._id, {
        $push: {
          executionHistory: {
            executedAt: new Date(),
            status: "success",
            method: "direct_email",
            manualTrigger: payload.manualTrigger || false,
            logs: [`✅ Email sent successfully (ID: ${emailResult.messageId})`],
            emailMessageId: emailResult.messageId,
            emailDetails: {
              from: task.emailConfig.from,
              to: toEmails,
              subject: task.emailConfig.subject || `Task Notification: ${task.description}`,
              compiledMessage: compiledTemplate.substring(0, 200) + "..." // Store first 200 chars
            }
          },
        },
      });

      return { 
        status: "success", 
        message: "Email sent successfully",
        emailMessageId: emailResult.messageId
      };
    } else {
      throw new Error(emailResult.error);
    }
  } catch (error) {
    console.error(`❌ Failed to execute email task "${task.description}":`, error.message);

    // Log failed execution
    await Task.findByIdAndUpdate(task._id, {
      $push: {
        executionHistory: {
          executedAt: new Date(),
          status: "failed",
          method: "direct_email",
          error: error.message,
          manualTrigger: payload.manualTrigger || false,
          logs: [`❌ Email sending failed: ${error.message}`],
          emailConfig: task.emailConfig
            ? {
                from: task.emailConfig.from,
                to: task.emailConfig.to,
                subject: task.emailConfig.subject,
              }
            : null,
        },
      },
    });

    throw error;
  }
}

// ✅ ENHANCED: Helper to calculate next execution time
function getNextExecutionTime(task) {
  const now = new Date();

  try {
    switch (task.frequency) {
      case "daily":
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const [hours, minutes] = (task.time || "00:00").split(":");
        tomorrow.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        return tomorrow.toISOString();

      case "weekly":
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return nextWeek.toISOString();

      case "one-time":
        return task.datetime || null;

      default:
        return null;
    }
  } catch (error) {
    console.error("Error calculating next execution time:", error);
    return null;
  }
}

// Helper function to parse time string to hours and minutes
function parseTime(timeString) {
  if (!timeString) return null;

  let parsedTime;
  if (typeof timeString === "string") {
    if (timeString.includes(":")) {
      const [hours, minutes] = timeString.split(":").map(Number);
      parsedTime = { hours, minutes };
    } else {
      const date = new Date(timeString);
      if (!isNaN(date.getTime())) {
        parsedTime = { hours: date.getHours(), minutes: date.getMinutes() };
      }
    }
  } else if (timeString instanceof Date) {
    parsedTime = {
      hours: timeString.getHours(),
      minutes: timeString.getMinutes(),
    };
  } else {
    const date = new Date(timeString);
    if (!isNaN(date.getTime())) {
      parsedTime = { hours: date.getHours(), minutes: date.getMinutes() };
    }
  }

  return parsedTime;
}

// Helper function to check if current time matches task time
function isTimeMatch(now, taskTime) {
  const parsedTime = parseTime(taskTime);
  if (!parsedTime) return false;

  return (
    now.getHours() === parsedTime.hours &&
    now.getMinutes() === parsedTime.minutes
  );
}

// Helper function to prevent duplicate executions within the same minute
const executedTasks = new Set();

function shouldExecuteTask(taskId, now) {
  const key = `${taskId}-${now.getHours()}-${now.getMinutes()}`;
  if (executedTasks.has(key)) {
    return false;
  }
  executedTasks.add(key);

  setTimeout(() => {
    executedTasks.delete(key);
  }, 120000);

  return true;
}

// ✅ ENHANCED: Helper function to validate comprehensive email configuration
function validateEmailConfig(emailConfig) {
  if (!emailConfig)
    return { valid: false, error: "No email configuration provided" };

  const { from, to, subject, message } = emailConfig;

  // Check if 'from' is a valid email
  if (!from || typeof from !== "string" || !from.includes("@")) {
    return { valid: false, error: 'Invalid or missing "from" email address' };
  }

  // Check if 'to' is an array of valid emails
  if (!to || !Array.isArray(to) || to.length === 0) {
    return { valid: false, error: 'Invalid or missing "to" email addresses' };
  }

  // Validate each 'to' email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(from)) {
    return { valid: false, error: `Invalid "from" email format: ${from}` };
  }

  for (const email of to) {
    if (!email || typeof email !== "string" || !emailRegex.test(email)) {
      return { valid: false, error: `Invalid "to" email format: ${email}` };
    }
  }

  // Check if subject and message are provided
  if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
    return { valid: false, error: "Email subject is required" };
  }

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return { valid: false, error: "Email message is required" };
  }

  return { valid: true, error: null };
}

// ✅ ENHANCED: Helper function to ensure task configuration with email validation
async function ensureTaskConfiguration(task) {
  let needsUpdate = false;
  const updates = {};

  // Check webhook URL
  if (!task.webhookUrl) {
    console.log(
      `⚠️ Task "${task.description}" has no webhook URL, setting default`
    );
    updates.webhookUrl = DEFAULT_WEBHOOK_URL;
    task.webhookUrl = DEFAULT_WEBHOOK_URL;
    needsUpdate = true;
  }

  // ✅ ENHANCED: Validate email configuration
  const emailValidation = validateEmailConfig(task.emailConfig);
  if (!emailValidation.valid) {
    console.error(
      `❌ Task "${task.description}" has invalid email configuration: ${emailValidation.error}`
    );
    throw new Error(
      `Cannot execute task "${task.description}": ${emailValidation.error}`
    );
  }

  // Update task if needed
  if (needsUpdate) {
    await Task.findByIdAndUpdate(task._id, updates);
  }

  return task;
}

// ✅ ENHANCED: Helper function to log comprehensive task execution details
function logTaskExecution(task, executionType, additionalInfo = {}) {
  console.log(`⏰ Executing ${executionType} task: ${task.description}`);

  if (task.emailConfig) {
    console.log(`📧 Email Configuration:`);
    console.log(`   From: ${task.emailConfig.from}`);
    console.log(`   To: ${task.emailConfig.to.join(", ")}`);
    console.log(`   Subject: ${task.emailConfig.subject}`);
    console.log(
      `   Message: ${task.emailConfig.message?.substring(0, 100)}${
        task.emailConfig.message?.length > 100 ? "..." : ""
      }`
    );

    if (task.emailConfig.cc && task.emailConfig.cc.length > 0) {
      console.log(`   CC: ${task.emailConfig.cc.join(", ")}`);
    }
    if (task.emailConfig.bcc && task.emailConfig.bcc.length > 0) {
      console.log(`   BCC: ${task.emailConfig.bcc.join(", ")}`);
    }
  }

  // Log additional info
  Object.entries(additionalInfo).forEach(([key, value]) => {
    console.log(`📅 ${key}: ${value}`);
  });
}

// Main scheduler job - runs every minute
const job = cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    console.log(`🕐 Scheduler running at: ${now.toLocaleString()}`);

    // ===== DAILY TASKS =====
    const dailyTasks = await Task.find({ isActive: true, frequency: "daily" });
    console.log(`📅 Found ${dailyTasks.length} daily tasks`);

    for (const task of dailyTasks) {
      if (isTimeMatch(now, task.time) && shouldExecuteTask(task._id, now)) {
        try {
          logTaskExecution(task, "daily");
          await ensureTaskConfiguration(task);
          await executeEmailTask(task, {
            ...task.toObject(),
            timestamp: now,
            executionType: "daily",
          });
        } catch (error) {
          console.error(
            `❌ Failed to execute daily task "${task.description}":`,
            error.message
          );
        }
      }
    }

    // ===== WEEKLY TASKS =====
    const weeklyTasks = await Task.find({
      isActive: true,
      frequency: "weekly",
    });
    console.log(`📅 Found ${weeklyTasks.length} weekly tasks`);

    for (const task of weeklyTasks) {
      const weekDay = now.toLocaleString("en-US", { weekday: "long" });

      if (
        weekDay === task.weeklyDay &&
        isTimeMatch(now, task.time) &&
        shouldExecuteTask(task._id, now)
      ) {
        try {
          logTaskExecution(task, "weekly", { weekDay });
          await ensureTaskConfiguration(task);
          await executeEmailTask(task, {
            ...task.toObject(),
            timestamp: now,
            executionType: "weekly",
            weekDay,
          });
        } catch (error) {
          console.error(
            `❌ Failed to execute weekly task "${task.description}":`,
            error.message
          );
        }
      }
    }

    // ===== SELECTED DAYS TASKS =====
    const selectedTasks = await Task.find({
      isActive: true,
      frequency: "selected",
    });
    console.log(`📅 Found ${selectedTasks.length} selected days tasks`);

    for (const task of selectedTasks) {
      const weekDay = now.toLocaleString("en-US", { weekday: "long" });

      if (
        task.selectedDays &&
        task.selectedDays.includes(weekDay) &&
        isTimeMatch(now, task.time) &&
        shouldExecuteTask(task._id, now)
      ) {
        try {
          logTaskExecution(task, "selected days", { weekDay });
          await ensureTaskConfiguration(task);
          await executeEmailTask(task, {
            ...task.toObject(),
            timestamp: now,
            executionType: "selected",
            weekDay,
          });
        } catch (error) {
          console.error(
            `❌ Failed to execute selected days task "${task.description}":`,
            error.message
          );
        }
      }
    }

    // ===== ONE-TIME TASKS =====
    const oneTimeTasks = await Task.find({
      isActive: true,
      frequency: "one-time",
      executed: { $ne: true },
    });
    console.log(`📅 Found ${oneTimeTasks.length} one-time tasks`);

    for (const task of oneTimeTasks) {
      if (!task.datetime) {
        console.error(
          `❌ One-time task "${task.description}" has no datetime set`
        );
        continue;
      }

      const taskDateTime = new Date(task.datetime);

      if (isNaN(taskDateTime.getTime())) {
        console.error(
          `❌ Invalid datetime for task "${task.description}": ${task.datetime}`
        );
        continue;
      }

      if (
        now.getFullYear() === taskDateTime.getFullYear() &&
        now.getMonth() === taskDateTime.getMonth() &&
        now.getDate() === taskDateTime.getDate() &&
        now.getHours() === taskDateTime.getHours() &&
        now.getMinutes() === taskDateTime.getMinutes() &&
        shouldExecuteTask(task._id, now)
      ) {
        try {
          logTaskExecution(task, "one-time", {
            scheduledTime: taskDateTime.toLocaleString(),
          });
          await ensureTaskConfiguration(task);
          await executeEmailTask(task, {
            ...task.toObject(),
            timestamp: now,
            executionType: "one-time",
            scheduledTime: taskDateTime,
          });

          // Mark as executed
          await Task.findByIdAndUpdate(task._id, { executed: true });
          console.log(
            `✅ One-time task marked as executed: ${task.description}`
          );
        } catch (error) {
          console.error(
            `❌ Failed to execute one-time task "${task.description}":`,
            error.message
          );
        }
      }
    }
  } catch (error) {
    console.error("❌ Error in scheduler:", error);
  }
});

// ✅ ENHANCED: Function to fix existing tasks and validate email configurations
async function fixExistingTasks() {
  try {
    // Fix webhook URLs
    const tasksWithoutWebhook = await Task.find({
      $or: [
        { webhookUrl: { $exists: false } },
        { webhookUrl: null },
        { webhookUrl: undefined },
        { webhookUrl: "" },
      ],
    });

    if (tasksWithoutWebhook.length > 0) {
      console.log(
        `🔧 Found ${tasksWithoutWebhook.length} tasks without webhook URL, fixing...`
      );
      await Task.updateMany(
        {
          $or: [
            { webhookUrl: { $exists: false } },
            { webhookUrl: null },
            { webhookUrl: undefined },
            { webhookUrl: "" },
          ],
        },
        { $set: { webhookUrl: DEFAULT_WEBHOOK_URL } }
      );
      console.log(
        `✅ Fixed ${tasksWithoutWebhook.length} tasks with default webhook URL`
      );
    }

    // ✅ ENHANCED: Validate email configurations
    const allTasks = await Task.find({});
    let tasksWithInvalidEmail = 0;
    let tasksWithValidEmail = 0;

    for (const task of allTasks) {
      const emailValidation = validateEmailConfig(task.emailConfig);
      if (!emailValidation.valid) {
        tasksWithInvalidEmail++;
        console.log(
          `⚠️ Task "${task.description}" has invalid email configuration: ${emailValidation.error}`
        );
      } else {
        tasksWithValidEmail++;
      }
    }

    console.log(`📊 Email Configuration Summary:`);
    console.log(`   ✅ Valid: ${tasksWithValidEmail} tasks`);
    console.log(`   ❌ Invalid: ${tasksWithInvalidEmail} tasks`);

    if (tasksWithInvalidEmail > 0) {
      console.log(
        `⚠️ ${tasksWithInvalidEmail} tasks have invalid email configuration and will not be executed`
      );
    }
  } catch (error) {
    console.error("❌ Error fixing existing tasks:", error);
  }
}

// Graceful shutdown handlers
process.on("SIGINT", () => {
  console.log("🛑 Shutting down scheduler...");
  job.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("🛑 Shutting down scheduler...");
  job.stop();
  process.exit(0);
});

// Start message and fix existing tasks
console.log("🚀 Scheduler started and running!");
console.log(`⏰ Current time: ${new Date().toLocaleString()}`);
console.log("📧 Direct email automation enabled - emails will be sent from this application");

// Fix existing tasks on startup
fixExistingTasks();

export { job };
