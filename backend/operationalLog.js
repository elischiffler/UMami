// Only fixed, reviewed messages enter the host's filtered read-only feed.
const messages = new Set([
   "API listening",
   "API readiness failed",
   "Worker listening",
   "Worker status unavailable",
   "Worker status persistence failed",
   "Scrape started",
   "Scrape succeeded",
   "Scrape failed",
   "Scrape skipped due to overlap",
   "Worker shutdown deadline reached",
]);

export function operationalEvent(level, message) {
   if (
      !["debug", "info", "warn", "error"].includes(level) ||
      !messages.has(message)
   ) {
      throw new Error("Unreviewed operational event");
   }
   process.stdout.write(
      `${JSON.stringify({ timestamp: new Date().toISOString(), level, message })}\n`,
   );
}
