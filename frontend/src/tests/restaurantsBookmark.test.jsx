import "../test-setup.js";
import "@testing-library/jest-dom";
import {
   render,
   screen,
   waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { jest } from "@jest/globals";
import Restaurants from "../pages/Restaurants";
import { supabase } from "../lib/supabase";

jest.mock("../lib/supabase", () => ({
   supabase: {
      auth: {
         getUser: jest.fn().mockResolvedValue({
            data: { user: { id: "owner-id" } },
            error: null,
         }),
         getSession: jest.fn().mockResolvedValue({
            data: {
               session: { access_token: "fixture-token" },
            },
            error: null,
         }),
      },
      from: jest.fn(() => ({
         select: () => ({
            eq: async () => ({ data: [], error: null }),
         }),
      })),
   },
}));

test("restaurant bookmark uses the authenticated API and ignores rapid repeat clicks", async () => {
   localStorage.setItem(
      "photo_prompt_skipped_owner-id",
      "true",
   );
   let resolveFetch;
   global.fetch = jest.fn(
      () =>
         new Promise((resolve) => {
            resolveFetch = resolve;
         }),
   );
   render(
      <MemoryRouter>
         <Restaurants
            restaurants={[
               {
                  id: 7,
                  name: "Hearth",
                  image: "/image.jpg",
                  hours: [],
               },
            ]}
         />
      </MemoryRouter>,
   );
   const user = userEvent.setup();
   const button = await screen.findByRole("button", {
      name: "Bookmark Hearth",
   });
   await user.click(button);
   await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledTimes(1),
   );
   expect(button).toBeDisabled();
   await user.click(button);
   expect(global.fetch).toHaveBeenCalledTimes(1);
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
   resolveFetch({ ok: true });
   await waitFor(() => expect(button).not.toBeDisabled());
   expect(supabase.from).toHaveBeenCalledTimes(1);
   localStorage.removeItem("photo_prompt_skipped_owner-id");
});
