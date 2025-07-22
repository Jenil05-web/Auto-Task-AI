import express from "express";
import { authenticateToken } from "../middlewares/authenticateToken.js";
import NLPService from "../services/nlpService.js";
import CallTask from "../models/CallTask.js";
import schedulerService from "../services/schedulerService.js";

const router = express.Router();

// POST /api/ai-call-automation/schedule
// User submits a natural language command to schedule an AI call
router.post("/schedule", authenticateToken, async (req, res) => {
  try {
    const { naturalLanguageInput } = req.body;
    if (!naturalLanguageInput) {
      return res
        .status(400)
        .json({ error: "Missing naturalLanguageInput in request body." });
    }

    // 1. Parse the user's natural language input using NLPService
    const parsedIntent = await NLPService.parseNaturalLanguageIntent(
      naturalLanguageInput
    );

    // 2. Build the call script (optional: can be improved with more AI logic)
    const callScript = {
      greeting: `Hello, this is an automated call from our assistant!`,
      mainMessage: parsedIntent.script || parsedIntent.purpose || "",
      questions: [],
      closingMessage: "Thank you for your time. Have a great day!",
    };

    // 3. Create the call task in the database
    const callTask = await CallTask.create({
      userId: req.user.userId,
      title: `Call Task - ${parsedIntent.action || "General"}`,
      naturalLanguageInput,
      parsedIntent,
      schedule: {
        frequency: parsedIntent.frequency || "once",
        time: parsedIntent.time || "09:00",
        daysOfWeek: parsedIntent.daysOfWeek || [],
        timezone: req.user.timezone || "UTC",
      },
      callScript,
      isActive: true,
    });

    // 4. Schedule the task
    schedulerService.scheduleTask(callTask);

    // 5. Respond with the created task
    res.status(201).json({
      message: "AI call task created and scheduled successfully.",
      task: callTask,
    });
  } catch (error) {
    console.error("Error scheduling AI call task:", error);
    res.status(500).json({
      error: "Failed to schedule AI call task.",
      details: error.message,
    });
  }
});

// GET /api/ai-call-automation/tasks
// List all scheduled AI call tasks for the authenticated user
router.get("/tasks", authenticateToken, async (req, res) => {
  try {
    const tasks = await CallTask.find({ userId: req.user.userId }).sort({
      createdAt: -1,
    });
    res.json({ tasks });
  } catch (error) {
    console.error("Error fetching AI call tasks:", error);
    res.status(500).json({
      error: "Failed to fetch AI call tasks.",
      details: error.message,
    });
  }
});

// PUT /api/ai-call-automation/tasks/:id
// Update a scheduled AI call task
router.put("/tasks/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;
    // Only allow updating user's own tasks
    const task = await CallTask.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      update,
      { new: true }
    );
    if (!task) {
      return res
        .status(404)
        .json({ error: "Task not found or not authorized." });
    }
    // Re-schedule the updated task
    schedulerService.stopTask(task._id.toString());
    schedulerService.scheduleTask(task);
    res.json({ message: "Task updated successfully.", task });
  } catch (error) {
    console.error("Error updating AI call task:", error);
    res
      .status(500)
      .json({
        error: "Failed to update AI call task.",
        details: error.message,
      });
  }
});

// DELETE /api/ai-call-automation/tasks/:id
// Delete a scheduled AI call task
router.delete("/tasks/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    // Only allow deleting user's own tasks
    const task = await CallTask.findOneAndDelete({
      _id: id,
      userId: req.user.userId,
    });
    if (!task) {
      return res
        .status(404)
        .json({ error: "Task not found or not authorized." });
    }
    // Remove from scheduler
    schedulerService.stopTask(task._id.toString());
    res.json({ message: "Task deleted successfully." });
  } catch (error) {
    console.error("Error deleting AI call task:", error);
    res
      .status(500)
      .json({
        error: "Failed to delete AI call task.",
        details: error.message,
      });
  }
});

export default router;
