import express from "express";
const router = express.Router();

// Example payment route
router.get("/", (req, res) => {
  res.json({ message: "Payments route working!" });
});

export default router;
