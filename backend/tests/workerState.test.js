import { describe, it, expect, jest } from "@jest/globals";
import {
   getWorkerState,
   runTrackedJob,
   setSchedulerActive,
} from "../workerState.js";

describe("worker run state", () => {
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
            error: "fixture failed",
         },
      });
      await runTrackedJob("menus", async () => {});
      expect(getWorkerState().healthy).toBe(true);
      setSchedulerActive(false);
   });
});
