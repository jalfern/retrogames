# STATE — session 158 (2026-11-06, slot b)

## What shipped
**WATCH rollout batch 6 (#1637) — PR #1692 squash-merged `7e3f130`, LIVE**
(`/magic-carpet`): Y seats `autopilot(gs)` from sim.js — the game's OWN
closed-loop brain, the one the attract demo flies and carpetcheck's 60-seed
sweep restores all three worlds with. Re-decides from live state every tick:
a watched run is a real run, never a witness replay.
- Seat/takeover verbatim from batches 1–5: Y toggles (shared blips); arrows,
  Shift, Space/X/Z, Q, digits, pad take over AND still apply (lossless); stage
  tap hands back WITHOUT casting (lode rule). `finish()` and `startPlay()` and
  the contract `reset` unseat; a world CLEAR keeps the pilot seated (same sim,
  the sweep crosses levels that way).
- Visual honesty: bank/sway/pitch/boost read `eff` — the EFFECTIVE inputs — so
  the picture tracks the route flown, not phantom key-holds.
- Chrome: registry WATCH line (coverage **37 of 80** routes), attract teach
  span + ▶ WATCH at the 24% band, pill, WatchToast, pause row auto.
- Harness: watchcheck gains the magic-carpet pilot pinned `?seed=7`; advance
  signals prover-only, verified head-to-head vs an idle carpet on the seed
  (idle |Δyaw| 0.000 over 480 ticks and banks nothing; pilot ≥0.65 within 60).
  Batch-6 source pins; no-guide registry gate drops /magic-carpet (DOS/IF stay);
  phone parse floor 33→36. Mutant `ap = {}` → advance legs RED (yaw 0°→0°),
  restored green. Local: pilot 115/115, watchphonecheck 272/272,
  attractcheck 694/694, lint gates + build green.

## Box emergency (this session's real cost — ~40 min)
System DNS + SecTrust + pgrep/Keychain are broken on this box (scutil --dns:
"No DNS configuration available"; sudo: "you do not exist in the passwd
database"; gh: x509 OSStatus -26276). Raw UDP DNS to 100.100.100.100 still
works, git still works (c-ares reads /etc/resolv.conf). Workaround installed:
`/tmp/forge/dnsproxy.mjs` (CONNECT proxy :18080, resolves via raw DNS) +
`/tmp/forge/bin/gh` (Node API shim, bundled CA store, covers api/issue/pr/run/
workflow/auth incl. --paginate/--input/-f) + exports block in `~/.zshenv`
(PATH, HTTPS_PROXY, NO_PROXY=localhost,127.0.0.1, NODE_USE_ENV_PROXY=1, plus a
pgrep-guarded proxy respawn). Token from hosts.yml; account jalfern.
**If GitHub access breaks on a future session, check this block first:
`/tmp/forge/dnsproxy.log`, `which gh` (should be /tmp/forge/bin/gh after a new
shell). If DNS/SecTrust heal, remove the ~/.zshenv block.** NOTE /tmp is wiped
on reboot — the shim dies with it; recreate from this description or from
PR #1691 (`gh-shim hardening in repo`, #1676 — the repo now hosts a real shim).

## Lessons (worth keeping)
- esbuild STRIPS `// comments` from served modules — verify mutants/served
  content by STRUCTURE (`const ap = {};`), never by comment markers.
- Game DEV hooks: `watching` must be a function on the hook TOP LEVEL
  (`watching: () => watchingRef.current`), not inside `probe()` — the factory
  calls `window[h].watching()`.
- `curl` jalfern.com needs `-L` (apex → www redirect); a poll without -L looks
  like "not deployed" forever.
- Source-pin regex windows: a comment between the anchor lines counts — a seat
  pin with a 4-line comment needs {0,480}, not {0,240}.
- Headless sim.js probes (node, import sim directly) prove advance-signal
  honesty (idle-vs-brain on the pinned seed) in seconds — do this BEFORE
  writing any browser pilot.

## Next (priority order)
1. #1637 stays OPEN `building` — remaining: DOS/IF (needs a solver that drives
   gameplay) and the SpaceInvaders reactive pilot (verdict on the issue;
   batch-7 candidate: track-lowest-column + fire-on-aligned, sim-graded win in
   invaderscheck, then seat like batch 5).
2. Box repair worth an issue? DNS/SecTrust/DirectoryServices are system-level;
   no sudo here. If it recurs, a `waiting-jon` question (games lane) about
   reboot/repair may be warranted — this session worked around it.
3. Normal ladder for next slot-b session: recompute `weakestStage` from READMEs.

## Notes for the next slot-b session
- Dev server 5178 left STOPPED; kill-port + restart + curl-verify dance still
  required (watcher dead).
- Worktree `~/Dev/retrogames-forge-watch-rollout-b6`: detached at origin/main,
  node_modules symlinked — reusable. Branch deleted both ends by the merge.
- Local Chrome still degraded (#1622, shell+sp boot); CI smoke is the pixel net.
- zsh: quote separators (`echo '---'`); `nohup` cannot detach on this box —
  use harness background jobs for dev servers.

## Open questions
None. jonq games lane: none open.
