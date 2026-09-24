const browsers = new Set();

export function trackBrowser(browser) {
   browsers.add(browser);
   return () => browsers.delete(browser);
}

export async function closeActiveBrowsers() {
   await Promise.allSettled(
      [...browsers].map((browser) => browser.close()),
   );
}
