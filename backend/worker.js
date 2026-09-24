import "dotenv/config";
import http from "node:http";
import { closeActiveBrowsers } from "./activeBrowsers.js";
import {
   scheduleRestaurantScraper,
   scrapeRestaurants,
} from "./utils/restaurantScraper.js";
import {
   scheduleCurrentMenuScraper,
   scrapeCurrentMenus,
} from "./utils/scrapeCurrentMenus.js";
import {
   getActiveRun,
   getWorkerState,
   runTrackedJob,
   setSchedulerActive,
} from "./workerState.js";

function requireSafeConfiguration() {
   const mode = process.env.UMAMI_SCRAPER_MODE;
   if (mode === "fixture") {
      const source = new URL(
         process.env.DINE_ON_CAMPUS_ORIGIN ||
            "http://missing.invalid",
      );
      const database = new URL(
         process.env.SUPABASE_URL ||
            "http://missing.invalid",
      );
      if (
         source.origin !==
            "http://fixture-supabase:54321" ||
         database.origin !== "http://fixture-supabase:54321"
      ) {
         throw new Error(
            "Fixture mode requires both sources to use fixture-supabase.",
         );
      }
      return;
   }
   if (
      mode === "live" &&
      process.env.UMAMI_ALLOW_LIVE_SCRAPES === "yes"
   ) {
      return;
   }
   throw new Error(
      "Set UMAMI_SCRAPER_MODE=fixture with isolated destinations, or explicitly authorize live worker sources.",
   );
}

requireSafeConfiguration();

const once = process.argv
   .find((argument) => argument.startsWith("--once="))
   ?.slice(7);
if (once) {
   const jobs = {
      restaurants: scrapeRestaurants,
      menus: () =>
         scrapeCurrentMenus({
            failOnRestaurantError: true,
         }),
   };
   if (!jobs[once]) {
      throw new Error(`Unknown one-shot job: ${once}`);
   }
   try {
      await runTrackedJob(once, jobs[once]);
   } catch (error) {
      console.error(
         `One-shot ${once} scrape failed:`,
         error,
      );
      process.exitCode = 1;
   }
} else {
   const schedules = [
      scheduleRestaurantScraper(),
      ...scheduleCurrentMenuScraper(),
   ].filter(Boolean);
   setSchedulerActive(true);
   const server = http.createServer((request, response) => {
      if (
         process.env.UMAMI_SCRAPER_MODE === "fixture" &&
         request.method === "POST" &&
         (request.url === "/fixture/fail" ||
            request.url === "/fixture/recover")
      ) {
         runTrackedJob("fixture-probe", () => {
            if (request.url === "/fixture/fail") {
               throw new Error(
                  "intentional fixture failure",
               );
            }
         }).then(
            () => {
               response.writeHead(200);
               response.end("ok");
            },
            () => {
               response.writeHead(500);
               response.end("fixture failure");
            },
         );
         return;
      }
      const state = getWorkerState();
      if (
         request.url === "/health" ||
         request.url === "/status"
      ) {
         response.writeHead(
            request.url === "/health" && !state.healthy
               ? 503
               : 200,
            {
               "content-type":
                  "application/json; charset=utf-8",
               "cache-control": "no-store",
            },
         );
         response.end(JSON.stringify(state));
         return;
      }
      response.writeHead(404);
      response.end();
   });

   server.listen(
      Number(process.env.WORKER_PORT || 3004),
      "0.0.0.0",
      () => {
         console.log(
            `UMami worker started with ${schedules.length} schedules in America/Los_Angeles.`,
         );
      },
   );

   let stopping = false;
   async function stop() {
      if (stopping) {
         return;
      }
      stopping = true;
      setSchedulerActive(false);
      schedules.forEach((schedule) => schedule.stop());
      server.close();
      await closeActiveBrowsers();
      const active = getActiveRun();
      if (active) {
         await Promise.race([
            active.catch(() => {}),
            new Promise((resolve) =>
               setTimeout(resolve, 8_000),
            ),
         ]);
      }
      process.exitCode = 0;
   }
   process.on("SIGTERM", stop);
   process.on("SIGINT", stop);
}
