import { jest } from "@jest/globals";
import supertest from "supertest";
import { supabase } from "../config/supabaseClient.js";

const DEFAULT_ID = "b677be85-81db-4245-91ca-acb713bd5564";

// Legacy happy-path route tests use a controlled Auth response. Security
// denial tests use raw supertest requests so missing credentials stay missing.
export default function authenticatedRequest(app) {
   supabase.auth = {
      getUser: jest.fn(async (token) => {
         const [id, email = "test@calpoly.edu"] =
            token.split("~");
         return {
            data: {
               user: {
                  id,
                  email,
                  email_confirmed_at:
                     "2026-09-24T00:00:00Z",
                  user_metadata: { name: "Test User" },
               },
            },
            error: null,
         };
      }),
   };

   function make(method, path) {
      const result = supertest(app)[method](path);
      const privateRead =
         method === "get" &&
         (path.startsWith("/api/notifications/") ||
            path === "/api/restaurants/bookmarks");
      if (method !== "get" || privateRead) {
         const pathId = path.match(
            /^\/api\/(?:users|notifications|uploads\/profile-photo)\/([^/?]+)/,
         )?.[1];
         const id =
            pathId && pathId !== "follows"
               ? pathId
               : DEFAULT_ID;
         result.set(
            "Authorization",
            `Bearer ${id}~test@calpoly.edu`,
         );
      }

      const originalSend = result.send.bind(result);
      result.send = (body) => {
         const id =
            body?.user_id || body?.follower_id || body?.id;
         if (id && method !== "get") {
            result.set(
               "Authorization",
               `Bearer ${id}~${body.email || "test@calpoly.edu"}`,
            );
         }
         return originalSend(body);
      };
      const originalField = result.field.bind(result);
      result.field = (name, value) => {
         if (name === "user_id") {
            result.set(
               "Authorization",
               `Bearer ${value}~test@calpoly.edu`,
            );
         }
         return originalField(name, value);
      };
      return result;
   }

   return {
      get: (path) => make("get", path),
      post: (path) => make("post", path),
      patch: (path) => make("patch", path),
      delete: (path) => make("delete", path),
   };
}
