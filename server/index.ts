import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'freelancehub-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

import { seedData } from "./lib/seed-data";
import { MongoStorage } from "./lib/mongo-storage";
import { setStorage } from "./storage";

(async () => {
  // Initialize storage
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri) {
    try {
      console.log('Attempting to connect to MongoDB Atlas...');
      const mongoStorage = new MongoStorage(mongoUri);
      await mongoStorage.connect();
      setStorage(mongoStorage);
      console.log('✓ Using MongoDB Atlas for persistent storage');
    } catch (error: any) {
      console.error('✗ Failed to connect to MongoDB:', error.message);
      if (error.message?.includes('SSL') || error.message?.includes('TLS')) {
        console.log('  → This appears to be an SSL/TLS issue with MongoDB Atlas');
        console.log('  → Please check your MongoDB Atlas IP whitelist (allow 0.0.0.0/0 for Replit)');
        console.log('  → Verify your connection string includes the database name');
      }
      console.log('  → Falling back to in-memory storage (data will not persist between restarts)');
    }
  } else {
    console.log('MONGODB_URI not configured, using in-memory storage');
  }
  
  // Seed initial data
  await seedData();
  import fetch from "node-fetch";

  app.get("/api/auth/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string;

    if (!code) {
      return res.status(400).send("Missing code");
    }

    try {
      const params = new URLSearchParams();
      params.append("client_id", process.env.DISCORD_CLIENT_ID!);
      params.append("client_secret", process.env.DISCORD_CLIENT_SECRET!);
      params.append("grant_type", "authorization_code");
      params.append("code", code);
      params.append("redirect_uri", process.env.DISCORD_REDIRECT_URI!);

      const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        body: params,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });

      const tokenData = await tokenResponse.json();

      if (!tokenData.access_token) {
        console.error("Token error:", tokenData);
        return res.status(400).send("Failed to get access token");
      }

      const userResponse = await fetch("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      });

      const user = await userResponse.json();

      req.session.user = user;

      res.redirect("/");
    } catch (err) {
      console.error(err);
      res.status(500).send("OAuth error");
    }
  });

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
