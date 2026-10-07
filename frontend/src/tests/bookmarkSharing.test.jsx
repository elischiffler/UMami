import "../test-setup.js";
import {
   render,
   screen,
   waitFor,
   act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import {
   MemoryRouter,
   useNavigate,
} from "react-router-dom";
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

test("a failed sharing status can be retried without reloading", async () => {
   const actor = userEvent.setup();
   authenticatedFetch.mockResolvedValueOnce({ ok: false });
   render(<BookmarkSharing ownerId="owner" />);
   await screen.findByRole("alert");
   expect(
      screen.getByRole("button", {
         name: "Create share link",
      }),
   ).toBeDisabled();
   authenticatedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active: false }),
   });
   await actor.click(
      screen.getByRole("button", {
         name: "Retry sharing status",
      }),
   );
   await screen.findByText("Private bookmarks");
   expect(screen.queryByRole("alert")).toBeNull();
   expect(
      screen.getByRole("button", {
         name: "Create share link",
      }),
   ).toBeEnabled();
   expect(authenticatedFetch).toHaveBeenCalledTimes(2);
});

function ShareNavigation() {
   const navigate = useNavigate();
   return (
      <button
         onClick={() =>
            navigate(`/shared-bookmarks#${"b".repeat(43)}`)
         }
      >
         Another share
      </button>
   );
}

test.each(["success", "error"])(
   "switching a share clears the previous %s while loading",
   async (previous) => {
      const originalFetch = global.fetch;
      let resolveNext;
      global.fetch = jest
         .fn()
         .mockResolvedValueOnce(
            previous === "success"
               ? {
                    ok: true,
                    json: async () => [
                       {
                          id: 1,
                          name: "Previous restaurant",
                       },
                    ],
                 }
               : { ok: false, status: 404 },
         )
         .mockImplementationOnce(
            () =>
               new Promise((resolve) => {
                  resolveNext = resolve;
               }),
         );
      try {
         render(
            <MemoryRouter
               initialEntries={[
                  `/shared-bookmarks#${"a".repeat(43)}`,
               ]}
            >
               <ShareNavigation />
               <SharedBookmarks />
            </MemoryRouter>,
         );
         if (previous === "success")
            await screen.findByText("Previous restaurant");
         else await screen.findByRole("alert");
         await userEvent.click(
            screen.getByRole("button", {
               name: "Another share",
            }),
         );
         expect(
            screen.getByRole("status"),
         ).toHaveTextContent("Loading");
         expect(
            screen.queryByText("Previous restaurant"),
         ).toBeNull();
         expect(screen.queryByRole("alert")).toBeNull();
         await act(async () =>
            resolveNext({
               ok: true,
               json: async () => [
                  { id: 2, name: "Next restaurant" },
               ],
            }),
         );
         await screen.findByText("Next restaurant");
         expect(screen.queryByRole("status")).toBeNull();
      } finally {
         global.fetch = originalFetch;
      }
   },
);

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
