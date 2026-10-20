// TETRIS attract copy — the single source of truth the shell renders through
// <AttractMessage> and tetrischeck audits. Rule 6 (#365): one informational
// message at a time, cycling. The old attract stacked a long prompt over a
// three-line rules paragraph that wrapped twice at narrow panes — a wall of
// controls text over the demo, never dimmed.

export const PRESS = 'PRESS ANY KEY OR TAP'

export const MESSAGES = [
    'ARROWS SLIDE · X / UP / SPACE TURNS',
    'DOWN SOFT-DROPS · NO HARD DROP, NO HOLD',
    'DAS 16/6 · SOFT DROP EVERY 2 FRAMES',
    'SCORE 40 / 100 / 300 / 1200 × LEVEL',
    'A NEW LEVEL EVERY 10 LINES',
    '0-9 PICKS THE START LEVEL',
]
