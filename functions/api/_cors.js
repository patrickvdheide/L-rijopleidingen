// functions/api/_cors.js

export const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type":                 "application/json",
};

export function corsHeaders() {
  return CORS;
}
