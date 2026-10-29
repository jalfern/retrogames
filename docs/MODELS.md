# 3D models — the shelf and the library index (#637, #901, #1140)

Two layers, one rule: **look before you model.**

## The shelf — what we own
`public/models/` + `public/models/shelf.json`: CC0 GLBs the arcade commits and
serves (1 unit = 1 m, +Y up, origin on the ground, forward +Z, sized for an
iPhone). Browse it in a game with `src/utils/modelShelf.js`
(`browse / loadModel / facingOf / directionalIds`). `scripts/build-shelf.mjs`
regenerates the Forge kit; `npm run shelfcheck` gates it.

## The library index — where to look first
`public/models/libraries.json`: a **link list** (never a mirror) of free-model
sources, each with what it holds, its license scope, formats, and whether its
assets carry physics data:

| id | fit | license | physics |
|---|---|---|---|
| kenney | retro/stylised characters, cars, props | CC0 (check per pack) | no |
| quaternius | retro/stylised everything, animated | CC0 | no |
| polyhaven | MODERN bar: realistic props, textures, sky HDRIs | CC0 | no |
| khronos-samples | renderer/loader testing corpus | **mixed per-asset** | no |
| nvidia-simready | ~2,000 USD robot/warehouse/household assets | **per supplier** | **yes** — mass, friction, colliders |

`src/utils/modelLibrary.js` gives `browseLibraries / library / shortlist` and
the law itself: `licenseGate(spdx)` ranks `ship(CC0) < credit(CC-BY) <
review(NC/unknown/trademark) < never(SCEA/ARR)`; a multi-license pack takes
its strictest component, and `gateFor(entry)` re-checks that each index entry's
declared gate matches its license string.

## The pull rule
Only models a **game actually uses** enter the repo — as GLB, sized for an
iPhone (≤ ~512 KB, textures ≤ 1024 px), with the license file beside them.
SimReady physics must be transcribed into the shelf entry (GLB carries no
physics) so robot-learning games can find mass/friction/colliders later.
Kenney/Quaternius/Poly Haven/SimReady live off GitHub/npm, so pulling is a
deliberate human-visible step — CI never downloads from them. Khronos samples
are on GitHub, but **check each asset's `metadata.json legal[]`** — licenses
there range CC0 to SCEA (the index's shortlist is already license-verified).

## Proven first use
SSX's riders and boards (#548/#975) ship from shelf KayKit rigs — a CC0 pack
that was hand-pulled from GitHub, exactly the workflow this index formalises —
and `npm run ssxmodelcheck` proves the rig pipeline in the browser. When the
next game needs a rider, car, tree or prop, consult this page — the shelf
first, then the index — before modelling from scratch.
