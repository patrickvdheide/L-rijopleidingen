// functions/api/verwijder-boeking.js
// Verwijdert een boeking definitief uit Airtable

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type":                 "application/json",
};

function jsonResp(data, status) {
  return new Response(JSON.stringify(data), { status: status, headers: CORS });
}

async function verifieersessie(env, token, user) {
  if (!token || !user) return false;
  var formula = encodeURIComponent("{Gebruikersnaam}=\"" + user + "\"");
  var url = "https://api.airtable.com/v0/appchbjgwoZQiQjfv/tblxPXaRSgAHiiauP?filterByFormula=" + formula;
  var resp = await fetch(url, {
    headers: { Authorization: "Bearer " + env.AIRTABLE_TOKEN }
  }).catch(function() { return null; });
  if (!resp || !resp.ok) return false;
  var data = await resp.json();
  var rec = data.records && data.records[0];
  if (!rec) return false;
  var rt = rec.fields && rec.fields.ResetToken || "";
  var rv = rec.fields && rec.fields.ResetVerloopt || 0;
  if (!rt.startsWith("sessie_" + token)) return false;
  if (new Date(rv) < new Date()) return false;
  return true;
}

export async function onRequest(context) {
  var request = context.request;
  var env = context.env;

  if (request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS });
  }

  var _url   = new URL(request.url);
  var _token = _url.searchParams.get("key");
  var _user  = _url.searchParams.get("user");

  var ok = await verifieersessie(env, _token, _user);
  if (!ok) {
    return jsonResp({ error: "Niet geautoriseerd" }, 401);
  }

  var body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResp({ error: "Ongeldige JSON" }, 400);
  }

  var recordId = body.recordId;
  if (!recordId) {
    return jsonResp({ error: "recordId ontbreekt" }, 400);
  }

  try {
    var delUrl = "https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2/" + recordId;
    var res = await fetch(delUrl, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + env.AIRTABLE_TOKEN }
    });

    if (!res.ok) {
      var err = await res.text();
      return jsonResp({ error: "Airtable: " + err }, 500);
    }

    return jsonResp({ success: true }, 200);
  } catch (err) {
    return jsonResp({ error: err.message }, 500);
  }
}
