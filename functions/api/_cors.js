// functions/api/_cors.js
// Gedeelde CORS helper + sessie verificatie

export const ALLOWED_ORIGINS = [
  "https://boekingen.l-rijopleidingen.nl",
  "https://l-rijopleidingen.pages.dev",
];

export function corsHeaders(request) {
  const origin  = request?.headers?.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-User",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type":                 "application/json",
    "Vary":                         "Origin",
  };
}
