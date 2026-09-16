/**
 * Transcript sensor — the Zork "eye".
 *
 * It reads what a human reads: the prose. It never touches the Z-machine's
 * memory. That makes it the honest arm (and the one that would still work
 * against a game whose internals we could not inspect), and it gives the A/B
 * something worth measuring, because `sensors/zmachine.js` (stage 7) will hand
 * the SAME `Percept` shape to the SAME brain by reading the object tree instead
 * — deterministically, exactly, and with the same loop and checks.
 *
 * What is confidently parsed, and what is inference:
 *
 *   room        a heading line (Title Case, no full stop) — Zork prints one every
 *               time a new room is entered, which is the classic map-tracker
 *               trick. Inference, so it carries confidence: an "I don't recognise
 *               that word" response is not a room, and the room does NOT change
 *               when the parser merely complains.
 *   dark        "it is pitch black" — hard signal, and the basis of the
 *               never-enter-the-dark-unlit invariant in stage 1.
 *   inventory   the block after "You are carrying:" — only fresh if an INVENTORY
 *               was issued recently, so it carries a decayed confidence.
 *   score       "Your score is N (of 350 points)" — exact when present.
 *   verdict     how the last command was received: taken / refused / blocked /
 *               unclear. A skill that cannot tell whether it worked is a skill
 *               that will walk into a wall for an hour, so this matters more
 *               than it looks.
 *
 * Deliberately NOT parsed here yet: exits (needs a per-verb "you can't go that
 * way" map — stage 1 explorer), weight limit, and the thief.
 */

import { makePercept } from '../../../ai/percept.js'

// "West of House", "North of House", "Kitchen", "The Troll Room",
// "Cellar Below the Trap Door" — but not "Taken.", not "You can't go that way."
const HEADING = /^[A-Z][A-Za-z0-9 ,'’()\-.]{2,42}$/
const NOT_HEADING = /(you|your|it's|it is|i 'm|there'?s|score|with a|suddenly|oh|hello|game|\*\*\*|>)\b|^\s*$|[.!?]$/i

// Commands that can legitimately change (or restate) where we are. This is the
// difference between a map tracker and a confabulator: the prose alone cannot
// tell "A Clearing" (a real Zork room) from "A leaflet" (the title the game
// prints when you READ the leaflet — same shape, same leading article, same
// Title Case). A human resolves it from the command they just typed, so we do
// too. Found by the first run of zorkcheck, which cheerfully mapped a leaflet.
const LOCATING = /^(n|s|e|w|ne|nw|se|sw|nne|sww|u|d|up|down|north|south|east|west|enter|in|inside|out|outside|exit|climb|through|across|follow|go\b|look|l|open|move|untie|board|swim|drive)\b/i

const VERDICTS = [
  ['taken', /^(taken|you have taken|got it|ok|alright|sure|as you take it)/im],
  ['dropped', /^(dropped|put down|you have dropped)/im],
  ['blocked', /(can.?t go that way|way out of the way|don.?t see any|no one here|i don.?t see|not something you can|door is nailed|it is locked|too dark)\b/i],
  ['dark', /pitch black|it.?s dark|can.?t see/i],
  ['dead', /(you have died|you are dead|game over)/i],
  ['score', /score is (\d+)/i],
]

export class TranscriptSensor {
  constructor() {
    this.reset()
  }

  reset() {
    this.lines = []          // every output line ever printed
    this.exchanges = []      // { command, output, verdict, room }
    this.room = null
    this.roomConf = 0
    this.dark = false
    this.dead = false
    this.score = null
    this.maxScore = null
    this.moves = 0
    this.inventory = []
    this.inventoryFreshness = Infinity   // moves since a credible inventory read
    this.lastOutput = ''
    this.lastVerdict = null
  }

  /**
   * Feed one completed exchange. `output` is the raw text the machine printed in
   * reply to `command` (already joined, newlines preserved).
   */
  saw(command, output) {
    const text = String(output || '')
    this.moves++
    this.lines.push(...text.split('\n'))
    this.lastOutput = text

    const heading = this.findHeading(text, command)
    if (heading) {
      this.room = heading
      this.roomConf = 1
    } else if (/pitch black|can'?t see/i.test(text)) {
      this.dark = true
      this.roomConf = Math.max(0, this.roomConf - 0.2)
    } else if (!/score is \d+/i.test(text)) {
      // Complaints do not change where we are; they only make us less sure the
      // last heading we saw is still current after many turns of noise.
      this.dark = /pitch black/i.test(text) ? true : this.dark
      this.roomConf = Math.max(0.4, this.roomConf - 0.02)
    }

    if (this.inventoryFreshness !== Infinity) this.inventoryFreshness++

    const inv = parseInventory(text)
    if (inv) { this.inventory = inv; this.inventoryFreshness = 0 }

    // Zork I: "Your score is 5 (total of 350 points), in 21 moves."
    // Zork II/III word it differently, so the maximum is parsed separately and
    // stays null rather than being guessed at.
    const got = text.match(/score is (\d+)/i)
    const max = text.match(/(?:total of|out of|of)\s+(\d+)\s+points/i)
    if (got) this.score = Number(got[1])
    if (max) this.maxScore = Number(max[1])

    if (/you have died|you are dead|game over/i.test(text)) this.dead = true

    this.lastVerdict = classify(text, heading)
    this.exchanges.push({ command: String(command || ''), output: text, verdict: this.lastVerdict, room: this.room })
    return this.lastVerdict
  }

  /**
   * A room heading is a stand-alone Title Case line, never a sentence — and only
   * when the command we just sent could have moved us (see LOCATING).
   */
  findHeading(text, command = '') {
    if (!LOCATING.test(String(command).trim())) return null
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line || line.startsWith('>')) continue
      if (!HEADING.test(line)) continue
      if (NOT_HEADING.test(line)) continue
      if (/^\d+$/.test(line)) continue
      // A real heading is followed by a description, not by another prompt.
      const next = (lines[i + 1] || '').trim()
      if (next && !next.startsWith('>') && next.length < 12) continue
      return line
    }
    return null
  }

  /** @returns {Percept} */
  percept() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    // Inventory decays: a carry list inferred five turns ago is a guess.
    const invConf = this.inventoryFreshness === Infinity
      ? 0
      : Math.max(0.2, 1 - this.inventoryFreshness * 0.08)
    return makePercept({
      room: this.room,
      inventory: this.inventory.slice(),
      message: { text: this.lastOutput.split('\n').filter(Boolean).pop() || null, conf: 0.9 },
      score: this.score,
      moves: this.moves,
      extra: {
        dark: this.dark,
        dead: this.dead,
        verdict: this.lastVerdict,
        roomConf: this.roomConf,
        inventoryConf: invConf,
        exchanges: this.exchanges.length,
      },
      ts: now,
      sensor: 'transcript',
    })
  }

  /** Progress currency for the loop: score first, room count as a fallback. */
  progress() {
    return this.score !== null ? this.score : 0
  }
}

function parseInventory(text) {
  const m = text.match(/you are carrying:?\n([\s\S]*?)(\n\s*\n|$)/i)
  if (!m) return null
  const items = m[1].split('\n').map(l => l.trim())
    .filter(l => /^(a|an|the|two|some)\s/i.test(l))
    .map(l => l.replace(/^(a|an|the|two|some)\s+/i, ''))
  if (!items.length && !/you are carrying:?$/i.test(text)) return items.length ? items : []
  return items
}

function classify(text, heading) {
  for (const [name, re] of VERDICTS) if (re.test(text)) return name
  // 'moved' is derived from the SAME heading decision the map uses, so the two
  // can never disagree. (It used to have its own regex, which happily matched
  // "You can't go that way." as a move and shadowed `blocked` forever.)
  return heading ? 'moved' : 'ok'
}

export default TranscriptSensor
