/**
 * ZorkExplorer — the stage-1 brain. Finds its way around, keeps a map, and does
 * not die in the dark.
 *
 * It is a ladder, not a planner, and the order is the whole design:
 *
 *   1. LIGHT    If the room is dark and no lamp is lit, this is survival. Zork
 *               kills you in the dark on a timer, so "explore the frontier" must
 *               never outrank "get out of the dark". It tries to light a carried
 *               lamp, then to pick up the lamp or matches it can see, then
 *               retreats the way it came and marks that room dark forever.
 *   2. TAKE     Objects the room's own prose claimed are here (or inside a
 *               container it named). Nothing is taken on faith: if the reply is a
 *               refusal, the map remembers that so it is not asked again.
 *   3. OPEN     Anything the game said is closed or locked, because a closed
 *               container is the only reason "in the trophy case is a lamp" is
 *               interesting.
 *   4. EXPLORE  BFS over the map to the nearest room with a direction never
 *               tried, then try one. This is what makes coverage measurable —
 *               the frontier is real data, so "the agent stopped because it had
 *               seen everything reachable" is a claim the check can confirm.
 *   5. LOOK     A no-op that costs a tick, so a brain with nothing left stops
 *               (loop → `idle`) instead of spinning silently.
 *
 * IT NEVER GUESSES AT THE PARSER. Every command comes from the verb list in
 * skills.js applied to a noun the game itself printed. If it cannot name a thing
 * it wants, it says nothing rather than improvising — and the loop counts a
 * rejected decision loudly rather than letting it dissolve into a different
 * action, which is precisely how the previous King's Quest agent ended up
 * opening a debug wizard.
 *
 * THE MAP IS WALKED, NOT READ. Room identities come from headings the game
 * printed after a move. The story file's own room table is right there inside
 * `ifvms` and is never consulted: a map handed to the agent would test the map,
 * not the agent.
 */

import { ZorkMap, DIRS, SHORT } from './map.js'
import { makeSkills } from './skills.js'

// Things worth a move, in priority order. Stage 2 replaces this list with the
// treasure set; for now the lamp family is the interesting case because it is
// the only object the game will kill you for lacking.
const WANT = ['lamp', 'lantern', 'matches', 'box of matches']

const has = (list, needle) => (list || []).some((x) => {
  const a = String(x).toLowerCase()
  const b = String(needle).toLowerCase()
  return a === b || a.includes(b) || b.includes(a)
})

export class ZorkExplorer {
  /**
   * @param {object} o
   * @param {(cmd:string)=>Promise<string>} o.send     actuator: type it, resolve with the reply
   * @param {import('../sensors/transcript.js').TranscriptSensor} o.sensor
   * @param {(msg:string)=>void} [o.onEvent]
   */
  constructor({ send, sensor, onEvent = null }) {
    if (typeof send !== 'function') throw new Error('ZorkExplorer needs a send(cmd) actuator')
    if (!sensor) throw new Error('ZorkExplorer needs a sensor')
    this.rawSend = send
    this.sensor = sensor
    this.onEvent = onEvent
    this.map = new ZorkMap()
    this.skills = makeSkills(async (cmd) => {
      this.trace.push(cmd)
      return this.rawSend(cmd)
    })
    this.trace = []
    this.pending = null        // the move whose reply we are waiting to classify
    this.asked = null          // the last non-move ask, so a refusal can be blamed on it
    this.refused = new Set()   // "room|verb noun" already declined, so never asked twice
    this.darkRooms = new Set()
    this.report = []           // honest notes: what it wanted and could not get
  }

  say(msg) { if (this.onEvent) this.onEvent(msg) }

  /**
   * Sense, and in the same breath settle the ledger for the previous command.
   * This is the only place the map is written, so a room can never be created by
   * anything except a reply the sensor actually read.
   */
  sense() {
    const p = this.sensor.percept()
    const verdict = p.extra?.verdict || null
    const from = this.map.at
    const move = this.pending

    if (move) {
      this.pending = null
      let key
      // Fingerprint FIRST: it is what room identity is decided on, so it has to
      // be in hand before the map is asked which room this is.
      const fp = this.map.fingerprint(this.sensor.lastOutput)
      if (move.kind === 'move') {
        // Identity is decided by the ENTRY, not by the name alone: Zork has two
        // rooms headed "Forest", and merging them is what made the first explorer
        // walk forever toward a direction its wrong twin had.
        if (verdict === 'moved' && p.room) key = this.map.keyFor(p.room, from, move.dir, fp)
        else if (verdict === 'moved') key = this.map.keyFor(null)   // moved, nameless
        else key = from                                               // refused: still here
      } else {
        key = from
        // REMEMBER THE NO. The first version re-asked the same question forever
        // — it opened the mailbox three times in a row, each time hearing "The
        // mailbox is already open", because refusals were only recorded if a host
        // happened to call noteRefusal(), and no host did. A game will refuse the
        // same request politely and infinitely; an agent without a memory of
        // refusals cannot tell that from progress.
        if (this.asked) {
          // DON'T ASK TWICE WITHOUT NEW INFORMATION.
          //
          // The first rule here was a regex of refusals — "already", "can't",
          // "impossible". It worked until the game said "Have your eyes checked."
          // in reply to opening an already-open window: not a word in the list, so
          // the agent opened it again, was insulted again, and did that eleven
          // times. You cannot enumerate a text adventure's sarcasm.
          //
          // So stop reading the reply as a verdict and read it as an outcome: if
          // the ask changed nothing we can PERCEIVE — carry list, visible objects,
          // known contents — then it has no further use, whatever the prose said.
          // Phrasing is infinite; state is finite.
          const now = this.snap(p)
          const no = /already|won'?t|can'?t|don'?t see|impossible|no way|but how/i.test(this.sensor.lastOutput || '')
          const inert = now === this.asked.snap
          if (no || verdict === 'blocked' || inert) {
            const a = this.asked
            this.refused.add(`${from}|${a.skill} ${a.args?.what ?? ''}`.trim())
            this.say(`refused${inert ? ' (nothing changed)' : ''}: ${a.skill} ${a.args?.what || ''} in ${from}`)
          }
          this.asked = null
        }
      }
      if (key) {
        if (verdict === 'moved' && fp) this.map.lastFingerprint = fp
        this.map.observe({
          key,
          from,
          fp,
          dir: move.kind === 'move' ? move.dir : null,
          dark: !!p.extra?.dark && !p.extra?.lit,
          visible: p.extra?.visible || [],
          contains: p.extra?.contains || {},
          announced: p.extra?.announced || [],
          darkExits: p.extra?.darkExits || [],
        })
        // A split is the map admitting it had merged two rooms. Adopt the new
        // key, and SAY SO: an unexplained split leaves the reader with 17 rooms
        // and no idea that one of them used to be two, which is how a wrong map
        // passes for a busy one.
        if ((this.map.splits || 0) > (this.splitsSeen || 0)) {
          this.splitsSeen = this.map.splits
          this.report.push(`split a merged room after the game refused a way the map swore was open (${key}) — Zork reuses room names, and two rooms were wearing one`)
          this.say(`split: ${key} was two rooms`)
        }
        if (this.map.splitsTo && this.map.splitsTo !== key) {
          key = this.map.splitsTo
          this.map.splitsTo = null
        }
        if (p.extra?.dark && !p.extra?.lit) {
          this.darkRooms.add(key)
          this.say(`dark: ${key} — will not re-enter unlit`)
        }
      }
      if (verdict === 'blocked' && move.kind === 'move') {
        this.say(`blocked: ${move.dir} from ${from}`)
      }
    } else if (from || p.room) {
      // No move pending: refresh what the current room claims. On the very first
      // tick there is no `from` at all, and the room the sensor is already
      // reading becomes the origin of the map — adopted, not assumed, because
      // the sensor did print a heading for it.
      this.map.observe({
        key: from || this.map.keyFor(p.room),
        from,
        dir: null,
        dark: !!p.extra?.dark && !p.extra?.lit,
        visible: p.extra?.visible || [],
        contains: p.extra?.contains || {},
        announced: p.extra?.announced || [],
        darkExits: p.extra?.darkExits || [],
      })
    }

    return p
  }

  /**
   * What the agent can perceive, as a string cheap enough to compare every tick.
   * Deliberately NOT the room name or the score: an ask that moves us to a new
   * room is obviously not inert, and score already has its own progress channel.
   * This is the narrow question "did doing that change what I know about
   * things?" — which is the only question an `open`/`take` can answer.
   */
  snap(p) {
    return [
      (p.inventory || []).slice().sort().join(','),
      (p.extra?.visible || []).slice().sort().join(','),
      Object.keys(p.extra?.contains || {}).sort().join(','),
    ].join('|')
  }

  progress(p) {
    // Rooms discovered is the currency: it can only go up by walking somewhere
    // new, so the watchdog is measuring exploration, not luck. Score is added so
    // a treasure grab also reads as progress the moment stage 2 lands.
    return this.map.visitedCount * 10 + (Number(p.score) || 0)
  }

  /** The ladder. Returns {skill,args} or null (loop counts it as idle). */
  step(p) {
    const here = this.map.at ? this.map.rooms.get(this.map.at) : null
    const dark = !!p.extra?.dark && !p.extra?.lit
    const carrying = p.inventory || []

    if (dark) return this.survive(p, here, carrying)

    // 2. take what this room's prose said is here, if we want it, are not
    //    carrying it, and have not already been told no about it.
    for (const item of this.desired(p, here, carrying)) {
      const id = `${this.map.at}|take ${item}`
      if (this.refused.has(id)) continue
      this.pending = { kind: 'other' }
      this.asked = { skill: 'take', args: { what: item }, snap: this.snap(p) }
      return { skill: 'take', args: { what: item } }
    }

    // 3. open what the game told us is shut — a closed container is a wall
    //    around the object we came for.
    for (const host of this.closable(p, here)) {
      const id = `${this.map.at}|open ${host}`
      if (this.refused.has(id)) continue
      this.pending = { kind: 'other' }
      this.asked = { skill: 'open', args: { what: host }, snap: this.snap(p) }
      // MUST return. Rule 3 and 3b were written, commented, and shipped setting
      // `pending`/`asked` and then FALLING THROUGH to the frontier — so they
      // could never act, and the run still "proved" it had opened the window
      // because the scripted warm-up three functions above had already opened it.
      // A rule that cannot fire is invisible in a passing suite.
      return { skill: 'open', args: { what: host } }
    }

    // 3b. a refused way out usually has a thing in front of it. If this room was
    //     described with an openable noun and some direction is closed, ask the
    //     game to open it — derived from the prose plus the refusal, not from a
    //     walkthrough: the agent has no idea there is a Kitchen behind the
    //     window, only that the game mentioned a window and said no to west.
    for (const thing of this.openables(p, here)) {
      const id = `${this.map.at}|open ${thing}`
      if (this.refused.has(id)) continue
      this.pending = { kind: 'other' }
      this.asked = { skill: 'open', args: { what: thing }, snap: this.snap(p) }
      return { skill: 'open', args: { what: thing } }
    }

    // 3c. test the assumptions. Every `back the way you came` in the map is an
    //     unverified guess, and Zork punishes guessing gently but persistently:
    //     the way back is not always the way you came.
    for (const dir of this.map.unverified(this.map.at)) {
      // Never test an assumption by walking into a room we know is dark.
      const guess = this.map.rooms.get(this.map.at)?.exits[dir]?.to
      if (this.wouldEnterDark(guess, p)) continue
      this.pending = { kind: 'move', dir, from: this.map.at }
      return { skill: 'go', args: { dir: SHORT[dir] || dir } }
    }

    // 4. the frontier — preferring ground the map can actually hold still.
    const stable = this.map.nearestFrontier({ avoidUnstable: true })
    const target = stable || this.map.nearestFrontier()
    if (target && !stable && !this.reportedShifty) {
      // Nothing is left except more forest, and the forest is where the map broke.
      // Zork ANNOTATES this ("the clearing spins in the forest, and when it stops,
      // you are somewhere different") — the territory moves, so a fixed graph of
      // it is a fiction, and every "new" room we invent there is the same room
      // wearing a new number. Saying so and stopping is the honest move; the
      // alternative is an agent with 30 rooms on its map that has walked four
      // rooms in a circle.
      this.reportedShifty = true
      this.report.push(`the remaining frontier is only in the shifting forest (${this.map.unstable ? [...this.map.unstable].join(', ') : 'unstable ground'}), which a static map cannot hold; stopping here rather than inventing rooms`)
      this.say('shifting ground: refusing to invent more rooms')
      return null
    }
    if (target) {
      const dir = target.path.length ? target.path[0] : this.map.untried(target.room)[0]
      if (dir && this.wouldEnterDark(target.room)) {
        // A first step into a room we recorded as dark, with no light. Survival
        // outranks curiosity, so try a different branch; if every branch is dark,
        // stop and say so instead of rolling the dice on the grue.
        const alt = this.alternative(p, carrying)
        if (alt) return alt
        if (!this.reportedDark) {
          this.reportedDark = true
          this.report.push(`every remaining route leads into the dark and no lamp is in reach (carried: ${carrying.join(', ') || 'nothing'})`)
          this.say('blocked by darkness; stopping rather than guessing')
        }
        return null
      }
      this.pending = { kind: 'move', dir, from: this.map.at }
      return { skill: 'go', args: { dir: SHORT[dir] || dir } }
    }

    // 5. nothing left that we know how to want.
    if (!this.reportedEmpty) {
      this.reportedEmpty = true
      this.report.push('frontier exhausted with the map it built')
      this.say('no frontier left; stopping rather than wandering')
    }
    return null
  }

  wouldEnterDark(roomKey) {
    const room = this.map.rooms.get(roomKey)
    return !!(room && room.dark)
  }

  /** Survival: light, acquire light, or back out. Order is the whole point. */
  survive(p, here, carrying) {
    const lit = !!p.extra?.lit
    if (lit) return null
    const lamp = carrying.find((x) => /lamp|lantern/.test(x))
    const matches = carrying.find((x) => /match/.test(x))
    const visible = (here && [...here.visible]) || []

    if (lamp && matches) {
      this.pending = { kind: 'other' }
      this.asked = { skill: 'light', args: { what: lamp } }
    }
    // The lamp might be IN HAND and the matches in the room, or vice versa.
    const wantHere = visible.find((v) => /lamp|lantern/.test(v))
    if (!lamp && wantHere) {
      this.pending = { kind: 'other' }
      return { skill: 'take', args: { what: wantHere } }
    }
    const matchesHere = visible.find((v) => /match/.test(v))
    if (!matches && matchesHere) {
      this.pending = { kind: 'other' }
      return { skill: 'take', args: { what: matchesHere } }
    }
    // Can't see anything (it is dark) and can't light anything: leave, and
    // remember this room as off-limits until there is a light.
    const back = this.lastDirBack()
    if (back) {
      this.pending = { kind: 'move', dir: back.dir, from: this.map.at }
      this.report.push(`retreated from dark ${this.map.at} without light`)
      this.say(`retreating ${back.dir} from the dark`)
      return { skill: 'go', args: { dir: SHORT[back.dir] || back.dir } }
    }
    return null
  }

  /** A non-dark move to try instead of walking into a known-dark room. */
  alternative(p, carrying) {
    const want = ['lamp', 'lantern', 'matches'].find((w) => !has(carrying, w))
    if (!want) return null
    const target = this.map.nearestFrontier()
    if (!target) return null
    const dir = target.path.length ? target.path[0] : this.map.untried(target.room)[0]
    if (!dir || this.wouldEnterDark(target.room, dir)) return null
    this.pending = { kind: 'move', dir, from: this.map.at }
    return { skill: 'go', args: { dir: SHORT[dir] || dir } }
  }

  /** The direction we last arrived from, so we can back out. */
  lastDirBack() {
    if (!this.map.at) return null
    const room = this.map.rooms.get(this.map.at)
    if (!room) return null
    for (const [dir, e] of Object.entries(room.exits)) {
      if (e.to && e.type !== 'blocked' && e.to !== this.map.at) return { dir }
    }
    return null
  }

  /** Objects worth a move that this room's own prose put here (or inside it). */
  desired(p, here, carrying) {
    if (!here) return []
    const listed = [...here.visible, ...Object.values(here.contains || {}).flat()]
    const want = []
    for (const item of listed) {
      if (!item || want.includes(item)) continue
      if (!WANT.some((w) => has([item], w))) continue
      if (has(carrying, item)) continue
      want.push(item)
    }
    return want
  }

  /**
   * Openable nouns the game itself named here, when at least one way out of the
   * room is closed. Without the second half of that test the agent would open
   * every door in the game before walking anywhere; with it, opening is a
   * response to an obstacle rather than a tic.
   */
  openables(p, here) {
    if (!here) return []
    const blockedAny = Object.values(here.exits).some((e) => e.type === 'blocked')
    if (!blockedAny) return []
    const named = [...(p.extra?.visible || []), ...here.visible]
      .filter((v) => /(window|door|case|trap|lid|chest|box|bag|sack|cushion|manhole|gate|hatch)/i.test(v))
    return named.filter((v) => {
      const tried = Object.entries(here.exits).filter(([, e]) => e.type === 'blocked')
      return tried.length > 0 && !this.refused.has(`${this.map.at}|open ${v}`)
    })
  }

  /** Closed/locked things that are both here and known to hold something we want. */
  closable(p, here) {
    if (!here) return []
    const shut = new Set(p.extra?.closed || [])
    const out = []
    for (const host of Object.keys(here.contains || {})) {
      const holds = here.contains[host] || []
      const wanted = WANT.some((w) => has(holds, w))
      const stillCarried = wanted && holds.some((h) => has(carryingOf(p), h))
      if (wanted && !stillCarried && (!shut.size || shut.has(host)) && !out.includes(host)) out.push(host)
    }
    return out
  }

  /**
   * The loop's watchdog calls this when progress stops. Two tries, then silence
   * so the loop can stop WITH A REASON: an agent that quietly resets its own
   * watchdog turns a dead end into an infinite walk, which is worse than
   * stopping and saying why.
   */
  recover(p) {
    if ((this.recovers = (this.recovers || 0) + 1) > 2) return null
    if (p.extra?.dark && !p.extra?.lit) {
      const back = this.lastDirBack()
      if (back) {
        this.pending = { kind: 'move', dir: back.dir, from: this.map.at }
        return { skill: 'go', args: { dir: SHORT[back.dir] || back.dir } }
      }
    }
    // Stuck in the light: re-read the room. A `look` is how a stuck player
    // notices the door they walked past, and it never lies about anything.
    this.pending = { kind: 'other' }
    return { skill: 'look', args: {} }
  }

  /** Called by the host when the loop records a refusal, so we stop asking. */
  noteRefusal(skill, args) {
    this.refused.add(`${this.map.at}|${skill} ${args?.what ?? args?.dir ?? ''}`.trim())
  }

  diagnose(p) {
    const s = this.map.stats()
    return `rooms=${s.rooms} frontier=${this.map.nearestFrontier() ? 'yes' : 'empty'} dark=${s.darkRooms} carried=${(p.inventory || []).join(',') || 'nothing'}`
  }

  summary() {
    return {
      rooms: [...this.map.rooms.keys()],
      stats: this.map.stats(),
      trace: this.trace.slice(),
      dark: [...this.darkRooms],
      report: this.report.slice(),
      carrying: this.sensor.inventory.slice(),
    }
  }
}

function carryingOf(p) { return (p && p.inventory) || [] }

export default ZorkExplorer
