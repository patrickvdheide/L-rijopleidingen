// functions/api/ical.js
// Geeft een .ics kalenderbestand terug voor een boeking

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id  = url.searchParams.get("id"); // boekingsnummer

  if (!id) {
    return new Response("id ontbreekt", { status: 400 });
  }

  // Haal boeking op uit Airtable
  const res = await fetch(
    `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2?filterByFormula=${encodeURIComponent('{Boekingsnummer}="' + id + '"')}`,
    { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
  ).catch(() => null);

  if (!res?.ok) return new Response("Niet gevonden", { status: 404 });

  const data = await res.json();
  const rec  = data.records?.[0];
  if (!rec) return new Response("Niet gevonden", { status: 404 });

  const f = rec.fields;

  // Datum + tijdsloten parsen
  // Datum formaat: YYYY-MM-DD
  // Tijdsloten formaat: "10:00 – 11:00 (2×)" of "10:00 – 12:00 (2×)"
  const datumStr = f.Datum || "";
  const [jaar, maand, dag] = (datumStr).split("-").map(n => parseInt(n));

  // Parseer starttijd uit tijdsloten
  const tijdMatch = (f.Tijdsloten || "").match(/(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
  const startTijd = tijdMatch ? tijdMatch[1] : "09:00";
  const eindTijd  = tijdMatch ? tijdMatch[2] : "10:00";

  const [sh, sm] = startTijd.split(":").map(Number);
  const [eh, em] = eindTijd.split(":").map(Number);

  function pad(n) { return String(n).padStart(2, "0"); }

  const dtStart = `${jaar}${pad(maand)}${pad(dag)}T${pad(sh)}${pad(sm)}00`;
  const dtEnd   = `${jaar}${pad(maand)}${pad(dag)}T${pad(eh)}${pad(em)}00`;
  const now     = new Date().toISOString().replace(/[-:]/g,"").slice(0,15);

  const samenvatting = `L-Rijopleidingen — ${f.Diensten || "Afspraak"} (${id})`;
  const beschrijving = [
    `Boekingsnummer: ${id}`,
    `Dienst: ${f.Diensten || "—"}`,
    f.Opties ? `Opties: ${f.Opties}` : null,
    `Betaling: ${f.Betaalmethode === "pin" ? "Pin op locatie" : "Contant op locatie"}`,
    `Bedrag: € ${Number(f.Totaal || 0).toFixed(2)}`,
    `Vragen? info@l-rijopleidingen.nl`,
  ].filter(Boolean).join("\\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//L-Rijopleidingen//Boekingssysteem//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${id}@l-rijopleidingen.nl`,
    `DTSTAMP:${now}Z`,
    `DTSTART;TZID=Europe/Amsterdam:${dtStart}`,
    `DTEND;TZID=Europe/Amsterdam:${dtEnd}`,
    `SUMMARY:${samenvatting}`,
    `DESCRIPTION:${beschrijving}`,
    "ORGANIZER;CN=L-Rijopleidingen:mailto:info@l-rijopleidingen.nl",
    `ATTENDEE;CN=${f.Naam || "Klant"}:mailto:${f.Email || ""}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type":        "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="afspraak-${id}.ics"`,
      "Cache-Control":       "no-store",
    },
  });
}
