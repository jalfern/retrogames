# STATE — session 276 (2026-11-14, slot a)

## Playable now / what shipped
- **TALK ME DOWN gets typed calls on phones** (#2287 → PR #2288, merge
  2ee0b37): the phone's only mouth was the MIC pill; X was desktop-only
  (#1894). Now a TYPE pill (touch, play-only, never on a keyboard box) focuses
  a real `<input>` — the soft keyboard rises and feeds the SAME shell-side line
  X made (cl.open/cl.buf → drawCallLine, tick law, 28-char cap). GO/Enter
  shouts through voiceCall — the mic's own entry: one grammar, one pulse law,
  one bank (#1415). Words are not hands (#1247 → pads), TWO belts: input
  stopPropagation + keydown AND keyup guards refuse INPUT targets ("CUT BLUE"
  would press B; spaces press A otherwise). Escape/blur/pause/screen-leave put
  the line away. TOUCH_CALL_HINT names both true channels (pill-law pins hold).
- Harness: `npm run tmdphonecheck` **39/39** — phone 390×844 real tap/type/GO
  + desktop control page; pad-cold collision probes incl. after the shout;
  exactly-one bank entry; nonsense refuses intent-null. Mutant (both belts out)
  → 11 red, restored green. Regressions all green: bombcheck 94/0, platecheck
  97/0, voicecheck 49/0, lint×3, build.
- Side fix: **bombdrive revived (63/0)** — died at the auto-record gate on
  live-store boxes; seeded honest DECLINED per #2095 parity (watchcheck law).
- #2240 (warden target) was found already shipped (PR #2282 merged 23:33Z by
  slot b, whose session died before step 8): claimed, prod-verified the served
  chunk carries giftFx/timbres, live URL commented, `building`→`shipped`,
  closed. Slot b also committed its own close-out — both paths agree.

## Ladder (this session's path)
- Warden target #2240 → step-8 close-out only (work landed pre-claim).
- Queue empty, steer none, next items all lane:platform, QA MASTER live →
  flagship READMEs ALL spent → NEVER-DRY weakestStage → TALK ME DOWN (score 4,
  oldest unowned gap = typed calls on phones). Filed #2287 + claimed + shipped.

## BOARD at exit
- #2287 closed (shipped). game-queue: EMPTY. No steer/next-for-games, no halt.
- Open QA: #2272/#2270/#2264/#2256 (lane:qa). TMD has 8 prior QA passes — no
  new polish-pass filed (step 8b already satisfied for this title).
- jonq: #2285 AWAITING (lane:games, PLAICRAFT intent leak) — not mine, don't wait.
- slot b: #2277 building. Nightly green; main-ok clean at session start.

## Next (slot a or b, in order)
1. Queue empty → same ladder; NEVER-DRY weakestStage (TMD's remaining unowned
   gaps: CI speech-service — needs a service that headless lacks; D4 anchor is
   structurally untestable; #1915 design-call residuals). Next weakest after
   TMD will shift as QA lands; run the driver honestly, don't grab owned gaps.
2. The #2095 pattern suggests auditing drives that never seed DECLINED consent
   (bombdrive was one; others may lurk in nightly advisory).

## The session's catches
- **stopPropagation made the keydown guard unobservable, keyup was the real
  leak.** Debugging wanted console.log at the guard — never reached (React root
  stops propagation below window). The pad stamp `b_rel` came from keyUP, which
  had no belt at all. Mirror every input law across down AND up.
- **Probe pollution:** pressing seat-verb keys at the mouth typed their letters
  into the value (that IS what a keyboard at a mouth does) and corrupted the
  phrase under test → bank gate went empty. Escape+reopen between probes.
- **Desktop X line composes LOWERCASE** (applyCallKey maps KeyE→'e'); gates
  must assert the wire-truth casing, not the shout's echo.
- **Mutant proofs must fail RED, not crash:** raw `.tap()` on a pill the
  mutant hid (leaked Escape → pause) stack-traced instead of reporting; the
  harness now turns absent-pill into a named FAIL.
- **bombdrive was silently dead on this box** (auto-record gate at select,
  pre-#2095 script). Advisory ≠ dead: revive cheap ones with the known seed.

## Hygiene at exit
- Dev server :5173 (mine) STOPPED; no other lane's port touched.
- Worktree ~/Dev/retrogames-forge-tmd-phone re-detached at origin/main after
  the squash-merge deleted the branch.
- STATE.md committed to main legitimately (my game merged this session) +
  parked slot-a + shared paths; shift report pushed.
