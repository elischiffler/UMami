import { supabase } from "../config/supabaseClient.js";

export async function optionalAuth(req, res, next) {
   const header = req.get("authorization");
   if (!header) {
      return next();
   }

   const match = /^Bearer ([^\s]+)$/i.exec(header);
   if (!match) {
      return res
         .status(401)
         .json({ error: "Invalid authorization header" });
   }

   try {
      const { data, error } = await supabase.auth.getUser(
         match[1],
      );
      if (error || !data?.user?.id) {
         return res
            .status(401)
            .json({ error: "Invalid access token" });
      }
      req.authUser = data.user;
      return next();
   } catch {
      return res
         .status(503)
         .json({ error: "Authentication unavailable" });
   }
}

export function requireAuth(req, res, next) {
   if (!req.authUser) {
      return res
         .status(401)
         .json({ error: "Sign in required" });
   }
   return next();
}

export function requireOwner(req, res, ownerId) {
   if (ownerId && ownerId !== req.authUser.id) {
      res.status(403).json({ error: "Forbidden" });
      return false;
   }
   return true;
}
