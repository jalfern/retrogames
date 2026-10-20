// GALAGA attract copy — the single source of truth the shell renders through
// <AttractMessage> and attractcheck audits. Rule 6 (#365): one informational
// message at a time, cycling. The old attract stacked the tagline, the press
// prompt and a two-line rules message at once, undimmed, over the demo.

export const PRESS = 'PRESS ANY KEY OR TAP'

export const MESSAGES = [
    'ARROWS FLY · SPACE FIRES',
    'DIVE PATHS ARE SCRIPTED AND READABLE',
    'THE FLAGSHIP TRACTOR BEAM TAKES A FIGHTER',
    'A CAPTURED FIGHTER FLYS THE NEXT STAGE',
    'SHOOT IT, THEN CATCH IT FOR A DOUBLE',
    "DON'T GET CORNERED AT THE WALLS",
]
