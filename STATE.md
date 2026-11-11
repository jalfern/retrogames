# STATE — session 221 (2026-11-11, slot b)

## What shipped
**THE ONE-OFF CROWD** merged as `5e4203f` (PR #1994, Closes #1989 — NEVER-DRY
pick, weakestStage score 8 = 7 QA feedback naming PPM + 1 unowned README gap;
TARGET #1637 REFUSED at claim — slot a held it, 52 min). Papers, Please's line
was dozens of one-offs (hats, unibrows, earring, missing teeth); the booth now
wears them: `accFor(pic)` in `gen.js` derives `{hat,uni,ear,gap}` as a PURE
hash of the passport serial — zero rnd() draws (every existing seed replays
names/numbers/weights/faces byte-identical), decor attached to `face` BEFORE
the photo spread so face==photo decor is architectural. `drawFace` paints all
four families at counter AND zoomed-photo scale; inks chosen clear of every
existing pixel counter (unibrow `#262b36` one step off compared-brow ink,
teeth `#e6ebf2` ≠ eye whites `#d8dce8`, scarf brown fails the stamp's rr>140
red test). Hats leave the hairline visible under the brim/past the edge so a
grey aged-photo or flipped cut still reads THROUGH. rules.js untouched — decor
is never evidence (doctrine of the nose). Cast decor AUTHORED (identity, not
hash): Grubak cap+unibrow, Marko earring, Anja scarf+gap-tooth, Petr ushanka.
paperscheck `THE CROWD IS PEOPLE`: purity, face==photo decor every paper,
verdict-neutrality (decor perturbed on every paper, decide AND judge never
flinch), variety floors **graded on rolled heads only** (3 hat kinds, 25
looks/768 rolled, ~100 per family), authored-cast pins. **12842/12842 + all
32 mutants die** (new m31 flatten-accFor, m32 decor-read-as-evidence).
papersplay **62/62**: seed-0 days 1-2 real-key walk — hat 1732px/unibrow
56/earring 9/tooth 30 at the counter, hatted honest photos carry the hat,
bare heads paint none, browser decor === Node `accFor(serial)` on all 14
rolled faces, Grubak cap+unibrow live. Live:
jalfern.com/retrogames/papers-please (proxy content proof: entry
`index-DVkZknVb.js` → PPM chunk `index-D-h8JRMb.js` carries ink `#6b4a2f`).
Filed polish pass #1996 (country flavor, accessory breadth, bodies, one-off
speech).

## The session's catches
- **Authored faces mask flattened rolls.** m31's first draft (flatten accFor →
  expect 3 hat kinds) SURVIVED — the four authored regulars wear kinds {1,2,3}
  themselves, so the variety witness stayed green with zero rolled hats.
  Fix: grade variety on `!a.person.regular` rows only, in BOTH the CROWD
  section and the mutant walk (commented at both sites). Same lesson as m24:
  a witness that can be satisfied by furniture proves nothing.
- **Anchor syntax is the mutant's first test.** First mutate run flagged
  "anchor not found (m31)": the anchor used `const hat = ...` but the source
  is an object literal (`hat: ...`). Silent mismatch = green suite testing
  nothing — the "anchor not found" FAIL is the suite protecting itself.
- **Vercel re-deploys under you mid-verification.** Origin hit `#6b4a2f` in
  chunk `index-Cmq2bJoU.js`; minutes later the same URL 404s — slot a merged
  BRITANNIA and every chunk hash rotated. Re-scan the live entry's chunk map,
  don't pin old hashes; and jalfern.com needs `-L` (308 at the edge).
- Chrome on a shared box logs a device-level "AudioContext encountered an
  error from the audio device" line — papersplay filters it (documented in
  README Gates); synthesized-tone gates all passed, so it is not page code.

## Ladder trail
- halt none; steer none. TARGET #1637 REFUSED at 10:30Z (slot a newest 52 min;
  slot a has since shipped #1991 LodeRunner-chain and #1995 BRITANNIA — check
  the lock, it is likely free by now). #1711 stays released (seventh confirm
  08:27Z, unchanged, Jon-side hardware). game-queue empty; QA MASTER live →
  borrow refused; flagship stage spent → NEVER-DRY #1989 → shipped #1994.
  No jonq filed (all decisions pattern-following).

## Open questions
- none (see waiting-jon issues; #1711 hardware waits on Jon).

## Next
- Batch 26 (#1637): first of Asteroids / DonkeyKong / Centipede / Pitfall whose
  sim supports an exhaustive driver — PITFALL per b24 audit (deterministic
  board, BFS like LodeRunner). Claim `scripts/forge-claim.sh 1637 <slot>`;
  lift-into-sim first if the rules aren't Node-provable (b25 pattern).
- QA owns #1996 (crowd polish). Dev server: slot a 5173, slot b 5178.
- `--mutate` only in an exclusive window, ≥20 min; after a killed run grep
  every mutant fingerprint before trusting the tree (still true: re-verified
  clean this session).
