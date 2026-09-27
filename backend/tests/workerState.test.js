import { describe, it, expect, jest } from "@jest/globals";
import {
   mkdtempSync,
   readFileSync,
   rmSync,
   writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
   configureWorkerState,
   getWorkerState,
   runTrackedJob,
   setSchedulerActive,
} from "../workerState.js";

describe("worker run state", () => {
   afterEach(() => configureWorkerState(null));
   it("prevents concurrent scrapes and records the completed run", async () => {
      setSchedulerActive(true);
      const warning = jest
         .spyOn(console, "warn")
         .mockImplementation(() => {});
      let finish;
      const first = runTrackedJob(
         "restaurants",
         () =>
            new Promise((resolve) => {
               finish = resolve;
            }),
      );
      const second = jest.fn();
      expect(await runTrackedJob("menus", second)).toEqual({
         skipped: true,
      });
      expect(second).not.toHaveBeenCalled();
      expect(getWorkerState().runningJob).toBe(
         "restaurants",
      );
      await Promise.resolve();
      finish();
      await first;
      expect(getWorkerState()).toMatchObject({
         runningJob: null,
         lastRun: {
            name: "restaurants",
            status: "succeeded",
         },
         healthy: true,
      });
      expect(
         getWorkerState().skippedOverlaps,
      ).toBeGreaterThan(0);
      warning.mockRestore();
   });

   it("exposes a failed scheduled run as unhealthy until a successful run", async () => {
      setSchedulerActive(true);
      await expect(
         runTrackedJob("menus", () => {
            throw new Error("fixture failed");
         }),
      ).rejects.toThrow("fixture failed");
      expect(getWorkerState()).toMatchObject({
         healthy: false,
         lastRun: {
            name: "menus",
            status: "failed",
         },
      });
      await runTrackedJob("menus", async () => {});
      expect(getWorkerState().healthy).toBe(true);
      setSchedulerActive(false);
   });

   it("persists sanitized results and marks interrupted work after restart", async () => {
      const directory = mkdtempSync(
         join(tmpdir(), "umami-worker-"),
      );
      const path = join(directory, "status.json");
      try {
         configureWorkerState(path);
         await runTrackedJob("restaurants", async () => {});
         expect(readFileSync(path, "utf8")).not.toContain(
            "fixture failed",
         );
         const stored = JSON.parse(
            readFileSync(path, "utf8"),
         );
         stored.lastRuns.menus = {
            name: "menus",
            status: "running",
            startedAt: new Date().toISOString(),
            finishedAt: null,
            error: "provider secret should not persist",
         };
         writeFileSync(path, JSON.stringify(stored));
         configureWorkerState(path);
         expect(getWorkerState().jobs.menus.state).toBe(
            "interrupted",
         );
         expect(
            getWorkerState().jobs.restaurants.state,
         ).toBe("fresh");
         expect(getWorkerState().scrapeReady).toBe(false);
         expect(readFileSync(path, "utf8")).not.toContain(
            "provider secret",
         );
      } finally {
         configureWorkerState(null);
         rmSync(directory, {
            recursive: true,
            force: true,
         });
      }
   });

   it("identifies an old successful scrape as stale", () => {
      const directory = mkdtempSync(
         join(tmpdir(), "umami-worker-"),
      );
      const path = join(directory, "status.json");
      try {
         writeFileSync(
            path,
            JSON.stringify({
               version: 1,
               lastRuns: {
                  restaurants: {
                     name: "restaurants",
                     status: "succeeded",
                     startedAt: "2020-01-01T00:00:00.000Z",
                     finishedAt: "2020-01-01T00:01:00.000Z",
                  },
               },
            }),
         );
         configureWorkerState(path);
         expect(
            getWorkerState().jobs.restaurants.state,
         ).toBe("stale");
      } finally {
         configureWorkerState(null);
         rmSync(directory, {
            recursive: true,
            force: true,
         });
      }
   });

   it("keeps failure across restart until a successful recovery", async () => {
      const directory = mkdtempSync(
         join(tmpdir(), "umami-worker-"),
      );
      const path = join(directory, "status.json");
      try {
         configureWorkerState(path);
         setSchedulerActive(true);
         await expect(
            runTrackedJob("menus", () => {
               throw new Error("provider payload secret");
            }),
         ).rejects.toThrow("provider payload secret");
         configureWorkerState(path);
         expect(getWorkerState().healthy).toBe(false);
         expect(getWorkerState().jobs.menus.state).toBe(
            "failed",
         );
         expect(readFileSync(path, "utf8")).not.toContain(
            "provider payload secret",
         );
         await runTrackedJob("menus", async () => {});
         configureWorkerState(path);
         expect(getWorkerState().jobs.menus.state).toBe(
            "fresh",
         );
         expect(getWorkerState().healthy).toBe(true);
      } finally {
         setSchedulerActive(false);
         configureWorkerState(null);
         rmSync(directory, {
            recursive: true,
            force: true,
         });
      }
   });
});
