const defaultApiBaseUrl =
   import.meta.env.MODE === "development" ||
   import.meta.env.MODE === "test"
      ? "http://localhost:4000"
      : "";

export const API_BASE_URL =
   import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl;

export function apiUrl(path) {
   return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
