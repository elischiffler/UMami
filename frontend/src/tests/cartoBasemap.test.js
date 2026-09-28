import { cartoTileUrl } from "../lib/cartoBasemap.js";

describe("CARTO tile URL", () => {
   test("adds and encodes a public key on each tile request", () => {
      expect(cartoTileUrl("  key+/=  ")).toBe(
         "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=key%2B%2F%3D",
      );
   });

   test.each([undefined, "", "   ", "invalid key"])(
      "rejects an absent or malformed key: %s",
      (key) => {
         expect(cartoTileUrl(key)).toBeNull();
      },
   );
});
