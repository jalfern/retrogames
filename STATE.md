# STATE — session 252 (2026-11-12, slot a)

## What shipped
**PLAICRAFT S1 — THE ±50 ms PROOF PAIRS ONLY THE NAMED CONTROL (#1711 audit
item 1)** merged as `a98e37c` (PR #2138). `matchClapEdges` now takes edges
tagged `{t, control}` and pairs onsets ONLY with A-button taps — the control
the #2056 player instructions name. Any-control laundering (audit: a ~120 ms
lagging phone could pair its clap with an unrelated stick crossing inside
±50 ms) is closed; untagged numbers pair NOTHING (SHAPE law, fail-closed).
recordcheck 123/123 incl. the audit's required mutant (dense stick edges +
taps shifted +120 ms -> RED); fail-forced by hand: restoring any-control
pairing turned that mutant green at offset ~0 — the exact audit attack — and
the suite went RED; restored. The synth clap driver taps Space (Gauntlet's
`a`) at the claps like the player does, steering holds as context.
#2093 items 2–4 shipped: webm phone take travels store→verify (evidence
self-test 35/35), clap verdict prints container duration + tail-drop
warning, `voiceFlushTimedOut` named outcome on `__autoCapture`/
`__autoRecord.last`. Prod verified: `autoRecord-B68CikD-.js` carries the
marker. #1711 NOT closed (stage rule 4): waiting on Jon's 3 fresh phone
takes, one clapping; `next` restored on it.

**Issues filed:** #2136 — the clap synth ±50 gate is box-load-flaky and
PRE-EXISTING on origin/main (reproduced with main's own driver, 59.7 ms;
heardMs rock-stable across runs, jitter is press-arrival under CDP);
#2137 — audit item 4: outbox scenario C red on main, unowned until now.

## The session's catches
- **`jalfern.com` answers 308.** Assets need `curl -L`; without it you grep
  a 15-byte redirect stub, count 0, and "verify prod" silently never
  verifies. (Property keys like `voiceFlushTimedOut` survive minification —
  identifiers don't; trace keys/strings.)
- **Rule 8 worked as designed.** Five probes on the clap jitter before
  stopping; the decisive cheap facts: heardMs identical every run (audio
  stable) + denser clock sampling changes nothing (interpolation ruled out)
  + origin/main reproduces. Outputs posted to #2136, session moved on.
- **Box load is a measurement instrument.** Load avg 3.5–4.4 (QA vite :5178,
  other users' Chromes) is enough to blow a ±50 ms budget on dispatch
  latency alone. Run alignment-sensitive checks quiet or expect #2136.

## Ladder trail
TARGET #1711 claimed clean on first call (`forge-claim.sh 1711 a`) — no
halt/steer/building corpses, jonq empty, no newer parked report for slot a
(slot b's #249 park predates session 251). No new claim (one ship/session).

## Open questions
- none filed (Jon's tap-vs-clap call rides #2056; the 3 fresh takes are
  already requested on #1711).

## Next
- `next` is on #1711 again. Lane-doable remainder there: #2093 item 1 —
  relabel tool for the three stored iPhone takes needs a JON_KEY-gated
  worker write route (deploy-relay.yml automates the deploy; core.js
  constant-time compare pattern exists). QA lane owns #2136 (fix ±50 proof
  under load) and #2137 (outbox scenario C).
- If #1711 idles: normal ladder; #2135 fresh for QA.

## Hygiene at exit
Dev server :5173 (mine) stopped. Worktree `retrogames-forge-plaicraft-s1`
removed after merge, registrations pruned. Main checkout detached at
origin/main. STATE committed to main (this session's target merged) and
parked via statepark park a.
