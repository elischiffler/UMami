// Keep legacy diagnostic console output out of the filtered stdout feed.
for (const method of [
   "log",
   "info",
   "warn",
   "error",
   "debug",
   "table",
]) {
   console[method] = (...values) => {
      process.stderr.write(
         `${values.map((value) => (typeof value === "string" ? value : "[diagnostic object]")).join(" ")}\n`,
      );
   };
}
