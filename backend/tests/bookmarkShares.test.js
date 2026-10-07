import {
   jest,
   describe,
   it,
   expect,
   beforeEach,
} from "@jest/globals";
import supertest from "supertest";
import { createHash } from "node:crypto";
import app from "../index.js";
import { supabase } from "../config/supabaseClient.js";
import request from "./authenticatedRequest.js";

jest.mock("../config/supabaseClient.js");
const owner = "b677be85-81db-4245-91ca-acb713bd5564";

describe("Private bookmark share capabilities", () => {
   beforeEach(() => jest.clearAllMocks());

   it.each([
      ["get", "/status"],
      ["post", ""],
      ["delete", ""],
   ])("requires auth for %s %s", async (method, path) => {
      const response = await supertest(app)[method](
         `/api/bookmark-shares${path}`,
      );
      expect(response.status).toBe(401);
      expect(supabase.from).not.toHaveBeenCalled();
   });

   it("stores only a hash and derives the owner from verified auth", async () => {
      const upsert = jest
         .fn()
         .mockResolvedValue({ error: null });
      supabase.from.mockReturnValue({ upsert });
      const before = Date.now();
      const response = await request(app)
         .post("/api/bookmark-shares")
         .send({ owner_id: "victim" });
      expect(response.status).toBe(201);
      expect(response.headers["cache-control"]).toBe(
         "no-store",
      );
      expect(response.body.token).toMatch(
         /^[A-Za-z0-9_-]{43}$/,
      );
      expect(upsert).toHaveBeenCalledWith(
         {
            user_id: owner,
            token_hash: createHash("sha256")
               .update(response.body.token)
               .digest("hex"),
            expires_at: response.body.expires_at,
         },
         { onConflict: "user_id" },
      );
      expect(
         JSON.stringify(upsert.mock.calls),
      ).not.toContain(response.body.token);
      expect(
         new Date(response.body.expires_at).getTime(),
      ).toBeGreaterThanOrEqual(before + 30 * 86400000);
   });

   it("revokes only the caller's link regardless of the body", async () => {
      const eq = jest
         .fn()
         .mockResolvedValue({ error: null });
      supabase.from.mockReturnValue({
         delete: jest.fn().mockReturnValue({ eq }),
      });
      const response = await request(app)
         .delete("/api/bookmark-shares")
         .send({ owner_id: "victim" });
      expect(response.status).toBe(204);
      expect(eq).toHaveBeenCalledWith("user_id", owner);
   });

   it("returns status without disclosing a stored hash", async () => {
      const query = {
         select: jest.fn().mockReturnThis(),
         eq: jest.fn().mockReturnThis(),
         gt: jest.fn().mockReturnThis(),
         maybeSingle: jest.fn().mockResolvedValue({
            data: { expires_at: "2099-01-01T00:00:00Z" },
            error: null,
         }),
      };
      supabase.from.mockReturnValue(query);
      const response = await request(app)
         .get("/api/bookmark-shares/status")
         .set("Authorization", `Bearer ${owner}`);
      expect(response.body).toEqual({
         active: true,
         expires_at: "2099-01-01T00:00:00Z",
      });
      expect(query.select).toHaveBeenCalledWith(
         "expires_at",
      );
      expect(query.eq).toHaveBeenCalledWith(
         "user_id",
         owner,
      );
      expect(query.gt).toHaveBeenCalledWith(
         "expires_at",
         expect.any(String),
      );
   });

   it.each([
      undefined,
      "short",
      "a".repeat(100),
      {},
      "!".repeat(43),
   ])(
      "rejects a malformed token without a database call",
      async (token) => {
         const response = await supertest(app)
            .post("/api/bookmark-shares/view")
            .send({ token });
         expect(response.status).toBe(404);
         expect(supabase.from).not.toHaveBeenCalled();
      },
   );

   it("fails closed for missing, expired or revoked shares", async () => {
      const query = {
         select: jest.fn().mockReturnThis(),
         eq: jest.fn().mockReturnThis(),
         gt: jest.fn().mockReturnThis(),
         maybeSingle: jest
            .fn()
            .mockResolvedValue({ data: null, error: null }),
      };
      supabase.from.mockReturnValue(query);
      const response = await supertest(app)
         .post("/api/bookmark-shares/view")
         .send({ token: "a".repeat(43) });
      expect(response.status).toBe(404);
      expect(supabase.from).toHaveBeenCalledTimes(1);
      expect(query.gt).toHaveBeenCalledWith(
         "expires_at",
         expect.any(String),
      );
   });

   it("resolves only the token owner's restaurants and exposes no private fields", async () => {
      const share = {
         select: jest.fn().mockReturnThis(),
         eq: jest.fn().mockReturnThis(),
         gt: jest.fn().mockReturnThis(),
         maybeSingle: jest.fn().mockResolvedValue({
            data: { user_id: owner },
            error: null,
         }),
      };
      const bookmarks = {
         select: jest.fn().mockReturnThis(),
         eq: jest.fn().mockResolvedValue({
            data: [{ restaurant_id: 1 }],
            error: null,
         }),
      };
      const restaurants = {
         select: jest.fn().mockReturnThis(),
         in: jest.fn().mockResolvedValue({
            data: [{ id: 1, name: "Fixture" }],
            error: null,
         }),
      };
      supabase.from.mockImplementation(
         (table) =>
            ({
               bookmark_shares: share,
               bookmarks,
               restaurants,
            })[table],
      );
      const response = await supertest(app)
         .post("/api/bookmark-shares/view")
         .send({
            token: "a".repeat(43),
            user_id: "victim",
         });
      expect(response.status).toBe(200);
      expect(response.body).toEqual([
         { id: 1, name: "Fixture" },
      ]);
      expect(bookmarks.eq).toHaveBeenCalledWith(
         "user_id",
         owner,
      );
      expect(restaurants.select).toHaveBeenCalledWith(
         "id,name,location,image_urls,avg_rating",
      );
      expect(response.headers["cache-control"]).toBe(
         "no-store",
      );
   });

   it("does not leak database errors or tokens", async () => {
      supabase.from.mockReturnValue({
         upsert: jest.fn().mockResolvedValue({
            error: { message: "private detail" },
         }),
      });
      const response = await request(app).post(
         "/api/bookmark-shares",
      );
      expect(response.status).toBe(503);
      expect(response.body).toEqual({
         error: "Could not create share link",
      });
   });
});
