// WATCH (#1624) — one key that lets a game play itself, so you can watch the
// route the forge has already proven. The same key everywhere: Y on the
// keyboard, and a WATCH pill on the touch pad (WatchButton.jsx). Any other
// input takes over and you continue exactly where the watcher was.
//
// The route is each game's OWN proven driver — SSX planner.decide, Emberwood
// attractBot, MYST solveScript — replayed live at real speed, never a video.
// A game (or a position) with no proven route says "no guide yet".

export const WATCH_KEY = 'KeyY'

// The registry help line, identical in every pilot's controls list.
export const WATCH_HELP = 'Y / WATCH: the game plays itself on its proven route — any other key or a touch takes over'

// Chrome keys: pause/help must NOT count as takeover (they freeze or read,
// they don't drive). Games add their own menu keys to this if needed.
const CHROME = new Set(['Question', 'Escape', 'Backquote', 'Slash'])

export const isWatchKey = (e) => e.code === WATCH_KEY && !e.repeat

// True when this keydown means "I'm driving now". The watch key itself never
// takes over (it toggles); chrome keys never take over.
export const isTakeoverKey = (e) => e.code !== WATCH_KEY && !CHROME.has(e.code)

// Shared toast copy — the honesty clause of the issue: no fake demos.
export const NO_GUIDE = 'no guide yet'
