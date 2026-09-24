const browsers = new Set();
let stopping = false;

export async function trackBrowser(browser) {
   if (stopping) {
      await browser.close();
      throw new Error(
         "Browser launched after worker shutdown began.",
      );
   }
   browsers.add(browser);
   return () => browsers.delete(browser);
}

export async function closeActiveBrowsers() {
   stopping = true;
   const count = browsers.size;
   await Promise.allSettled(
      [...browsers].map((browser) => browser.close()),
   );
   return count;
}
