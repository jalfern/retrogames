// MYST attract copy — the single source of truth the shell renders and
// mystcheck audits. Rule 6 (#365): one informational message at a time,
// cycling. The old attract stacked the CYAN byline, a long lore paragraph and
// a separate hint paragraph at once — a wall of rules text over the dock scene.
// MYST's attract is React DOM, so it renders these through <AttractMessage>,
// which shows one at a time.

export const PRESS = 'PRESS ANY KEY TO START'

export const MESSAGES = [
    'CYAN · 1993 · REBUILT IN CODE',
    'A library of living books · two imprisoned brothers',
    'Four Ages hidden in plain sight',
    'No map. No hints. Take notes, as in 1993.',
    'Click or tap what you see · arrows step and turn',
]
