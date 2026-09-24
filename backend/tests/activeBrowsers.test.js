import { describe, it, expect, jest } from "@jest/globals";
import {
   closeActiveBrowsers,
   trackBrowser,
} from "../activeBrowsers.js";

describe("worker browser shutdown", () => {
   it("closes every tracked browser when interrupted", async () => {
      const first = { close: jest.fn(async () => {}) };
      const second = { close: jest.fn(async () => {}) };
      const untrack = trackBrowser(first);
      trackBrowser(second);
      await closeActiveBrowsers();
      expect(first.close).toHaveBeenCalledTimes(1);
      expect(second.close).toHaveBeenCalledTimes(1);
      untrack();
   });
});
