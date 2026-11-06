// WATCH (#1624) — one key that lets a game play itself, so you can watch the
// route the forge has already proven. The same key everywhere: Y on the
// keyboard, and a WATCH pill on the touch pad (WatchButton.jsx). Any other
// input takes over and you continue exactly where the watcher was.
//
// The route is each game's OWN proven driver — SSX planner.decide, Emberwood
// attractBot, MYST solveScript — replayed live at real speed, never a video.
// A game (or a position) with no proven route says "no guide yet".

import { audioController } from './AudioController.js'

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

// #1654 — discoverable copy: every pilot shows this line on its attract
// screen, before the first Y press. One sentence in every game.
export const WATCH_ATTRACT_HINT = 'Y — WATCH THE PROVEN ROUTE'

// #1656 — does this registry entry advertise WATCH? The controls list carries
// WATCH_HELP for exactly the titles with a proven driver; shared chrome
// (PauseOverlay's WATCH row) gates on the same source of truth.
export const gameHasWatch = (game) =>
  Array.isArray(game?.controls) && game.controls.some((c) => typeof c === 'string' && c.startsWith('Y / WATCH'))

// #1638 — the handoff blip. Rising when the prover takes the wheel, falling
// when it hands the wheel back; one voice in every pilot. playTone is
// lock-safe (silent no-op until the AudioContext exists), so no try/catch.
// The log is what watchcheck drives against: a start that never blipped or a
// declined guide that did is a red check.
const SFX_LOG = []
export const watchSfxLog = () => SFX_LOG.slice()

export const playWatchStart = () => {
  audioController.playTone(660, 0.07, 'square', 0.06)
  audioController.playTone(990, 0.1, 'square', 0.06, 0.07)
  SFX_LOG.push('start')
}

export const playWatchStop = () => {
  audioController.playTone(880, 0.07, 'square', 0.06)
  audioController.playTone(440, 0.12, 'square', 0.06, 0.07)
  SFX_LOG.push('stop')
}
