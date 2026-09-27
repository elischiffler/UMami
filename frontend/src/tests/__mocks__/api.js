export const API_BASE_URL = "http://localhost:4000";

export const apiUrl = (path) =>
   `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
