export function resolveScrapeDestination(rawUrl) {
   if (
      process.env.JEST_WORKER_ID &&
      !process.env.UMAMI_SCRAPER_MODE
   ) {
      return rawUrl;
   }
   const requested = new URL(rawUrl);
   if (process.env.UMAMI_SCRAPER_MODE === "live") {
      if (
         requested.protocol !== "https:" ||
         ![
            "apiv4.dineoncampus.com",
            "www.subway.com",
         ].includes(requested.hostname)
      ) {
         throw new Error(
            "Scraper source is not allowlisted.",
         );
      }
      return requested.toString();
   }
   if (process.env.UMAMI_SCRAPER_MODE !== "fixture") {
      throw new Error("Scraper mode is not configured.");
   }

   const fixtureOrigin = new URL(
      process.env.DINE_ON_CAMPUS_ORIGIN,
   );
   if (
      fixtureOrigin.origin !==
      "http://fixture-supabase:54321"
   ) {
      throw new Error(
         "Fixture scraper destination must use fixture-supabase.",
      );
   }
   if (requested.origin === fixtureOrigin.origin) {
      return rawUrl;
   }
   if (requested.hostname === "apiv4.dineoncampus.com") {
      return new URL(
         requested.pathname + requested.search,
         fixtureOrigin,
      ).toString();
   }
   throw new Error(
      `Fixture mode blocks external scraper destination: ${requested.hostname}`,
   );
}
