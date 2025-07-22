import express from "express";
import {
  signup,
  login,
} from "../../task-ai-weave/server/controllers/auth.controller.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/test", (req, res) => {
  res.send("Test route working!");
});

export default router;
