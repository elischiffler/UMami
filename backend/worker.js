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
   configureWorkerState,
} from "./workerState.js";
import { operationalEvent } from "./operationalLog.js";

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
configureWorkerState(process.env.WORKER_STATE_PATH || null);

const once = process.argv
   .find((argument) => argument.startsWith("--once="))
   ?.slice(7);
if (once) {
   let interrupted = false;
   let interruptedExitCode = 143;
   let shutdownTimer;
   const interrupt = async (signal) => {
      if (interrupted) {
         return;
      }
      interrupted = true;
      interruptedExitCode = signal === "SIGINT" ? 130 : 143;
      shutdownTimer = setTimeout(() => {
         console.error(
            "One-shot shutdown deadline reached with an active scrape; exiting nonzero.",
         );
         process.exit(interruptedExitCode);
      }, 7_000);
      const count = await closeActiveBrowsers();
      console.log(
         `Interrupted ${once}; closed ${count} browser(s).`,
      );
      process.exitCode = interruptedExitCode;
   };
   process.once("SIGTERM", () => interrupt("SIGTERM"));
   process.once("SIGINT", () => interrupt("SIGINT"));
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
      process.exitCode = interrupted
         ? interruptedExitCode
         : 1;
   } finally {
      clearTimeout(shutdownTimer);
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
            request.url === "/fixture/recover" ||
            request.url === "/fixture/hang")
      ) {
         runTrackedJob("fixture-probe", () => {
            if (request.url === "/fixture/fail") {
               throw new Error(
                  "intentional fixture failure",
               );
            }
            if (request.url === "/fixture/hang") {
               return new Promise((resolve) =>
                  setTimeout(resolve, 15_000),
               );
            }
         }).then(
            (result) => {
               response.writeHead(
                  result?.skipped ? 409 : 200,
               );
               response.end(
                  result?.skipped ? "overlap" : "ok",
               );
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
         operationalEvent("info", "Worker listening");
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
      server.closeAllConnections();
      server.close();
      let shutdownTimer;
      const deadline = new Promise((resolve) => {
         shutdownTimer = setTimeout(
            () => resolve(false),
            7_000,
         );
      });
      const cleanup = (async () => {
         await closeActiveBrowsers();
         const active = getActiveRun();
         if (active) {
            await active.catch(() => {});
         }
         return true;
      })();
      const cleaned = await Promise.race([
         cleanup,
         deadline,
      ]);
      clearTimeout(shutdownTimer);
      if (!cleaned || getActiveRun()) {
         operationalEvent(
            "error",
            "Worker shutdown deadline reached",
         );
         console.error(
            "Worker shutdown deadline reached with an active scrape; exiting nonzero.",
         );
         process.exit(143);
      }
      process.exitCode = 0;
   }
   process.on("SIGTERM", stop);
   process.on("SIGINT", stop);
}
