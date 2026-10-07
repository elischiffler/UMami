import express from "express";
import { createHash, randomBytes } from "node:crypto";
import { supabase } from "../config/supabaseClient.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
const lifetimeMs = 30 * 24 * 60 * 60 * 1000;
const hash = (token) =>
   createHash("sha256").update(token).digest("hex");

router.use((_req, res, next) => {
   res.set("Cache-Control", "no-store");
   next();
});

router.get("/status", requireAuth, async (req, res) => {
   try {
      const { data, error } = await supabase
         .from("bookmark_shares")
         .select("expires_at")
         .eq("user_id", req.authUser.id)
         .gt("expires_at", new Date().toISOString())
         .maybeSingle();
      if (error) {
         throw error;
      }
      return res.json({
         active: Boolean(data),
         expires_at: data?.expires_at ?? null,
      });
   } catch {
      return res
         .status(503)
         .json({ error: "Bookmark sharing unavailable" });
   }
});

router.post("/", requireAuth, async (req, res) => {
   try {
      const token = randomBytes(32).toString("base64url");
      const expires_at = new Date(
         Date.now() + lifetimeMs,
      ).toISOString();
      const { error } = await supabase
         .from("bookmark_shares")
         .upsert(
            {
               user_id: req.authUser.id,
               token_hash: hash(token),
               expires_at,
            },
            { onConflict: "user_id" },
         );
      if (error) {
         throw error;
      }
      return res.status(201).json({ token, expires_at });
   } catch {
      return res
         .status(503)
         .json({ error: "Could not create share link" });
   }
});

router.delete("/", requireAuth, async (req, res) => {
   try {
      const { error } = await supabase
         .from("bookmark_shares")
         .delete()
         .eq("user_id", req.authUser.id);
      if (error) {
         throw error;
      }
      return res.sendStatus(204);
   } catch {
      return res
         .status(503)
         .json({ error: "Could not revoke share link" });
   }
});

// Tokens are in the request body, not URL paths/query strings or access logs.
router.post("/view", async (req, res) => {
   const token = req.body?.token;
   if (
      typeof token !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(token)
   ) {
      return res
         .status(404)
         .json({ error: "Share link unavailable" });
   }
   try {
      const { data: share, error: shareError } =
         await supabase
            .from("bookmark_shares")
            .select("user_id")
            .eq("token_hash", hash(token))
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();
      if (shareError) {
         throw shareError;
      }
      if (!share) {
         return res
            .status(404)
            .json({ error: "Share link unavailable" });
      }
      const { data: bookmarks, error: bookmarkError } =
         await supabase
            .from("bookmarks")
            .select("restaurant_id")
            .eq("user_id", share.user_id);
      if (bookmarkError) {
         throw bookmarkError;
      }
      const ids = bookmarks.map((row) => row.restaurant_id);
      if (!ids.length) {
         return res.json([]);
      }
      const { data, error } = await supabase
         .from("restaurants")
         .select("id,name,location,image_urls,avg_rating")
         .in("id", ids);
      if (error) {
         throw error;
      }
      return res.json(data);
   } catch {
      return res
         .status(503)
         .json({ error: "Bookmark sharing unavailable" });
   }
});

export default router;
