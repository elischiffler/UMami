import { useState, useCallback, useRef } from "react";
import { apiUrl } from "../lib/api";
import { authenticatedFetch } from "../lib/authenticatedFetch";

export function useBookmarks(initialIds = []) {
   // Use lazy initialization so the Set is only built on the first render
   const [bookmarkedIds, setBookmarkedIds] = useState(
      () => new Set(initialIds),
   );
   const pendingRef = useRef(new Set());
   const [pendingIds, setPendingIds] = useState(new Set());

   const toggleBookmark = useCallback(
      async (userId, restaurantId) => {
         if (!userId) {
            return {
               error: new Error(
                  "You must be signed in to bookmark.",
               ),
            };
         }

         const id =
            typeof restaurantId === "string"
               ? parseInt(restaurantId, 10)
               : restaurantId;
         if (pendingRef.current.has(id)) {
            return { error: null, ignored: true };
         }
         pendingRef.current.add(id);
         setPendingIds(new Set(pendingRef.current));
         const wasBookmarked = bookmarkedIds.has(id);

         // Optimistic UI update
         setBookmarkedIds((prev) => {
            const next = new Set(prev);
            if (wasBookmarked) {
               next.delete(id);
            } else {
               next.add(id);
            }
            return next;
         });

         try {
            const response = await authenticatedFetch(
               apiUrl("/api/restaurants/bookmarks/sync"),
               {
                  method: "POST",
                  headers: {
                     "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                     user_id: userId,
                     added: wasBookmarked ? [] : [id],
                     removed: wasBookmarked ? [id] : [],
                  }),
               },
            );
            if (!response.ok) {
               throw new Error("Failed to update bookmark");
            }

            return { error: null };
         } catch (err) {
            console.error("Error updating bookmark:", err);

            // Revert optimistic update on failure
            setBookmarkedIds((prev) => {
               const next = new Set(prev);
               if (wasBookmarked) next.add(id);
               else next.delete(id);
               return next;
            });

            return { error: err };
         } finally {
            pendingRef.current.delete(id);
            setPendingIds(new Set(pendingRef.current));
         }
      },
      [bookmarkedIds],
   );

   return {
      bookmarkedIds,
      pendingIds,
      setBookmarkedIds,
      toggleBookmark,
   };
}
