const configuredApiBaseUrl =
   import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL =
   configuredApiBaseUrl ||
   (import.meta.env.MODE === "development" ||
   import.meta.env.MODE === "test"
      ? "http://localhost:4000"
      : "https://umami-api-calpoly-bpgzacb7ckf3hked.westus3-01.azurewebsites.net");

export function apiUrl(path) {
   return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
