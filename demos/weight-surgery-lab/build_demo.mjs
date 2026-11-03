// WEIGHT SURGERY demo page builder v2 (#1493 + fair-horizon rescore #1506).
// Reads lab artifacts, writes a self-contained demo HTML. No weights embedded.
// When results/fair_scores.json exists, the fair-cap verdict replaces the
// cap-1024 first-pass verdict (kept, labeled superseded).
import fs from "node:fs";

const LAB = process.env.LAB_DIR || ".";
const read = (p, fb = null) => {
  try { return JSON.parse(fs.readFileSync(`${LAB}/${p}`, "utf8")); } catch { return fb; }
};
const lines = (p) => {
  try {
    return fs.readFileSync(`${LAB}/${p}`, "utf8").trim().split("\n").map(l => JSON.parse(l));
  } catch { return []; }
};

const batches = lines("batches.jsonl");
const scores = {};
for (const f of fs.existsSync(`${LAB}/results`) ? fs.readdirSync(`${LAB}/results`) : []) {
  const m = f.match(/^score_(.+)_(math|gsm)\.jsonl$/);
  if (m) scores[`${m[1]}_${m[2]}`] = lines(`results/${f}`);
}
const fair = {};
for (const f of fs.existsSync(`${LAB}/results`) ? fs.readdirSync(`${LAB}/results`) : []) {
  const m = f.match(/^fair_(.+)_(math|gsm)\.jsonl$/);
  if (m) fair[`${m[1]}_${m[2]}`] = lines(`results/${f}`);
}
const fairScores = read("results/fair_scores.json", null);
const ranking = read("results/layer_ranking.json", null);
const corpus = read("results/corpus_check.json", null);
const capSweep = read("results/cap_sweep.json", {});
const fairEdit = read("edited_fair/edit_report.json", null);
const variantsFair = read("results/variants_fair.json", null);
// The fair runner writes the surgical row under its variant tag (k256/k512);
// the page language is base/edit/penalty — alias the chosen tag to `edit`.
const EDITTAG = ["edit", "k256", "k512"].find(t =>
  Object.keys(fair).some(k => k.startsWith(`${t}_`)) ||
  (fairScores && fairScores.rows && Object.keys(fairScores.rows).some(k => k.startsWith(`${t}_`)))) || "edit";
if (EDITTAG !== "edit") {
  for (const set of ["math", "gsm"]) {
    if (!fair[`edit_${set}`] && fair[`${EDITTAG}_${set}`]) fair[`edit_${set}`] = fair[`${EDITTAG}_${set}`];
    if (fairScores?.rows && !fairScores.rows[`edit_${set}`] && fairScores.rows[`${EDITTAG}_${set}`]) {
      fairScores.rows[`edit_${set}`] = fairScores.rows[`${EDITTAG}_${set}`];
    }
  }
}
const reports = {};
for (const v of ["edited_a1k64", "edited_a1k256"]) {
  reports[v] = read(`${v}/edit_report.json`);
}
const variants = read("results/variants.json", {});
const finals = read("results/final_scores.json", {});
const sweepSumm = Object.fromEntries(batches.filter(b => b.phase === "practice" && b.purpose && b.purpose.startsWith("Jon step1")).map(b => [`cap${b.cap}`, b]));

const FAIRC = (fairScores && fairScores.cap) || (capSweep && 4096);

// pick the demo pair from the FAIR runs: base capped, edit terminated (correct preferred)
let pair = null;
{
  const bM = fair["base_math"] || [];
  const eM = fair["edit_math"] || [];
  for (const want_ok of [true, false]) {
    for (const b of bM) {
      const e = eM.find(x => x.i === b.i);
      if (b.cap_hit && e && !e.cap_hit && (!want_ok || e.ok)) { pair = { base: b, edit: e }; break; }
    }
    if (pair) break;
  }
  if (!pair) { // fall back to first-pass pair
    const baseMath = scores["base_math"] || [];
    const edMath = scores["edit_math"] || [];
    for (const b of baseMath) {
      const e = edMath.find(x => x.i === b.i);
      if (b.cap && e && !e.cap) { pair = { base: b, edit: e }; break; }
    }
  }
}

const pct = (v) => v === undefined ? "—" : `${v}%`;
const tbl = Object.entries(finals).map(([k, s]) =>
  `<tr><td>${k.replace("_", " · ")}</td><td>${pct(s.acc)}</td><td>${pct(s.terminated)}</td><td>${pct(s.hit_cap_pct)}</td><td>${pct(s.looped_pct)}</td></tr>`).join("\n");

const fairTbl = (() => {
  const rows = [];
  for (const set of ["math", "gsm"]) {
    for (const run of ["base", "edit", "sampfix"]) {
      const recs = fair[`${run}_${set}`];
      if (!recs || !recs.length) continue;
      const n = recs.length;
      const s = {
        acc: 100 * recs.filter(r => r.ok).length / n,
        term: 100 * recs.filter(r => !r.cap_hit).length / n,
        cap: 100 * recs.filter(r => r.cap_hit).length / n,
        loop: 100 * recs.filter(r => r.loop).length / n,
      };
      rows.push(`<tr><td>${run === "edit" && EDITTAG !== "edit" ? `edit (${EDITTAG})` : run} · ${set}</td><td>${n}</td><td>${s.acc.toFixed(1)}%</td><td>${s.term.toFixed(1)}%</td><td>${s.cap.toFixed(1)}%</td><td>${s.loop.toFixed(1)}%</td></tr>`);
    }
  }
  return rows.join("\n");
})();
const fairReady = fairScores && fairScores.rows && Object.keys(fairScores.rows).length >= 6;

// heat: old (layers 15/19) + fair (all-layer t ranking + touched layers)
const heat = (() => {
  const parts = [];
  if (ranking) {
    const mx = Math.max(...ranking.ranking.map(r => r.t));
    const bars = Array.from({ length: 24 }, (_, L) => {
      const e = ranking.ranking.find(r => r.layer === L);
      const v = e ? e.t : 0;
      return `<i style="height:${4 + 44 * v / mx}px" title="layer ${L}: t ${v.toFixed(4)}"></i>`;
    }).join("");
    const top = ranking.ranking.slice(0, 3).map(r => `${r.layer} (t=${r.t})`).join(", ");
    parts.push(`<div class="hrow"><span>ALL-LAYER scan — loop-vs-finished MLP-write separability t per layer (our own localization, no 15/19 prior; top: ${top})</span><div class="cells">${bars}</div></div>`);
  }
  if (fairEdit) {
    for (const L of Object.keys(fairEdit.layers)) {
      const top = fairEdit.layers[L].proj_top.map(Math.abs);
      const mx = Math.max(...top);
      parts.push(`<div class="hrow"><span>layer ${L} · down_proj cols touched · |d·w| ${fairEdit.layers[L].t_score !== undefined ? "(scan t " + fairEdit.layers[L].t_score + ")" : ""}</span><div class="cells">${top.map(v => `<i style="height:${8 + 40 * v / mx}px" title="|d·w| ${v.toFixed(4)}"></i>`).join("")}</div></div>`);
    }
    parts.push(`<div class="note">fair edit: ${fairEdit.pct_changed.toFixed(4)}% of 752M weights — per-layer d removed from top-${fairEdit.topk} down_proj columns of layers ${Object.keys(fairEdit.layers).join("/")}</div>`);
  }
  const r = reports["edited_a1k64"];
  if (r) {
    for (const L of [15, 19]) {
      const top = r.layers[L].proj_top.map(Math.abs);
      const mx = Math.max(...top);
      parts.push(`<div class="hrow firstpass"><span>first pass · layer ${L} · ${r.pct_changed.toFixed(4)}% of weights (cap-1024 attempt)</span><div class="cells dim">${top.map(v => `<i style="height:${8 + 40 * v / mx}px" title="|d·w| ${v.toFixed(4)}"></i>`).join("")}</div></div>`);
    }
  }
  return `<div id="heat">${parts.join("")}</div>`;
})();

const batchRows = batches.map(b =>
  `<tr><td>${b.ts ? b.ts.slice(11, 19) : ""}</td><td>${b.phase}</td><td>${b.split}</td><td>${b.batch}</td><td>${b.cap}</td><td>${b.purpose}${b.ruled_out && b.ruled_out !== "nothing yet" ? `<br><span class="ruled">ruled out: ${b.ruled_out}</span>` : ""}</td></tr>`).join("\n");

const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
const pairHtml = pair ? `
<div class="pair">
  <div class="pane"><h3>BASE — ${pair.base.cap_hit || pair.base.cap ? `ran to the token cap (${pair.base.ntok} tok)` : "terminated"} ✗</h3><pre>${esc(pair.base.text)}…</pre></div>
  <div class="pane"><h3>${pair.edit.gold !== undefined ? "EDITED" : "EDITED"} — terminated${pair.edit.ok ? `, correct answer: ${esc(pair.edit.gold)}` : ""} ✓ (${pair.edit.ntok} tok)</h3><pre>${esc(pair.edit.text)}…</pre></div>
</div>` : `<p class="note">pair panel: awaiting fair scoring runs</p>`;

const vExtra = read("results/variants_extra.json", {});
const prac = Object.entries({ ...variants, ...vExtra }).map(([k, s]) =>
  `<tr><td>${k}</td><td>${s.terminated}/12</td><td>${s.correct}/12</td><td>${s.mean_ntok ?? "≥1024"}</td></tr>`).join("\n");
const pracHtml = prac ? `<h2>PRACTICE VARIANTS — first pass (gsm_train, 12 paired, cap 1024 — horizon now known to be unfair)</h2>
<table><tr><th>variant</th><th>terminated</th><th>correct</th><th>mean tokens</th></tr>${prac}</table>
<p class="note">…except <code>sampfix2.0</code>: its flag was duplicated (<code>--presence-penalty 1.5</code> still in the command). The clean rerun is the honest one.</p>` : "";
const pracFairHtml = variantsFair ? `<h2>FAIR-CAP PRACTICE (12 paired train problems, cap ${FAIRC}, penalty-free)</h2>
<table><tr><th>variant</th><th>terminated</th><th>correct</th></tr>${Object.entries(variantsFair).map(([k, s]) => `<tr><td>${k}</td><td>${s.terminated}/12</td><td>${s.correct}/12</td></tr>`).join("\n")}</table>` : "";

const sweepHtml = `
<table><tr><th>run</th><th>finished</th><th>cap-hit</th><th>loop-flagged</th><th>correct</th></tr>
${Object.entries(sweepSumm).map(([k, b]) => `<tr><td>${k}${b.pp > 0 ? ` @pp${b.pp}` : ""}</td><td>${b.finished}/12</td><td>${b.hit_cap}/12</td><td>${b.looped}/12</td><td>${b.correct}/12</td></tr>`).join("\n")}
</table>`;

const corpusHtml = corpus ? `<p class="note">corpus check: ${corpus.corpus.length ? `${corpus.corpus.filter(c => c.longest_repeat_words >= 24).length}/${corpus.corpus.length} cap-hit texts contain an exact repeated span ≥24 words (tight-loop signature); longest repeat median ${[...corpus.corpus].sort((a, b) => a.longest_repeat_words - b.longest_repeat_words)[Math.floor(corpus.corpus.length / 2)].longest_repeat_words} words. The rest are long-winded: progress without exact repetition.` : "no cap-hits at the fair cap — the loop class largely dissolves once answers can finish."}</p>` : "";

const verdict = fairReady ? `
<h2>VERDICT (fair horizon, cap ${FAIRC})</h2>
${(() => {
  const r = fairScores.rows;
  const avg = (run) => {
    const m = r[`${run}_math`], g = r[`${run}_gsm`];
    if (!m || !g) return null;
    const n = m.n + g.n;
    return {
      acc: (m.acc * m.n + g.acc * g.n) / n,
      term: (m.terminated * m.n + g.terminated * g.n) / n,
      cap: (m.hit_cap_pct * m.n + g.hit_cap_pct * g.n) / n,
      loop: (m.looped_pct * m.n + g.looped_pct * g.n) / n, n,
    };
  };
  const b = avg("base"), e = avg("edit"), p = avg("sampfix");
  const rowline = (nm, s) => s ? `<div><b>${nm}</b> acc ${s.acc.toFixed(1)}% · terminated ${s.term.toFixed(1)}% · hit-cap ${s.cap.toFixed(1)}% · loop ${s.loop.toFixed(1)}%</div>` : "";
  const verdictLine = (e && b && e.acc >= b.acc + 5)
    ? `The edit <b>moved the needle</b> at a horizon where answers can finish (${b.acc.toFixed(1)}% → ${e.acc.toFixed(1)}% accuracy, terminated ${b.term.toFixed(1)}% → ${e.term.toFixed(1)}%). ${e.acc >= 40 ? "Astra-scale improvement: reproduced." : "Short of MIT's 48.1% — partial reproduction."}`
    : (e && b && e.acc <= b.acc + 1)
      ? `At cap ${FAIRC}, where ${b.term.toFixed(0)}% of base answers finish, our weight edit changed accuracy ${b.acc.toFixed(1)}% → ${e.acc.toFixed(1)}% and termination ${b.term.toFixed(1)}% → ${e.term.toFixed(1)}%. <b>The honest negative stands — now provable, not provisional:</b> removing our localized loop direction does not fix the non-termination even when the horizon is fair. MIT's improvement must come from what their localization found at 32k horizons (repeat-onset contrast), not from what a sequence-mean direction at 4k horizons captures.`
      : `Mixed rows — see table; verdict prose pending full per-row review.`;
  return `<div class="kpi">${rowline("base (pp0)", b)}${rowline(`edit${EDITTAG !== "edit" ? ` (${EDITTAG})` : ""}`, e)}${rowline("penalty-only (pp1.5)", p)}</div><p>${verdictLine}</p>`;
})()}
<p class="note">Fair deviations: cap ${FAIRC}, not MIT's 32,768 (this box is CPU-only, ~150 tok/s); fixed 100 MATH-500 + 100 GSM8K-test (seed 20261103, identical rows before/after); grader = boxed-extraction + numeric match; d = per-layer loop-tail-vs-finished contrast over all 24 layers (repeat-onset positions approximated by the last 1024 tokens of capped generations). Backend: the six scored rows ran on one <code>llama-server</code> with continuous batching (24 slots, ~4× the aggregate throughput of the 12-separate-process harness, which is RAM-bandwidth-bound) — same seed and sampling args on every row; a partially-scored CPU-harness row was archived and never mixed into these tables.</p>` : `
<div class="banner">⚠ The verdict below was measured at cap 1024 — a horizon where 91–100% of base answers hit the cap. Per Jon's steer on #1493 it is <b>not a measurement of the fix</b>: answers there were cut off, not looping. The fair-horizon rescore (#1506, cap ${FAIRC}, fixed 100+100, base/edit/penalty rows) is ${fairTbl ? "partially complete" : "running"} — this page updates when its numbers land.</div>
<h2>VERDICT (first pass, cap 1024 — SUPERSEDED)</h2>
<p>The Astra recipe <b>did not reproduce</b> with our budget and our localization. Removing our loop-write direction from layers 15/19 — even from <i>all</i> columns (0.98% of weights) — left 12/12 practice problems non-terminating; the ablated model stayed coherent but rambled <i>longer</i>. Within a 1024-token horizon, 9,220 "looping" positions look like verbose self-questioning, not the tight attractor MIT traced over 32k-token horizons.</p>
<p>The control row caught us out. An early run looked like the model-card fix (presence penalty 2.0) suddenly terminating 12/12 — too good. It was a <b>harness artifact</b>: the override flag was appended <i>after</i> the standard 1.5, so the command carried <code>--presence-penalty 1.5 --presence-penalty 2.0</code>. With the override applied cleanly (single flag), termination collapsed to 0/12.</p>`;

// ---- SURGERY II (#1505): longer-horizon capture + downstream removal ----
const v2 = read("results/v2_variants.json", null) || read("variants_v2.json", {});
const v2loops = read("results/v2_loop_texts.json", null) || read("v2_loop_texts.json", null);
const v2reports = {};
for (const v of ["A", "B", "C"]) v2reports[v] = read(`edited2_${v}/edit_report.json`) || read(`edit_reports/v2_${v}.json`);
const V2LBL = { base: "base · cap 4096 · pp 0", A: "A · upstream: d removed from down_proj ×6 FA layers", B: "B · downstream: tied-unembed + o_proj rank-1 strip ×6 FA layers", C: "C · A+B combined" };
const v2rows = Object.entries(v2).map(([k, s]) => {
  const mean = s.rows ? Math.round(s.rows.reduce((a, r) => a + r.ntok, 0) / s.rows.length) : "—";
  return `<tr><td>${V2LBL[k] || k}</td><td>${s.terminated}/12</td><td>${s.looped}/12</td><td>${s.correct}/12</td><td>${mean}</td></tr>`;
}).join("\n");
const v2signal = ["A", "B", "C"].some(k => v2[k] && v2.base &&
  (v2[k].terminated > v2.base.terminated && v2[k].correct > v2.base.correct));
const v2cap = (() => {
  const cap = batches.find(b => b.phase === "capture-v2");
  return cap ? `onset positions (tokens): ${JSON.stringify(cap.onsets)}` : "capture pending";
})();
const v2pair = v2loops && v2loops.loop?.length && v2loops.end?.length ? `
<div class="pair">
  <div class="pane"><h3>II · LOOP at cap 4096 — onset at token ${v2loops.loop[0].onset_tok} ✗</h3><pre>${esc(v2loops.loop[0].text.slice(0, 700))}…</pre></div>
  <div class="pane"><h3>II · TERMINATED at cap 4096 (${v2loops.end[0].ntok} tok) ${v2loops.end[0].hit_cap ? "✗" : "✓"}</h3><pre>${esc(v2loops.end[0].text.slice(0, 700))}…</pre></div>
</div>` : "";
const v2acc = ["A", "B", "C"].filter(k => v2[k] && v2.base && v2[k].correct > v2.base.correct);
const v2Html = `
<h2>SURGERY II — repeat-onset d, all six attention layers, both ends (#1505)</h2>
<p>Round I localized <b>d</b> as a whole-sequence mean at a 1024-token horizon — verbose reasoning, not the attractor. Round II changes all three inputs at once: capture at <b>cap 4096</b> (penalty-free, seed 23, train-only), take d as <b>mean(write during the loop) − mean(write before it)</b> from the detected repeat-onset, and operate on all six full-attention layers <code>{3,7,11,15,19,23}</code> (this model interleaves linear attention every 4th layer). Variant <b>B</b> cuts the <i>read</i> side instead: <code>embed_tokens</code> rows (unembed is tied) and <code>o_proj</code> rank-1, so the residual stream can no longer be expressed in logits or written by attention along d. <em>${v2cap}</em></p>
${v2pair}
<table><tr><th>variant</th><th>terminated</th><th>looped</th><th>correct</th><th>mean tokens</th></tr>${v2rows || "<tr><td colspan=5>v2 runs pending</td></tr>"}</table>
${v2reports.B ? `<p class="note">weights edited — A: ${(v2reports.A?.pct_changed ?? 0).toFixed(3)}% · B: ${v2reports.B.pct_changed.toFixed(3)}% (embed ‖d‖ energy removed ${v2reports.B.embed?.norm_removed ?? "?"}) · C: ${(v2reports.C?.pct_changed ?? 0).toFixed(3)}%</p>` : ""}
<p class="note">${v2signal
  ? "VERDICT II: a variant terminates more held-out problems AND scores higher than base at the fair horizon — the second cut lands. Details above."
  : `VERDICT II: no variant beats base-4096 on termination at this horizon — the second negative, and sharper than round I's: with exact token counting base itself terminates only 1/12 (the earlier 6/12 was a words×2 estimate artifact, see README). ${v2acc.length ? `But ${v2acc.map(k => `variant ${k} (${v2[k].correct}/${v2.base.correct})`).join(", ")} scores above base without terminating — removing d from the READ path makes the model find right answers while it rambles. Direction removal helps reasoning, not termination; horizon (32k vs 4k) and localization remain the gap to MIT.` : "No variant even improves accuracy; horizon (32k vs 4k) and localization remain the gap to MIT."}`}</p>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>WEIGHT SURGERY — labs</title>
<style>
  body { background:#0b0714; color:#d9b8ff; font:13px/1.6 ui-monospace,Menlo,monospace; margin:0; padding:24px 18px 60px; }
  .wrap { max-width:860px; margin:0 auto; }
  h1 { color:#c77dff; letter-spacing:.12em; font-size:20px; margin:0 0 4px; }
  h2 { color:#7dffb2; font-size:13px; letter-spacing:.14em; margin:28px 0 8px; }
  .sub { color:#6f5a8d; margin-bottom:18px; }
  table { border-collapse:collapse; width:100%; font-size:12px; }
  th, td { border:1px solid rgba(199,125,255,.25); padding:5px 8px; text-align:left; vertical-align:top; }
  th { color:#c77dff; background:rgba(199,125,255,.08); }
  .big { font-size:22px; color:#7dffb2; }
  #heat .hrow { margin:10px 0; }
  #heat .cells { display:flex; align-items:flex-end; gap:1px; height:48px; }
  #heat i { flex:1; background:#7dffb2; min-width:2px; opacity:.85; }
  #heat .firstpass .cells i { background:#5a4a78; }
  .banner { border:1px solid #ffb86b; color:#ffb86b; padding:10px 14px; margin:18px 0; }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width:700px){ .pair{grid-template-columns:1fr;} }
  .pane { border:1px solid rgba(199,125,255,.3); padding:10px; min-width:0; }
  .pane h3 { font-size:11px; letter-spacing:.08em; margin:0 0 8px; color:#ffb86b; }
  .pane pre { white-space:pre-wrap; word-break:break-word; font-size:11px; max-height:300px; overflow:auto; color:#cbb6e8; margin:0; }
  .note { color:#6f5a8d; font-size:11px; }
  .ruled { color:#ffb86b; }
  a { color:#7dffb2; }
  #log td { font-size:11px; }
  .kpi { display:flex; gap:18px; flex-wrap:wrap; margin:14px 0; }
  .kpi div { border:1px solid rgba(199,125,255,.3); padding:8px 14px; }
  .kpi b { display:block; font-size:20px; color:#7dffb2; }
</style>
</head>
<body><div class="wrap">
<h1>WEIGHT SURGERY</h1>
<div class="sub">Qwen3.5-0.8B @ <code>2fc06364</code> — weight-space programming attempt (#1493), rescored at a fair horizon (#1506): no gradients, practice on GSM8K/MATH <b>train</b> only, ≤50 forward-pass batches, one scored held-out run. By the forge, on a laptop-class CPU (this box's GPU path is dead, #737).</div>

<h2>THE BUG — and the cap that hid it</h2>
<p>Qwen's own model card (L856) warns Qwen3.5-0.8B falls into <b>thinking loops</b>. The first pass measured at a 1024-token cap: <span class="big">36/36</span> train problems hit the cap — including "What is 17×23?". But the cap itself was the confound (Jon's steer, #1493): at cap 4096, penalty-free, the same base model finishes:</p>
${sweepHtml}
${corpusHtml}
<p class="note">So: at 4096, ${sweepSumm.cap4096 ? sweepSumm.cap4096.finished + "/12" : "?"} finishes and only ${sweepSumm.cap4096 ? sweepSumm.cap4096.hit_cap + "/12" : "?"} hits the cap — of which only ${sweepSumm.cap4096 ? sweepSumm.cap4096.looped + "/12" : "?"} carries the exact-repeat loop signature. The non-termination at 1024 was mostly truncation of long thinking, not the MIT loop.</p>

<h2>THE FIX — our own localization, all layers, per layer</h2>
<p>MIT CSAIL (Takehi et&nbsp;al., Nov 2026) fixed Qwen3.5-0.8B by subtracting one direction written by the MLPs of layers 15 &amp; 19 from the top down_proj columns — 0.016% of the weights — at a horizon of 32,768 tokens. Per the steer, we scanned <b>all 24 layers</b> for the loop-vs-finished MLP-write contrast (no 15/19 prior; fixes the layer-pooling shortcut in the first-pass capture), ranked separability per layer, and removed the per-layer direction from the top-K columns of the highest-ranked layers:</p>
${heat}

${pracFairHtml}
${pracHtml}

<h2>HOLD-OUT SCORES — fair horizon (fixed 100 MATH-500 + 100 GSM8K-test, seed 20261103, cap ${FAIRC})</h2>
<table>
<tr><th>run · set</th><th>n</th><th>accuracy</th><th>terminated</th><th>hit cap</th><th>repeated (loop)</th></tr>
${fairTbl || "<tr><td colspan=6>scoring in progress — runs launch as the edit lands; resumable runner, numbers post to #1506</td></tr>"}
</table>

<h2>ONE PROBLEM, BEFORE / AFTER</h2>
${pairHtml}

<h2>THE BATCH LOG (every pass, what it ruled out)</h2>
<table id="log">
<tr><th>time</th><th>phase</th><th>split</th><th>n</th><th>cap</th><th>purpose</th></tr>
${batchRows}
</table>

${verdict}

<h2>FIRST-PASS HELD-OUT (cap 1024 — kept for the record; unmeasurable horizon)</h2>
<table>
<tr><th>run · set</th><th>accuracy</th><th>terminated</th><th>hit cap</th><th>repeated (loop)</th></tr>
${tbl || "<tr><td colspan=5>—</td></tr>"}
</table>

${v2Html}

<h2>SOURCES</h2>
<p><a href="https://jalfern.com/retrogames/issues/1493" rel="noopener">Issue #1493</a> ·
<a href="https://jalfern.com/retrogames/issues/1505" rel="noopener">Issue #1505 (Surgery II)</a> ·
<a href="https://jalfern.com/retrogames/issues/1506" rel="noopener">rescore #1506</a> ·
<a href="https://rikiyat.github.io/blog/weight-space-programming/" rel="noopener">Sparks of Weight-Space Programming</a> (MIT CSAIL) ·
<a href="https://github.com/RikiyaT/lm_understand-logs" rel="noopener">experiment logs</a> ·
lab scripts: <code>demos/weight-surgery-lab/</code> in the repo.</p>
</div></body></html>`;

const out = process.argv[2] || `${LAB}/weightsurgery.html`;
fs.writeFileSync(out, html);
console.log("wrote", out, `${(html.length / 1024) | 0}KB`);
