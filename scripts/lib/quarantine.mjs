// #2176: quarantine ONE nightly check so a red main clears within 2 hours.
// Pure half — the list lives in scripts/quarantine.json, run-checks.mjs
// consults it, jonqcheck pins it. A quarantine is a visibility trade, not a
// fix: every entry must name an OPEN issue (Jon's clause 3 — "skip it in the
// nightly, with an open issue naming it"), so the board always shows what is
// hidden and who owes the fix. Entries missing an issue are ignored, loudly.

export function parseQuarantine(text) {
  if (!text || !text.trim()) return [];
  let doc = null;
  try { doc = JSON.parse(text); } catch { return []; }
  const raw = Array.isArray(doc) ? doc : (doc && Array.isArray(doc.checks) ? doc.checks : []);
  const out = [];
  for (const e of raw) {
    const label = e && String(e.label || '').trim();
    const issue = e && Number(e.issue);
    if (!label || !Number.isInteger(issue) || issue <= 0) continue; // enforced by isQuarantined's warning path
    out.push({ label, issue, reason: String(e.reason || '').trim() });
  }
  return out;
}

// Drop entries the file carries but that cannot be honoured (no issue number),
// so `isQuarantined` stays a pure predicate and the runner can warn once.
export function invalidQuarantine(text) {
  if (!text || !text.trim()) return [];
  let doc = null;
  try { doc = JSON.parse(text); } catch { return [{ label: '<unparseable quarantine.json>', issue: 0 }]; }
  const raw = Array.isArray(doc) ? doc : (doc && Array.isArray(doc.checks) ? doc.checks : []);
  return raw.filter((e) => !e || !String(e.label || '').trim()
    || !Number.isInteger(Number(e.issue)) || Number(e.issue) <= 0);
}

// A name matches an entry exactly or as a mutant variant of it
// ("watchcheck -- --mutate" is quarantined by label "watchcheck").
export function isQuarantined(name, entries) {
  return entries.some((e) => name === e.label || name.startsWith(e.label + ' '));
}
