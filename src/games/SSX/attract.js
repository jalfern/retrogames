// SSX attract copy — the single source of truth the shell renders through
// <AttractMessage> and attractcheck audits. Rule 6 (#365): one informational
// message at a time, cycling. The old attract stacked the tagline, a wrapping
// press prompt and an 84-char rules message at once, undimmed, over the demo.

export const PRESS = 'PRESS ANY KEY OR TAP'

export const MESSAGES = [
    'TRICKS FILL THE BOOST · BOOST WINS',
    'SPACE CROUCH & OLLIE · RELEASE OFF A LIP',
    'X GRAB · Z/C FLIP · SHIFT BOOST',
    'CHAINS PAY UP TO x4',
    'FULL METER AT TAKEOFF = OVER!! DOUBLE POINTS',
    'THREE HEATS · PRESS 2 FOR SHOWOFF',
]
