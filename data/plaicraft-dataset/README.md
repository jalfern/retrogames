# PLAICRAFT human dataset (#1712, big build S2)

Regenerate with `npm run plaicraft:dataset` (reads the S1 store —
`retrogames.jalfern.workers.dev`, read key `JON_KEY` via `.env.local`).
Deterministic: same store bytes twice -> same `version` and byte-identical
files. The full corpus (rows + audio) rides out of git; `sample.jsonl`,
`card.json` and `index.json` are the committed evidence.

## Files
- `dataset.jsonl` — one row per `(take, tick, seat)`:

| field | meaning |
|-------|---------|
| `k`   | store key of the take this row came from |
| `g`   | game id |
| `s`   | seed of the take |
| `t`   | tick (1-based) within the take |
| `lvl` | level index (gauntlet level / floor-boss shift / bomb index; null for games without a feature adapter) |
| `seat`| seat index this row describes |
| `act` | that seat's compact pad that tick (`rec/v1` pad codec) |
| `feat`| game-state features for that seat — gauntlet: THE 31 features of `src/games/Gauntlet/model.js`; floor-boss: THE 37 of `src/games/FloorBoss/model.js`; bomb-defuse: THE 35 of `src/games/BombDefuse/model.js` (#1712) — always computed while replaying the take against THE sim with every recorded checkpoint verified; other games: `null` until an adapter exists |
| `split` | `train` \| `player-heldout` \| `seed-heldout` \| `flagged` |

- `audio/<file>.webm` — consented human voice tracks, decoded verbatim from
  the take (`voiceReexport`; nothing transcoded). Bot/tool audio is never
  written here.
- `audio/index.jsonl` — per track: seats, player, mime, wall ms, the tick->ms
  clock, and `clips` (spoken `voiceCmd` calls cut to tick-aligned ms windows:
  call tick `t` -> `[tickToMs(t)-500, tickToMs(t)+1500]` clamped to the track).
- `card.json` — dataset card: games, players, hours, sessions with voice, the
  split assignments, and the honest coverage block: which #1712 acceptance
  lines this store can meet today and which are blocked (and why).
- `manifest.json` — `version` + per-file sha256. `version` = sha256 over the
  sorted `path\0sha\0` lines of the content files; `card.json` embeds it and
  the manifest proves it.

## Split doctrine (the #1712 audit, 2026-11-20)
`train`/held-out splits are fed by HUMAN takes only: a named player (not the
pre-audit fixed `player`, not `qabot`/`harness`), a NATIVE human seat
(`slots[].source.kind === 'human'` WITHOUT `relabeledFrom` — a relabeled seat
is an audit stamp, never a counted player), and a real game (a registry id;
`/claptest` is a calibration tool). Everything else lands `split:'flagged'`
and never feeds train or held-out. Whole players are held out
(`sha256('plaicraft-player-split-v1:'+player) % 4 == 0`, degenerate cases
fixed so both sides are non-empty when 2+ players exist); the seed axis is
`sha256('plaicraft-seed-split-v1:'+seed) % 100 >= 80`, auditable from the
seed alone. Fewer than two human players: `card.splits.player.blocked =
"need-2-players"` — the card says so instead of faking a holdout.

## Today (store as of this export)
Human: **jalfern, gauntlet only** — 4 native takes (+4 legacy-folded, `lg:1`),
all replay-verified. Coverage lines `covers 2+ games` and `no held-out player
in train` need Jon's friends' takes (see the question on #1712); the pipeline
and determinism are proven by `npm run plaicraft:datasetcheck` (48/48 + five
mutants RED by design). Adaptered games (a friend's take there closes lines
immediately): **gauntlet, floor-boss, bomb-defuse** (#1712 pass: 35 features,
`src/games/BombDefuse/model.js`). A friend recording an adapter-LESS registry
game still consents and lands (audio + flagged rows,
`card.totals.unadaptedHumanTakes`), but their split/coverage credit waits for
that game's adapter — the trainable gate, load-bearing under mutant.
