import express from "express";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Template from "../models/Template.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// ✅ Enhanced authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ error: "No token provided." });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token." });
    }
    req.user = user;
    next();
  });
}

// Protect all ML routes
router.use(authenticateToken);

// ✅ Enhanced email analysis with learning
router.post("/analyze-email", async (req, res) => {
  try {
    const { emailContent, context, templateId } = req.body;
    
    if (!emailContent) {
      return res.status(400).json({ error: "Email content is required" });
    }
    
    // Get user for personalized analysis
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Prepare analysis data with user context
    const analysisData = {
      emailContent,
      context: context || {},
      userPreferences: user.aiPreferences,
      activityHistory: user.activityLog.slice(-50), // Last 50 activities
      templateUsage: user.templateUsage
    };
    
    // Call enhanced Python script
    const pythonProcess = spawn("python", [
      path.join(__dirname, "../ml/enhanced_email_analyzer.py"),
      JSON.stringify(analysisData)
    ]);
    
    let result = "";
    let errorOutput = "";
    
    pythonProcess.stdout.on("data", (data) => {
      result += data.toString();
    });
    
    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    
    pythonProcess.on("close", async (code) => {
      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
        console.error(`Error output: ${errorOutput}`);
        return res.status(500).json({ 
          error: "Failed to analyze email", 
          details: errorOutput 
        });
      }
      
      try {
        const analysisResult = JSON.parse(result);
        
        // Log analysis activity for learning
        await user.logActivity("email_analyzed", {
          emailLength: emailContent.length,
          analysisType: "content_analysis",
          suggestions: analysisResult.suggestions?.length || 0,
          confidence: analysisResult.confidence || 0
        }, "email");
        
        // Update template usage if templateId provided
        if (templateId) {
          await user.updateTemplateUsage(templateId, true, analysisResult.processingTime || 0);
        }
        
        return res.json({
          ...analysisResult,
          personalized: true,
          timestamp: new Date()
        });
      } catch (parseError) {
        console.error("Failed to parse Python output:", parseError);
        return res.status(500).json({ error: "Failed to parse analysis result" });
      }
    });
  } catch (error) {
    console.error("Error in analyze-email endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Enhanced similar emails with learning
router.post("/similar-emails", async (req, res) => {
  try {
    const { emailContent, count = 5, includeUserHistory = true } = req.body;
    
    if (!emailContent) {
      return res.status(400).json({ error: "Email content is required" });
    }
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Prepare search data
    const searchData = {
      emailContent,
      count,
      includeUserHistory,
      userHistory: includeUserHistory ? user.activityLog.filter(a => a.category === 'email') : [],
      templateUsage: user.templateUsage
    };
    
    const pythonProcess = spawn("python", [
      path.join(__dirname, "../ml/similar_emails_finder.py"),
      JSON.stringify(searchData)
    ]);
    
    let result = "";
    let errorOutput = "";
    
    pythonProcess.stdout.on("data", (data) => {
      result += data.toString();
    });
    
    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    
    pythonProcess.on("close", async (code) => {
      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
        console.error(`Error output: ${errorOutput}`);
        return res.status(500).json({ 
          error: "Failed to find similar emails", 
          details: errorOutput 
        });
      }
      
      try {
        const similarEmails = JSON.parse(result);
        
        // Log similarity search for learning
        await user.logActivity("similar_emails_searched", {
          resultsCount: similarEmails.length,
          searchQuery: emailContent.substring(0, 100)
        }, "email");
        
        return res.json({
          similarEmails,
          searchMetadata: {
            searchTime: new Date(),
            resultCount: similarEmails.length,
            personalized: includeUserHistory
          }
        });
      } catch (parseError) {
        console.error("Failed to parse Python output:", parseError);
        return res.status(500).json({ error: "Failed to parse similar emails result" });
      }
    });
  } catch (error) {
    console.error("Error in similar-emails endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Smart template suggestion based on AI learning
router.post("/suggest-template", async (req, res) => {
  try {
    const { emailContent, context, recipientType } = req.body;
    
    if (!emailContent) {
      return res.status(400).json({ error: "Email content is required" });
    }
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Get user's templates for personalized suggestions
    const userTemplates = await Template.find({ 
      owner: req.user.userId, 
      isActive: true 
    });
    
    const suggestionData = {
      emailContent,
      context: context || {},
      recipientType,
      userTemplates: userTemplates.map(t => ({
        id: t._id,
        name: t.name,
        category: t.category,
        variables: t.variables,
        analytics: t.analytics
      })),
      userPreferences: user.aiPreferences,
      templateUsage: user.templateUsage
    };
    
    const pythonProcess = spawn("python", [
      path.join(__dirname, "../ml/template_suggester.py"),
      JSON.stringify(suggestionData)
    ]);
    
    let result = "";
    let errorOutput = "";
    
    pythonProcess.stdout.on("data", (data) => {
      result += data.toString();
    });
    
    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    
    pythonProcess.on("close", async (code) => {
      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
        console.error(`Error output: ${errorOutput}`);
        return res.status(500).json({ 
          error: "Failed to suggest templates", 
          details: errorOutput 
        });
      }
      
      try {
        const suggestions = JSON.parse(result);
        
        // Log template suggestion for learning
        await user.logActivity("template_suggestions_requested", {
          suggestionsCount: suggestions.length,
          context: context || {},
          recipientType
        }, "template");
        
        return res.json({
          suggestions,
          metadata: {
            totalUserTemplates: userTemplates.length,
            generatedAt: new Date(),
            personalized: true
          }
        });
      } catch (parseError) {
        console.error("Failed to parse Python output:", parseError);
        return res.status(500).json({ error: "Failed to parse template suggestions" });
      }
    });
  } catch (error) {
    console.error("Error in suggest-template endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Learn from user behavior
router.post("/learn-from-action", async (req, res) => {
  try {
    const { action, context, feedback, success } = req.body;
    
    if (!action) {
      return res.status(400).json({ error: "Action is required" });
    }
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Prepare learning data
    const learningData = {
      action,
      context: context || {},
      feedback,
      success: success !== undefined ? success : true,
      timestamp: new Date(),
      userId: req.user.userId
    };
    
    const pythonProcess = spawn("python", [
      path.join(__dirname, "../ml/behavior_learner.py"),
      JSON.stringify(learningData)
    ]);
    
    let result = "";
    let errorOutput = "";
    
    pythonProcess.stdout.on("data", (data) => {
      result += data.toString();
    });
    
    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    
    pythonProcess.on("close", async (code) => {
      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
        console.error(`Error output: ${errorOutput}`);
        return res.status(500).json({ 
          error: "Failed to process learning data", 
          details: errorOutput 
        });
      }
      
      try {
        const learningResult = JSON.parse(result);
        
        // Log learning activity
        await user.logActivity("ai_learning_update", {
          action,
          success,
          feedback: feedback ? "provided" : "none",
          learningUpdates: learningResult.updates || []
        }, "ai");
        
        return res.json({
          message: "Learning data processed successfully",
          learningResult,
          timestamp: new Date()
        });
      } catch (parseError) {
        console.error("Failed to parse Python output:", parseError);
        return res.status(500).json({ error: "Failed to parse learning result" });
      }
    });
  } catch (error) {
    console.error("Error in learn-from-action endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Get personalized insights
router.get("/insights", async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Get user's templates and their performance
    const userTemplates = await Template.find({ 
      owner: req.user.userId, 
      isActive: true 
    });
    
    const insightsData = {
      userId: req.user.userId,
      activityHistory: user.activityLog,
      templateUsage: user.templateUsage,
      templates: userTemplates.map(t => ({
        id: t._id,
        name: t.name,
        category: t.category,
        analytics: t.analytics,
        aiLearning: t.aiLearning
      })),
      preferences: user.aiPreferences
    };
    
    const pythonProcess = spawn("python", [
      path.join(__dirname, "../ml/insights_generator.py"),
      JSON.stringify(insightsData)
    ]);
    
    let result = "";
    let errorOutput = "";
    
    pythonProcess.stdout.on("data", (data) => {
      result += data.toString();
    });
    
    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    
    pythonProcess.on("close", async (code) => {
      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
        console.error(`Error output: ${errorOutput}`);
        return res.status(500).json({ 
          error: "Failed to generate insights", 
          details: errorOutput 
        });
      }
      
      try {
        const insights = JSON.parse(result);
        
        // Log insights generation
        await user.logActivity("insights_generated", {
          insightTypes: insights.types || [],
          totalInsights: insights.insights?.length || 0
        }, "ai");
        
        return res.json({
          insights,
          metadata: {
            generatedAt: new Date(),
            dataPoints: user.activityLog.length,
            templatesAnalyzed: userTemplates.length
          }
        });
      } catch (parseError) {
        console.error("Failed to parse Python output:", parseError);
        return res.status(500).json({ error: "Failed to parse insights" });
      }
    });
  } catch (error) {
    console.error("Error in insights endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Predict optimal send time
router.post("/predict-send-time", async (req, res) => {
  try {
    const { emailContent, recipientInfo, urgency = "medium" } = req.body;
    
    if (!emailContent) {
      return res.status(400).json({ error: "Email content is required" });
    }
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const predictionData = {
      emailContent,
      recipientInfo: recipientInfo || {},
      urgency,
      userTimezone: user.emailPreferences.timezone,
      userPreferences: user.emailPreferences,
      historicalData: user.activityLog.filter(a => a.category === 'email'),
      templateUsage: user.templateUsage
    };
    
    const pythonProcess = spawn("python", [
      path.join(__dirname, "../ml/send_time_predictor.py"),
      JSON.stringify(predictionData)
    ]);
    
    let result = "";
    let errorOutput = "";
    
    pythonProcess.stdout.on("data", (data) => {
      result += data.toString();
    });
    
    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    
    pythonProcess.on("close", async (code) => {
      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
        console.error(`Error output: ${errorOutput}`);
        return res.status(500).json({ 
          error: "Failed to predict send time", 
          details: errorOutput 
        });
      }
      
      try {
        const prediction = JSON.parse(result);
        
        // Log prediction request
        await user.logActivity("send_time_predicted", {
          urgency,
          predictedTime: prediction.optimalTime,
          confidence: prediction.confidence
        }, "ai");
        
        return res.json({
          prediction,
          metadata: {
            predictedAt: new Date(),
            userTimezone: user.emailPreferences.timezone,
            basedOnData: user.activityLog.length
          }
        });
      } catch (parseError) {
        console.error("Failed to parse Python output:", parseError);
        return res.status(500).json({ error: "Failed to parse prediction result" });
      }
    });
  } catch (error) {
    console.error("Error in predict-send-time endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Generate email content with AI
router.post("/generate-content", async (req, res) => {
  try {
    const { prompt, context, tone = "professional", length = "medium" } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const generationData = {
      prompt,
      context: context || {},
      tone,
      length,
      userPreferences: user.emailPreferences,
      userStyle: user.activityLog.filter(a => a.category === 'email').slice(-20), // Recent email activity
      templateUsage: user.templateUsage
    };
    
    const pythonProcess = spawn("python", [
      path.join(__dirname, "../ml/content_generator.py"),
      JSON.stringify(generationData)
    ]);
    
    let result = "";
    let errorOutput = "";
    
    pythonProcess.stdout.on("data", (data) => {
      result += data.toString();
    });
    
    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    
    pythonProcess.on("close", async (code) => {
      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
        console.error(`Error output: ${errorOutput}`);
        return res.status(500).json({ 
          error: "Failed to generate content", 
          details: errorOutput 
        });
      }
      
      try {
        const generatedContent = JSON.parse(result);
        
        // Log content generation
        await user.logActivity("content_generated", {
          prompt: prompt.substring(0, 100),
          tone,
          length,
          generatedLength: generatedContent.content?.length || 0
        }, "ai");
        
        return res.json({
          generatedContent,
          metadata: {
            generatedAt: new Date(),
            personalizedFor: user.name,
            basedOnHistory: true
          }
        });
      } catch (parseError) {
        console.error("Failed to parse Python output:", parseError);
        return res.status(500).json({ error: "Failed to parse generated content" });
      }
    });
  } catch (error) {
    console.error("Error in generate-content endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;