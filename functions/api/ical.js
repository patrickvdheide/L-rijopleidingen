// functions/api/ical.js
// Genereert .ics bestand puur op basis van URL-parameters — geen Airtable nodig

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const p   = url.searchParams;

  // Verplichte parameters
  const datum      = p.get("datum");     // YYYY-MM-DD
  const startTijd  = p.get("start");     // HH:MM
  const eindTijd   = p.get("eind");      // HH:MM
  const id         = p.get("id")  || "";
  const naam       = p.get("naam") || "Klant";
  const email      = p.get("email")|| "";
  const dienst     = p.get("dienst")|| "Afspraak";
  const opties     = p.get("opties")|| "";
  const betaling   = p.get("betaling") === "pin" ? "Pin op locatie" : "Contant op locatie";
  const totaal     = p.get("totaal")   || "0";

  if (!datum || !startTijd || !eindTijd) {
    return new Response("Ontbrekende parameters: datum, start, eind zijn verplicht", { status: 400 });
  }

  const [jaar, maand, dag] = datum.split("-").map(n => parseInt(n));
  const [sh, sm] = startTijd.split(":").map(Number);
  const [eh, em] = eindTijd.split(":").map(Number);

  function pad(n) { return String(n).padStart(2, "0"); }

  const dtStart = `${jaar}${pad(maand)}${pad(dag)}T${pad(sh)}${pad(sm)}00`;
  const dtEnd   = `${jaar}${pad(maand)}${pad(dag)}T${pad(eh)}${pad(em)}00`;
  const now     = new Date().toISOString().replace(/[-:.Z]/g,"").slice(0,15);

  const samenvatting = `L-Rijopleidingen — ${dienst}${id ? ` (${id})` : ""}`;
  const beschrijving = [
    id         ? `Boekingsnummer: ${id}`            : null,
    `Dienst: ${dienst}`,
    opties     ? `Opties: ${opties}`                 : null,
    `Betaling: ${betaling}`,
    `Bedrag: € ${Number(totaal).toFixed(2)}`,
    `Vragen? info@l-rijopleidingen.nl`,
  ].filter(Boolean).join("\\n");

  const locatie = "L-Rijopleidingen oefenlocatie";

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//L-Rijopleidingen//Boekingssysteem//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${id || now}@l-rijopleidingen.nl`,
    `DTSTAMP:${now}Z`,
    `DTSTART;TZID=Europe/Amsterdam:${dtStart}`,
    `DTEND;TZID=Europe/Amsterdam:${dtEnd}`,
    `SUMMARY:${samenvatting}`,
    `DESCRIPTION:${beschrijving}`,
    `LOCATION:${locatie}`,
    `ORGANIZER;CN=L-Rijopleidingen:mailto:info@l-rijopleidingen.nl`,
    email ? `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;CN=${naam}:mailto:${email}` : null,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type":        "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="afspraak-${id || datum}.ics"`,
      "Cache-Control":       "no-store",
    },
  });
}
