import { describe, it, expect } from "@jest/globals";
import { resolveScrapeDestination } from "../config/scrapeDestination.js";

describe("fixture scraper destinations", () => {
   const originalMode = process.env.UMAMI_SCRAPER_MODE;
   const originalOrigin = process.env.DINE_ON_CAMPUS_ORIGIN;

   afterEach(() => {
      if (originalMode === undefined) {
         delete process.env.UMAMI_SCRAPER_MODE;
      } else {
         process.env.UMAMI_SCRAPER_MODE = originalMode;
      }
      if (originalOrigin === undefined) {
         delete process.env.DINE_ON_CAMPUS_ORIGIN;
      } else {
         process.env.DINE_ON_CAMPUS_ORIGIN = originalOrigin;
      }
   });

   it("rewrites only the known Dine on Campus origin to the internal fixture", () => {
      process.env.UMAMI_SCRAPER_MODE = "fixture";
      process.env.DINE_ON_CAMPUS_ORIGIN =
         "http://fixture-supabase:54321";
      expect(
         resolveScrapeDestination(
            "https://apiv4.dineoncampus.com/locations/1/menu?date=2026-09-24",
         ),
      ).toBe(
         "http://fixture-supabase:54321/locations/1/menu?date=2026-09-24",
      );
      expect(() =>
         resolveScrapeDestination(
            "https://example.com/menu",
         ),
      ).toThrow(
         "Fixture mode blocks external scraper destination: example.com",
      );
   });

   it("rejects an unapproved fixture origin", () => {
      process.env.UMAMI_SCRAPER_MODE = "fixture";
      process.env.DINE_ON_CAMPUS_ORIGIN =
         "http://example.com";
      expect(() =>
         resolveScrapeDestination(
            "https://apiv4.dineoncampus.com/menu",
         ),
      ).toThrow(
         "Fixture scraper destination must use fixture-supabase.",
      );
   });
});
