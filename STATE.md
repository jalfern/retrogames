# STATE.md — 2026-10-10 (Forge Conveyor session end)

## Where things stand
**#103 GAME 16 — FORGE CONVEYOR IS LIVE at jalfern.com/retrogames/forge** (PR #111,
squash ba119f5, `shipped` label, closed). The first forge claim that is not a game:
the board itself now has an animated factory floor. Arcade is still 23 titles.
**Next session: claim #71 GAME 07 — Galaga** (queue head), then #72 Polarity Shooter.
No unlabeled `GAME —` issues exist; nothing carries `next`.

| since last STATE | what |
|---|---|
| #103 / `forge-conveyor` | `src/pages/floor.js` (pure `deriveFloor`) is now the ONE truth the lamps, the floor band and the harness all read. `FactoryFloor.jsx`: queue bin (drift-in cards), anvil (glow=building, spark=pulse<15 min, dark=silent), CI gate (amber+PR# beats pulse), conveyor (cart ONLY on a pulse-proven shipped-flip), shelf cartridges → /games. CSS+emoji only, zero new deps, zero new API calls. |
| **bug found by the harness** | The board's `comments_url.replace(host,'')` was re-prefixed by `API()` → doubled `/repos/...` → **404, swallowed by `catch { decorative }`**. The warden log and build feed had NEVER rendered in production. `forgeplay`'s zero-page-errors check caught it on the first run. |

## What is playable right now
- Everything on jalfern.com/retrogames, plus `/forge` now shows the factory floor
  fed by the board's own fetches. At ship-time prod: 8 queue cards, 7 shelf carts,
  anvil honestly DARK (my `building` label was gone and the warden's pulse was
  >15 min old — the honesty clause working, observed live).

## What changed this session (the parts that matter next time)
- **A mutation you did not prove was APPLIED is a mutation you never ran.** My
  first fresh-ness mutant "survived" (green check, green restore) because the
  perl pattern had a trailing `;` the source line does not have. The playbook
  says break a line and watch it go red — now I also print the mutated line
  before running. Three real mutants after that: queue-leak (4 reds),
  always-fresh anvil (3 reds), unconditional cart (3 reds).
- **`catch { /* decorative */ }` is where truth goes to die.** A fetch that
  404s every single load, silently, for months, while the UI quietly omits the
  panel. forgeplay asserting `zero page errors` is what turned it from invisible
  into a check.
- **`renderToStaticMarkup` in Node CAN host the real component**: esbuild
  (Vite already ships it) bundles the JSX, `MemoryRouter` makes real `<Link>`
  hrefs, `createRequire` banner bridges react-dom/server's CJS. The whole DOM
  harness is ~0.5 s — CI static material. `scripts/forgecheck.mjs` is the
  template for any future non-canvas UI check.
- Purity: `Date.now()` in render is a react-hooks/purity error — freshness is
  now stamped when the fetch LANDS (`setNow`), which is also the honest
  semantics ("fresh when we fetched it").

## Gates (all green at merge)
12 scoped lints incl. new `lint:forge` · `forgecheck` 37 asserts in CI static ·
`forgeplay` 8/8 real-Chrome against LIVE GitHub data (manual tier, in
`npm run verify`) · build ✓ · prod bundle contains the floor, /forge 200,
real click → /games with zero errors.

## Next (for the next session — do NOT re-debug these here)
1. Claim **#71 Galaga** (queue head, oldest). Standard game lane: canvas,
   attract mode, VirtualControls, DebugKit, lint:galaga + galact check
   (proven red first), galactplay browser pass.
2. Do not polish the floor — shipped. Its gates: `lint:forge` + `forgecheck`
   (static), `forgeplay` (manual, needs dev server + GitHub network).
3. If /forge ever shows no warden log again: suspect a doubled URL or a
   swallowed throw before suspecting the warden — `forgeplay` will name it.

## Three questions for Jon
1. The QA lane fired mid-my-session and correctly stopped at the dirty tree
   (issue #103's feed shows it). If forge and QA share this worktree they can
   only ever interleave by luck — separate worktree per lane, or schedule QA
   only when no `building` issue exists?
2. `jalfern.com` 308s to `www.jalfern.com` — my prod poll was blind until I
   added `-L`. Does the warden's own prod check follow redirects, or has it
   been "checking" a redirect page?
3. Two `feedback` issues sit untriaged and the QA lane hasn't merged one yet
   (its first real run died on the dirty tree). Want it to retry this evening,
   or hold until the worktree question above is settled?

## Lineage
AGENTS.md honored: read STATE first, ff-only pull, no corpse branches
(`git fetch --prune` + branch scan), `next` (#103) claimed above queue head per
FORGE.md step 2 with claim comment, one game, checkpoints pushed per increment
with FORGE comments, harness proven red 3x (with the mutation-APPLIED
discipline above), merge only via
`gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch`,
prod verified in a real browser, STATE rewritten on main (game merged →
allowed). Rule 4 (game code): this claim is deliberately board code —
`src/pages/**` — per Jon's `next` label on a non-game issue.
