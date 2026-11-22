# STATE — forge board snapshot (slot b, 2026-11-23 early — shipped)

## This session shipped
- **FIRE CREW trainable** (#1712 → PR #2983 → main `46be66a`, prod-verified).
  The shelf's first NEW trainable title since TalkMeDown closed the eight.
  - Game edge (`index.jsx`): consent at seed-birth (askConsent → startPlay →
    beginRun), `recordLiveTick` banks the consumed pads, `endRun` ships after
    the radio's final chunk (endVoice orders it, #1249 law kept), seat kinds
    resolve at STOP (`humanSeats:false` + live sources — Rally's law, a WATCH
    left on is labelled cpu), WATCH flips stamp `rules.watch` ("t0-t1,…"),
    radio yields slot 0 to the auto mic (`hasAutoVoice()` new gameContract
    export; recognition runs either way — SOS law).
  - `src/games/FireCrew/model.js` — THE 65 features. `lightAt` IS the eyes:
    unseen victims honest-zero, fire shared by rule; radio one-hots+countdown,
    wind+vane, rig, prev-pad lane banked after the label. Hash-clean.
  - `fireCrewRows` adapter + ADAPTERS['fire-crew']: replays THE sim.js,
    verifies every checkpoint (S1); rows per tick per HUMAN seat only;
    watch-span rows dropped; radio re-seated via `applyRadio`; recording.js
    voiceCmd now carries `side` (refused vs replayed must be distinguishable).
  - Proof: datasetcheck 81/81 (+4 legs; FIXTURE-store coverage 9 games — the
    ≥2 line passes there; prod honest-zero until humans play), mutant 14
    adapter-bypass dies by name, firecrewcheck 171 (+6 model gates, leak-gate
    mutant red by hand), firecrewplay DRIVE GREEN (+4 consent/span legs),
    lint×4 + build green.
- **Jon's #2846 executed** (PR #2979 → `7ac26b0`): CONTRA, DOUBLE DRAGON,
  R-TYPE `visibility: 'public'`; visibilitycheck is now a Jon-approved
  allowlist (276 gates; auto-promotion of any other title dies by name).
- QA polish filed: **#2985** (span-cap overflow, double voice ask, refusal
  lanes, first-live-take byte-identity acceptance, couch loft features).

## PLAYABLE on main right now
- `/retrogames/fire-crew` — consented phone takes are now trainable-with-
  features (this session; prod verify below).
- `/retrogames/contra`, `/retrogames/r-type`, `/retrogames/double-dragon` —
  PUBLIC per Jon's #2846 (metadata; site split not wired yet — nothing reads
  the flag beyond the gate).

## Board at close
- `game-queue` empty; `steer`/`next` empty. `building`: #1712 (multi-stage —
  human-data lines: fire-crew+gauntlet hits 2 games when a phone take lands).
- `feedback`: #2985 (this session's QA ask), #2978 (TMD polish), #2971
  (contra-adapter polish), #2964 (FloorBoss — item 2 shipped #2977).
- Adapter shelf: NINE trainable now (gauntlet, floor-boss, bomb-defuse, SOS,
  rally, double-dragon, contra, talk-me-down, fire-crew). Gravel-yard still
  voice-no-autoRecord — candidate next shelf stage.

## Open questions for Jon (links only, #605)
- (none open this slot; #2846 + #2953 both answered and executed.)

## Harness notes (carry-overs)
- **Commit before checkout-swap** — relearned the hard way: a mutant-proof
  `git checkout -- file` wiped uncommitted promo edits mid-session (redone).
- Consent-gate latency: keyboard START now resolves after an async store probe
  — play-legs must WAIT for the gate (`[data-consent-gate]` + `#consent-no`)
  or poll screen==='play', never assume a fixed 250 ms. (Firecrewplay legs
  rewritten; other games' legs already had this pattern.)
- Y on a seated sheet RELEASES it (flip law) — span-legs must read state, not
  assume KeyY seats.
- mutateguard refuses dirty trees: the discipline is commit → mutant → green.

## Slots / ops
- Slot b port 5178: dev server stopped via `scripts/devstop.sh` ✓.
- Worktree `retrogames-forge-firecrew-trainable` (branch merged) removed;
  older prunable dirs from 11-22 sessions remain (someone's `git worktree
  prune` is overdue).
- Main checkout: detached `origin/main`; STATE.md committed this session
  (game merged ✓) + `statepark.mjs park b`.
- Nightly watch: first full nightly over `46be66a` runs the new datasetcheck
  (81/81) + consent-aware firecrewplay together against prod Chrome.
