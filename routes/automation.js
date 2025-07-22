const express = require("express");
const router = express.Router();
// Assume you have a function to get automation data from your DB
const { getAutomationData } = require("../models/automation");

// GET /api/automation/:automationId/data
router.get("/:automationId/data", async (req, res) => {
  const { automationId } = req.params;
  try {
    const data = await getAutomationData(automationId);
    if (!data) {
      return res.status(404).json({ error: "Automation not found" });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// POST /api/automation/:automationId/status
router.post("/:automationId/status", async (req, res) => {
  const { automationId } = req.params;
  const { status, details, sentAt } = req.body;
  try {
    // TODO: Store or log the status update in your database for user notification
    // Example: await saveAutomationStatus(automationId, { status, details, sentAt });
    console.log(`Automation ${automationId} status:`, {
      status,
      details,
      sentAt,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// POST /api/ai/generate-email
router.post("/api/ai/generate-email", (req, res) => {
  const { template, variables } = req.body;
  if (!template || !variables) {
    return res.status(400).json({ error: "Missing template or variables" });
  }
  // Simple template replacement (mock AI)
  let emailContent = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    emailContent = emailContent.replace(regex, value);
  }
  res.json({ emailContent });
});

module.exports = router;
