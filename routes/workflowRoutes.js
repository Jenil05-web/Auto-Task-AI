import express from "express";
import Workflow from "../models/Workflow.js";
import jwt from "jsonwebtoken";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// Auth middleware (reuse from other routes if possible)
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided." });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token." });
    req.user = user;
    next();
  });
}

router.use(authenticateToken);

// List all workflows for current tenant
router.get("/", async (req, res) => {
  try {
    const workflows = await Workflow.find({ tenantId: req.user.tenantId });
    res.json(workflows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch workflows." });
  }
});

// Create a new workflow
router.post("/", async (req, res) => {
  try {
    const { name, description, steps, schedule, status } = req.body;
    const workflow = new Workflow({
      tenantId: req.user.tenantId,
      name,
      description,
      steps,
      schedule,
      status,
      createdBy: req.user.userId,
    });
    await workflow.save();
    res.status(201).json(workflow);
  } catch (err) {
    res.status(500).json({ error: "Failed to create workflow." });
  }
});

// Get a single workflow by ID (must belong to tenant)
router.get("/:id", async (req, res) => {
  try {
    const workflow = await Workflow.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!workflow)
      return res.status(404).json({ error: "Workflow not found." });
    res.json(workflow);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch workflow." });
  }
});

// Update a workflow (must belong to tenant)
router.put("/:id", async (req, res) => {
  try {
    const { name, description, steps, schedule, status } = req.body;
    const workflow = await Workflow.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { $set: { name, description, steps, schedule, status } },
      { new: true }
    );
    if (!workflow)
      return res
        .status(404)
        .json({ error: "Workflow not found or not authorized." });
    res.json(workflow);
  } catch (err) {
    res.status(500).json({ error: "Failed to update workflow." });
  }
});

// Delete a workflow (must belong to tenant)
router.delete("/:id", async (req, res) => {
  try {
    const workflow = await Workflow.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!workflow)
      return res
        .status(404)
        .json({ error: "Workflow not found or not authorized." });
    res.json({ message: "Workflow deleted." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete workflow." });
  }
});

export default router;
