// functions/api/reviews.js
// Haalt Google Reviews op voor L-Rijopleidingen
// Vereiste environment variables in Cloudflare Pages:
//   GOOGLE_API_KEY  — Google Places API key
//   PLACE_ID        — Google Place ID van L-Rijopleidingen

import { corsHeaders } from "./_cors.js";

export async function onRequestGet({ env }) {
  const apiKey  = env.GOOGLE_API_KEY;
  const placeId = env.PLACE_ID;

  if (!apiKey || !placeId) {
    return new Response(
      JSON.stringify({ error: "Server misconfiguratie: GOOGLE_API_KEY of PLACE_ID ontbreekt." }),
      { status: 500, headers: corsHeaders() }
    );
  }

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=reviews,rating,user_ratings_total` +
    `&language=nl` +
    `&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK") {
      return new Response(
        JSON.stringify({ error: `Google API fout: ${data.status}` }),
        { status: 502, headers: corsHeaders() }
      );
    }

    const payload = {
      rating: data.result.rating,
      total:  data.result.user_ratings_total,
      reviews: (data.result.reviews || []).map((r) => ({
        author: r.author_name,
        rating: r.rating,
        text:   r.text,
        time:   r.relative_time_description,
      })),
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Cache-Control": "public, max-age=3600",
      },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Ophalen reviews mislukt." }),
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
