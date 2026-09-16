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
  // The refusals a player would recognise. Note `becomes impenetrable` — the
  // game declining a direction in the third person, without ever saying "you
  // can't", which is the reply that made the first explorer repeat itself until
  // the watchdog caught it. The map no longer depends on this list (an asked
  // direction that produced no arrival is closed regardless), but the verdict is
  // still what the diary and the HUD show, so it must not lie.
  ['blocked', /(can.?t go that way|way out of the way|don.?t see any|no one here|i don.?t see|not something you can|door is nailed|it is locked|too dark|impenetrable|the way is blocked|get there from here|no way to go)\b/i],
  ['dark', /pitch black|it.?s dark|can.?t see/i],
  ['dead', /(you have died|you are dead|game over)/i],
  ['score', /score is (\d+)/i],
]

export class TranscriptSensor {
  constructor() {
    this.reset()
  }

  /** Nouns the game described as openable, so `open X` is a word we may use. */
  get openables() {
    return this.visible.filter((v) => /(window|door|case|trap|lid|chest|box|bag|sack|cushion|manhole|gate|hatch)/i.test(v))
  }

  reset() {
    this.lines = []          // every output line ever printed
    this.exchanges = []      // { command, output, verdict, room }
    this.room = null
    // What the CURRENT room says is here, parsed out of its description, and
    // what containers the description says are inside it. The stage-1 explorer
    // cannot decide to `take lamp` or `open case` without these, and the prose
    // is the only source the transcript arm is allowed to use.
    this.visible = []
    this.contains = {}       // container -> [contents]
    this.closed = []         // things described as closed/locked
    // Ways OUT that the description mentions, and the ones it says are DARK.
    // These are CLAIMS, not edges: the map does not grow from them, because a
    // description that says "a passage leads west" is not evidence that west
    // works (the Kitchen says exactly that, and west from the Kitchen is a
    // chimney you can only climb with a lamp in hand). They are kept so the
    // brain can have a REASON to want a lamp while it is still in the light —
    // see the Kitchen comment in map.js. Stage 1 could only react to darkness by
    // standing in it.
    this.announced = []
    this.darkExits = []
    this.lit = false
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

    // DARK IS NOT STICKY. The first version set `dark = true` and only ever set
    // it true, so one pitch-black room convinced the model the entire underground
    // empire was permanently dark — and the stage-1 explorer, correctly obeying
    // the "never enter the dark unlit" rule, refused to move again and filed the
    // whole game as unnavigable. A sensor that lies in the safe direction is
    // still lying; it just fails quietly and looks cautious.
    //
    // So darkness is re-decided from the CURRENT reply: a new heading carries
    // that room's own light, "the lamp is on" clears it, and a description with
    // objects in it cannot be dark by construction.
    // "It is too dark to see" is how Zork writes it, and `it'?s` does not match
    // "it is" — so until now that sentence was not darkness at all to this sensor.
    // Found by writing a probe to catch a mutation and having the mutant survive:
    // the test was not weak, the fixture never entered the branch.
    const saysDark = /\bpitch black\b|\bit(?:'?s| is)?\s+(?:too|very|so|rather)?\s*dark|\btoo dark to\b|can'?t see a thing/i.test(text)
    if (/the (lamp|lantern|torch) is (on|lit)/i.test(text)) this.lit = true
    if (/the (lamp|lantern|torch) is (off|out)/i.test(text)) this.lit = false
    if (heading) this.dark = saysDark && !this.lit
    else if (saysDark) this.dark = !this.lit
    else if (this.lit) this.dark = false

    if (heading) {
      this.room = heading
      this.roomConf = 1
    } else if (saysDark) {
      this.roomConf = Math.max(0, this.roomConf - 0.2)
    } else if (!/score is \d+/i.test(text)) {
      // Complaints do not change where we are; they only make us less sure the
      // last heading we saw is still current after many turns of noise.
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

    // Room furniture and contents, refreshed only when a description was
    // actually printed (a `take` reply must not erase the room's contents).
    if (heading) {
      // A new room starts with an empty floor. The first version only ever
      // REPLACED the list when the new description yielded something, so the
      // mailbox from West of House haunted every room in the underground empire
      // and the explorer kept trying to take a mailbox that was not there.
      // Stale-by-default is the failure mode of any "remember what you saw"
      // field that is not cleared on the transition that invalidates it.
      this.visible = []
      this.closed = []
      this.announced = []
      this.darkExits = []
    }
    if (heading || /you see|there (is|are)|in the |on the |hanging|mounted/i.test(text)) {
      const seen = parseVisible(text)
      if (seen.length) this.visible = [...new Set([...this.visible, ...seen])]
      const cont = parseContains(text)
      if (Object.keys(cont).length) this.contains = { ...this.contains, ...cont }
      const shut = parseClosed(text)
      if (shut.length) this.closed = [...new Set([...this.closed, ...shut])]
      const ways = parseExits(text)
      if (ways.all.length) this.announced = [...new Set([...this.announced, ...ways.all])]
      if (ways.dark.length) this.darkExits = [...new Set([...this.darkExits, ...ways.dark])]
    }
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
        lit: this.lit,
        dead: this.dead,
        verdict: this.lastVerdict,
        roomConf: this.roomConf,
        inventoryConf: invConf,
        // Copies, always copies: a brain that held a reference to the sensor's
        // own arrays would silently watch them change under it, and every
        // `seen before?` test downstream would answer for the FUTURE instead of
        // the moment the decision was made.
        visible: this.visible.slice(),
        contains: Object.fromEntries(Object.entries(this.contains).map(([k, v]) => [k, v.slice()])),
        closed: this.closed.slice(),
        // Candidate ways out of here, and the subset the prose called dark.
        // Never a substitute for a walked edge — see `announced` in reset().
        announced: this.announced.slice(),
        darkExits: this.darkExits.slice(),
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

/**
 * Objects a room description claims are here.
 *
 * "There is a lamp here" is the easy case, and for a while it was the only case.
 * Zork rarely writes it. Its Kitchen says "A bottle IS SITTING ON the table" and
 * "On the table is an elongated brown sack", and a sensor that understands only
 * "there is" stands in that room reporting NOTHING VISIBLE — which is worse than
 * wrong, because it is wrong in the direction that looks like an empty room, so
 * the agent stops looking for things to take and never forms the goal that
 * eventually leads it underground. Measured: the Kitchen returned `visible: []`
 * with a bottle, a sack and a cake in it.
 */
function parseVisible(text) {
  const out = new Set()
  const clean = (raw) => String(raw || '').trim()
    .replace(/^(a|an|some|two|the)\s+/i, '')
    .replace(/\s+(here|there|inside|nearby)$/i, '')
    .replace(/\s+that .*$/i, '')
    .replace(/\s+which\b.*$/i, '')
    .trim()

  const re = /(?:there (?:is|are)|you (?:see|notice)|here (?:is|are))\s+((?:a|an|some|two|the)\s+[a-z][a-z' -]{1,34}?)(?:\.|;|,|$)/gi
  let m
  while ((m = re.exec(text))) {
    const item = clean(m[1])
    if (item.length > 2) out.add(item)
  }

  // "A bottle is sitting on the table", "A homemade cake is dying slowly on the
  // peg", "A sword hangs on the wall". The verb is what makes this a statement
  // about furniture rather than about us ("you are holding the bottle").
  const furniture = /(?:^|[.\n])\s*((?:a|an|some|the)\s+[a-z][a-z' -]{1,30}?)\s+(?:is|are)\s+(?:sitting|lying|resting|leaning|hanging|stuck|piled|placed|propped|sleeping|dying|embedded|half[- ]buried|bolted|fastened)\b/gi
  while ((m = furniture.exec(text))) {
    const item = clean(m[1])
    if (item.length > 2) out.add(item)
  }

  // The inverted form Zork actually prefers: "On the table is an elongated
  // brown sack", "In the corner is a crude portrait".
  const inverted = /(?:^|[.\n])\s*(?:on|in|beside|behind|under|atop|before|from)\s+(?:the|a)\s+[a-z][a-z' -]{1,24}?\s+(?:is|are)\s+((?:a|an|some|the)\s+[a-z][a-z' -]{1,30})/gi
  while ((m = inverted.exec(text))) {
    const item = clean(m[1])
    if (item.length > 2) out.add(item)
  }

  // "A trap door is in the floor" / "There's a sword here" (contracted verb)
  const re2 = /(?:there's|there are)\s+((?:a|an|some)\s+[a-z][a-z' -]{1,34})/gi
  while ((m = re2.exec(text))) out.add(clean(m[1]))
  return [...out]
}

/**
 * Ways the description says lead somewhere, and the ones it says are DARK.
 *
 * The Kitchen: "A passage leads to the west and **a dark staircase** can be seen
 * **leading upward**. **A dark chimney leads down** and to the east is a small
 * window which is open." Four ways out, two of them labelled dark in the same
 * breath. That label is the game telling us, before we move, that somewhere in
 * this graph is ground we cannot walk yet — the only warning any text parser
 * gives, and the difference between an agent that seeks a lamp and one that
 * discovers it needs one while a grue is eating it.
 *
 * Split by clause, not by sentence: the Kitchen's first sentence carries one
 * safe way and one dark way, and attributing "dark" to the sentence would make
 * west look deadly.
 */
function parseExits(text) {
  const all = new Set()
  const dark = new Set()
  const DIR = 'north|northeast|northwest|south|southeast|southwest|east|west|upward|downward|up|down'
  // ", and" is a clause separator here, not a conjunction inside a noun phrase —
  // that is what lets "a dark chimney leads down AND to the east is a window"
  // attribute darkness to the chimney alone.
  for (const clause of String(text).split(/[.;]|,?\s+and\s+/i)) {
    const m = clause.match(new RegExp(`(?:lead(?:s|ing)?|run(?:s|ning)?|go(?:es|ing)?| descend| open(?:s)? into| continue)\\s+(?:to\\s+the\\s+|toward\\s+the\\s+|up\\s+|down\\s+|straight\\s+)?(${DIR})\\b`, 'i'))
      || clause.match(new RegExp(`to\\s+the\\s+(${DIR})\\b[^.]{0,24}?\\b(?:is|are)\\b`, 'i'))
    if (!m) continue
    const dir = /^(upward|up)$/.test(m[1]) ? 'up' : /^(downward|down)$/.test(m[1]) ? 'down' : m[1].toLowerCase()
    all.add(dir)
    if (/\b(dark|black|lightless)\b/i.test(clause)) dark.add(dir)
  }
  return { all: [...all], dark: [...dark] }
}

/** "In the trophy case is a lamp and a bottle." -> { 'trophy case': [...] } */
function parseContains(text) {
  const out = {}
  const re = /in the ([a-z][a-z' -]{1,28}?) (?:is|are) ((?:a|an|some|the)\s+[a-z][a-z' &,()-]{1,80}?)(?:\.|$)/gi
  let m
  while ((m = re.exec(text))) {
    const host = m[1].trim()
    const items = m[2].split(/\s*(?:,|and)\s*/i)
      .map(x => x.trim().replace(/^(a|an|some|the)\s+/i, '')).filter(x => x.length > 2)
    if (host && items.length) out[host] = [...new Set([...(out[host] || []), ...items])]
  }
  // "The glass bottle contains:" followed by an indented list — the Kitchen's
  // water, the sack's lunch, the egg's jewels. All of it was invisible.
  const colon = /(?:the|a)\s+([a-z][a-z' -]{1,28}?)\s+contains:?\s*\n?\s*([^\n]+)/gi
  while ((m = colon.exec(text))) {
    const host = m[1].trim()
    const items = m[2].split(/\s*(?:,|and)\s*/i)
      .map(x => x.trim().replace(/^(a|an|some|the)\s+/i, '')).filter(x => x.length > 2)
    if (host && items.length) out[host] = [...new Set([...(out[host] || []), ...items])]
  }
  return out
}

/** Things the game has told us are shut or locked, so `open` is a real option. */
function parseClosed(text) {
  const out = []
  const re = /(?:^|\n)\s*(?:the |a )?([a-z][a-z' -]{2,28}?) (?:is|are) (?:closed|locked|shut)\b/gi
  let m
  while ((m = re.exec(text))) out.push(m[1].trim())
  return [...new Set(out)]
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
