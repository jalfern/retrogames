// TETRIS (NES) — Korobeiniki tempo by level. The NES speeds the music up as
// the levels climb; L0 keeps the pinned 0.15s step and the table steps down
// one notch per level to a 0.06s floor. The exact ROM tempo values are not
// reproduced (honest deviation, README.md) — the shape is: faster every level,
// and it stops getting faster.

export const TET_MUSIC_STEPS = [0.15, 0.14, 0.13, 0.12, 0.11, 0.1, 0.09, 0.08, 0.07, 0.06]

export function musicStep(level) {
    if (level <= 9) return TET_MUSIC_STEPS[level]
    return TET_MUSIC_STEPS[TET_MUSIC_STEPS.length - 1]
}
