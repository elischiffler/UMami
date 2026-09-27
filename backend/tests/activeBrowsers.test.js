import { describe, it, expect, jest } from "@jest/globals";
import {
   closeActiveBrowsers,
   trackBrowser,
} from "../activeBrowsers.js";

describe("worker browser shutdown", () => {
   it("closes every tracked browser when interrupted", async () => {
      const first = { close: jest.fn(async () => {}) };
      const second = { close: jest.fn(async () => {}) };
      const untrack = await trackBrowser(first);
      await trackBrowser(second);
      await closeActiveBrowsers();
      expect(first.close).toHaveBeenCalledTimes(1);
      expect(second.close).toHaveBeenCalledTimes(1);
      untrack();
   });

   it("closes a browser that finishes launching after shutdown starts", async () => {
      const late = { close: jest.fn(async () => {}) };
      await expect(trackBrowser(late)).rejects.toThrow(
         "Browser launched after worker shutdown began.",
      );
      expect(late.close).toHaveBeenCalledTimes(1);
   });
});
