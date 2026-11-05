// WEIGHT SURGERY demo page builder v3 (#1493 + fair-horizon rescore #1506).
// Reads lab artifacts, writes a self-contained demo HTML. No weights embedded.
// With fair scores in (results/fair_scores.json live, lab-root copy committed),
// the six-row verdict LEADS the page and the cap-1024 first-pass verdict is
// retired into a collapsed SUPERSEDED block.
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
const fairScores = read("results/fair_scores.json", null) || read("fair_scores.json", null);
// #1506 closeout: banner-contamination honesty artifact (8 llama-cli banner rows on
// the MATH runs, same problem ids in all three runs; GSM8K clean).
const honesty = read("results/fair_honesty.json", null) || read("fair_honesty.json", null);
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
// #1520-iii: per-problem drill-down excerpts — first 10 scored problems per set,
// text capped at 600 chars (honest size; no weights). Prefer the committed lab-root
// copy so every build (CI, live lab) renders byte-identical drill-downs.
const excerpts = (() => {
  const fx = read("fair_excerpts.json", null);
  if (fx) return fx;
  const out = {};
  for (const [k, recs] of Object.entries(fair)) {
    out[k] = recs.filter(r => !/Loading model/.test(r.text || "")).slice(0, 10).map(r => ({
      i: r.i, ok: !!r.ok, cap: !!r.cap_hit, ntok: r.ntok,
      q: (r.problem || "").slice(0, 140),
      x: (r.text || "").slice(0, 600),
    }));
  }
  return out;
})();
const reports = {};
for (const v of ["edited_a1k64", "edited_a1k256"]) {
  reports[v] = read(`${v}/edit_report.json`);
}
const variants = read("results/variants.json", {});
const finals = read("results/final_scores.json", {});
// #1533 ROUND 2 artifacts (oMLX GPU @32K): scores, bench, pp-proof, p50c manifest, own edit
const r2s = read("results/r2/r2_scores.json", null);
const r2bench = read("results/r2/bench16.json", null);
const r2pp = read("results/r2/pp_proof.json", null);
const r2mit = read("results/r2/mit_grader.json", null);
const r2p50 = read("results/r2/p50c_manifest.json", null);
const r2own = read("results/r2/edit_report_own.json", null);
const r2gate = read("results/r2/step1_gate.json", null);
const r2probe = read("results/r2/probe_engine.json", null);
// #1567 ROUND 3 artifacts: layer-count ranking (pass P7), practice rows for the
// α selection (Jon ruling: choose on practice; held-out is scored ONCE, for the
// winner only), and the frozen-rule pick.
const r3Layer = read("results/r2/r3_layer_rank.json", null);
const r3Pick = read("results/r2/r3_alpha_pick.json", null);
const r3prac = Object.fromEntries(["base", "own2", "own4", "own8"]
  .map(t => [t, read(`results/r2/practice_${t}.json`, null)]));

const sweepSumm = Object.fromEntries(batches.filter(b => b.phase === "practice" && b.purpose && b.purpose.startsWith("Jon step1")).map(b => [`cap${b.cap}`, b]));

const FAIRC = (fairScores && fairScores.cap) || (capSweep && 4096);

// pick the demo pair from the FAIR runs: base capped, edit terminated (correct preferred).
// #1506 b18 fix (finished by slot a): llama-cli startup-banner rows ("Loading model…")
// are harness contamination, never pair material.
const bannerFree = (x) => !/Loading model/.test(x?.text || "");
let pair = null;
{
  const bM = (fair["base_math"] || []).filter(bannerFree);
  const eM = (fair["edit_math"] || []).filter(bannerFree);
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
const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");

// #1520-iii: expandable per-problem block under a fair-table row (item iii).
const ddRow = (run, set, total) => {
  const rows = excerpts[`${run === "edit" ? EDITTAG : run}_${set}`];
  if (!rows || !rows.length) return "";
  const nOk = rows.filter(r => r.ok).length;
  const blocks = rows.map(r => `<div class="ddp1${r.ok ? " ok" : ""}"><b>#${r.i}${r.ok ? " ✓" : ""}${r.cap ? " · cap" : ""} · ${r.ntok} tok</b><span>${esc(r.q)}</span><pre>${esc(r.x)}…</pre></div>`).join("");
  return `\n<tr class="ddrow"><td colspan=6><details class="dd"><summary>drill down — first ${rows.length}/${total} scored, ${nOk}/${rows.length} correct (text excerpts ≤600 chars)</summary><div class="ddp">${blocks}</div></details></td></tr>`;
};
const tbl = Object.entries(finals).map(([k, s]) =>
  `<tr><td>${k.replace("_", " · ")}</td><td>${pct(s.acc)}</td><td>${pct(s.terminated)}</td><td>${pct(s.hit_cap_pct)}</td><td>${pct(s.looped_pct)}</td></tr>`).join("\n");

const fairTbl = (() => {
  const rows = [];
  for (const set of ["math", "gsm"]) {
    for (const run of ["base", "edit", "sampfix"]) {
      const key = `${run === "edit" ? EDITTAG : run}_${set}`;
      const recs = fair[key];
      const label = run === "edit" && EDITTAG !== "edit" ? `edit (${EDITTAG})`
        : run === "sampfix" ? "penalty (pp1.5)" : run;
      let n, acc, term, cap, loop;
      if (recs && recs.length) {
        n = recs.length;
        if (n < 100) {   // mid-run row: status only — interim metrics would ship numbers the final run may not repeat
          rows.push(`<tr id="h-${run}_${set}"><td>${label} · ${set}</td><td>${n}/100</td><td colspan=4 class="note">scoring in progress — final row lands on #1506 <span class="prog" aria-hidden="true"><i></i></span></td></tr>${ddRow(run, set, n)}`);
          continue;
        }
        acc = 100 * recs.filter(r => r.ok).length / n;
        term = 100 * recs.filter(r => !r.cap_hit).length / n;
        cap = 100 * recs.filter(r => r.cap_hit).length / n;
        loop = 100 * recs.filter(r => r.loop).length / n;
      } else {
        // committed lab copy carries no per-row jsonl (size) — render the row from the
        // scored summary artifact instead, identical numbers to the live-lab recomputation
        const s = fairScores?.rows?.[key];
        if (!s) continue;
        n = s.n; acc = s.acc; term = s.terminated; cap = s.hit_cap_pct; loop = s.looped_pct;
      }
      rows.push(`<tr id="h-${run}_${set}"><td>${label} · ${set}</td><td>${n}</td><td>${acc.toFixed(1)}%</td><td>≥${term.toFixed(1)}%†</td><td>≤${cap.toFixed(1)}%†</td><td>${loop.toFixed(1)}%</td></tr>${ddRow(run, set, n)}`);
    }
  }
  return rows.join("\n");
})();
const fairReady = fairScores && fairScores.rows && Object.keys(fairScores.rows).length >= 6;

// #1520-iv: tap-to-see-layer readout under each heat board (bars carry data-info).
const readout = (id) => `<div class="hread" id="${id}">tap or hover a bar — layer readout</div>`;
// heat: old (layers 15/19) + fair (all-layer t ranking + touched layers)
const heat = (() => {
  const parts = [];
  if (ranking) {
    const mx = Math.max(...ranking.ranking.map(r => r.t));
    const bars = Array.from({ length: 24 }, (_, L) => {
      const e = ranking.ranking.find(r => r.layer === L);
      const v = e ? e.t : 0;
      return `<i data-info="layer ${L}: t ${v.toFixed(4)}" style="height:${4 + 44 * v / mx}px" title="layer ${L}: t ${v.toFixed(4)}"></i>`;
    }).join("");
    const top = ranking.ranking.slice(0, 3).map(r => `${r.layer} (t=${r.t})`).join(", ");
    parts.push(`<div class="hrow"><span>ALL-LAYER scan — loop-vs-finished MLP-write separability t per layer (our own localization, no 15/19 prior; top: ${top})</span><div class="cells" data-readout="heatreadout">${bars}</div></div>`);
  }
  if (fairEdit) {
    for (const L of Object.keys(fairEdit.layers)) {
      const top = fairEdit.layers[L].proj_top.map(Math.abs);
      const mx = Math.max(...top);
      parts.push(`<div class="hrow"><span>layer ${L} · down_proj cols touched · |d·w| ${fairEdit.layers[L].t_score !== undefined ? "(scan t " + fairEdit.layers[L].t_score + ")" : ""}</span><div class="cells" data-readout="heatreadout">${top.map(v => `<i data-info="|d·w| ${v.toFixed(4)}" style="height:${8 + 40 * v / mx}px" title="|d·w| ${v.toFixed(4)}"></i>`).join("")}</div></div>`);
    }
    parts.push(`<div class="note">fair edit: ${fairEdit.pct_changed.toFixed(4)}% of 752M weights — per-layer d removed from top-${fairEdit.topk} down_proj columns of layers ${Object.keys(fairEdit.layers).join("/")}</div>`);
  }
  const r = reports["edited_a1k64"];
  if (r) {
    for (const L of [15, 19]) {
      const top = r.layers[L].proj_top.map(Math.abs);
      const mx = Math.max(...top);
      parts.push(`<div class="hrow firstpass"><span>first pass · layer ${L} · ${r.pct_changed.toFixed(4)}% of weights (cap-1024 attempt)</span><div class="cells dim" data-readout="heatreadout">${top.map(v => `<i data-info="|d·w| ${v.toFixed(4)}" style="height:${8 + 40 * v / mx}px" title="|d·w| ${v.toFixed(4)}"></i>`).join("")}</div></div>`);
    }
  }
  return `<div id="heat">${parts.join("")}${readout("heatreadout")}</div>`;
})();

// #1520-v: score-fair rows jump to their table row; first-pass score rows that a
// later score-fair row re-measured get dimmed (kept visible — corrections are the story).
const splitOf = (b) => b.split ?? (b.run ? `${b.run} · ${b.set}` : "—");
const supKeys = new Set(batches.filter(b => b.phase === "score-fair").map(splitOf));
const batchRows = batches.map(b => {
  const split = splitOf(b);
  let anchorKey = split.replace(/ · /g, "_");
  if (anchorKey.startsWith(`${EDITTAG}_`)) anchorKey = `edit_${anchorKey.slice(EDITTAG.length + 1)}`;
  // committed excerpts key by the raw variant tag (k256_math); log anchors use the page
  // tag (edit_math) — accept either when deciding whether to link.
  const exHas = (k) => !!excerpts[k] || (k.startsWith("edit_") && !!excerpts[`${EDITTAG}_${k.slice(5)}`]);
  const splitCell = b.phase === "score-fair" && (fair[anchorKey] || fairScores?.rows?.[anchorKey]) && exHas(anchorKey) ? `<a href="#h-${anchorKey}">${split}</a>` : split;
  const cls = b.phase === "score" && supKeys.has(split) ? ' class="ovr"' : '';
  const purpose = b.purpose ?? (b.phase === "score-fair" ? `fair hold-out row — acc ${b.acc}% terminated ${b.terminated}%`
    : b.phase === "score" ? `first-pass hold-out row — acc ${b.acc}% terminated ${b.terminated}%` : "");
  return `<tr${cls}><td>${b.ts ? b.ts.slice(11, 19) : ""}</td><td>${b.phase}</td><td>${splitCell}</td><td>${b.batch}</td><td>${b.cap}</td><td>${purpose}${b.ruled_out && b.ruled_out !== "nothing yet" ? `<br><span class="ruled">ruled out: ${b.ruled_out}</span>` : ""}</td></tr>`;
}).join("\n");
const pairHtml = pair ? `
<div class="pair">
  <div class="pane"><h3>BASE — ${pair.base.cap_hit || pair.base.cap ? `ran to the token cap (${pair.base.ntok} est tok)` : "terminated"} ✗</h3><pre>${esc(pair.base.text)}…</pre></div>
  <div class="pane"><h3>EDITED — terminated${pair.edit.ok ? `, correct answer: ${esc(pair.edit.gold)}` : " but wrong answer"} ${pair.edit.ok ? "✓" : "±"} (${pair.edit.ntok} est tok)</h3><pre>${esc(pair.edit.text)}…</pre></div>
</div>` : `<div class="pair skelpair">
  <div class="pane dim"><h3>BASE — awaiting fair scoring</h3><div class="skel"></div><div class="skel w80"></div><div class="skel w60"></div></div>
  <div class="pane dim"><h3>EDITED — awaiting fair scoring</h3><div class="skel"></div><div class="skel w80"></div><div class="skel w60"></div></div>
</div>`;

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
<h2 id="verdictfair">VERDICT — fair horizon, cap ${FAIRC} (fixed 100 MATH-500 + 100 GSM8K-test, seed 20261103)</h2>
${(() => {
  const r = fairScores.rows;
  const g = (run, set) => r[`${run === "edit" ? EDITTAG : run}_${set}`];
  const bm = g("base", "math"), bg = g("base", "gsm");
  const em = g("edit", "math"), eg = g("edit", "gsm");
  const pm = g("sampfix", "math"), pg = g("sampfix", "gsm");
  const f1 = (v) => v.toFixed(1);
  const td = (s) => `<td>${f1(s.acc)}%</td><td>≥${f1(s.terminated)}%†</td><td>${f1(s.looped_pct)}%</td>`;
  const signal = bm && bg && em && eg &&
    ((em.acc >= bm.acc + 5 && em.terminated >= bm.terminated + 10) ||
     (eg.acc >= bg.acc + 5 && eg.terminated >= bg.terminated + 10));
  const lead = signal
    ? `The edit <b>moved the needle</b> at a horizon where answers can finish — see the per-set table for where. Short of MIT's 48.1%: partial reproduction.`
    : `The edit <b>did not fix it.</b> MATH accuracy ${f1(bm.acc)}% → ${f1(em.acc)}% and GSM8K ${f1(bg.acc)}% → ${f1(eg.acc)}% — both differences sit inside the ≈±10 pp noise band at n=100 per set — while loop flags on GSM8K <b>went up</b>, ${f1(bg.looped_pct)}% → ${f1(eg.looped_pct)}%. The presence penalty (the model card's sampling-side fix) made <b>every number worse</b>: MATH ${f1(bm.acc)}% → ${f1(pm.acc)}%, GSM8K ${f1(bg.acc)}% → ${f1(pg.acc)}%, and finished rates fell on both sets.`;
  return `<p id="verdictlead">${lead}</p>
<table id="verdictfairtbl">
<tr><th>run</th><th>MATH acc</th><th>MATH finished</th><th>MATH loop</th><th>GSM8K acc</th><th>GSM8K finished</th><th>GSM8K loop</th></tr>
<tr id="v-base"><td>base (pp0)</td>${td(bm)}${td(bg)}</tr>
<tr id="v-pen"><td>presence penalty (pp1.5)</td>${td(pm)}${td(pg)}</tr>
<tr id="v-edit"><td>edit · per-layer d, top-256 cols${EDITTAG !== "edit" ? ` (${EDITTAG})` : ""}</td>${td(em)}${td(eg)}</tr>
</table>
<p>What this settles: our all-layer scan independently ranked <b>L19 — one of MIT's two layers — second of 24</b> without using their prior, so the edit still targeted the layers named in their write-up; the negative is not a wrong-address miss. At cap ${FAIRC} the non-terminating texts are verbose rambling, not MIT's tight 32k attractor (corpus check: 0 cap-hits repeat ≥24 words), and both fixes — sampling-side and weight-side — move termination the wrong way. One backend, one seed, one penalty policy across all six rows: the comparison is apples-to-apples.</p>
<p class="note">Our numbers are now on the record, which releases the issue-rule lock on MIT's published HF model — a future lab pass may score their edit as a comparison row.</p>
<details class="fn"><summary>VERDICT (first pass, cap 1024) — SUPERSEDED: at that horizon 91–100% of base answers were cut off before finishing, so it measured truncation, not the fix. Kept for the record.</summary>
<p>The Astra recipe <b>did not reproduce</b> with our budget and our localization. Removing our loop-write direction from layers 15/19 — even from <i>all</i> columns (0.98% of weights) — left 12/12 practice problems non-terminating; the ablated model stayed coherent but rambled <i>longer</i>. Within a 1024-token horizon, 9,220 "looping" positions look like verbose self-questioning, not the tight attractor MIT traced over 32k-token horizons.</p>
<p>The control row caught us out. An early run looked like the model-card fix (presence penalty 2.0) suddenly terminating 12/12 — too good. It was a <b>harness artifact</b>: the override flag was appended <i>after</i> the standard 1.5, so the command carried <code>--presence-penalty 1.5 --presence-penalty 2.0</code>. With the override applied cleanly (single flag), termination collapsed to 0/12.</p>
</details>
<p class="note">Fair deviations: cap ${FAIRC}, not MIT's 32,768 (this box is CPU-only, ~150 tok/s); fixed 100 MATH-500 + 100 GSM8K-test (seed 20261103, identical rows before/after); grader = boxed-extraction + numeric match; d = per-layer loop-tail-vs-finished contrast over all 24 layers (repeat-onset positions approximated by the last 1024 tokens of capped generations). Backend: the six scored rows ran on one <code>llama-server</code> with continuous batching (24 slots, ~4× the aggregate throughput of the 12-separate-process harness, which is RAM-bandwidth-bound) — same seed and sampling args on every row; a partially-scored CPU-harness row was archived and never mixed into these tables.</p>`;
})()}`
 : `
<div class="banner">⚠ The verdict below was measured at cap 1024 — a horizon where 91–100% of base answers hit the cap. Per Jon's steer on #1493 it is <b>not a measurement of the fix</b>: answers there were cut off, not looping. The fair-horizon rescore (#1506, cap ${FAIRC}, fixed 100+100, base/edit/penalty rows) is ${fairTbl ? "partially complete" : "running"} — final numbers post to #1506, and the page refreshes on the deploy after they land.</div>
<details class="fn"><summary>VERDICT (first pass, cap 1024 — SUPERSEDED by the fair-horizon rescore)</summary>
<p>The Astra recipe <b>did not reproduce</b> with our budget and our localization. Removing our loop-write direction from layers 15/19 — even from <i>all</i> columns (0.98% of weights) — left 12/12 practice problems non-terminating; the ablated model stayed coherent but rambled <i>longer</i>. Within a 1024-token horizon, 9,220 "looping" positions look like verbose self-questioning, not the tight attractor MIT traced over 32k-token horizons.</p>
<p>The control row caught us out. An early run looked like the model-card fix (presence penalty 2.0) suddenly terminating 12/12 — too good. It was a <b>harness artifact</b>: the override flag was appended <i>after</i> the standard 1.5, so the command carried <code>--presence-penalty 1.5 --presence-penalty 2.0</code>. With the override applied cleanly (single flag), termination collapsed to 0/12.</p>
</details>`;

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

// #1515-1: depth-heat — ‖removed d‖ per FA layer (edit_reports/v2_A.json), on a
// 24-slot board so the linear-attention interleave (every 4th layer) is visible.
const depthHtml = (() => {
  const A = v2reports.A;
  if (!A) return "";
  const fa = Object.keys(A.layers).map(Number).sort((a, b) => a - b);
  const vals = fa.map(L => A.layers[L].norm_removed ?? 0);
  const mx = Math.max(...vals, 0.001);
  const slots = Array.from({ length: 24 }, (_, L) => {
    const v = vals[fa.indexOf(L)];
    if (v === undefined) return `<i data-info="layer ${L}: linear-attention (no FA MLP write in d)" class="lin" title="layer ${L}: linear-attention (no FA MLP write in d)"></i>`;
    return `<i data-info="layer ${L}: ‖removed d‖ ${v.toFixed(4)}" style="height:${4 + 44 * v / mx}px" title="layer ${L}: ‖removed d‖ ${v.toFixed(4)}"></i>`;
  }).join("");
  return `<div class="hrow"><span>depth structure — ‖removed d‖ at the six FA layers ${fa.join("/")} (bars), grey slots = linear-attention layers; raw onset-contrast ‖d‖ grows monotonically with depth, L3 0.089 → L23 0.932 (README) — the loop write is concentrated deep, MIT's 15/19 catches only part</span><div class="cells" data-readout="heat2readout">${slots}</div></div>`;
})();

// #1515-2: onset story — n-gram reuse vs token position for the worst looping
// text (same SUST=16 mirror as step8/ws2check), with the detected onset marked.
const onsetHtml = (() => {
  const t = v2loops?.loop?.[0];
  if (!t?.text) return "";
  const words = t.text.split(/\s+/);
  const SUST = 16;
  const reuse = (upto) => { // longest exact span ≥SUST ending before `upto` that reappears at/after it
    let best = 0;
    for (let p = 4; p <= 128; p++)
      for (let j = Math.max(0, upto - 2 * p); j + p <= upto; j++) {
        let k = 0;
        while (k < p && words[j + k] === words[upto + k]) k++;
        if (k > best) best = k;
        if (best >= p) break;
      }
    return best >= SUST ? best : 0;
  };
  const N = 60, last = words.length - SUST - 1;
  const pts = Array.from({ length: N }, (_, i) => reuse(Math.floor((i + 1) * last / N)));
  const mx = Math.max(...pts, 1);
  const bars = pts.map(v => `<i data-info="reuse ${v} words" style="height:${2 + 44 * v / mx}px" title="reuse ${v} words"></i>`).join("");
  const on = t.onset_tok != null ? `<span class="onmark" style="left:${100 * Math.min(1, t.onset_tok / (t.ntok || 4096))}%" title="detected onset token ${t.onset_tok}"></span>` : "";
  return `<div class="hrow"><span>why “no strict onset” — longest exact n-gram reuse vs token position for one capped 4k loop (${(t.problem || "").slice(0, 48)}…): reuse stays ragged, the flag (≥16-word run, SUST=16) appears only late at token ${t.onset_tok ?? "?"} of ${t.ntok} — verbose rambling reaches repetition late, unlike MIT's tight attractor at 32k</span><div class="cells onset" data-readout="heat2readout">${bars}${on}</div></div>`;
})();

// #1515-3: A/B/C edit-map thumbnails — where each variant cuts.
const editmapsHtml = (() => {
  const cell = (lit, on, title) => `<b class="${on ? "ed" : ""}" title="${title}">${lit}</b>`;
  const mk = (v, name) => {
    if (!v) return "";
    const ops = [
      cell("emb", !!v.embed, v.embed ? `embed_tokens rank-1 strip — ${v.embed.rows} rows, ‖d‖ ${v.embed.norm_removed}` : "embed untouched"),
      cell("o_proj", false, ""),
      ...["3", "7", "11", "15", "19", "23"].map(L => {
        const Ld = v.layers?.[L] || {};
        return cell(`L${L}`, !!Ld.norm_removed || !!Ld.o_proj_norm_removed,
          `layer ${L}: ${Ld.norm_removed ? `down_proj top-${Ld.K} cols, ‖d‖ ${Ld.norm_removed}` : ""}${Ld.o_proj_norm_removed ? `${Ld.norm_removed ? " + " : ""}o_proj rank-1, ‖d‖ ${Ld.o_proj_norm_removed}` : ""}`);
      }),
      cell("lm_h", !!v.embed, "lm_head (tied to embed)"),
    ];
    return `<div class="emap"><h4>${name} — ${v.pct_changed}% of weights</h4><div class="ecells">${ops.join("")}</div></div>`;
  };
  // fix o_proj cells per layer for B/C after the fact
  let html = mk(v2reports.A, "A · upstream (write path)")
    + mk(v2reports.B, "B · downstream (read path)")
    + mk(v2reports.C, "C · both ends");
  return html ? `<div class="emaps">${html}</div>` : "";
})();

// #1515-4: Q4_0 scorer speed strip (measured in-lab, README L97-99, recipe on #1506).
const speedHtml = `
<div class="kpi" id="speedkpi">
  <div><b>1.8×</b>generation speed</div>
  <div><b>2.4×</b>prefill speed</div>
  <div><b>844 MB</b>Q4_0 scorer — embed + the six FA ffn_down kept fp16, rest Q4</div>
</div>
<p class="note">the on-the-way win: a Q4_0 build of the model that scores these problems runs ~2× faster than f16 on this CPU box (measured under load, lab README; quant recipe posted to <a href="https://jalfern.com/retrogames/issues/1506" rel="noopener">#1506</a>).</p>`;
const v2Html = `
<h2>SURGERY II — repeat-onset d, all six attention layers, both ends (#1505)</h2>
<p>Round I localized <b>d</b> as a whole-sequence mean at a 1024-token horizon — verbose reasoning, not the attractor. Round II changes all three inputs at once: capture at <b>cap 4096</b> (penalty-free, seed 23, train-only), take d as <b>mean(write during the loop) − mean(write before it)</b> from the detected repeat-onset, and operate on all six full-attention layers <code>{3,7,11,15,19,23}</code> (this model interleaves linear attention every 4th layer). Variant <b>B</b> cuts the <i>read</i> side instead: <code>embed_tokens</code> rows (unembed is tied) and <code>o_proj</code> rank-1, so the residual stream can no longer be expressed in logits or written by attention along d. <em>${v2cap}</em></p>
${v2pair}
${depthHtml || onsetHtml ? `<div id="heat2">${depthHtml}${onsetHtml}${readout("heat2readout")}</div>` : ""}
${editmapsHtml}
<table><tr><th>variant</th><th>terminated</th><th>looped</th><th>correct</th><th>mean tokens</th></tr>${v2rows || "<tr><td colspan=5>v2 runs pending</td></tr>"}</table>
${speedHtml}
${v2reports.B ? `<p class="note">weights edited — A: ${(v2reports.A?.pct_changed ?? 0).toFixed(3)}% · B: ${v2reports.B.pct_changed.toFixed(3)}% (embed ‖d‖ energy removed ${v2reports.B.embed?.norm_removed ?? "?"}) · C: ${(v2reports.C?.pct_changed ?? 0).toFixed(3)}%</p>` : ""}
<p class="note">${v2signal
  ? "VERDICT II: a variant terminates more held-out problems AND scores higher than base at the fair horizon — the second cut lands. Details above."
  : `VERDICT II: no variant beats base-4096 on termination at this horizon — the second negative, and sharper than round I's: with exact token counting base itself terminates only 1/12 (the earlier 6/12 was a words×2 estimate artifact, see README). ${v2acc.length ? `But ${v2acc.map(k => `variant ${k} (${v2[k].correct}/${v2.base.correct})`).join(", ")} scores above base without terminating — removing d from the READ path makes the model find right answers while it rambles. Direction removal helps reasoning, not termination; horizon (32k vs 4k) and localization remain the gap to MIT.` : "No variant even improves accuracy; horizon (32k vs 4k) and localization remain the gap to MIT."}`}</p>`;

// ---- ROUND 2 (#1533): MIT's horizon on our silicon — oMLX GPU, 32,768-token think35 ----
// MIT's claimed numbers (Sparks of Weight-Space Programming): base ~8% MATH /
// 14% GSM8K with ~93% cut at 32K; p50c 48% MATH / 67% GSM8K acc, ~67% finished
// (~33% cut). The table pairs every row with these side by side — the
// "five second" tell: read accuracy, then finished, per row.
const R2EXP = {
  base: { math: "MIT base: 8% acc · ~93% cut", gsm: "MIT base: 14% acc · ~93% cut" },
  p50c: { math: "MIT p50c: 48% acc · ~67% finished", gsm: "MIT p50c: 67% acc · ~67% finished" },
  p50cw: { math: "MIT p50c same-100: 45.8% acc · ~67% finished", gsm: "MIT p50c same-100: 67% acc · ~67% finished" },
  own: { math: "our own edit, scored vs our p50cw row (#1562)", gsm: "our own edit, scored vs our p50cw row (#1562)" },
  basew: { math: "base at window ctx 32768 — our box", gsm: "base at window ctx 32768 — our box" },
  openbook: { math: "unedited base + MIT's written diagnosis (#1580)", gsm: "unedited base + MIT's written diagnosis (#1580)" },
};
const R2ROWS = [
  ["base", "base @ 32K think35"],
  ["basew", "base @ window ctx 32768 (#1562 settings)"],
  ["p50c", "MIT p50c edit — our reproduction"],
  ["p50cw", "#1547 option C — penalty window ctx 32768"],
  ["own", "our own edit (Astra rules, #1562)"],
  ["openbook", "OPEN-BOOK — base + MIT's written diagnosis in context (#1580)"],
];
// #1562: Jon re-opened step 2 — judged against OUR p50cw row, not MIT's published
// numbers. jonGo flips the own row from "forbidden (gate STOP)" to in-flight/done.
const jonGo = read("results/r2/jon_go_1562.json", null);
const r2Tbl = R2ROWS.map(([tag, label]) => {
  const s = r2s && r2s[tag];
  if (!s) {
    if (tag === "basew")
      return `<tr id="r2-${tag}"><td>${label}</td><td colspan=4 class="note">#1567 control row — running detached at PAR-32, lands as it scores</td><td class="note">${R2EXP[tag].math}</td></tr>`;
    if (tag === "openbook")
      return `<tr id="r2-${tag}"><td>${label}</td><td colspan=4 class="note">#1580 open-book control — <b>unedited weights</b>, diagnosis text in context; rows land as they score <span class="prog" aria-hidden="true"><i></i></span></td><td class="note">${R2EXP[tag].math}</td></tr>`;
    if (tag === "own" && r2gate && !r2gate.pass && !jonGo)
      return `<tr id="r2-${tag}"><td>${label}</td><td colspan=4 class="note">forbidden — step-1 gate STOPped the run before it; never ran</td><td class="note">${R2EXP[tag].math}</td></tr>`;
    return `<tr id="r2-${tag}"><td>${label}</td><td colspan=4 class="note">pending — rows land as each gate clears <span class="prog" aria-hidden="true"><i></i></span></td><td class="note">${R2EXP[tag].math}</td></tr>`;
  }
  return ["math", "gsm"].filter(set => s[set]).map((set, si, arr) => {
    const t = s[set];
    const done = t.n >= (r2s._hold || 100);
    const cells = `<td>${t.n}</td><td>${done ? t.acc.toFixed(1) + "%" : `${t.n}/… scoring`}</td><td>${done ? t.finished.toFixed(1) + "%" : "—"}</td><td>${done ? t.mean_ntok : "—"}</td>`;
    const first = si === 0 ? `<td rowspan=${arr.length}>${label}</td>` : "";
    const exp = `<td class="note">${R2EXP[tag][set]}</td>`;
    return `<tr id="${si ? "r2-" + tag + "-gsm" : "r2-" + tag}">${first}<td>${set}</td>${cells}${exp}</tr>`;
  }).join("\n");
}).join("\n");
const r2Kpi = r2bench ? `<div class="kpi" id="r2kpi">
  <div><b>${r2bench.agg_tps}</b>tok/s aggregate (4 streams, GPU)</div>
  <div><b>${r2bench.cut_off}/${r2bench.n}</b>cut at 32K — base, train set</div>
  <div><b>${r2bench.est_hours_100p50 ?? "?"} h</b>per scored row</div>
</div>` : "";
// The honest-negative copy (#1540): rendered only when the step-1 rows are
// final AND the gate STOPped — an in-flight round keeps the pending rows.
const r2Copy = (() => {
  if (!r2s || !r2s.base || !r2s.p50c || !r2gate || r2gate.pass) return "";
  const b = r2s.base, p = r2s.p50c;
  const cut = (t) => (100 - t.finished).toFixed(0);
  const prec = (t) => (100 * t.acc / t.finished).toFixed(0);
  return `
<p class="note"><b>WHAT REPRODUCES.</b> The base rows land in MIT's base neighborhood — MATH ${b.math.acc.toFixed(1)}% acc vs MIT 8% · GSM ${b.gsm.acc.toFixed(1)}% vs 14% — and the loop-cut signature matches: ${cut(b.math)}%/${cut(b.gsm)}% of base answers cut at 32K vs MIT's ~93%. On the p50c row, precision-per-finished-answer matches MIT's: ${p.math.acc}/${p.math.finished} ≈ ${prec(p.math)}% (MATH) and ${p.gsm.acc}/${p.gsm.finished} = ${prec(p.gsm)}% (GSM) vs MIT's ~48/67 ≈ 72%.</p>
<p class="note"><b>WHAT DOES NOT.</b> The loop-escape rate after the edit: MIT's edited model finishes ~67% of problems; ours finishes ${p.math.finished.toFixed(0)}% on MATH (${p.gsm.finished.toFixed(0)}% on GSM). Edited MATH accuracy lands ${Math.round(48 - p.math.acc)} points below MIT's 48% (${p.math.acc.toFixed(0)}% vs 48%) — the gap is per-problem escape probability, not per-answer quality.</p>
<p class="note"><b>WHY IT IS HONEST.</b> Weights hash-verified against MIT's pinned base (${r2p50 ? `${r2p50.tensors}, ${r2p50.entries}` : "sha256 both sides"}); grading was fixed twice after the fact (gold-answer extraction had silently zeroed accuracy — base MATH read 0.0%, true ${b.math.acc.toFixed(1)}%; a math_verify threading bug downgraded every live row to the numeric fallback); MTP/speculative decoding ruled out twice — tensor forensics (the scored MLX backend carries 0 mtp/nextn tensors; mtp_compatible: false)${r2probe ? ` and a clean vlm-engine A/B probe (plain-AR, MTP-off verified at runtime: ${r2probe.acc}% acc / ${r2probe.finished}% finished vs the frozen row's ${p.math.acc.toFixed(0)}%/${p.math.finished.toFixed(0)}% — two engines, same ceiling)` : ""}; knob-tuning to clear the frozen gate was forbidden by design.</p>
<p class="note"><b>THE FIVE-SECOND TELL.</b> Read each row left to right: accuracy, then finished. The gap between our p50c row and MIT's claimed row lives in the <b>finished</b> column (${p.math.finished.toFixed(0)}% vs ~67%), not in per-finished-answer precision (${prec(p.math)}% vs ~72%).</p>
${r2s.p50cw ? `
<p class="note"><b>#1547 — WHAT THE PENALTY WINDOW RULED OUT.</b> One backend artifact had been left standing: mlx-lm applies <code>presence_penalty</code> over only the last <code>presence_context_size</code> tokens (server default <b>20</b>), while vLLM — what MIT ran — penalizes every generated token. Widening the window to the whole generation and re-running the same 100 MATH rows moved finished ${p.math.finished.toFixed(0)}% → <b>${r2s.p50cw.math.finished.toFixed(0)}%</b> — real, but the ceiling held: ${r2s.p50cw.math.acc.toFixed(1)}% by our grader, ${r2mit && r2mit.regrade && r2mit.regrade["p50cw:math"] ? r2mit.regrade["p50cw:math"].mit_acc.toFixed(1) + "% by MIT's own checker" : "—"} on identical predictions, against MIT's 45.8% on these same rows. The window accounts for ~10 of the 26 missing finish points and none of the accuracy gap — what remains is per-problem escape probability on this silicon, not a sampling-knob artifact. Grading is MIT-verified now: their checker and ours disagree on ${r2mit && r2mit.regrade && r2mit.regrade["p50cw:math"] ? r2mit.regrade["p50cw:math"].diffs.length : 0}/100 rows, all parse-edge cases (intervals, fractions, bare letters), plus ${r2mit && r2mit.regrade && r2mit.regrade["p50cw:math"] ? r2mit.regrade["p50cw:math"].pred_none_finished_sidecar_ok : 0} rows our scorer had dropped to <code>pred=None</code> that their extraction recovers.</p>` : ""}`;
})();
const r2Verdict = (() => {
  if (jonGo) {
    const o = r2s && r2s.own, w = r2s && r2s.p50cw
    const avg = (s) => {
      const ks = ["math", "gsm"].filter(k => s && s[k] && s[k].n >= (r2s._hold || 100))
      return ks.length ? ks.reduce((a, k) => a + s[k].acc * s[k].n, 0) / ks.reduce((a, k) => a + s[k].n, 0) : null
    }
    const fmt = (s) => ["math", "gsm"].filter(k => s && s[k])
      .map(k => `${s[k].n >= (r2s._hold || 100) ? s[k].acc.toFixed(1) + "%" : s[k].n + "/… scoring"} ${k}`).join(" · ")
    const base = r2s.basew || null
    const passes = batches.filter(b => typeof b.purpose === "string" && b.purpose.startsWith("#1562 own-direction search")).length
    if (o && o.math && o.gsm && o.math.n >= (r2s._hold || 100) && o.gsm.n >= (r2s._hold || 100)) {
      const rg = r2mit && r2mit.regrade || {}
      const mit = (k) => rg[k] ? rg[k].mit_acc.toFixed(1) + "%" : "—"
      const fin = (s) => ["math", "gsm"].filter(k => s && s[k]).map(k => s[k].finished.toFixed(0) + "%").join("/")
      const bwClauseBody = (() => {
        if (!(base && base.math && base.gsm && base.math.n >= (r2s._hold || 100))) return null
        const dBase = (base.math.finished + base.gsm.finished) / 2
          - (r2s.base.math.finished + r2s.base.gsm.finished) / 2
        const p = r2s.p50c
        const dEdit = p && w && p.math && p.gsm
          ? (w.math.finished + w.gsm.finished) / 2 - (p.math.finished + p.gsm.finished) / 2
          : null
        const inter = dEdit === null ? ""
          : Math.abs(dBase) >= Math.abs(dEdit)
            ? " — the window lifts base at least as much as it lifted the edit: much of the p50cw finish-rate is the measurement, not the edit"
            : dBase <= 0
              ? " — the window does not lift base at all; the finish-lift is edit-specific, MIT's edit works under whole-generation penalty pressure in a way the raw model does not"
              : ` — the window lifts base +${dBase.toFixed(0)} pts, the edit +${dEdit.toFixed(0)} pts: the lift is mostly edit-specific`
        return `The base-with-window control now exists: base at ctx 32768 gives ${fmt(base)} (finished ${fin(base)}, window Δfinished ${dBase >= 0 ? "+" : ""}${dBase.toFixed(0)} pts vs the ctx-20 row)${inter}.`
      })()
      const wacc = w ? ["math", "gsm"].filter(k => w[k]) : []
      const wmean = wacc.length ? wacc.reduce((a, k) => a + w[k].acc, 0) / wacc.length : null
      return `<p class="note"><b>#1562 — THE OWN EDIT, JUDGED HONESTLY.</b> Qwen's own direction — found in ${passes} of the disclosed 20 forward passes, never reading MIT's edit tensors — scores <b>${fmt(o)}</b> (MIT-checker: ${mit("own:math")} math · ${mit("own:gsm")} gsm) against base ${fmt(r2s.base)} and <b>our p50cw reproduction of MIT's edit at identical settings: ${fmt(w)}</b> (MIT-checker: ${mit("p50cw:math")} math · ${mit("p50cw:gsm")} gsm). Same silicon, same 100+100 held-out problems, same window — the comparison the issue asked for. Verdict: <b>the own direction moves MATH (base ${r2s.base.math.acc.toFixed(0)}% → ${o.math.acc.toFixed(0)}%, doubled) but does not break the loop</b> — finished stays at ${fin(o)} vs the edit's ${fin(w) || "—"}, GSM8K sits at base level (${o.gsm.acc.toFixed(0)}% vs ${w && w.gsm ? w.gsm.acc.toFixed(0) + "%" : "—"}). ${wmean !== null ? Math.round(wmean - (o.math.acc + o.gsm.acc) / 2) : "?"} points of mean accuracy short: ${passes} passes of honest search reproduced <i>some</i> escape signal — direction [L15, L7] down_proj, held-out-validated — but MIT's edit does ~${wmean ? Math.round(wmean / Math.max((o.math.acc + o.gsm.acc) / 2, 0.1)) : "?"}× the job. The escape gap round 1 diagnosed is not closed by our search; it lives in the finished column, exactly as before. ${bwClauseBody ?? "Optional base-with-window control: running now (#1567 candidate 1)."}</p>`
    }
    return `<p class="note"><b>#1562 — STEP 2 IN FLIGHT.</b> Jon re-opened step 2 (#1562): the edit is judged against <b>our own p50cw row</b> — same box, same settings — not MIT's published numbers, so the backend gap cancels. Search budget: at most <b>20 forward passes</b> (a pass = one generation batch of ≤64 practice problems or one teacher-forced read; this run spends 5, each logged in the batch log above with what it tested and ruled out). Rows land as they score.</p>`
  }
  if (r2gate && !r2gate.pass && !jonGo) return `<p class="note">STEP-1 GATE: our reproduction did NOT land in MIT's neighborhood — ${r2gate.detail} Per Jon's rule we stopped before step 2; diagnosis posted to <a href="https://jalfern.com/retrogames/issues/1533" rel="noopener">#1533</a>.</p>`;
  if (r2gate && r2gate.pass && r2s && r2s.own) {
    const b = r2s.base, p = r2s.p50c, o = r2s.own;
    const avg = (s) => (s.math.acc * s.math.n + s.gsm.acc * s.gsm.n) / (s.math.n + s.gsm.n);
    return `<p class="note">VERDICT: reproduction ${r2gate.detail}. Our own edit scores ${avg(o).toFixed(1)}% mean accuracy vs base ${avg(b).toFixed(1)}% and MIT p50c ${avg(p).toFixed(1)}% — ${avg(o) > avg(b) ? "own direction helps" : "our own direction does not beat base"}${avg(o) >= avg(p) ? ", at or above MIT's edit" : ", short of MIT's edit"}.</p>`;
  }
  return `<p class="note">${r2gate ? "Step-1 gate green — own edit in flight; every pass lands in the batch log above." : "Round 2 runs as the step-1 gate clears; nothing here is claimed before it is measured."}</p>`;
})();
const r2Html = `
<h2>ROUND 2 — MIT'S HORIZON ON OUR SILICON (#1533)</h2>
<p>Rounds I–II ran on CPU at capped horizons because this box's GPU path was dead (#737). It is alive: the whole round now runs on <b>oMLX (Metal GPU)</b> at MIT's full <b>32,768-token</b> think35 protocol — thinking on, temp 0.6 / top_p 0.95 / top_k 20 / <b>presence_penalty 1.5 confirmed applied</b> (seed-fixed probe: pp0 vs pp1.5 outputs differ — the #1506 duplicated-flag class of bug is ruled out on this backend), graded on the last <code>\\boxed{}</code> with <code>math-verify</code>. Fixed held-out: ${r2s && r2s._hold ? r2s._hold : 100} MATH-500 + ${r2s && r2s._hold ? r2s._hold : 100} GSM8K-test, selection seed 1533, identical rows for every line. ${r2p50 ? `MIT's p50c edit rebuilt from their run folder with <code>apply_edit.py</code> — both tensors sha256-verified against the pinned base (${r2p50.tensors}, ${r2p50.entries}).` : ""}</p>
${r2Kpi}
<table>
<tr><th>row</th><th>set</th><th>n</th><th>accuracy</th><th>finished</th><th>mean tok</th><th>MIT reference</th></tr>
${r2Tbl}
</table>
${r2Copy}
${r2own ? `<p class="note">our own edit: ${r2own.summary} — directions from our own measurements only; MIT's edit tensors were never loaded as a source (issue rule).</p>` : ""}
${r2Verdict}`;

// ---- ROUND 3 (#1567): scaling the own edit — basew control, α sweep, layer count ----
const r3Hold = (r2s && r2s._hold) || 100
const r3math = (tag) => { const s = r2s && r2s[tag]; return s && s.math && s.math.n >= r3Hold ? s.math : null }
const r3mit = (k) => r2mit && r2mit.regrade && r2mit.regrade[k] ? r2mit.regrade[k].mit_acc.toFixed(1) + "%" : "—"
const r3AlphaRows = [["own", 1], ["own2", 2], ["own4", 4], ["own8", 8]].map(([tag, a]) => {
  const t = r3math(tag)                       // held-out row (α=1 #1562; winner only for the sweep)
  const prac = tag === "own" ? null : r3prac[tag]
  const isWin = r3Pick && r3Pick.decision === tag
  const pracCell = tag === "own"
    ? `<span class="note">not re-run — basew ${r2s && r2s.basew && r2s.basew.math ? r2s.basew.math.acc.toFixed(1) + "%" : "6.0%"} MATH at the same window already answers α=1 (Jon note 00:25Z)</span>`
    : (prac ? `${prac.n} · <b>${prac.acc.toFixed(1)}%</b> acc · ${prac.finished.toFixed(1)}% fin`
      : `<span class="note">pending — practice pass P${9 + Math.log2(a / 2)}</span>`)
  const heldCell = t
    ? `${t.n} · ${t.acc.toFixed(1)}% <span class="note">(MIT-checker ${r3mit(`${tag}:math`)})</span> · ${t.finished.toFixed(1)}% fin`
    : (isWin ? `<span class="note">scoring now — the ONE held-out row this round</span>`
      : `<span class="note">never — swept variants don't touch held-out</span>`)
  return `<tr id="r3-a${a}"><td>α = ${a}${isWin ? ' <b class="big" style="font-size:12px">★ winner</b>' : ""}</td><td>${pracCell}</td><td>${heldCell}</td></tr>`
}).join("\n")
const r3PickNote = (() => {
  if (!r3Pick) return `<p class="note"><b>Candidate 2 — α pick: in flight.</b> Base + α∈{2,4,8} score on a fresh practice batch (passes P8–P11); the frozen rule (max practice accuracy, ties → finished-rate, then smaller α) picks one winner, and only the winner earns the held-out 100+100 row.</p>`
  const w = r3Pick.winner
  const lift = r3Pick.lift_over_base
  return `<p class="note"><b>CANDIDATE 2 — THE PICK: α = ${w.alpha}.</b> On the fresh 64-math practice batch (cap 8192, think35 pp1.5 ctx 32768): ${Object.entries(r3Pick.rows).map(([t, s]) => `${t.replace("own", "α=")} ${s.acc.toFixed(1)}% acc / ${s.finished.toFixed(1)}% fin`).join(" · ")}${r3Pick.base_reference ? ` · base ${r3Pick.base_reference.acc.toFixed(1)}% / ${r3Pick.base_reference.finished.toFixed(1)}%` : ""}. Frozen rule (accuracy first) picks <b>α = ${w.alpha}</b>${lift !== null ? `, ${lift >= 0 ? "+" : ""}${lift.toFixed(1)} pts over base on practice` : ""}; its held-out 100+100 row is ${r2s && r2s[r3Pick.decision] && r2s[r3Pick.decision].math && r2s[r3Pick.decision].math.n >= r3Hold ? "landed below" : "scoring now"}.</p>`
})()
// Winner's held-out verdict — appears only when the ONE winner row has landed
// (both sets). Numbers derive from artifacts; nothing here is hardcoded, so the
// page can never claim a lift the scores don't show.
const r3WinNote = (() => {
  if (!r3Pick || !r2s) return ""
  const tag = r3Pick.decision
  const e = r2s[tag]
  if (!e || !e.math || e.math.n < r3Hold || !e.gsm || e.gsm.n < r3Hold) return ""
  const alpha = r3Pick.winner.alpha
  const mean = (x) => (x.math.acc + x.gsm.acc) / 2
  const o = r2s.own && r2s.own.math && r2s.own.gsm ? r2s.own : null
  const w = r2s.p50cw && r2s.p50cw.math && r2s.p50cw.gsm ? r2s.p50cw : null
  const lift = o ? mean(e) - mean(o) : null
  const short = w ? mean(w) - mean(e) : null
  const survive = lift >= 2
    ? "the practice gain survived onto the test set — scaling the direction helps"
    : lift > -2
      ? "FLAT on the test set — the practice ordering did not generalize; on this model the direction saturates at α = 1"
      : "the practice gain REVERSED on held-out — the pick over-fit the practice batch"
  // the held-out row is the pass beyond the newest numbered practice pass (P11)
  const passes = Math.max(0, ...batches.filter(b => typeof b.pass_no === "number").map(b => b.pass_no)) + 1
  return `<p class="note" id="r3-verdict"><b>CANDIDATE 2 — VERDICT: THE WINNER HELD OUT, SCORED ONCE.</b> α = ${alpha} earned its single held-out pass at the full think35 pp1.5 ctx 32,768 protocol: <b>MATH ${e.math.acc.toFixed(1)}% acc / ${e.math.finished.toFixed(1)}% fin · GSM8K ${e.gsm.acc.toFixed(1)}% / ${e.gsm.finished.toFixed(1)}% fin</b> (MIT-checker ${r3mit(`${tag}:math`)} math · ${r3mit(`${tag}:gsm`)} gsm on identical predictions). Against α = 1 (#1562, same rows): ${o ? `MATH ${o.math.acc.toFixed(1)}→${e.math.acc.toFixed(1)}%, GSM8K ${o.gsm.acc.toFixed(1)}→${e.gsm.acc.toFixed(1)}%, ${lift >= 0 ? "+" : ""}${lift.toFixed(1)} pts mean — ${survive}` : "no α = 1 row"}${w ? `; still <b>${short.toFixed(1)} pts short of our p50cw reproduction of MIT's edit at the identical protocol (${w.math.acc.toFixed(1)}% math · ${w.gsm.acc.toFixed(1)}% gsm)</b> — MIT's lift remains edit-specific, not a magnitude reachable by scaling our own direction` : ""}. Finished ${e.math.finished.toFixed(1)}% math — ${w && e.math.finished < w.math.finished ? "the loop still holds: scaling moved accuracy only, never escape" : "escape improved as well"}. Ledger: ${passes} of the disclosed 20 Astra passes spent, each logged in the batch log above.</p>`
})()
const r3LayerRows = r3Layer
  ? Object.entries(r3Layer.combined_sep).map(([k, v]) =>
      `<tr><td>${k} — ${r3Layer.sets[k].join("/")}</td><td>${v.toFixed(2)}</td></tr>`).join("\n")
  : ""
const r3LayerNote = (() => {
  if (!r3Layer) return `<p class="note"><b>Candidate 3 — layer count: in flight.</b> P5 separated five of the six FA layers at |sep| ≥ 1 while the edit took only the top-2. A decision rule frozen before the read (top-4 must beat top-2 combined held-out separation by +10%) decides whether a 4-layer edit earns scoring passes.</p>`
  const s = r3Layer.combined_sep
  const ratio = s.top4 / s.top2
  return `<p class="note"><b>CANDIDATE 3 — MORE LAYERS? ${r3Layer.decision === "top4" ? "YES" : "NO"}.</b> Combined held-out separation on the P5 basis (pooled z-normalization; cross-layer covariance measured from the read, not assumed independent): top-2 ${s.top2.toFixed(2)} · top-3 ${s.top3.toFixed(2)} · top-4 ${s.top4.toFixed(2)} · all-6 ${s.all6.toFixed(2)}. Frozen rule: commit scoring passes to 4 layers only above 1.10× top-2 — measured ${ratio.toFixed(2)}×, ${r3Layer.decision === "top4" ? "MET — a 4-layer edit earns its scoring row next stage" : `NOT met — the layer budget stays ${r3Layer.sets.top2.join("/")}, and the curve says why (top-3 DROPS below top-2: layers 3/11 re-report L15/L7 rather than add)`}. Per-layer separations reproduce P5 ${r3Layer.reproduces_p5_sep ? "within gate tolerance — plumbing green" : "(gate FAILED — do not trust this ranking)"}.</p>`
})()
const r3BasewNote = (() => {
  const bw = r2s && r2s.basew
  if (bw && bw.math && bw.math.n >= r3Hold && !(bw.gsm && bw.gsm.n >= r3Hold))
    return `<p class="note"><b>Candidate 1 — basew control: in flight.</b> MATH landed: base at ctx 32768 gives ${bw.math.acc.toFixed(1)}% acc / ${bw.math.finished.toFixed(1)}% finished — the window lifts base MATH ${r2s.base.math.acc.toFixed(0)} → ${bw.math.acc.toFixed(0)}%: #1562's own-edit "doubling" is matched by the unedited control, so at fair settings the α=1 edit adds nothing on MATH accuracy. The GSM8K row scores now; the full Δfinished verdict lands with it.</p>`
  if (!bw || !bw.math || !bw.gsm || bw.math.n < r3Hold || bw.gsm.n < r3Hold)
    return `<p class="note"><b>Candidate 1 — basew control: in flight.</b> base re-scored at the whole-generation penalty window (ctx 32768), same fixed 100+100 rows — closing the question #1562 disclosed as not-run: does widening the window lift the BASE too? Row lands in the Round 2 table; the verdict clause in the #1562 note updates with it.</p>`
  const dBase = (bw.math.finished + bw.gsm.finished) / 2
    - (r2s.base.math.finished + r2s.base.gsm.finished) / 2
  const p = r2s.p50c, w = r2s.p50cw
  const dEdit = p && w ? (w.math.finished + w.gsm.finished) / 2 - (p.math.finished + p.gsm.finished) / 2 : null
  return `<p class="note"><b>CANDIDATE 1 — THE BASEW CONTROL.</b> Base at ctx 32768: MATH ${bw.math.acc.toFixed(1)}% (${bw.math.finished.toFixed(1)}% finished) · GSM ${bw.gsm.acc.toFixed(1)}% (${bw.gsm.finished.toFixed(1)}% finished) — window Δfinished ${dBase >= 0 ? "+" : ""}${dBase.toFixed(0)} pts vs the ctx-20 base row${dEdit === null ? "" : `, against +${dEdit.toFixed(0)} pts on the p50c edit (#1547)`}. ${Math.abs(dBase) >= Math.abs(dEdit === null ? 99 : dEdit) ? "The window lifts base at least as much as it lifted the edit — much of the p50cw finish-rate is measurement, not edit." : dBase <= 0 ? "The window does not lift base at all: the finish-lift is edit-specific — MIT's edit converts whole-generation penalty pressure into escapes in a way the raw model cannot." : `The window lifts base a little (+${dBase.toFixed(0)} pts), the edit much more (+${dEdit.toFixed(0)} pts): the lift is edit-specific.`} This is now the fair baseline for every edited row on this box.</p>`
})()
const r3Html = `
<h2>ROUND 3 — SCALING THE OWN EDIT (#1567)</h2>
<p>Round 2's self-found direction doubled base MATH (3→6%) at layers L15/L7 but left the finished column where it was. Step 3 takes three candidates in the issue's expected-payoff order — <b>(1)</b> the basew control: does the whole-generation penalty window lift the base too? <b>(2)</b> direction scaling: is the direction right but underscaled? α ∈ {2, 4, 8} on the identical [L15, L7] top-K 128 recipe — chosen on <b>practice</b>, per Jon's ruling mid-round ("scoring several α variants on held-out would be tuning on the test set"): one frozen rule picks a winner from a fresh practice batch, and that winner alone earns a held-out row. <b>(3)</b> layer count: P5 separated five of six FA layers, the edit used two. Astra rules unchanged — practice-only, no gradients, norm/embed/lm_head untouched; every pass in the ledger.</p>
${r3BasewNote}
<h3 style="color:#7dffb2;font-size:12px;letter-spacing:.12em;margin:20px 0 6px">DIRECTION SCALING — α SWEEP, CHOSEN ON PRACTICE (candidate 2)</h3>
<table>
<tr><th>edit</th><th>practice — fresh 64 math, cap 8192 (passes P8–P11)</th><th>held-out 100+100 — winner only</th></tr>
${r3AlphaRows}
</table>
${r3PickNote}
${r3WinNote}
<p class="note">α = 1 removed the d-component outright; whether scaling past full removal helps was v1's question. Jon's ruling corrected the protocol: picking among α variants on the held-out 100 MATH would be <b>tuning on the test set</b>, so the sweep scores a fresh practice batch (math_train indices 96–159 of the SEED-1562 shuffle — provably disjoint from #1562's fit/validation), and <b>one</b> winner is scored on held-out at the full think35 protocol. The practice batch's base control (P8) measures the lift on the same problems.</p>
${r3LayerRows ? `<h3 style="color:#7dffb2;font-size:12px;letter-spacing:.12em;margin:20px 0 6px">LAYER COUNT — COMBINED HELD-OUT SEPARATION (candidate 3)</h3>
<table>
<tr><th>layer set (ranked by P5 per-layer sep)</th><th>combined sep</th></tr>
${r3LayerRows}
</table>` : ""}
${r3LayerNote}`;

// ---- ROUND 4 (#1580): OPEN-BOOK control — MIT's WRITTEN diagnosis, UNEDITED weights ----
// Jon's condition from the #1567 handoff: feed MIT's final_answer.md verbatim as a
// system turn (WS_SYSTEM_FILE, r4_openbook.sh) to the untouched base model, same
// fixed held-out rows, same think35 pp1.5 ctx 32768 PAR-32 protocol. One question:
// does the CONTENT of their diagnosis do what their edit tensors do? Trust boundary:
// final_answer.md is the only MIT artifact this lab reads — ws3check §12 polices it.
const r4Ob = r2s && r2s.openbook
const r4Done = (x) => x && x.math && x.gsm && x.math.n >= r3Hold && x.gsm.n >= r3Hold
const r4Row = (id, tag, label, s) => {
  const mit = (k) => r2mit && r2mit.regrade && r2mit.regrade[k] ? r2mit.regrade[k].mit_acc.toFixed(1) + "%" : "—"
  if (!r4Done(s))
    return `<tr id="${id}"><td>${label}</td><td colspan=5 class="note">pending — lands as it scores <span class="prog" aria-hidden="true"><i></i></span></td></tr>`
  return `<tr id="${id}"><td>${label}</td><td>${s.math.acc.toFixed(1)}%</td><td>${s.math.finished.toFixed(1)}%</td><td>${s.gsm.acc.toFixed(1)}%</td><td>${s.gsm.finished.toFixed(1)}%</td><td class="note">${mit(`${tag}:math`)} / ${mit(`${tag}:gsm`)}</td></tr>`
}
const r4Html = `
<h2>ROUND 4 — OPEN-BOOK CONTROL (#1580)</h2>
<p>Jon's condition closing #1567: every weight-side route we ran stayed ~26 points short of our p50cw reproduction, so the remaining question is <b>where the knowledge lives</b>. Feed MIT's <i>written</i> diagnosis — their experiment write-up <code>exp8_math/runs/p50c/final_answer.md</code>, verbatim — into the <b>unedited base model</b> as a system turn, at the identical protocol (fixed 100+100 held-out, think35, pp1.5, ctx 32,768, seed 0, PAR-32). If the text alone recovers escape, their result is content-transferable; if the weights row still towers, the fix was never reducible to instructions. Trust boundary, enforced by ws3check: <code>final_answer.md</code> is the only MIT artifact this lab reads — their edit tensors, turn logs and weight manifests were never opened, and the injection is scoped to this one command (<code>WS_SYSTEM_FILE</code>, never exported).</p>
<table>
<tr><th>row — same 100+100, same protocol</th><th>MATH acc</th><th>MATH fin</th><th>GSM8K acc</th><th>GSM8K fin</th><th>MIT-checker math / gsm</th></tr>
${r4Row("r4-base", "base", "base (ctx-20 window, #1533)", r2s && r2s.base)}
${r4Row("r4-basew", "basew", "base @ window ctx 32768 (#1567 control)", r2s && r2s.basew)}
${r4Row("r4-openbook", "openbook", "<b>OPEN-BOOK — base + MIT's written diagnosis</b>", r4Ob)}
${r4Row("r4-p50cw", "p50cw", "p50cw — MIT's edit, our weights (reference)", r2s && r2s.p50cw)}
</table>
${(() => {
  if (!r4Done(r4Ob))
    return `<p class="note" id="ob-verdict"><b>#1580 — OPEN-BOOK CONTROL IN FLIGHT.</b> base + MIT's written diagnosis, weights untouched, same rows and protocol as the p50cw row — the cleanest content-vs-weights test on this box. Rows land as it scores; nothing is claimed before it is measured.</p>`
  const mean = (x) => (x.math.acc + x.gsm.acc) / 2
  const b = r2s.base, bw = r2s.basew, w = r2s.p50cw
  const liftC = r4Done(bw) ? mean(r4Ob) - mean(bw) : null
  const shortW = r4Done(w) ? mean(w) - mean(r4Ob) : null
  const finOb = (r4Ob.math.finished + r4Ob.gsm.finished) / 2
  const finW = r4Done(w) ? (w.math.finished + w.gsm.finished) / 2 : null
  const works = liftC !== null && liftC >= 2
  const concl = works && (shortW === null || shortW <= 2)
    ? `<b>the diagnosis CONTENT transfers.</b> Reading it moves the unedited model +${liftC.toFixed(1)} pts over the same-window base${shortW === null ? "" : `, within ${shortW.toFixed(1)} pts of the weight edit`} — part of MIT's result is knowledge the model can act on from instructions alone.`
    : works
      ? `the diagnosis <b>helps but does not close</b>: +${liftC.toFixed(1)} pts over the same-window base, still <b>${shortW.toFixed(1)} pts short</b> of the p50cw weights edit at the identical protocol (finished ${finOb.toFixed(0)}% vs ${finW === null ? "?" : finW.toFixed(0)}%). The words carry a piece of the fix; the tensors carry the rest — escape is not reducible to the write-up.`
      : `<b>reading the diagnosis does nothing measurable</b> (Δ${liftC.toFixed(1)} pts vs the same-window base control, finished ${finOb.toFixed(0)}% vs the edit's ${finW === null ? "?" : finW.toFixed(0)}%). MIT's escape is not knowledge their text conveys — it lives in the weights, not the words.`
  return `<p class="note" id="ob-verdict"><b>#1580 — OPEN-BOOK VERDICT.</b> base + MIT's written diagnosis, unedited weights, scored once at the full protocol: <b>MATH ${r4Ob.math.acc.toFixed(1)}% acc / ${r4Ob.math.finished.toFixed(1)}% fin · GSM8K ${r4Ob.gsm.acc.toFixed(1)}% / ${r4Ob.gsm.finished.toFixed(1)}% fin</b> (MIT-checker ${r3mit("openbook:math")} math · ${r3mit("openbook:gsm")} gsm) — vs base ${b && b.math && b.gsm ? `${b.math.acc.toFixed(1)}% / ${b.gsm.acc.toFixed(1)}%` : "—"} (ctx-20) and, at the <b>same</b> window, base ${bw && r4Done(bw) ? `${bw.math.acc.toFixed(1)}% / ${bw.gsm.acc.toFixed(1)}%` : "—"} and p50cw ${w && r4Done(w) ? `${w.math.acc.toFixed(1)}% / ${w.gsm.acc.toFixed(1)}%` : "—"}. Verdict: ${concl} No direction-search passes spent — this row is pure scoring; it lands once in the batch log above.</p>`
})()}`;

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
  #heat .cells { display:flex; align-items:flex-end; gap:3px; height:48px; }
  #heat i { flex:1; background:#7dffb2; min-width:6px; opacity:.85; }
  #heat .firstpass .cells i { background:#5a4a78; }
  #heat2 .hrow { margin:10px 0; }
  #heat2 .cells { display:flex; align-items:flex-end; gap:3px; height:48px; position:relative; border-bottom:1px solid rgba(199,125,255,.25); }
  #heat2 i { flex:1; background:#7dffb2; min-width:6px; opacity:.85; }
  #heat2 i.lin { background:#241a38; min-height:3px; opacity:.6; }
  #heat2 .onmark { position:absolute; top:-2px; bottom:0; width:2px; background:#ffb86b; }
  .emaps { display:flex; gap:14px; flex-wrap:wrap; margin:14px 0; }
  .emap h4 { margin:0 0 6px; font-size:11px; color:#c77dff; letter-spacing:.06em; }
  .ecells { display:flex; gap:2px; }
  .ecells b { font-weight:400; font-size:9px; padding:4px 3px; border:1px solid rgba(199,125,255,.25); color:#6f5a8d; }
  .ecells b.ed { background:rgba(125,255,178,.16); border-color:#7dffb2; color:#7dffb2; }
  .banner { border:1px solid #ffb86b; color:#ffb86b; padding:10px 14px; margin:18px 0; }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width:700px){ .pair{grid-template-columns:1fr;} .pane pre{max-height:200px;} }
  .prog{display:inline-block;width:72px;height:6px;background:#141414;border:1px solid #333;margin-left:8px;vertical-align:middle}
  .prog i{display:block;height:100%;width:30%;background:#0af;animation:sweep 1.6s linear infinite}
  @keyframes sweep{from{margin-left:-30%}to{margin-left:100%}}
  .pane.dim{opacity:.5}
  .skel{height:10px;background:#1d1d1d;margin:8px 0}
  .skel.w80{width:80%}
  .skel.w60{width:60%}
  @media (prefers-reduced-motion:reduce){ .prog i{animation:none;width:100%;background:#555} }
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
  .hread { font-size:11px; color:#ffb86b; margin-top:4px; min-height:14px; }
  details.fn { margin:8px 0; }
  details.fn summary { cursor:pointer; color:#8f7aad; font-size:11px; }
  details.dd summary { cursor:pointer; color:#7dffb2; font-size:11px; }
  .ddrow td { background:rgba(199,125,255,.04); }
  .ddp { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px; }
  @media (max-width:700px){ .ddp{grid-template-columns:1fr;} }
  .ddp1 { border:1px solid rgba(199,125,255,.18); padding:6px; min-width:0; }
  .ddp1 b { color:#c77dff; font-size:10px; letter-spacing:.04em; }
  .ddp1.ok b { color:#7dffb2; }
  .ddp1 span { display:block; font-size:10px; color:#9c86bd; margin:2px 0; }
  .ddp1 pre { white-space:pre-wrap; word-break:break-word; font-size:10px; max-height:110px; overflow:auto; color:#8f7aad; margin:0; }
  .ovr { opacity:.55; }
</style>
</head>
<body><div class="wrap">
<h1>WEIGHT SURGERY</h1>
<div class="sub">Qwen3.5-0.8B @ <code>2fc06364</code> — weight-space programming attempt (#1493), rescored at a fair horizon (#1506), and re-run at MIT's own 32,768-token horizon on the GPU (#1533): no gradients, practice on GSM8K/MATH <b>train</b> only, ≤50 forward-pass batches, one scored held-out run. By the forge, on a laptop-class box (rounds I–II on CPU — the GPU path was dead until round 2, #737).</div>
${r2Html}
${r3Html}
${r4Html}

${verdict}

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
${fairTbl || `<tr><td colspan=6>scoring in progress — runs launch as the edit lands; resumable runner, numbers post to #1506 <span class="prog" aria-hidden="true"><i></i></span></td></tr>`}
</table>
<details class="fn"><summary>† the terminated / hit-cap bounds — why they are bounds, not points</summary>
<p class="note">token counts in these rows come from llm.py's word×2 estimate (the exact llama token counter regex died on llama v0.3 — #1505 found it lab-wide): estimate ≥ real tokens, so <b>terminated is a true lower bound, hit-cap a true upper bound</b>. accuracy and loop-flag are exact (graded on full text). An exact-count rerun would regenerate all 600 generations (~10 h on this box) — deliberately not run: #1506 closes by direction with no new experiments, and no conclusion here flips at either bound.${honesty ? ` One more thing in the open: on the three MATH runs the same ${honesty.base_math.banner_rows} problems (ids ${honesty.base_math.banner_idx.join(", ")}) were captured as llama-cli startup banners instead of model answers — they grade wrong and count as finished; excluding them lifts each MATH accuracy by ≤0.7 pp and lowers MATH finished rates by ${honesty.base_math.banner_rows} pp, and changes no comparison. GSM8K rows are banner-free (${honesty.base_gsm.banner_rows + honesty.k256_gsm.banner_rows + honesty.sampfix_gsm.banner_rows} contaminated rows across the three).` : ""} Drill-downs skip contaminated rows; <code>fair_honesty.json</code> carries the per-row detail.</p></details>

<h2>ONE PROBLEM, BEFORE / AFTER</h2>
${pairHtml}

<h2>THE BATCH LOG (every pass, what it ruled out)</h2>
<table id="log">
<tr><th>time</th><th>phase</th><th>split</th><th>n</th><th>cap</th><th>purpose</th></tr>
${batchRows}
</table>

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
<a href="https://jalfern.com/retrogames/issues/1533" rel="noopener">round 2 (32K GPU) #1533</a> ·
<a href="https://rikiyat.github.io/blog/weight-space-programming/" rel="noopener">Sparks of Weight-Space Programming</a> (MIT CSAIL) ·
<a href="https://github.com/RikiyaT/lm_understand-logs" rel="noopener">experiment logs</a> ·
lab scripts: <code>demos/weight-surgery-lab/</code> in the repo.</p>
<script>
(function(){ /* #1520-iv: heat-bar tap readout — click a bar, its layer lands in the readout line */
  document.querySelectorAll('#heat .cells,#heat2 .cells').forEach(function(cs){
    cs.addEventListener('click',function(e){
      var b=e.target;
      if(b.tagName!=='I'||!b.dataset.info)return;
      var rd=document.getElementById(cs.getAttribute('data-readout')||'');
      if(rd)rd.textContent=b.dataset.info;
    });
  });
})();
</script>
</div></body></html>`;

const out = process.argv[2] || `${LAB}/weightsurgery.html`;
fs.writeFileSync(out, html);
console.log("wrote", out, `${(html.length / 1024) | 0}KB`);
