import express from "express";
const router = express.Router();
import CallTask from "../models/CallTask.js";
import Client from "../models/Client.js";
import NLPService from "../services/nlpService.js";
import SchedulerService from "../services/schedulerService.js";
import { authenticateToken } from "../middlewares/authenticateToken.js";

// Create new call task from natural language
router.post("/create", authenticateToken, async (req, res) => {
  try {
    const { naturalLanguageInput } = req.body;

    // Parse natural language using NLP
    const parsedIntent = await NLPService.parseNaturalLanguageIntent(
      naturalLanguageInput
    );

    // Create call task
    const callTask = new CallTask({
      userId: req.user._id,
      title: `Call Task - ${parsedIntent.action}`,
      naturalLanguageInput,
      parsedIntent,
      schedule: {
        frequency: parsedIntent.frequency,
        time: parsedIntent.time,
        timezone: req.user.settings.timezone,
      },
      callScript: {
        greeting: `Hello, this is an automated call from ${req.user.name}.`,
        mainMessage: parsedIntent.script,
        closingMessage: "Thank you for your time. Have a great day!",
      },
    });

    await callTask.save();

    // Schedule the task
    SchedulerService.scheduleTask(callTask);

    res.status(201).json({
      success: true,
      task: callTask,
      message: "Call task created and scheduled successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get all user's call tasks
router.get("/", authenticateToken, async (req, res) => {
  try {
    const tasks = await CallTask.find({ userId: req.user._id })
      .populate("clients")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      tasks,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Toggle task active status
router.patch("/:taskId/toggle", authenticateToken, async (req, res) => {
  try {
    const task = await CallTask.findOne({
      _id: req.params.taskId,
      userId: req.user._id,
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    task.isActive = !task.isActive;
    await task.save();

    if (task.isActive) {
      SchedulerService.scheduleTask(task);
    } else {
      SchedulerService.stopTask(task._id.toString());
    }

    res.json({
      success: true,
      task,
      message: `Task ${
        task.isActive ? "activated" : "deactivated"
      } successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;