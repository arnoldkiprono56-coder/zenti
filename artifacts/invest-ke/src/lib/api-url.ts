/**
 * Returns the full URL for an API path.
 *
 * In development (same-origin): uses Vite's BASE_URL so requests go to the
 * local Express dev server through the proxy.
 *
 * In production IIS builds: VITE_API_URL must be set to the deployed backend
 * (e.g. https://investke-api.replit.app) so every request goes there instead.
 */
const EXTERNAL_API = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "")
  : null;

export function apiUrl(path: string): string {
  if (EXTERNAL_API) {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${EXTERNAL_API}${cleanPath}`;
  }
  const base = (import.meta.env.BASE_URL as string).replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${base}/${cleanPath}`;
}
