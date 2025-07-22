import express from "express";
const router = express.Router();

// Example: GET /api/clients - List all clients (placeholder)
router.get("/", (req, res) => {
  res.json({ message: "Clients route is working!" });
});

export default router;
