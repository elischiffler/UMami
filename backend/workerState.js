const state = {
   schedulerActive: false,
   runningJob: null,
   lastRun: null,
   skippedOverlaps: 0,
};

let activeRun = null;

export function setSchedulerActive(active) {
   state.schedulerActive = active;
}

export function getWorkerState() {
   return {
      ...state,
      healthy:
         state.schedulerActive &&
         state.lastRun?.status !== "failed",
   };
}

export function getActiveRun() {
   return activeRun;
}

export function runTrackedJob(name, run) {
   if (activeRun) {
      state.skippedOverlaps += 1;
      console.warn(
         `Skipping overlapping ${name} scrape; ${state.runningJob} is running.`,
      );
      return Promise.resolve({ skipped: true });
   }

   state.runningJob = name;
   const startedAt = new Date().toISOString();
   activeRun = Promise.resolve()
      .then(run)
      .then((result) => {
         state.lastRun = {
            name,
            status: "succeeded",
            startedAt,
            finishedAt: new Date().toISOString(),
         };
         return result;
      })
      .catch((error) => {
         state.lastRun = {
            name,
            status: "failed",
            startedAt,
            finishedAt: new Date().toISOString(),
            error: error.message,
         };
         throw error;
      })
      .finally(() => {
         state.runningJob = null;
         activeRun = null;
      });
   return activeRun;
}
