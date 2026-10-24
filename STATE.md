# STATE — 2026-10-24 forge session 4 (COMET DRIFT HD phone path proven; also fixed red main)

## Shipped this session
- **#987 → main (PR #990 squash 2a85c5f)** — **COMET DRIFT HD phone
  auto-fallback proven**, live at `https://www.jalfern.com/retrogames/comet-drift-hd`.
  - Flagship idle stage (#841): queue empty, QA lane live (borrow forbidden);
    `idle.mjs` pick: SSX+Emberwood QA-held (#986/#982, and #982 shipped as
    #984/#988 en route) → oldest unowned gap = CometDriftHD honest gaps #0.
  - Game code (DEV hooks): `gpuProbe()` = honest fallback facts (`hadGpu`
    captured pre-init, `nodeGL`, `lostArmed`); `wantProbe/frameProbe` =
    **in-frame** 48x48 pixel sample of the renderer's own GL context —
    three's WebGLBackend omits `preserveDrawingBuffer` (r180
    contextAttributes), so the phone canvas is BLACK to out-of-frame
    readback; truth only exists inside the rAF callback.
  - Harness `cometdrifthdphonecheck` (18 gates, alias, lint:hd): phone
    390x844 coarse-pointer with `navigator.gpu` killed pre-page — AUTO
    fallback engages unpinned, refuge armed, tap-to-start, dusk pixels real
    in-frame, contract-driven race advances, no spurious heal, provoked
    mid-race loss self-heals on the AUTO path and repaints. Where WebGPU is
    real (this box): compositor PNG luma stats + frame-to-frame motion —
    the "only proof is screenshots" half became computed gates.
  - Mutant: `--mutate-classify` (backend always claims webgpu) → 9 gates
    red (naming, blind heartbeat, unarmed refuge, dead probe, no heal);
    restore green. `cometdrifthdcheck` 382/0 regression; lint
    hd/mario/fps/ai + build green. Prod verified by content marker
    (chunk index-B6qiEadE.js: gpuProbe=1, drawingBufferWidth 3/3).
  - README honest gaps #0 rewritten honestly: residual = real-device
    adapters (iOS Safari WebGPU quirks, thermal flips, Adreno MSAA) can't
    be emulated headlessly.
- **Red main fixed: #991 (PR #991 squash e3ab38e)** — jonqcheck assumed
  every flagship always has an open gap; #980+#988 honestly emptied SSX's
  list (parseGaps correctly filtered CLOSED bullets) → 7 static gates red on
  every PR. Canary now: open-gap OR CLOSED-marker (broken-parse still red);
  order/kick fixtures ride synthetic FIX_GAPS; new real-data gate names
  today's stage (Emberwood). jonqcheck 112/0.

## Next goal
- `game-queue` is EMPTY → #841 flagship stages again. Honest `idle.mjs` pick
  after this ship: **COMET DRIFT HD honest gaps #1** (autopilot drift-charge
  tiers in real races), unless a `steer`/`next` lands first.
- Never touch QA-held issues; QA currently holds #928, #891, #939, #947, #956.

## Board / harness status
- main = 2a85c5f (this ship). `main-ok` green at claim + both merges;
  `static` SUCCESS; Vercel pass; prod content-verified.
- First-run merge gotcha: rule-5's `s=$(gh pr checks ...)` dies quietly when
  checks aren't reported yet (`s` empty → failed assignment kills the &&).
  Pre-wait until static reports, then run rule 5 verbatim — done both times.
- Advisory noise expected: ssxmodelcheck paused-stable / grab distinctness
  flaps on software GL (pre-existing, rule 3).

## New harness lessons (this session)
- **A flagship shipping out of its gap list is a legal state** (#991):
  harness fixtures that index `REAL_GAPS.<game>[0]` turn honest shipping into
  red main. Order/ownership semantics belong in synthetic fixtures; README
  ground truth keeps parse-quality + "what does the stage name today" gates.
- **An out-of-frame BLACK canvas is a spec, not a bug** (three WebGLBackend
  without preserveDrawingBuffer): in-frame readPixels is the phone-path pixel
  oracle; anchor the probe to `renderer`'s context, never a stray canvas —
  a zero-sized `glCanvas` grab was a self-inflicted flake.
- **`Report.check(label, pass, detail)`** — misordered args print `PASS true`
  and every gate silently passes; eyeball the labels once per new check.

## Housekeeping owed
- Prune when idle: `retrogames-forge-comet-hd-fallback`,
  `retrogames-fix-jonq-empty-flagship` (both done), plus standing list
  (momentum-courses, iphone-controller, ssx-*, emberwood-*, qa-863*,
  people-sim, campfire-670, forge-model-library, coral-reef, qa-973*).
  qa-973 was HOLDING `main` (violates worktrees-only); detached it this
  session — keep it that way or the next lane's detach dies.

## Open questions
- None (#605: nothing filed this session).
