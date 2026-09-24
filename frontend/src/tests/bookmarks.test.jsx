import {
   act,
   renderHook,
   waitFor,
} from "@testing-library/react";
import { jest } from "@jest/globals";
import { useBookmarks } from "../hooks/useBookmarks";

jest.mock("../lib/supabase", () => ({
   supabase: {
      auth: {
         getSession: jest.fn().mockResolvedValue({
            data: {
               session: { access_token: "fixture-token" },
            },
            error: null,
         }),
      },
   },
}));

test("rapid bookmark toggles send one owner-scoped request until the first completes", async () => {
   let resolveFetch;
   global.fetch = jest.fn(
      () =>
         new Promise((resolve) => {
            resolveFetch = resolve;
         }),
   );
   const { result } = renderHook(() => useBookmarks());

   let first;
   let second;
   act(() => {
      first = result.current.toggleBookmark("owner-id", 7);
      second = result.current.toggleBookmark("owner-id", 7);
   });
   expect(await second).toEqual({
      error: null,
      ignored: true,
   });
   await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledTimes(1),
   );
   expect(result.current.pendingIds.has(7)).toBe(true);
   expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/restaurants/bookmarks/sync",
      expect.objectContaining({
         headers: expect.objectContaining({
            Authorization: "Bearer fixture-token",
         }),
         body: JSON.stringify({
            user_id: "owner-id",
            added: [7],
            removed: [],
         }),
      }),
   );

   await act(async () => {
      resolveFetch({ ok: true });
      await first;
   });
   expect(result.current.bookmarkedIds.has(7)).toBe(true);
   expect(result.current.pendingIds.has(7)).toBe(false);
});
