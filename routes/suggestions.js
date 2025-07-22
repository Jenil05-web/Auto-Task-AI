import express from "express";
import { getAdvancedSuggestions } from "../ml/advancedSuggestions.js"; // (to be implemented)
import { authenticateToken } from "../middlewares/authenticateToken.js";
import Task from "../models/task.js";
import User from "../models/User.js";

const router = express.Router();

router.use(authenticateToken);

// GET /api/automations/suggestions
router.get("/", async (req, res) => {
  try {
    // Fetch user to get dismissed suggestions
    const user = await User.findById(req.user.userId);
    const dismissed = user?.dismissedSuggestions || [];
    // Call your advanced ML/AI logic here (can be a Python microservice call)
    let suggestions = await getAdvancedSuggestions(
      req.user.userId,
      req.user.tenantId
    );
    // Filter out dismissed suggestions by taskId
    suggestions = suggestions.filter(
      (s) => !dismissed.includes(String(s.taskId))
    );
    res.json({ suggestions });
  } catch (error) {
    console.error("Advanced suggestions error:", error);
    res.status(500).json({ error: "Failed to generate advanced suggestions" });
  }
});

// Accept a suggestion
router.post("/:id/accept", async (req, res) => {
  try {
    const { id } = req.params;
    // Find the original task
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ error: "Task not found" });

    // Schedule for today
    const now = new Date();
    task.datetime = now;
    task.isActive = true;
    await task.save();

    res.json({ success: true, message: "Task scheduled for today", task });
  } catch (error) {
    res.status(500).json({ error: "Failed to accept and schedule suggestion" });
  }
});

// Dismiss a suggestion
router.post("/:id/dismiss", async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    // Add the dismissed taskId to the user's dismissedSuggestions array if not already present
    if (!user.dismissedSuggestions) user.dismissedSuggestions = [];
    if (!user.dismissedSuggestions.includes(req.params.id)) {
      user.dismissedSuggestions.push(req.params.id);
      await user.save();
    }
    res.json({ success: true, message: "Suggestion dismissed" });
  } catch (error) {
    res.status(500).json({ error: "Failed to dismiss suggestion" });
  }
});

export default router;
