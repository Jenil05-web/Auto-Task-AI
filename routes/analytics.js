import express from "express";
const router = express.Router();

// Example: GET /api/analytics - List analytics (placeholder)
router.get("/", (req, res) => {
  res.json({ message: "Analytics route is working!" });
});

export default router;
