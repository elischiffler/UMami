import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { API_BASE_URL } from "../lib/api";
import "./SharedBookmarks.css";

export default function SharedBookmarks() {
   const { hash } = useLocation();
   const [result, setResult] = useState(null);
   const currentResult =
      result?.hash === hash
         ? result
         : { loading: true, restaurants: [], error: "" };
   useEffect(() => {
      const controller = new AbortController();
      // Fragments are omitted from HTTP requests and referrer headers.
      const token = hash.slice(1);
      fetch(`${API_BASE_URL}/api/bookmark-shares/view`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ token }),
         signal: controller.signal,
      })
         .then(async (response) => {
            if (!response.ok)
               throw new Error(
                  response.status === 404
                     ? "This share link has expired or been revoked."
                     : "Shared bookmarks are unavailable right now.",
               );
            const restaurants = await response.json();
            if (!controller.signal.aborted)
               setResult({
                  hash,
                  loading: false,
                  restaurants,
                  error: "",
               });
         })
         .catch((err) => {
            if (!controller.signal.aborted)
               setResult({
                  hash,
                  loading: false,
                  restaurants: [],
                  error: err.message,
               });
         });
      return () => controller.abort();
   }, [hash]);
   return (
      <main className="shared-bookmarks">
         <h1>Shared Saved Restaurants</h1>
         {currentResult.loading && (
            <p role="status">Loading...</p>
         )}
         {currentResult.error && (
            <p role="alert">{currentResult.error}</p>
         )}
         {!currentResult.loading &&
            !currentResult.error &&
            currentResult.restaurants.length === 0 && (
               <p>No saved restaurants.</p>
            )}
         <div className="shared-bookmark-list">
            {currentResult.restaurants.map((restaurant) => (
               <article key={restaurant.id}>
                  {restaurant.image_urls?.[0] && (
                     <img
                        src={restaurant.image_urls[0]}
                        alt={restaurant.name}
                        referrerPolicy="no-referrer"
                     />
                  )}
                  <h2>{restaurant.name}</h2>
                  <p>{restaurant.location}</p>
                  <p aria-label="Average rating">
                     {restaurant.avg_rating || 0} / 5
                  </p>
               </article>
            ))}
         </div>
      </main>
   );
}
