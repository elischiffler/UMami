import { cartoTileUrl } from "./cartoBasemap.js";

export function getCartoTileUrl() {
   return cartoTileUrl(
      import.meta.env.VITE_CARTO_BASEMAP_KEY,
   );
}
