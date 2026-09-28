import "dotenv/config";
import express from "express";
import cors from "cors";
import reviewsRouter from "./routes/reviews.js";
import usersRouter from "./routes/users.js";
import restaurantsRouter from "./routes/restaurants.js";
import notificationsRouter from "./routes/notifications.js";
import { supabase } from "./config/supabaseClient.js";
import uploadsRouter from "./routes/uploads.js";
import { optionalAuth } from "./middleware/auth.js";
import { operationalEvent } from "./operationalLog.js";

const app = express();
const PORT = process.env.PORT || 4000;
const additionalOrigins = (process.env.CORS_ORIGINS || "")
   .split(",")
   .map((origin) => origin.trim())
   .filter(Boolean);

// CORS configuration — allows requests from the frontend and local dev
// Must use specific origins (not "*") when credentials are involved
app.use(
   cors({
      origin: [
         "https://umami.elischiffler.dev", // Vercel production frontend
         "https://thankful-hill-0f3846d10.7.azurestaticapps.net", // Azure production frontend
         "http://localhost:5173", // Local Vite dev server
         "http://localhost:5174",
         ...additionalOrigins,
      ],
      credentials: true, // Allow cookies and auth headers to be sent
   }),
);

// Parse incoming JSON request bodies
app.use(express.json());

// Routes
app.use("/api", optionalAuth);
app.use("/api/reviews", reviewsRouter);
app.use("/api/users", usersRouter);
app.use("/api/restaurants", restaurantsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/uploads", uploadsRouter);

// Health check for uptime monitoring
app.get("/health", (req, res) => {
   res.json({ ok: true });
});

app.get("/ready", async (req, res) => {
   try {
      const { error } = await supabase
         .from("restaurants")
         .select("id")
         .limit(1);
      if (error) {
         throw error;
      }
      res.json({ ready: true });
   } catch {
      operationalEvent("error", "API readiness failed");
      res.status(503).json({ ready: false });
   }
});

// Root route
app.get("/", (req, res) => {
   res.json({ status: "UMami API is running!" });
});

// Only start the server if we're not in a test environment
if (process.env.NODE_ENV !== "test") {
   const server = app.listen(PORT, () => {
      operationalEvent("info", "API listening");
      console.log(
         `Server is alive on http://localhost:${PORT}`,
      );
   });
   const stop = () => {
      server.closeAllConnections();
      server.close();
   };
   process.once("SIGTERM", stop);
   process.once("SIGINT", stop);
}

export default app;
