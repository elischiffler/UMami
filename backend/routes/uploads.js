import express from "express";
import multer from "multer";
import { supabase } from "../config/supabaseClient.js";
import {
   requireAuth,
   requireOwner,
} from "../middleware/auth.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const REVIEW_BUCKET = "review-photos";
const AVATAR_BUCKET = "profile-photos";

// POST /api/uploads/review-photo
router.post(
   "/review-photo",
   requireAuth,
   upload.single("file"),
   async (req, res) => {
      try {
         if (!req.file) {
            return res
               .status(400)
               .json({ error: "No file provided" });
         }

         const ext = req.file.originalname.split(".").pop();
         const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

         const { error: uploadError } =
            await supabase.storage
               .from(REVIEW_BUCKET)
               .upload(fileName, req.file.buffer, {
                  contentType: req.file.mimetype,
                  upsert: false,
               });

         if (uploadError) {
            throw uploadError;
         }

         const { data } = supabase.storage
            .from(REVIEW_BUCKET)
            .getPublicUrl(fileName);

         return res
            .status(201)
            .json({ url: data.publicUrl });
      } catch (err) {
         console.error("Upload error:", err);
         return res
            .status(500)
            .json({ error: err.message });
      }
   },
);

// POST /api/uploads/profile-photo
// Uses user_id as filename so uploading always overwrites the old photo
router.post(
   "/profile-photo",
   requireAuth,
   upload.single("file"),
   async (req, res) => {
      try {
         if (!requireOwner(req, res, req.body?.user_id)) {
            return;
         }
         if (!req.file) {
            return res
               .status(400)
               .json({ error: "No file provided" });
         }

         const ext = req.file.originalname.split(".").pop();
         const userId = req.authUser.id;
         const fileName = `avatars/${userId}.${ext}`;

         // upsert: true overwrites the existing file for this user
         const { error: uploadError } =
            await supabase.storage
               .from(AVATAR_BUCKET)
               .upload(fileName, req.file.buffer, {
                  contentType: req.file.mimetype,
                  upsert: true,
               });

         if (uploadError) {
            throw uploadError;
         }

         const { data } = supabase.storage
            .from(AVATAR_BUCKET)
            .getPublicUrl(fileName);

         const separator = data.publicUrl.includes("?")
            ? "&"
            : "?";

         return res.status(201).json({
            url: `${data.publicUrl}${separator}v=${Date.now()}`,
         });
      } catch (err) {
         console.error("Profile photo upload error:", err);
         return res
            .status(500)
            .json({ error: err.message });
      }
   },
);

// DELETE /api/uploads/profile-photo/:userId
// Deletes the user's profile photo from storage and clears avatar_url in DB
router.delete(
   "/profile-photo/:userId",
   requireAuth,
   async (req, res) => {
      const { userId } = req.params;
      if (!requireOwner(req, res, userId)) {
         return;
      }

      try {
         // Try to delete all common image extensions for this user
         const extensions = [
            "jpg",
            "jpeg",
            "png",
            "webp",
            "gif",
         ];
         for (const ext of extensions) {
            const { error: removeError } =
               await supabase.storage
                  .from(AVATAR_BUCKET)
                  .remove([`avatars/${userId}.${ext}`]);
            if (removeError) {
               throw removeError;
            }
         }

         // Clear avatar_url in the database and revert to ui-avatars.com
         const { data: userData, error: userError } =
            await supabase
               .from("users")
               .select("name")
               .eq("id", userId)
               .single();
         if (userError) {
            throw userError;
         }

         const defaultAvatar = userData?.name
            ? `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}`
            : "";

         const { error: updateError } = await supabase
            .from("users")
            .update({ avatar_url: defaultAvatar })
            .eq("id", userId);
         if (updateError) {
            throw updateError;
         }

         return res.status(200).json({
            message: "Profile photo removed",
            avatar_url: defaultAvatar,
         });
      } catch (err) {
         console.error("Delete profile photo error:", err);
         return res
            .status(500)
            .json({ error: err.message });
      }
   },
);

export default router;
