const CARTO_TILE_URL =
   "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

export function cartoTileUrl(key) {
   const trimmedKey =
      typeof key === "string" ? key.trim() : "";
   if (!trimmedKey || /\s/.test(trimmedKey)) return null;

   return `${CARTO_TILE_URL}?key=${encodeURIComponent(trimmedKey)}`;
}
