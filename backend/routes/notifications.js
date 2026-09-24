import express from "express";
import { supabase } from "../config/supabaseClient.js";
import { Notification } from "../models/notificationModel.js";
import { z } from "zod";
import {
   requireAuth,
   requireOwner,
} from "../middleware/auth.js";

const router = express.Router();

// Create a new notification
const PROFILE_PHOTO_REMINDER =
   "Don't forget to add a profile photo so others can recognize you!";

router.post("/", requireAuth, async (req, res) => {
   if (!requireOwner(req, res, req.body.user_id)) {
      return;
   }
   if (req.body.type !== "profile_photo") {
      return res
         .status(400)
         .json({ error: "Unsupported notification type" });
   }
   try {
      const { data, error } = await supabase
         .from("notifications")
         .insert([
            {
               user_id: req.authUser.id,
               type: "profile_photo",
               message: PROFILE_PHOTO_REMINDER,
               related_id: null,
               is_read: false,
            },
         ])
         .select();

      if (error) {
         throw error;
      }

      const validatedData = z
         .array(Notification)
         .parse(data);

      res.status(201).json(validatedData[0]);
   } catch (error) {
      res.status(500).json({ error: error.message });
   }
});

// Get all notifications for a user
router.get("/:userId", requireAuth, async (req, res) => {
   const { userId } = req.params;
   if (!requireOwner(req, res, userId)) {
      return;
   }
   try {
      const { data, error } = await supabase
         .from("notifications")
         .select("*")
         .eq("user_id", userId)
         .order("created_at", { ascending: false });

      if (error) {
         throw error;
      }

      const validatedData = z
         .array(Notification)
         .parse(data);

      res.status(200).json(validatedData);
   } catch (error) {
      res.status(500).json({ error: error.message });
   }
});

// Mark all notifications as read for a user
router.patch(
   "/:userId/read-all",
   requireAuth,
   async (req, res) => {
      const { userId } = req.params;
      if (!requireOwner(req, res, userId)) {
         return;
      }
      try {
         const { error } = await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("user_id", userId);

         if (error) {
            throw error;
         }

         res.status(200).json({
            message: "All notifications marked as read",
         });
      } catch (error) {
         res.status(500).json({ error: error.message });
      }
   },
);

// Delete all notifications for a user
router.delete(
   "/:userId/delete-all",
   requireAuth,
   async (req, res) => {
      const { userId } = req.params;
      if (!requireOwner(req, res, userId)) {
         return;
      }
      try {
         const { error } = await supabase
            .from("notifications")
            .delete()
            .eq("user_id", userId);

         if (error) {
            throw error;
         }

         res.status(200).json({
            message: "All notifications deleted",
         });
      } catch (error) {
         res.status(500).json({ error: error.message });
      }
   },
);

// Mark a notification as read
router.patch("/:id/read", requireAuth, async (req, res) => {
   const { id } = req.params;
   try {
      const { data, error } = await supabase
         .from("notifications")
         .update({ is_read: true })
         .eq("id", id)
         .eq("user_id", req.authUser.id)
         .select();

      if (error) {
         throw error;
      }

      const validatedData = z
         .array(Notification)
         .parse(data);

      if (!validatedData.length) {
         return res
            .status(404)
            .json({ error: "Notification not found" });
      }
      res.status(200).json(validatedData[0]);
   } catch (error) {
      res.status(500).json({ error: error.message });
   }
});

// Delete a notification
router.delete("/:id", requireAuth, async (req, res) => {
   const { id } = req.params;
   try {
      const { error } = await supabase
         .from("notifications")
         .delete()
         .eq("id", id)
         .eq("user_id", req.authUser.id);

      if (error) {
         throw error;
      }

      res.status(200).json({
         message: "Notification deleted",
      });
   } catch (error) {
      res.status(500).json({ error: error.message });
   }
});

export default router;
