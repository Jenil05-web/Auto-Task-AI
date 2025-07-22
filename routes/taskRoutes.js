import express from "express";
import Task from "../models/task.js";
import axios from "axios";
import jwt from "jsonwebtoken";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  console.log("Auth header:", authHeader);
  console.log("Token extracted:", token);
  if (!token) return res.status(401).json({ error: "No token provided." });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token." });
    console.log("Decoded JWT user:", user);
    req.user = user;
    next();
  });
}

// Protect all task routes
router.use(authenticateToken);

// Get all tasks for the current user and tenant
router.get("/", async (req, res) => {
  try {
    const tasks = await Task.find({
      userId: req.user.userId,
      tenantId: req.user.tenantId,
    });
    res.json(tasks);
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// ✅ ENHANCED: Create task with template support
router.post("/", async (req, res) => {
  try {
    if (!req.user.tenantId) {
      console.error("Missing tenantId in req.user:", req.user);
      return res.status(400).json({
        error:
          "Missing tenantId in user context. Please log out and log in again.",
      });
    }

    const {
      description,
      time,
      frequency,
      progress,
      deadline,
      weeklyDay,
      selectedDays,
      datetime,
      webhookUrl,
      // Email fields
      from,
      to,
      subject,
      message,
      // ✅ NEW: Template fields
      template,
      variables,
      conditionalRules,
    } = req.body;
    // Accept confidence from request (e.g., from ML extraction)
    let { confidence } = req.body;
    if (confidence === undefined || confidence === null) confidence = 1;
    // Set needsReview if confidence is low
    const needsReview = confidence < 0.7;

    // Validate required fields based on frequency
    if (frequency === "weekly" && !weeklyDay) {
      return res.status(400).json({
        error: "weeklyDay is required for weekly tasks",
      });
    }

    if (
      frequency === "selected" &&
      (!selectedDays || selectedDays.length === 0)
    ) {
      return res.status(400).json({
        error: "selectedDays is required for selected frequency tasks",
      });
    }

    // Process email configuration if provided
    let emailConfig = null;
    if (from && to) {
      // Convert to array if it's a string with comma-separated emails
      const toEmails =
        typeof to === "string"
          ? to
              .split(",")
              .map((email) => email.trim())
              .filter(Boolean)
          : Array.isArray(to)
          ? to
          : [];

      emailConfig = {
        from,
        to: toEmails,
        subject: subject || `Task Notification: ${description}`,
        message:
          message || `Your scheduled task "${description}" has been executed.`,
        // Additional fields that n8n might use
        fromName: from.split("@")[0],
        priority: "normal",
        attachments: [],
      };
    }

    // ✅ NEW: Process template and variables
    const templateContent = template || message;
    const variablesObj = variables || {};

    // Default variables if not provided
    if (!variablesObj.taskName) variablesObj.taskName = description;
    if (!variablesObj.executionTime)
      variablesObj.executionTime = "{{executionTime}}";
    if (!variablesObj.frequency) variablesObj.frequency = frequency;

    // Save task to MongoDB with template support
    const newTask = new Task({
      userId: req.user.userId,
      tenantId: req.user.tenantId,
      description,
      time,
      frequency,
      progress: progress || 0,
      deadline,
      weeklyDay,
      selectedDays,
      datetime,
      webhookUrl:
        webhookUrl || "https://jenil005.app.n8n.cloud/webhook/execute-task",
      isActive: true,
      executed: false,
      // Email fields
      emailFrom: from,
      emailTo:
        typeof to === "string"
          ? to.split(",").map((email) => email.trim())
          : to,
      emailSubject: subject,
      emailBody: message,
      emailConfig: emailConfig,
      // ✅ NEW: Template fields
      template: templateContent,
      variables: variablesObj,
      conditionalRules: conditionalRules || [],
      // ✅ NEW: Confidence and review
      confidence,
      needsReview,
    });

    // ✅ NEW: Add initial version to version history
    newTask.versionHistory = [
      {
        version: 1,
        timestamp: new Date(),
        template: templateContent,
        variables: variablesObj,
        emailConfig: emailConfig,
        changedBy: req.user.userId,
        changeDescription: "Initial version",
      },
    ];

    const savedTask = await newTask.save();

    console.log(`📅 Task scheduled successfully: ${description}`);
    console.log(`⏰ Frequency: ${frequency}`);
    if (frequency === "weekly") {
      console.log(`⏰ Scheduled time: ${time}`);
    }

    res.status(201).json({
      message: "Task scheduled successfully",
      task: savedTask,
      note: "Task will be executed by the scheduler at the appropriate time",
    });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// ✅ NEW: Manual trigger endpoint for testing (optional)
router.post("/:id/trigger", async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      tenantId: req.user.tenantId,
    });

    if (!task) {
      return res
        .status(404)
        .json({ error: "Task not found or not authorized." });
    }

    // Manually trigger the task's webhook
    const N8N_WEBHOOK_URL =
      task.webhookUrl || "https://jenil005.app.n8n.cloud/webhook/execute-task";

    try {
      await axios.post(N8N_WEBHOOK_URL, {
        description: task.description,
        time: task.time,
        frequency: task.frequency,
        userId: task.userId,
        tenantId: task.tenantId,
        taskId: task._id,
        progress: task.progress,
        deadline: task.deadline,
        manualTrigger: true,
        triggeredAt: new Date(),
      });

      // Update execution history
      await Task.findByIdAndUpdate(task._id, {
        $push: {
          executionHistory: {
            executedAt: new Date(),
            status: "success",
            webhookUrl: N8N_WEBHOOK_URL,
            manualTrigger: true,
          },
        },
      });

      res.json({
        message: "Task triggered manually",
        task: task.description,
      });
    } catch (n8nError) {
      console.error("Error triggering task:", n8nError.message);
      res.status(500).json({ error: "Failed to trigger task" });
    }
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to trigger task" });
  }
});

// Update a task by ID (only if it belongs to the current user and tenant)
router.put("/:id", async (req, res) => {
  try {
    const {
      description,
      time,
      frequency,
      progress,
      deadline,
      weeklyDay,
      selectedDays,
      datetime,
      webhookUrl,
      // Email fields
      from,
      to,
      subject,
      message,
      // ✅ NEW: Template fields
      template,
      variables,
      conditionalRules,
    } = req.body;

    // Update basic task fields
    if (description) task.description = description;
    if (time) task.time = time;
    if (frequency) task.frequency = frequency;
    if (progress !== undefined) task.progress = progress;
    if (deadline) task.deadline = deadline;
    if (weeklyDay) task.weeklyDay = weeklyDay;
    if (selectedDays) task.selectedDays = selectedDays;
    if (datetime) task.datetime = datetime;
    if (webhookUrl) task.webhookUrl = webhookUrl;

    // Update email fields
    if (from) task.emailFrom = from;
    if (to) {
      task.emailTo =
        typeof to === "string"
          ? to.split(",").map((email) => email.trim())
          : to;
    }
    if (subject) task.emailSubject = subject;
    if (message) task.emailBody = message;

    // ✅ NEW: Update template fields
    const templateContent = template || message || task.template;
    const variablesObj = variables || task.variables || {};

    if (template) task.template = template;
    if (variables) task.variables = variables;
    if (conditionalRules) task.conditionalRules = conditionalRules;

    // Update email configuration
    let emailConfig = task.emailConfig || {};
    if (from) emailConfig.from = from;
    if (to) {
      emailConfig.to =
        typeof to === "string"
          ? to.split(",").map((email) => email.trim())
          : to;
    }
    if (subject) emailConfig.subject = subject;
    if (message) emailConfig.message = message;
    task.emailConfig = emailConfig;

    // ✅ NEW: Add new version to version history
    const latestVersion =
      task.versionHistory && task.versionHistory.length > 0
        ? Math.max(...task.versionHistory.map((v) => v.version)) + 1
        : 1;

    task.versionHistory.push({
      version: latestVersion,
      timestamp: new Date(),
      template: templateContent,
      variables: variablesObj,
      emailConfig: emailConfig,
      changedBy: req.user.userId,
      changeDescription: req.body.changeDescription || "Updated version",
    });

    const updatedTask = await task.save();

    res.json({
      message: "Task updated successfully",
      task: updatedTask,
    });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// ✅ NEW: Rollback to previous version
router.post("/:id/rollback/:version", async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      tenantId: req.user.tenantId,
    });

    if (!task) {
      return res
        .status(404)
        .json({ error: "Task not found or not authorized." });
    }

    const versionNumber = parseInt(req.params.version);
    const versionToRollback = task.versionHistory.find(
      (v) => v.version === versionNumber
    );

    if (!versionToRollback) {
      return res.status(404).json({ error: "Version not found." });
    }

    // Rollback to previous version
    task.template = versionToRollback.template;
    task.variables = versionToRollback.variables;
    task.emailConfig = versionToRollback.emailConfig;

    // Add new version entry for the rollback
    const latestVersion =
      Math.max(...task.versionHistory.map((v) => v.version)) + 1;
    task.versionHistory.push({
      version: latestVersion,
      timestamp: new Date(),
      template: versionToRollback.template,
      variables: versionToRollback.variables,
      emailConfig: versionToRollback.emailConfig,
      changedBy: req.user.userId,
      changeDescription: `Rolled back to version ${versionNumber}`,
    });

    const updatedTask = await task.save();

    res.json({
      message: `Successfully rolled back to version ${versionNumber}`,
      task: updatedTask,
    });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to rollback version" });
  }
});

// Delete a task by ID (only if it belongs to the current user and tenant)
router.delete("/:id", async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
      tenantId: req.user.tenantId,
    });
    if (!task)
      return res
        .status(404)
        .json({ error: "Task not found or not authorized." });
    res.json({ message: "Task deleted successfully." });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to delete task." });
  }
});

// Get task execution history
router.get("/:id/history", async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      tenantId: req.user.tenantId,
    });

    if (!task) {
      return res
        .status(404)
        .json({ error: "Task not found or not authorized." });
    }

    res.json({
      taskId: task._id,
      description: task.description,
      executionHistory: task.executionHistory || [],
    });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to fetch execution history." });
  }
});

// Get execution history for a task
router.get("/:id/execution-history", async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id, "executionHistory");
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json({ executionHistory: task.executionHistory });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new conditional rule to a task
router.post("/:id/rules", async (req, res) => {
  try {
    const { id } = req.params;
    const { rule } = req.body;
    if (!rule) return res.status(400).json({ error: "Rule is required" });
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    task.conditionalRules.push(rule);
    await task.save();
    res.json({ success: true, conditionalRules: task.conditionalRules });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Edit a conditional rule by index
router.put("/:id/rules/:ruleIndex", async (req, res) => {
  try {
    const { id, ruleIndex } = req.params;
    const { rule } = req.body;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!task.conditionalRules[ruleIndex])
      return res.status(404).json({ error: "Rule not found" });
    task.conditionalRules[ruleIndex] = rule;
    await task.save();
    res.json({ success: true, conditionalRules: task.conditionalRules });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Delete a conditional rule by index
router.delete("/:id/rules/:ruleIndex", async (req, res) => {
  try {
    const { id, ruleIndex } = req.params;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!task.conditionalRules[ruleIndex])
      return res.status(404).json({ error: "Rule not found" });
    task.conditionalRules.splice(ruleIndex, 1);
    await task.save();
    res.json({ success: true, conditionalRules: task.conditionalRules });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enhanced rule suggestion endpoint with feedback-driven learning
router.get("/:id/rule-suggestions", async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(
      id,
      "executionHistory conditionalRules variables feedback"
    );
    if (!task) return res.status(404).json({ error: "Task not found" });
    const history = task.executionHistory || [];
    const rules = task.conditionalRules || [];
    const feedback = task.feedback || [];
    const suggestions = [];

    // Effectiveness scoring for each rule
    rules.forEach((rule, idx) => {
      const triggered = history.filter(
        (h) => Array.isArray(h.triggeredRules) && h.triggeredRules.includes(idx)
      );
      const triggeredCount = triggered.length;
      const successCount = triggered.filter(
        (h) => h.status === "success"
      ).length;
      const skipCount = triggered.filter((h) => h.status === "skipped").length;
      const effectiveness =
        triggeredCount > 0 ? successCount / triggeredCount : null;
      if (effectiveness !== null) {
        suggestions.push({
          type: "rule_effectiveness",
          ruleIndex: idx,
          effectiveness,
          message:
            `Rule ${idx + 1} ('${rule.condition}') effectiveness: ${(
              effectiveness * 100
            ).toFixed(1)}% success (${successCount}/${triggeredCount})` +
            (effectiveness < 0.5 ? " - Consider revising or disabling." : ""),
        });
      }
    });

    // --- Feedback-driven suggestions ---
    // 1. Find rules that are frequently corrected or flagged in feedback
    const ruleCorrectionCounts = {};
    feedback.forEach((fb) => {
      if (fb.ruleIndex !== undefined && fb.correctionType === "correction") {
        ruleCorrectionCounts[fb.ruleIndex] =
          (ruleCorrectionCounts[fb.ruleIndex] || 0) + 1;
      }
    });
    Object.entries(ruleCorrectionCounts).forEach(([ruleIndex, count]) => {
      if (count >= 2) {
        suggestions.push({
          type: "feedback_correction",
          ruleIndex: Number(ruleIndex),
          message: `Rule ${
            Number(ruleIndex) + 1
          } has been corrected by users ${count} times. Consider reviewing or updating this rule.`,
        });
      }
    });

    // 2. Suggest new rules based on frequent feedback patterns
    // (e.g., if feedback mentions a variable value often, suggest a rule)
    const patternCounts = {};
    feedback.forEach((fb) => {
      if (fb.correctionType === "suggestion" && fb.feedback) {
        // Simple pattern: look for 'if X then Y' in feedback
        const match = fb.feedback.match(/if ([^,]+),? then ([^\.]+)/i);
        if (match) {
          const key = match[0].toLowerCase();
          patternCounts[key] = (patternCounts[key] || 0) + 1;
        }
      }
    });
    Object.entries(patternCounts).forEach(([pattern, count]) => {
      if (count >= 2) {
        suggestions.push({
          type: "pattern_feedback",
          message: `Users have suggested the pattern "${pattern}" ${count} times. Consider adding a rule for this pattern.`,
        });
      }
    });

    // Anomaly detection: flag outlier executions (unexpected skips/failures)
    const anomalyExecutions = history.filter(
      (h) => h.status === "skipped" || h.status === "error"
    );
    if (anomalyExecutions.length > 0) {
      anomalyExecutions.forEach((h, i) => {
        suggestions.push({
          type: "anomaly",
          executionIndex: i,
          status: h.status,
          logs: h.logs,
          message: `Anomaly detected: execution at ${
            h.executedAt
          } had status '${h.status}'. Review logs: ${h.logs?.join("; ")}`,
        });
      });
    }

    // Existing suggestions (never triggered, always triggered, etc.)
    rules.forEach((rule, idx) => {
      const triggeredCount = history.filter(
        (h) => Array.isArray(h.triggeredRules) && h.triggeredRules.includes(idx)
      ).length;
      if (triggeredCount === 0) {
        suggestions.push({
          type: "disable_rule",
          ruleIndex: idx,
          message: `Rule ${idx + 1} ('${
            rule.condition
          }') has never been triggered. Consider disabling or removing it.`,
        });
      }
      if (triggeredCount > history.length / 2) {
        suggestions.push({
          type: "increase_priority",
          ruleIndex: idx,
          message: `Rule ${idx + 1} ('${
            rule.condition
          }') is triggered very frequently. Consider increasing its priority.`,
        });
      }
    });

    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add user feedback/correction to a task
router.post("/:id/feedback", async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback, correctionType, executionId, ruleIndex } = req.body;
    if (!feedback)
      return res.status(400).json({ error: "Feedback is required" });
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    task.feedback.push({
      userId: req.user?.userId,
      feedback,
      correctionType: correctionType || "correction",
      executionId,
      ruleIndex,
      status: "pending",
      createdAt: new Date(),
    });
    await task.save();
    res.json({ success: true, feedback: task.feedback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI/ML-powered suggestions endpoint
router.get("/suggestions", async (req, res) => {
  try {
    // Fetch all tasks for the user
    const tasks = await Task.find({
      userId: req.user.userId,
      tenantId: req.user.tenantId,
    });

    // Simple rules engine: find recurring weekly automations
    const dayOfWeekMap = {};
    const now = new Date();
    const todayDay = now.getDay(); // 0=Sunday, 1=Monday, ...
    const todayStr = now.toISOString().slice(0, 10);
    const suggestions = [];

    for (const task of tasks) {
      // Only consider active, recurring tasks
      if (!task.isActive) continue;
      if (
        !task.frequency ||
        !["weekly", "selected", "daily"].includes(task.frequency)
      )
        continue;
      // Analyze execution history for weekly patterns
      if (Array.isArray(task.executionHistory)) {
        const days = task.executionHistory
          .map((e) => {
            const d = new Date(e.executedAt);
            return d.getDay();
          })
          .filter((d) => !isNaN(d));
        // Count frequency of each day
        days.forEach((d) => {
          dayOfWeekMap[d] = (dayOfWeekMap[d] || 0) + 1;
        });
        // If a task is most often run on a specific day, suggest it for next occurrence
        if (days.length > 2) {
          const counts = days.reduce((acc, d) => {
            acc[d] = (acc[d] || 0) + 1;
            return acc;
          }, {});
          const maxDay = Object.keys(counts).reduce((a, b) =>
            counts[a] > counts[b] ? a : b
          );
          const maxCount = counts[maxDay];
          if (maxCount >= 2) {
            // Find next date for that day
            const nextDate = new Date(now);
            const dayDiff = (parseInt(maxDay) + 7 - todayDay) % 7 || 7;
            nextDate.setDate(now.getDate() + dayDiff);
            suggestions.push({
              type: "recurring",
              taskId: task._id,
              description: task.description,
              suggestedFor: nextDate,
              frequency: task.frequency,
              reason: `You often automate this on ${
                [
                  "Sunday",
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                ][maxDay]
              }.`,
              originalTask: task,
            });
          }
        }
        // Missed automations: if a task was scheduled for today but not run
        if (task.frequency === "daily") {
          const ranToday = task.executionHistory.some((e) => {
            const d = new Date(e.executedAt).toISOString().slice(0, 10);
            return d === todayStr;
          });
          if (!ranToday) {
            suggestions.push({
              type: "missed",
              taskId: task._id,
              description: task.description,
              suggestedFor: now,
              frequency: task.frequency,
              reason: "You usually run this daily, but it was missed today.",
              originalTask: task,
            });
          }
        }
      }
    }

    // Popular automations: suggest the most frequently run task
    const taskRunCounts = tasks.map((task) => ({
      taskId: task._id,
      description: task.description,
      count: Array.isArray(task.executionHistory)
        ? task.executionHistory.length
        : 0,
      originalTask: task,
    }));
    const mostPopular = taskRunCounts.sort((a, b) => b.count - a.count)[0];
    if (mostPopular && mostPopular.count > 3) {
      suggestions.push({
        type: "popular",
        taskId: mostPopular.taskId,
        description: mostPopular.description,
        suggestedFor: now,
        frequency: mostPopular.originalTask.frequency,
        reason: "This is your most frequently automated task.",
        originalTask: mostPopular.originalTask,
      });
    }

    res.json({ suggestions });
  } catch (error) {
    console.error("AI/ML suggestions error:", error);
    res.status(500).json({ error: "Failed to generate suggestions" });
  }
});

// Signup route
router.post("/signup", async (req, res) => {
  // TODO: Add real signup logic (e.g., save user to DB, hash password)
  res.status(201).json({ message: "User signed up!" });
});

// --- REVIEW QUEUE ENDPOINT ---
// Get all tasks needing review for the current tenant/user
router.get("/review-queue", async (req, res) => {
  try {
    const tasks = await Task.find({
      tenantId: req.user.tenantId,
      needsReview: true,
    });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// --- SUBMIT REVIEW ENDPOINT ---
// Reviewer can update task, clear needsReview, and set new confidence
router.post("/:id/submit-review", async (req, res) => {
  try {
    const { id } = req.params;
    const { updates, confidence } = req.body;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    // Apply updates if provided
    if (updates && typeof updates === "object") {
      Object.entries(updates).forEach(([key, value]) => {
        task[key] = value;
      });
    }
    if (confidence !== undefined) task.confidence = confidence;
    task.needsReview = false;
    await task.save();
    res.json({ message: "Task reviewed and updated", task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ NEW: Test endpoint to debug email configuration
router.post("/test-email", async (req, res) => {
  try {
    const { from, to, subject, message, template, variables } = req.body;

    // Create a test task with email configuration
    const testTask = {
      _id: "test-task-id",
      description: "Test Email Task",
      emailConfig: {
        from: from || "test@example.com",
        to: Array.isArray(to) ? to : [to || "recipient@example.com"],
        subject: subject || "Test Subject",
        message: message || "Test message",
        fromName: from?.split("@")[0] || "Test Sender",
      },
      template: template,
      variables: variables || {},
      webhookUrl: "https://jenil005.app.n8n.cloud/webhook/execute-task",
    };

    // Simulate the webhook trigger
    const axios = await import("axios");
    const Handlebars = await import("handlebars");

    // Compile template if provided
    let compiledTemplate = message;
    if (template && variables) {
      try {
        const compiled = Handlebars.default.compile(template);
        compiledTemplate = compiled(variables);
      } catch (error) {
        console.error("Template compilation error:", error);
        compiledTemplate = message;
      }
    }

    // Create the same payload structure as the scheduler
    const n8nPayload = {
      taskId: testTask._id,
      taskDescription: testTask.description,
      frequency: "test",
      executionType: "manual",
      timestamp: new Date().toISOString(),

      email: {
        from: testTask.emailConfig.from,
        fromName: testTask.emailConfig.fromName,
        to: testTask.emailConfig.to,
        toString: Array.isArray(testTask.emailConfig.to)
          ? testTask.emailConfig.to.join(", ")
          : testTask.emailConfig.to,
        cc: [],
        bcc: [],
        subject: testTask.emailConfig.subject,
        body: compiledTemplate,
        message: compiledTemplate,
        htmlMessage: compiledTemplate,
        text: compiledTemplate,
        priority: "normal",
        attachments: [],
        variables: variables || {},
      },

      // Flat email fields for n8n compatibility
      from: testTask.emailConfig.from,
      to: Array.isArray(testTask.emailConfig.to)
        ? testTask.emailConfig.to.join(", ")
        : testTask.emailConfig.to,
      toArray: testTask.emailConfig.to,
      subject: testTask.emailConfig.subject,
      body: compiledTemplate,
      message: compiledTemplate,
      text: compiledTemplate,

      context: {
        webhookUrl: testTask.webhookUrl,
        executionId: `${testTask._id}-${Date.now()}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        serverTime: new Date().toISOString(),
      },

      action: {
        type: "send_email",
        requiresEmail: true,
        validateEmail: true,
        logExecution: true,
      },
    };

    console.log("🧪 TEST EMAIL PAYLOAD:");
    console.log(JSON.stringify(n8nPayload, null, 2));

    // Send to n8n
    const response = await axios.default.post(testTask.webhookUrl, n8nPayload, {
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TaskScheduler/1.0",
        "X-Task-ID": testTask._id,
        "X-Execution-Type": "test",
        "X-Email-From": testTask.emailConfig.from,
        "X-Email-To": testTask.emailConfig.to.join(","),
      },
    });

    res.json({
      success: true,
      message: "Test email sent to n8n",
      payload: n8nPayload,
      n8nResponse: response.data,
    });
  } catch (error) {
    console.error("Test email error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      payload: req.body,
    });
  }
});

export default router;
