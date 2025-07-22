import express from "express";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// Session middleware (add to your Express app)
// app.use(session({ secret: "your_secret", resave: false, saveUninitialized: true }));
// app.use(passport.initialize());
// app.use(passport.session());

// Passport config
// passport.use(new GoogleStrategy({
//     clientID: process.env.GOOGLE_CLIENT_ID,
//     clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//     callbackURL: "https://localhost:5000/auth/google/callback"
//   },
//   async (accessToken, refreshToken, profile, done) => {
//     // Find or create user logic here
//     let user = await User.findOne({ googleId: profile.id });
//     if (!user) {
//       user = await User.create({
//         googleId: profile.id,
//         email: profile.emails[0].value,
//         name: profile.displayName,
//         avatar: profile.photos[0].value,
//         // ...other fields
//       });
//     }
//     return done(null, user);
//   }
// ));

// passport.serializeUser((user, done) => done(null, user.id));
// passport.deserializeUser(async (id, done) => {
//   const user = await User.findById(id);
//   done(null, user);
// });

// Auth middleware
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

// Admin-only middleware
function isAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

// Signup route
router.post("/signup", async (req, res) => {
  try {
    const { email, password, name, company, avatar, tenantName, tenantId } =
      req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: "User already exists." });
    }
    let finalTenantId = tenantId;
    if (tenantName) {
      // Create new tenant
      const Tenant = (await import("../models/Tenant.js")).default;
      const existingTenant = await Tenant.findOne({ name: tenantName });
      if (existingTenant) {
        return res.status(409).json({ error: "Tenant name already exists." });
      }
      const newTenant = new Tenant({ name: tenantName });
      await newTenant.save();
      finalTenantId = newTenant._id;
    } else if (tenantId) {
      // Validate tenantId exists
      const Tenant = (await import("../models/Tenant.js")).default;
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found." });
      }
    } else {
      return res.status(400).json({ error: "Tenant information required." });
    }
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Create and save user
    const newUser = new User({
      email,
      password: hashedPassword,
      name,
      company,
      avatar,
      tenantId: finalTenantId,
      role: "member", // Always default to member
    });
    await newUser.save();
    // Return user profile (excluding password)
    const userProfile = (({
      _id,
      name,
      company,
      email,
      avatar,
      createdAt,
      tenantId,
      role,
    }) => ({ _id, name, company, email, avatar, createdAt, tenantId, role }))(
      newUser
    );
    // Generate JWT with tenantId and role (like login)
    const token = jwt.sign(
      {
        userId: newUser._id,
        email: newUser.email,
        tenantId: newUser.tenantId,
        role: newUser.role,
      },
      JWT_SECRET,
      { expiresIn: "2h" }
    );
    res.status(201).json({
      message: "User registered successfully!",
      token,
      user: userProfile,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error during registration." });
  }
});

// Login route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials." });
    }
    // Generate JWT with tenantId and role
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "2h" }
    );
    // Return user profile (excluding password)
    const userProfile = (({
      _id,
      name,
      company,
      email,
      avatar,
      createdAt,
      tenantId,
      role,
    }) => ({ _id, name, company, email, avatar, createdAt, tenantId, role }))(
      user
    );
    res
      .status(200)
      .json({ message: "Login successful!", token, user: userProfile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error during login." });
  }
});

// List all tenants (for registration UI)
router.get("/tenants", async (req, res) => {
  try {
    const Tenant = (await import("../models/Tenant.js")).default;
    const tenants = await Tenant.find({}, "_id name plan createdAt");
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tenants." });
  }
});

// Get current user's profile
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

// Update current user's profile
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { name, company } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { name, company },
      { new: true, runValidators: true, select: "-password" }
    );
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

// Update avatar
router.put("/avatar", authenticateToken, async (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar) return res.status(400).json({ error: "No avatar provided." });
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { avatar },
      { new: true, runValidators: true, select: "-password" }
    );
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ avatar: user.avatar });
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

// Change password
router.put("/password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required." });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "New passwords do not match." });
    }
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found." });
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password updated successfully!" });
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

// Delete account
router.delete("/account", authenticateToken, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ message: "Account deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

// List all users in the tenant (admin only)
router.get("/team", authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await User.find({ tenantId: req.user.tenantId }).select(
      "-password"
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch team members." });
  }
});

// Promote a user to admin (admin only)
router.put(
  "/team/:userId/promote",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findOneAndUpdate(
        { _id: userId, tenantId: req.user.tenantId },
        { $set: { role: "admin" } },
        { new: true, select: "-password" }
      );
      if (!user) return res.status(404).json({ error: "User not found." });
      res.json({ message: "User promoted to admin.", user });
    } catch (err) {
      res.status(500).json({ error: "Failed to promote user." });
    }
  }
);

// Google OAuth routes
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    // Successful authentication, redirect or send JWT
    res.redirect("/"); // or send a token
  }
);

export default router;
