# STATE — session 344 slot b close-out

## Shipped this session
- **FLOOR BOSS TEACH THE KNEE (#2719, #2711 s2) — PR #2722 merged `1632c46`.**
  `kneeEscapes(gs,x,y)` answers a `why:'knee'` refusal: BENDS (open elbows whose
  arms ride the `kneeNet` before the click — the click sits at `B+dIn+dOut`) +
  BESIDE-PLACE (neighbours legal in their own right). Doctrine: monotonicity —
  racks only shrink the knee net, so no plug frees a swing; the lesson offers
  placement, never redemption, and says `SWING STAYS OPEN` when nothing is
  provable. Painter: amber elbow boxes + quarter sweep-arcs centred on the
  elbow's inner vertex, green `HERE` frames, tail `RACK BESIDE — KEEP THE SWING
  CLEAR`; DEV eye `kneeTeach`. README: aisle-clearance gap now reports #2711
  (it shipped unwritten) + this stage; residual narrowed to overhang beyond
  the outer diagonal. Proof: floorbosscheck +15 gates all green (throat/mouth
  rig pins, bend structure, beside legality + monotonic honesty, illegal-mouth
  exclusion, honest fallback, purity twins, presentation pins); mutant
  `--mutate-knee-teach` killed; floorbossplay knee leg 9/9 green twice (real
  taps, fx ledger, HERE/elbow pixels, advice-builds-but-swing-still-refused);
  lint×3 + build green. Prod: `RACK BESIDE` verified in the live FloorBoss
  chunk; #2719 shipped+closed.

## Next queued (slot b)
- No TARGET claim pending. TARGET #2709 was REFUSED at kick (slot a held it
  live); its remainder (claptestplay per-schedule fake-file migration) may now
  be free — verify with `scripts/forge-claim.sh 2709 b` or the live comments.
- Ladder after that was run dry by derivation this session: steer/next/queue
  held or empty, QA live, flagship gaps spent, weakest PickRush declined
  (episode-export = pipeline task, README self-notes it; 2nd time — treat as
  settled unless the gap text changes).
- FloorBoss residuals left honest in README: overhang beyond one diagonal cell,
  live-flow re-routing (reads, doesn't re-route), second-hotseat. Don't invent
  a third teach — next FloorBoss stage should come from QA feedback (#2700
  polish issues closed; file new ones only from real playtest gaps).

## Catches learned (durable)
- **`gh pr create` can print a URL for another lane's race.** Two lanes created
  PRs within seconds; mine printed `…/pull/2720` while slot a's create won that
  number — no PR existed for my branch at all (later `gh pr list --head` empty).
  ALWAYS verify a create: `gh pr list --head <branch>` must show your number
  before trusting the printed URL. Rule-5 loop then `gh pr checks` finds no PR,
  the while-condition fails on iteration one, and **a while-loop with no body
  executions exits 0** — the merge silently skipped. Verify merge by state
  (`gh pr view --json state,mergeCommit`), never by chain exit code.
- **A merged branch's `git checkout --detach` dies if another worktree holds
  `main`.** `gh pr merge --delete-branch` tries to checkout `main`; if a stale
  QA worktree was switched onto it (its own delete-branch), 'main' stays
  claimed. Remove the stale worktree (branch already merged) or detach in the
  main checkout — do NOT leave `main` checked out anywhere.
- Knee teach doctrine: monotone laws (net only shrinks) cannot self-plug —
  their teach is placement-beside + structure-show, never a fake redemption;
  the play leg pins exactly that (advice builds, swing still refused) so a
  future laundering breaks the leg.
- Plant strings must match the source comment verbatim (`an illegal neighbour`
  vs `illegal neighbour`) — mutateguard exits 2 loudly; good, keep it that way.
- Advisory floorbossplay flaked on main too (10 fails at load 6.6, same legs:
  elbow teach, seat-stamp px, yields eye, shift timing). My branch failed a
  strict subset and my new leg never flaked. Baseline-from-main-on-a-spare-port
  is the cheap discriminator for "is this red mine?" — use it before spending
  a PR on harness timing (#3 rule).

## Lane state
- Worktree `~/Dev/retrogames-forge-floorboss-knee-teach` + branch removed
  post-merge; also pruned stale merged worktree `retrogames-qa-2713` (freed
  main). Main checkout detached at `1632c46`. Port 5178 freed (dev server was
  killed mid-suite — sessions must restart their own).
- Rule 4: game code merged this PR ✓ (streak reset).
- QA MASTER (node studio) live all session; #2713/#2714 taken by QA lanes,
  #2718/#2720 shipped theirs.
- Open questions for Jon: none filed (every pick this session was ladder- or
  README-derived; nothing taste-shaped or hard-to-undo).
