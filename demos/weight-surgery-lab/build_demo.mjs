// WEIGHT SURGERY demo page builder (#1493).
// Reads lab artifacts, writes a self-contained demo HTML. No weights embedded.
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
  if (m) scores[`${m[1]}_${m[2]}`] = lines(`results/${f}`).map(r => ({ ...r }));
}
const reports = {};
for (const v of ["edited_a1k64", "edited_a1k256"]) {
  reports[v] = read(`${v}/edit_report.json`);
}
const variants = read("results/variants.json", {});
const finals = read("results/final_scores.json", {});
const loopTexts = read("results/loop_texts.json", { loop: [], end: [] });

// pick the demo pair: a problem base capped on, edited terminated correctly
let pair = null;
{
  const baseMath = scores["base_math"] || [];
  const edMath = scores["edit_math"] || [];
  for (const b of baseMath) {
    const e = edMath.find(x => x.i === b.i);
    if (b.cap && e && !e.cap && e.ok) { pair = { base: b, edit: e }; break; }
  }
  if (!pair) {
    for (const b of baseMath) {
      const e = edMath.find(x => x.i === b.i);
      if (b.cap && e && !e.cap) { pair = { base: b, edit: e }; break; }
    }
  }
}

const pct = (v) => v === undefined ? "—" : `${v}%`;
const tbl = Object.entries(finals).map(([k, s]) =>
  `<tr><td>${k.replace("_", " · ")}</td><td>${pct(s.acc)}</td><td>${pct(s.terminated)}</td><td>${pct(s.hit_cap_pct)}</td><td>${pct(s.looped_pct)}</td></tr>`).join("\n");

const heat = (() => {
  const r = reports["edited_a1k64"];
  if (!r) return "";
  const rows = [15, 19].map(L => {
    const top = r.layers[L].proj_top.map(Math.abs);
    const mx = Math.max(...top);
    return `<div class="hrow"><span>layer ${L} · down_proj cols touched (of ${r.layers[L].frac_of_layer * 3584 | 0})</span><div class="cells">${top.map(v => `<i style="height:${8 + 40 * v / mx}px" title="|d·w| ${v.toFixed(4)}"></i>`).join("")}</div></div>`;
  }).join("");
  return `<div id="heat">${rows}<div class="note">${(r.pct_changed).toFixed(4)}% of 752M weights edited — remove <b>d</b> from the top-${r.topk} down_proj columns of layers 15/19 (the Astra recipe, applied to our own localized direction)</div></div>`;
})();

const batchRows = batches.map(b =>
  `<tr><td>${b.ts ? b.ts.slice(11, 19) : ""}</td><td>${b.phase}</td><td>${b.split}</td><td>${b.batch}</td><td>${b.cap}</td><td>${b.purpose}${b.ruled_out && b.ruled_out !== "nothing yet" ? `<br><span class="ruled">ruled out: ${b.ruled_out}</span>` : ""}</td></tr>`).join("\n");

const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
const pairHtml = pair ? `
<div class="pair">
  <div class="pane"><h3>BASE — ran to the token cap (${pair.base.ntok} tok) ✗</h3><pre>${esc(pair.base.text)}…</pre></div>
  <div class="pane"><h3>EDITED — terminated, correct answer: ${esc(pair.edit.gold)} ✓ (${pair.edit.ntok} tok)</h3><pre>${esc(pair.edit.text)}…</pre></div>
</div>` : `<p class="note">pair panel: ${scores["base_math"] ? "no base-capped problem was terminated correctly after the edit on this subsample" : "scoring runs incomplete"}</p>`;

const vExtra = read("results/variants_extra.json", {});
const prac = Object.entries({ ...variants, ...vExtra }).map(([k, s]) =>
  `<tr><td>${k}</td><td>${s.terminated}/12</td><td>${s.correct}/12</td><td>${s.mean_ntok ?? "≥1024"}</td></tr>`).join("\n");
const pracHtml = prac ? `<h2>PRACTICE VARIANTS (gsm_train, 12 paired problems, cap 1024)</h2>
<table><tr><th>variant</th><th>terminated</th><th>correct</th><th>mean tokens</th></tr>${prac}</table>
<p class="note">…except <code>sampfix2.0</code>: its flag was duplicated (<code>--presence-penalty 1.5</code> still in the command). The clean rerun is the honest one.</p>` : "";

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
<div class="sub">Qwen3.5-0.8B @ <code>2fc06364</code> — an attempt at weight-space programming (#1493): no gradients, practice on GSM8K/MATH <b>train</b> only, ≤50 forward-pass batches, one scored held-out run. By the forge, on a laptop-class CPU (this box's GPU path is dead, #737).</div>

<h2>THE BUG</h2>
<p>Qwen's own model card (L856) warns Qwen3.5-0.8B falls into <b>thinking loops</b>. Measured on 36 GSM8K/MATH train problems at a 1024-token cap with the card's own sampling: <span class="big">36/36</span> hit the cap. Zero terminated. Even "What is 17×23?" rambles past 512 tokens without an answer.</p>

<h2>THE FIX ATTEMPT — the Astra recipe, our own localization</h2>
<p>MIT CSAIL (Takehi et&nbsp;al., Nov 2026) fixed this by subtracting one direction written by the MLPs of layers 15 &amp; 19 from 64 down_proj columns in each — 0.016% of the weights. We localized our own direction <b>d</b>: the mean residual-stream write of layers 15/19 across 9,220 looping positions (captured by prefill only, train splits), then removed d's component from the top-64 / top-256 / all 3,584 down_proj columns of those two layers (0.017% / 0.070% / 0.98% of weights).</p>
${heat}

${pracHtml}
<h2>SCORES (fixed-seed held-out subsamples, identical config before/after)</h2>
<table>
<tr><th>run · set</th><th>accuracy</th><th>terminated</th><th>hit cap</th><th>repeated (loop)</th></tr>
${tbl || "<tr><td colspan=5>scoring in progress</td></tr>"}
</table>
<p class="note">Deviations, stated plainly: cap 1024 not 32,768 (laptop compute; identical both sides); MATH-500 and GSM8K-test fixed-seed subsampled to ${finals.base_math ? Math.max(...Object.values(finals).map(s => s.n)) : "?"} problems; grading = boxed-extraction + numeric/string match; column ranking used |d·w| only (activation-weighted ranking had a capture bug); no terminated contrast class existed (the base never terminates), so d is the raw loop-write mean.</p>

<h2>ONE PROBLEM, BEFORE / AFTER</h2>
${pairHtml}

<h2>THE BATCH LOG (every pass, what it ruled out)</h2>
<table id="log">
<tr><th>time</th><th>phase</th><th>split</th><th>n</th><th>cap</th><th>purpose</th></tr>
${batchRows}
</table>

<h2>VERDICT — a clean negative, and a harness trap we fell into and caught</h2>
<p>The Astra recipe <b>did not reproduce</b> with our budget and our localization. Removing our loop-write direction from layers 15/19 — even from <i>all</i> columns (0.98% of weights) — left 12/12 practice problems non-terminating; the ablated model stayed coherent but rambled <i>longer</i>. Within a 1024-token horizon, 9,220 "looping" positions look like verbose self-questioning, not the tight attractor MIT traced over 32k-token horizons: what we could localize at this scale isn't the thing they cut.</p>
<p>The control row caught us out. An early run looked like the model-card fix (presence penalty 2.0) suddenly terminating 12/12 — too good. It was a <b>harness artifact</b>: the override flag was appended <i>after</i> the standard 1.5, so the command carried <code>--presence-penalty 1.5 --presence-penalty 2.0</code>. With the override applied cleanly (single flag), termination collapsed to 0/12. Held-out scoring, run before we noticed, shows the same: presence 2.0 still hits the cap on 95% of MATH and 100% of GSM8K problems.</p>
<p class="note">Bottom line: on a laptop CPU, at a 1024-token cap, with a whole-sequence mean direction — <b>neither weight surgery nor the model card's own sampling settings break the non-termination</b>. MIT's numbers stand (their logs are public); reproducing them needs their horizon (32k), their batch sizes, and probably their localization method (repeat-onset contrast, not sequence mean). Next: capture at 2–8k horizons from the moment loops start, ablate through o_proj/unembed too, score full MATH-500, then compare against MIT's published edit — in that order.</p>

${v2Html}

<h2>SOURCES</h2>
<p><a href="https://jalfern.com/retrogames/issues/1493" rel="noopener">Issue #1493</a> ·
<a href="https://jalfern.com/retrogames/issues/1505" rel="noopener">Issue #1505 (Surgery II)</a> ·
<a href="https://rikiyat.github.io/blog/weight-space-programming/" rel="noopener">Sparks of Weight-Space Programming</a> (MIT CSAIL) ·
<a href="https://github.com/RikiyaT/lm_understand-logs" rel="noopener">experiment logs</a> ·
lab scripts: <code>demos/weight-surgery-lab/</code> in the repo.</p>
</div></body></html>`;

const out = process.argv[2] || `${LAB}/weightsurgery.html`;
fs.writeFileSync(out, html);
console.log("wrote", out, `${(html.length / 1024) | 0}KB`);
