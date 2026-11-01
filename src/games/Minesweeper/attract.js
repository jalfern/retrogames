// MINESWEEPER attract copy — the single source of truth the shell renders
// through <AttractMessage> and attractcheck audits. Rule 6 (#365): one
// informational message at a time, cycling. The old attract stacked a
// three-line rules wall plus a wrapping difficulty prompt over the marquee,
// clipped at both frame edges and undimmed.

export const PRESS = 'PRESS ANY KEY OR TAP'

export const MESSAGES = [
    'CLICK TO DIG · RIGHT-CLICK TO FLAG',
    'B OR SHIFT ALSO PLANTS A FLAG',
    'DIG A MATCHED NUMBER TO CHORD THE REST',
    '1 COLT 9×9 · 2 SAPPER 16×12',
    '3 GENERAL 22×13 · TAP A CELL TO DIG IT',
    'EVERY BOARD IS PROVEN GUESS-FREE',
]
