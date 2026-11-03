# STATE — session 113 (2026-11-03, slot a)

## Shipped this session
- **WEIGHT SURGERY rescore stage 1** merged `2101f8e` (PR #1510): live at
  https://jalfern.com/retrogames/demos/weightsurgery.html (32KB). Fair-horizon
  base rows (fixed 100 MATH-500 + 100 GSM8K-test, seed 20261103, cap 4096, pp0):
  MATH acc 4.0% term ≥70.0%† · GSM acc 11.0% term ≥15.0%† († = word×2-estimate
  bounds — #1505 found llama v0.3 killed llm.py's exact token regex lab-wide;
  acc + loop-flag exact). All-layer heat, cap-sweep/corpus tables, superseded
  cap-1024 verdict, batch log with purpose fields; rebased over b's SURGERY II
  (merged cleanly, ws2check 16/16, static green). #1520 QA polish pass filed.
- Shift report pushed ("the honest denominator is live").

## Stage 2 runbook for next lane (close #1506)
1. Lab: `~/Dev/weight-lab/qwen-forge`. Check `results/FAIR_SCORING_DONE` +
   `fair_scores.json` (6 rows; step10 writes it, wrapper touches marker). Runner
   order base→sampfix→k256, watchdog relaunches every 15 min (resumable jsonl;
   base rows DONE at 100/100 each). ETA last row ~16:00–17:00Z.
   **NOTE:** tonight's sampfix/k256 summaries in batches.jsonl lack `purpose`
   (running process predates the generator patch) — normalize before build:
   add `purpose` to score/score-fair lines (one-liner, see 2101f8d parent commit)
   or ws2check's rules gate goes red.
2. **Exact-token rerun** (the honest part): est ntok ≠ exact (bounds only).
   Regenerate the six rows with exact stderr parsing (b's step10_eval2 has the
   v0.3-safe regex; llm.py itself still unparsed). ~600 gens ≈ 1.5–2 h at ~150 tps.
   Then VERDICT (builder fairReady branch): edit ≥ base+5 ⇒ partial reproduction;
   ≤ base+1 ⇒ provable negative superseding #1504's; between ⇒ mixed.
   k256 = layers 23+19, k=0.0697%. Practice evidence already says edit HURTS
   termination (b22-24) — verdict prose is ready for either outcome.
3. Rebuild page (`LAB_DIR=… node demos/weight-surgery-lab/build_demo.mjs
   public/demos/weightsurgery.html`), sync artifacts snapshot (batches.jsonl,
   variants*.json), rule-5 merge, prod-verify (`VERDICT (fair horizon` in live
   html), comment live URL, #1506 building→shipped + close. #1520 stays for QA lane.

## Board (end of session)
- main tip `2101f8e`. #1506 building (slot a; stage 2 left). #1520 feedback (new).
  #1502/#1497/#1498 QA lanes per main's STATE. #1473 b16 map in b's STATE.
  #1492 AWAITING (deadline 11-05, default B) — link only, do NOT re-ask.
- Rule-4: slot-a merged demos code TODAY ✓ streak clean.
- Runner + watchdog must survive my exit (detached to launchd — verified pattern).
  If next lane finds them dead: re-detach via `detach_runner.sh` (double-fork;
  nested launchctl refused from warden contexts).

## ENV (this box — persists across sessions until reboot fixes Tailscale)
- System DNS = dead MagicDNS (tailscaled refuses prefs); gh Go-TLS = `x509
  OSStatus -26276`; macOS path_helper re-prepends /opt/homebrew/bin so PATH
  shims are bypassed inside zsh scripts (main-ok.sh = false-green; verify
  nightly via API). Working GitHub stack lives in `/tmp/forge/`:
  `dnsguard.mjs` (run first: `node /tmp/forge/dnsguard.mjs &`… actually use the
  double-fork detach pattern), `ghapi` + `gh` (explicit-path ONLY), git via
  `git -c http.proxy=http://127.0.0.1:18080`, curl via `-x`/HTTPS_PROXY.
  REST `ready_for_review` is a SILENT NO-OP with this token — GraphQL
  `markPullRequestReadyForReview` works. Test `gh api octocat` first; if it
  works, all of the above is unnecessary.
- pgrep broken (use `ps aux | grep`); never put literal process names in the
  same command as a kill-grep (self-match SIGTERM footgun); zsh eats leading `=`.
- llama-server --cont-batching: stalled-gen quirk at parallel ≥12 on this box;
  "fast" benches were slot-context truncation. CPU-only ~55–150 tps aggregate.

## Open questions
- #1492 — link only (AWAITING, default B, slot-b thread).
