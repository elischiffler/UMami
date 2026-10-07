import "../test-setup.js";
import {
   render,
   screen,
   waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import {
   jest,
   test,
   expect,
   beforeEach,
} from "@jest/globals";
import BookmarkSharing from "../components/BookmarkSharing";
import SharedBookmarks from "../pages/SharedBookmarks";
import { authenticatedFetch } from "../lib/authenticatedFetch";

jest.mock("../lib/authenticatedFetch", () => ({
   authenticatedFetch: jest.fn(),
}));
beforeEach(() => jest.clearAllMocks());

test("sharing is opt-in, copying uses a fragment, and revoke clears the link", async () => {
   const actor = userEvent.setup();
   authenticatedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active: false }),
   });
   render(<BookmarkSharing ownerId="owner" />);
   await screen.findByText("Private bookmarks");
   expect(authenticatedFetch).toHaveBeenCalledTimes(1);
   authenticatedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
         token: "a".repeat(43),
         expires_at: "2099-01-01T00:00:00Z",
      }),
   });
   await actor.click(
      screen.getByRole("button", {
         name: "Create share link",
      }),
   );
   expect(
      await screen.findByRole("textbox", {
         name: "Bookmark share link",
      }),
   ).toHaveValue(
      `${window.location.origin}/shared-bookmarks#${"a".repeat(43)}`,
   );
   await actor.click(
      screen.getByRole("button", {
         name: "Copy share link",
      }),
   );
   expect(
      await screen.findByRole("status"),
   ).toHaveTextContent("Copied");
   authenticatedFetch.mockResolvedValueOnce({ ok: true });
   await actor.click(
      screen.getByRole("button", { name: "Revoke" }),
   );
   await screen.findByText("Private bookmarks");
   expect(screen.queryByRole("textbox")).toBeNull();
   expect(authenticatedFetch).toHaveBeenLastCalledWith(
      expect.stringContaining("/api/bookmark-shares"),
      { method: "DELETE" },
   );
});

test("a revoke failure leaves the active link visible", async () => {
   authenticatedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
         active: true,
         expires_at: "2099-01-01T00:00:00Z",
      }),
   });
   render(<BookmarkSharing ownerId="owner" />);
   const button = await screen.findByRole("button", {
      name: "Revoke",
   });
   authenticatedFetch.mockResolvedValueOnce({ ok: false });
   await userEvent.click(button);
   expect(
      await screen.findByRole("alert"),
   ).toHaveTextContent("Could not revoke share link");
   expect(
      screen.getByRole("button", { name: "Revoke" }),
   ).toBeInTheDocument();
});

test("shared bookmarks resolve without auth, with the token only in the body", async () => {
   const originalFetch = global.fetch;
   global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => [
         {
            id: 1,
            name: "Shared restaurant",
            avg_rating: 4,
         },
      ],
   }));
   try {
      render(
         <MemoryRouter
            initialEntries={[
               `/shared-bookmarks#${"a".repeat(43)}`,
            ]}
         >
            <SharedBookmarks />
         </MemoryRouter>,
      );
      await screen.findByText("Shared restaurant");
      expect(global.fetch).toHaveBeenCalledWith(
         expect.stringMatching(
            /\/api\/bookmark-shares\/view$/,
         ),
         expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ token: "a".repeat(43) }),
            headers: { "Content-Type": "application/json" },
         }),
      );
      expect(screen.queryByRole("button")).toBeNull();
   } finally {
      global.fetch = originalFetch;
   }
});

test("a revoked share renders an unavailable state", async () => {
   const originalFetch = global.fetch;
   global.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
   }));
   try {
      render(
         <MemoryRouter
            initialEntries={[
               `/shared-bookmarks#${"a".repeat(43)}`,
            ]}
         >
            <SharedBookmarks />
         </MemoryRouter>,
      );
      await waitFor(() =>
         expect(
            screen.getByRole("alert"),
         ).toHaveTextContent("expired or been revoked"),
      );
   } finally {
      global.fetch = originalFetch;
   }
});
