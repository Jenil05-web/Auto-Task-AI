import dotenv from "dotenv";
dotenv.config();
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import fs from "fs";
import https from "https";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as SamlStrategy } from "passport-saml";
import crypto from "crypto";

// Secure password generation for OAuth users
function generateSecurePassword() {
  // Generate a cryptographically secure random password
  // This is only used for OAuth users who don't need to know their password
  return crypto.randomBytes(32).toString('hex');
}

// Existing imports
import taskRoutes from "./routes/taskRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import workflowRoutes from "./routes/workflowRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import User from "./models/User.js";
import EmailAutomation from "./models/EmailAutomation.js";
import suggestionsRoutes from "./routes/suggestions.js";
import mlRoutes from "./routes/mlRoutes.js";

// NEW IMPORTS FOR AUTOMATED CALLING
import callTaskRoutes from "./routes/callTasks.js";
import clientRoutes from "./routes/clients.js";
import webhookRoutes from "./routes/webhooks.js";
import analyticsRoutes from "./routes/analytics.js";


console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY);
const app = express();

// Redis session (optional)
let sessionStore;
if (process.env.REDIS_URL) {
  const Redis = require("ioredis");
  const RedisStore = require("connect-redis")(session);
  const redisClient = new Redis(process.env.REDIS_URL);
  sessionStore = new RedisStore({ client: redisClient });
}

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://10.102.202.63:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // NEW: For webhook form data

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: { secure: false },
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Passport Serialization
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ email: profile.emails[0].value });
        if (!user) {
          user = new User({
            name: profile.displayName,
            email: profile.emails[0].value,
            avatar: profile.photos[0]?.value,
            password: generateSecurePassword(),
            tenantId:
              process.env.DEFAULT_TENANT_ID || "686fcc03d957d085adfdf047",
            role: "member",
            // NEW: Add calling subscription defaults
            subscription: {
              plan: "free",
              callsRemaining: 50,
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            },
            settings: {
              timezone: "UTC",
              voicePreference: "female",
              language: "en-US",
            },
          });
          await user.save();
        }
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// Google OAuth Routes
app.get(
  "/api/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

app.get(
  "/api/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    const user = req.user;
    const token = jwt.sign(
      { userId: user._id, tenantId: user.tenantId },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    res.redirect(
      `${
        process.env.FRONTEND_URL || "http://localhost:5173"
      }/login?token=${token}`
    );
  }
);

// SAML Auth Routes
app.get(
  "/api/auth/saml",
  passport.authenticate("saml", { failureRedirect: "/login" })
);
app.post(
  "/api/auth/saml/callback",
  passport.authenticate("saml", { failureRedirect: "/login" }),
  (req, res) => {
    const user = req.user;
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );
    res.redirect(
      `${
        process.env.FRONTEND_URL || "http://localhost:5173"
      }/login?token=${token}`
    );
  }
);

// Save Email Automation
app.post("/api/email-automation", async (req, res) => {
  try {
    const userId = req.session?.userId || req.user?._id || req.body.userId;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { recipients, subject, body, schedule } = req.body;
    const automation = new EmailAutomation({
      user: userId,
      recipients,
      subject,
      body,
      schedule,
    });
    await automation.save();
    res.json({ success: true, automation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger n8n manually
app.post("/api/trigger-n8n", async (req, res) => {
  try {
    const response = await fetch(
      "https://jenil005.app.n8n.cloud/webhook/execute-task",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Triggered from my app!",
          user: "Jenil",
          priority: "High",
          task: "Send report",
        }),
      }
    );
    const data = await response.text();
    res.json({ status: "n8n triggered", n8nResponse: data });
  } catch (error) {
    res.status(500).json({ error: "Failed to trigger n8n" });
  }
});

// NEW: Demo endpoint for testing natural language input
app.post("/api/test-nlp", async (req, res) => {
  try {
    const { input } = req.body;

    // Simple demo response (will be replaced by actual NLP service)
    const demoResponse = {
      originalInput: input,
      parsed: {
        action: "reminder",
        frequency: "daily",
        time: "10:00",
        purpose: "appointment confirmation",
        confidence: 0.85,
      },
      message:
        "NLP parsing successful! This will be enhanced with OpenAI integration.",
    };

    res.json(demoResponse);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Existing API Routes
app.use("/api/tasks", taskRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/workflows", workflowRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/automations/suggestions", suggestionsRoutes);
app.use("/api/ml", mlRoutes);

// NEW API Routes for Automated Calling
app.use("/api/call-tasks", callTaskRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/analytics", analyticsRoutes);

// NEW: Webhook routes (no auth required for external services)
app.use("/webhooks", webhookRoutes);

// Health check
app.get("/health", (req, res) =>
  res.status(200).json({
    status: "ok",
    features: {
      emailAutomation: true,
      workflows: true,
      callAutomation: true, // NEW
      aiConversations: true, // NEW
    },
  })
);

// MongoDB Connection
if (!process.env.MONGODB_URI) {
  console.error("❌ MONGODB_URI is not defined in .env");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000, // 30 seconds
    socketTimeoutMS: 45000, // 45 seconds
  })
  .then(async () => {
    console.log("✅ Connected to MongoDB");

    // Import scheduler AFTER connection is established
    try {
      await import("./scheduler.js");
      console.log("✅ Email scheduler initialized");
    } catch (err) {
      console.error("❌ Email scheduler error:", err);
    }

    // NEW: Initialize Call Scheduler
    try {
      await import("./services/schedulerService.js");
      console.log("✅ Call scheduler initialized");
    } catch (err) {
      console.error("❌ Call scheduler error:", err);
    }

    const PORT = process.env.PORT || 5000;

    if (process.env.HTTPS_KEY && process.env.HTTPS_CERT) {
      const key = fs.readFileSync(process.env.HTTPS_KEY);
      const cert = fs.readFileSync(process.env.HTTPS_CERT);
      https.createServer({ key, cert }, app).listen(PORT, () => {
        console.log(`🚀 HTTPS server running at https://localhost:${PORT}`);
        console.log(
          `📞 Call automation endpoints available at /api/call-tasks`
        );
        console.log(`🔗 Webhooks available at /webhooks`);
      });
    } else {
      app.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
        console.log(
          `📞 Call automation endpoints available at /api/call-tasks`
        );
        console.log(`🔗 Webhooks available at /webhooks`);
      });
    }
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });
