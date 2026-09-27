import {
   readFileSync,
   renameSync,
   rmSync,
   writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { operationalEvent } from "./operationalLog.js";

const JOBS = ["restaurants", "menus"];
const MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const state = {
   schedulerActive: false,
   runningJob: null,
   lastRun: null,
   lastRuns: {},
   skippedOverlaps: 0,
};
let activeRun = null;
let statePath = null;

function safeRun(run) {
   if (
      !run ||
      !JOBS.includes(run.name) ||
      ![
         "running",
         "succeeded",
         "failed",
         "interrupted",
      ].includes(run.status) ||
      !Number.isFinite(Date.parse(run.startedAt)) ||
      (run.finishedAt !== null &&
         !Number.isFinite(Date.parse(run.finishedAt)))
   ) {
      return null;
   }
   return {
      name: run.name,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
   };
}

function persist() {
   if (!statePath) {
      return;
   }
   const temporary = join(
      dirname(statePath),
      `.worker-state-${randomUUID()}.tmp`,
   );
   try {
      writeFileSync(
         temporary,
         JSON.stringify({
            version: 1,
            lastRuns: state.lastRuns,
         }),
         {
            encoding: "utf8",
            mode: 0o600,
            flag: "wx",
         },
      );
      renameSync(temporary, statePath);
   } catch (error) {
      rmSync(temporary, { force: true });
      operationalEvent(
         "error",
         "Worker status persistence failed",
      );
      throw error;
   }
}

export function configureWorkerState(path) {
   statePath = path;
   state.lastRuns = {};
   state.lastRun = null;
   if (!path) {
      return;
   }
   try {
      const stored = JSON.parse(readFileSync(path, "utf8"));
      if (
         stored.version !== 1 ||
         typeof stored.lastRuns !== "object"
      ) {
         throw new Error("Invalid worker status version");
      }
      for (const name of JOBS) {
         const run = safeRun(stored.lastRuns[name]);
         if (stored.lastRuns[name] && !run) {
            throw new Error("Invalid worker status run");
         }
         if (run) {
            state.lastRuns[name] =
               run.status === "running"
                  ? {
                       ...run,
                       status: "interrupted",
                       finishedAt: new Date().toISOString(),
                    }
                  : run;
         }
      }
      state.lastRun =
         Object.values(state.lastRuns).sort((a, b) =>
            b.startedAt.localeCompare(a.startedAt),
         )[0] || null;
      persist();
   } catch (error) {
      if (error.code !== "ENOENT") {
         operationalEvent(
            "error",
            "Worker status unavailable",
         );
         throw error;
      }
      persist();
   }
}

export function setSchedulerActive(active) {
   state.schedulerActive = active;
}

export function getWorkerState() {
   const now = Date.now();
   const jobs = Object.fromEntries(
      JOBS.map((name) => {
         const run = state.lastRuns[name] || null;
         const fresh =
            run?.status === "succeeded" &&
            now - Date.parse(run.finishedAt) <=
               MAX_AGE_MS &&
            now >= Date.parse(run.finishedAt);
         return [
            name,
            {
               lastRun: run,
               state: !run
                  ? "missing"
                  : fresh
                    ? "fresh"
                    : run.status === "succeeded"
                      ? "stale"
                      : run.status,
            },
         ];
      }),
   );
   return {
      schedulerActive: state.schedulerActive,
      runningJob: state.runningJob,
      lastRun: state.lastRun,
      jobs,
      skippedOverlaps: state.skippedOverlaps,
      scrapeReady: JOBS.every(
         (name) => jobs[name].state === "fresh",
      ),
      healthy:
         state.schedulerActive &&
         state.lastRun?.status !== "failed" &&
         state.lastRun?.status !== "interrupted",
   };
}

export function getActiveRun() {
   return activeRun;
}

export function runTrackedJob(name, run) {
   if (activeRun) {
      state.skippedOverlaps += 1;
      operationalEvent(
         "warn",
         "Scrape skipped due to overlap",
      );
      return Promise.resolve({ skipped: true });
   }
   if (!JOBS.includes(name) && name !== "fixture-probe") {
      throw new Error("Unknown tracked job");
   }
   state.runningJob = name;
   const startedAt = new Date().toISOString();
   if (JOBS.includes(name)) {
      state.lastRuns[name] = {
         name,
         status: "running",
         startedAt,
         finishedAt: null,
      };
      persist();
   }
   operationalEvent("info", "Scrape started");
   activeRun = Promise.resolve()
      .then(run)
      .then((result) => {
         state.lastRun = {
            name,
            status: "succeeded",
            startedAt,
            finishedAt: new Date().toISOString(),
         };
         if (JOBS.includes(name)) {
            state.lastRuns[name] = state.lastRun;
         }
         persist();
         operationalEvent("info", "Scrape succeeded");
         return result;
      })
      .catch((error) => {
         state.lastRun = {
            name,
            status: "failed",
            startedAt,
            finishedAt: new Date().toISOString(),
         };
         if (JOBS.includes(name)) {
            state.lastRuns[name] = state.lastRun;
         }
         persist();
         operationalEvent("error", "Scrape failed");
         throw error;
      })
      .finally(() => {
         state.runningJob = null;
         activeRun = null;
      });
   return activeRun;
}
