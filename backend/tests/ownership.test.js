import {
   beforeEach,
   describe,
   expect,
   it,
   jest,
} from "@jest/globals";
import request from "supertest";
import app from "../index.js";
import { supabase } from "../config/supabaseClient.js";

jest.mock("../config/supabaseClient.js");

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const token = `Bearer fixture-owner`;

describe("API ownership boundary", () => {
   beforeEach(() => {
      jest.clearAllMocks();
      supabase.auth = {
         getUser: jest.fn().mockResolvedValue({
            data: {
               user: {
                  id: OWNER,
                  email: "owner@calpoly.edu",
                  email_confirmed_at:
                     "2026-09-24T00:00:00Z",
               },
            },
            error: null,
         }),
      };
      supabase.storage = { from: jest.fn() };
   });

   it("rejects missing and invalid tokens before database or Storage access", async () => {
      const review = await request(app)
         .post("/api/reviews")
         .send({
            user_id: OTHER,
            restaurant_id: 1,
            rating: 5,
         });
      const upload = await request(app)
         .post("/api/uploads/profile-photo")
         .field("user_id", OTHER)
         .attach(
            "file",
            Buffer.from("image"),
            "avatar.png",
         );
      const notifications = await request(app).get(
         `/api/notifications/${OWNER}`,
      );
      supabase.auth.getUser.mockResolvedValueOnce({
         data: { user: null },
         error: new Error("invalid"),
      });
      const invalid = await request(app)
         .post("/api/reviews")
         .set("Authorization", "Bearer bad-token")
         .send({ restaurant_id: 1, rating: 5 });

      expect([
         review.status,
         upload.status,
         notifications.status,
      ]).toEqual([401, 401, 401]);
      expect(invalid.status).toBe(401);
      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.storage.from).not.toHaveBeenCalled();
   });

   it("rejects cross-user IDs before privileged writes and private reads", async () => {
      const calls = [
         () =>
            request(app)
               .post("/api/reviews")
               .set("Authorization", token)
               .send({
                  user_id: OTHER,
                  restaurant_id: 1,
                  rating: 5,
               }),
         () =>
            request(app)
               .post("/api/reviews/1/helpful")
               .set("Authorization", token)
               .send({ user_id: OTHER }),
         () =>
            request(app)
               .patch(`/api/users/${OTHER}`)
               .set("Authorization", token)
               .send({ name: "Hijacked" }),
         () =>
            request(app)
               .post("/api/users/follows/sync")
               .set("Authorization", token)
               .send({
                  follower_id: OTHER,
                  added: [OWNER],
               }),
         () =>
            request(app)
               .post("/api/restaurants/bookmarks/sync")
               .set("Authorization", token)
               .send({ user_id: OTHER, added: [1] }),
         () =>
            request(app)
               .get(`/api/notifications/${OTHER}`)
               .set("Authorization", token),
         () =>
            request(app)
               .delete(
                  `/api/uploads/profile-photo/${OTHER}`,
               )
               .set("Authorization", token),
         () =>
            request(app)
               .post("/api/uploads/profile-photo")
               .set("Authorization", token)
               .field("user_id", OTHER)
               .attach(
                  "file",
                  Buffer.from("image"),
                  "avatar.png",
               ),
      ];
      for (const call of calls) {
         const response = await call();
         expect(response.status).toBe(403);
      }
      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.storage.from).not.toHaveBeenCalled();
   });

   it("derives the review and profile owner from the verified token", async () => {
      const reviewRow = {
         id: 1,
         restaurant_id: 1,
         user_id: OWNER,
         created_at: "2026-09-24",
         rating: 5,
         comment: "Good",
         photo_urls: [],
         tags: [],
      };
      const insert = jest.fn().mockReturnValue({
         select: () => ({
            single: async () => ({
               data: reviewRow,
               error: null,
            }),
         }),
      });
      supabase.from.mockReturnValue({ insert });

      const response = await request(app)
         .post("/api/reviews")
         .set("Authorization", token)
         .send({
            restaurant_id: 1,
            rating: 5,
            comment: "Good",
         });

      expect(response.status).toBe(201);
      expect(insert).toHaveBeenCalledWith([
         expect.objectContaining({ user_id: OWNER }),
      ]);
      expect(supabase.auth.getUser).toHaveBeenCalledWith(
         "fixture-owner",
      );
   });

   it("creates a profile only for the verified identity and derives private fields", async () => {
      const crossUser = await request(app)
         .post("/api/users")
         .set("Authorization", token)
         .send({
            id: OTHER,
            email: "forged@calpoly.edu",
            is_verified: true,
         });
      expect(crossUser.status).toBe(403);
      expect(supabase.from).not.toHaveBeenCalled();

      const row = {
         id: OWNER,
         email: "owner@calpoly.edu",
         created_at: "2026-09-24",
         name: "Owner",
         avatar_url: null,
         is_verified: true,
      };
      const insert = jest.fn().mockReturnValue({
         select: () => ({
            single: async () => ({
               data: row,
               error: null,
            }),
         }),
      });
      supabase.from.mockReturnValue({ insert });
      const own = await request(app)
         .post("/api/users")
         .set("Authorization", token)
         .send({
            id: OWNER,
            email: "forged@example.com",
            is_verified: false,
            name: "Owner",
         });
      expect(own.status).toBe(201);
      expect(insert).toHaveBeenCalledWith([
         expect.objectContaining({
            id: OWNER,
            email: "owner@calpoly.edu",
            is_verified: true,
         }),
      ]);
   });

   it("reports a Storage delete failure and stops before database update", async () => {
      const remove = jest.fn().mockResolvedValue({
         error: new Error("Storage failed"),
      });
      supabase.storage.from.mockReturnValue({ remove });
      const response = await request(app)
         .delete(`/api/uploads/profile-photo/${OWNER}`)
         .set("Authorization", token);
      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Storage failed");
      expect(supabase.from).not.toHaveBeenCalled();
   });

   it("reports a profile database update failure instead of claiming removal succeeded", async () => {
      supabase.storage.from.mockReturnValue({
         remove: jest
            .fn()
            .mockResolvedValue({ error: null }),
      });
      const update = jest.fn().mockReturnValue({
         eq: async () => ({
            error: new Error("Database update failed"),
         }),
      });
      supabase.from.mockReturnValue({
         select: () => ({
            eq: () => ({
               single: async () => ({
                  data: { name: "Owner" },
                  error: null,
               }),
            }),
         }),
         update,
      });
      const response = await request(app)
         .delete(`/api/uploads/profile-photo/${OWNER}`)
         .set("Authorization", token);
      expect(response.status).toBe(500);
      expect(response.body.error).toBe(
         "Database update failed",
      );
      expect(update).toHaveBeenCalled();
   });

   it("limits client-created notifications to the self profile-photo reminder", async () => {
      const reject = await request(app)
         .post("/api/notifications")
         .set("Authorization", token)
         .send({
            user_id: OWNER,
            type: "admin",
            message: "Arbitrary message",
         });
      expect(reject.status).toBe(400);
      expect(supabase.from).not.toHaveBeenCalled();

      const inserted = jest.fn().mockReturnValue({
         select: async () => ({
            data: [
               {
                  id: "33333333-3333-4333-8333-333333333333",
                  user_id: OWNER,
                  type: "profile_photo",
                  message:
                     "Don't forget to add a profile photo so others can recognize you!",
                  related_id: null,
                  is_read: false,
                  created_at: "2026-09-24",
               },
            ],
            error: null,
         }),
      });
      supabase.from.mockReturnValue({ insert: inserted });
      const accept = await request(app)
         .post("/api/notifications")
         .set("Authorization", token)
         .send({
            type: "profile_photo",
            message: "Forged body message",
         });
      expect(accept.status).toBe(201);
      expect(inserted).toHaveBeenCalledWith([
         expect.objectContaining({
            user_id: OWNER,
            type: "profile_photo",
            message:
               "Don't forget to add a profile photo so others can recognize you!",
         }),
      ]);
   });

   it("never returns email on public user lookup", async () => {
      const row = {
         id: OTHER,
         email: "private@example.com",
         password_hash: "hash",
         created_at: "2026-09-24",
         name: "Other",
         avatar_url: null,
         is_verified: false,
      };
      supabase.from.mockReturnValue({
         select: jest.fn().mockReturnThis(),
         eq: jest.fn().mockReturnThis(),
         single: jest
            .fn()
            .mockResolvedValue({ data: row, error: null }),
      });
      const response = await request(app).get(
         `/api/users/${OTHER}`,
      );
      expect(response.status).toBe(200);
      expect(response.body.email).toBeUndefined();
      expect(response.body.password_hash).toBeUndefined();
   });
});
