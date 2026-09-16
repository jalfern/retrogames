/**
 * ZorkMap — a world model built only from walking.
 *
 * NOT the story file's graph. The parser will accept any direction word, so a
 * brain could cheat here: read the Z-machine's door table and walk a perfect
 * route. That would make the check worthless, because the thing under test is
 * whether an agent can *find its way*, not whether we can. So this map knows a
 * room only after the sensor reported a heading, and knows an exit only after a
 * command was actually sent and the prose said what happened.
 *
 * EDGES ARE TYPED, and the types are the interesting part:
 *
 *   proven   we walked it and the game printed a new room heading.
 *   blocked  we walked it and the game complained ("you can't go that way").
 *            Never retried, which is what makes "no dead-end retried" a
 *            provable property instead of a hope.
 *   assumed  the reverse of a proven edge. Zork passages are mostly two-way,
 *            but "mostly" is not a fact about this game — the trap door and the
 *            upstairs passage are not. So a reverse edge is a *hypothesis* the
 *            planner may try, at a cost of exactly one failed move, and it is
 *            demoted to `blocked` the moment the prose says no.
 *
 * A second honesty rule lives in `keyFor`: rooms are keyed by the heading the
 * game printed. If a room is ever entered with no heading (dark, or a passage
 * that never names itself), it gets a UNIQUE provisional key and is never
 * merged with a same-looking room elsewhere. Aliasing two rooms into one is the
 * bug that silently deletes every frontier behind the merge — the map looks
 * finished and half of it is fiction. Re-walking costs one move.
 */

export const DIRS = ['north', 'south', 'east', 'west', 'up', 'down']

const OPPOSITE = {
  north: 'south', south: 'north', east: 'west', west: 'east',
  up: 'down', down: 'up',
}

export const opposite = (dir) => OPPOSITE[dir] || null

/** The four short forms the parser answers to, so traces read like a player's. */
export const SHORT = { north: 'n', south: 's', east: 'e', west: 'w', up: 'u', down: 'd' }

export class ZorkMap {
  /** How many same-named rooms we will believe before calling the area shifty. */
  static MAX_TWINS = 4

  constructor() {
    this.unstable = new Set()
    this.lastFingerprint = null
    this.rooms = new Map()
    this.at = null
    this.order = []          // the actual walk, newest last
    this.provisional = 0
  }

  /**
   * Which node are we standing in? THE question, and the one that broke the
   * first explorer.
   *
   * Zork reuses room names. Two different rooms in Zork I are both headed
   * "Forest" (and two more are "Forest Path"), and they have different exits. The
   * classic map tracker keys on the heading, merges them, inherits an exit from
   * the wrong twin — and then stands in one room walking toward a direction the
   * other room had, forever, while its map insists the way is open. The trace
   * looked like stubbornness; the map looked valid. It was neither: it was two
   * rooms wearing one name.
   *
   * So a heading is a CANDIDATE, never an identity. Arrival is accepted into an
   * existing node only when the entry is *consistent* with what that node
   * already knows — and if a move is ever refused on an edge the map had marked
   * proven, the node we are in is re-keyed as a fresh room (`observe` does the
   * split, because that contradiction is proof positive of a bad merge).
   *
   * @param {string} heading  what the game printed
   * @param {string|null} from  the room we came from (null = first sighting)
   * @param {string|null} dir   the direction we walked to get here
   */
  keyFor(heading, from = null, dir = null, fp = null) {
    const base = (heading || '').trim()
    if (!base || base.length < 2) {
      this.provisional++
      return `#anon-${this.provisional}`
    }
    if (!from || !dir) return this.claim(base, null)

    const rev = opposite(dir)
    const twins = [...this.rooms.values()].filter((r) => r.base === base)
    // A paragraph match settles identity outright, before any exit reasoning.
    // NB `fp` is passed IN. When it lived on the map as `lastFingerprint` the
    // explorer wrote it only after calling keyFor, so every arrival was matched
    // against the PREVIOUS room's paragraph — no two sightings ever agreed, and
    // walking back to North of House produced `North of House#2`. Identity that
    // is read a beat late is identity that is read wrong.
    if (fp) for (const twin of twins) if (twin.fp === fp) return twin.key
    const rejected = []
    for (const twin of twins) {
      const known = twin.exits[rev]
      // The way back we would expect to exist either is untried (no evidence
      // against) or already leads to where we came from (positive evidence).
      //
      // A BLOCKED reverse with nowhere on the other end is NOT evidence of a
      // different room, and treating it that way was what put `North of House#2`
      // and `Behind House#2` on the map — rooms Zork has exactly one of. Read the
      // twin log this replaced: every false twin said `rejected X: south=null
      // (blocked)`. `blocked, to=null` means only "we once asked that way and were
      // refused", and Zork refuses for TRANSIENT reasons — storm-tossed trees,
      // "the forest becomes impenetrable to the north". Now the game has just
      // carried us along that same bearing in reverse, which is direct evidence
      // the refusal was weather, not geography. Contradicting a refusal is fine
      // when there is proof behind it; `null` is not proof, it is a memory of a
      // no. The twins that survive are the ones refused against a PROVEN exit
      // (`Clearing: south=Forest(proven)`), and those are real double-bookings.
      // TRIED AND REVERTED (attempt 3). `|| (known && known.type === 'blocked' &&
      // !known.to)` here removed every false twin — `North of House#2`,
      // `Behind House#2`, all gone, twin log empty — and coverage FELL from 13
      // rooms to 7, because those twins were the frontier. That is the real
      // finding: the walk has been surviving on fabricated ground. A wrong map is
      // not merely untidy, it is load-bearing fuel, and deleting the wrongness
      // without giving the planner honest ground to chew makes it quit sooner.
      // So identity stays as shipped, and the next change belongs to the planner,
      // not the map: when the honest frontier is empty, standing still is not the
      // answer — backtrack to a room with untried bearings and walk one.
      const agrees = !known || (known.to === from && known.type !== 'blocked')
      // NOTE what is NOT done here: the refusal is kept. Identity and routing are
      // two different questions and the first version of this fix answered both by
      // deleting the blocked record, which merged correctly and then re-offered a
      // bearing that really is closed (south from North of House does NOT lead to
      // Behind House — north from Behind House is a one-way asymmetry in this
      // game), so the walk spent its budget re-knocking and mapped 7 rooms instead
      // of 13. "We were refused that way once" is weak evidence about WHICH ROOM
      // this is, and good evidence about whether to walk it again.
      if (agrees) return this.claim(base, twin.key)
      rejected.push(`${twin.key}: ${rev}=${known.to}(${known.type})`)
    }
    // Every same-named room disagrees with this arrival: it is a different room
    // wearing the same name.
    //
    // RECORD WHY. Two hypotheses about what creates false twins (path anchoring,
    // then fingerprint churn) have already been built and falsified by
    // measurement, so the next fix has to come with the arrival that produced the
    // twin, the direction walked, and the exit that contradicted it — printed, not
    // remembered. `North of House#2` and `Behind House#2` are rooms Zork has
    // exactly ONE of, so each of these lines is a bug with its name on it.
    this.twinReasons = this.twinReasons || []
    if (twins.length && this.twinReasons.length < 24) {
      this.twinReasons.push({ base, from, dir, rev, rejected })
    }
    return this.claim(base, null)
  }

  /**
   * `base` is the heading; `key` is `base` for the first, `base#2` for twins.
   *
   * The cap is honesty, not tidiness. Zork's forest MOVES ("the clearing spins
   * in the forest, and when it stops, you are somewhere different"), so a
   * deterministic map of it is not available, and an uncapped twin counter will
   * happily invent room after room while the agent walks in circles calling each
   * one new. Past the cap the map says "this neighbourhood is unstable", marks
   * the way in as `shifty`, and the planner stops pruning new frontier from it —
   * reporting the limit instead of pretending to have finished.
   */
  claim(base, reuse) {
    if (reuse) return reuse
    if (!this.rooms.has(base)) return base
    let n = 2
    while (this.rooms.has(`${base}#${n}`)) n++
    if (n > ZorkMap.MAX_TWINS) {
      this.unstable.add(base)
      return `${base}#${ZorkMap.MAX_TWINS}`
    }
    return `${base}#${n}`
  }

  /**
   * A room's identity is its DESCRIPTION.
   *
   * Heading-only keys merged two different rooms named "Forest"; that was bad
   * enough to make the explorer walk forever toward a direction its wrong twin
   * had. Description fingerprints are the answer, because Zork writes a unique
   * paragraph per room — and crucially, the rotating Clearing keeps its text
   * while the world moves underneath it, which is exactly when a name lies and a
   * paragraph does not.
   *
   * The fingerprint is the first real sentence of the room's own description,
   * normalised. Never the heading (that is the label), never the exit list
   * (exits are what we are trying to learn).
   */
  fingerprint(text) {
    if (!text) return null
    const clean = String(text).replace(/\s+/g, ' ').trim()
    if (!clean) return null
    // Drop the heading if the reply led with it, then take the first sentence.
    const m = clean.match(/(?:[.!?]["']?\s+|^)([A-Z][^.!?]{12,}?[.!?])/)
    const core = (m ? m[1] : clean).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().slice(0, 120)
    return core.length > 11 ? core : null
  }

  findByFingerprint(fp) {
    if (!fp) return null
    for (const r of this.rooms.values()) if (r.fp === fp) return r.key
    return null
  }

  ensure(key) {
    if (!this.rooms.has(key)) {
      this.rooms.set(key, {
        key,
        visits: 0,
        fp: null,
        base: key.split('#')[0],
        heading: key.split('#')[0],
        exits: {},          // dir -> { to, type }
        dark: false,
        visible: new Set(),
        contains: {},
        announced: new Set(),   // prose claims about ways out (never edges)
        darkWays: new Set(),    // the subset the prose called dark
        facts: [],          // raw prose the room was described with (debug aid)
      })
    }
    return this.rooms.get(key)
  }

  /**
   * Called after every command, with what the sensor now believes.
   * @param {object} o  { key, from, dir, dark, visible, contains, announced, darkExits }
   */
  observe({ key, from, dir, dark = false, visible = [], contains = {}, announced = [], darkExits = [], fp = null }) {
    const base = key.split('#')[0]
    let room = this.ensure(key)
    if (!room.base) room.base = base
    if (!room.heading) room.heading = base
    // A fingerprint seen for the first time is pinned to this node; the same
    // paragraph again is the strongest evidence two sightings are one room.
    if (fp && !room.fp) room.fp = fp
    const arrived = this.at !== key
    if (arrived) {
      room.visits++
      this.order.push(key)
      if (from && dir && from !== key) {
        // The edge belongs to the room you STOOD IN, pointing at the room you
        // reached. The first version wrote it onto the destination (`Kitchen
        // --north--> Kitchen`), which meant the origin never recorded having
        // tried that way — so `untried()` kept offering it and the explorer
        // obediently walked the same corridor back and forth until the watchdog
        // stopped it. The map has to remember a attempt, not just a result:
        // "no dead end is retried" is only a property if the attempt is written
        // down where the planner will look.
        const origin = this.ensure(from)
        const was = origin.exits[dir]
        origin.exits[dir] = { to: key, type: 'proven' }
        // An assumed way that checked out is no longer an assumption. Silently
        // overwriting it would lose the fact that a hypothesis was tested, which
        // is the one number that says whether this map is evidence or guesswork.
        if (was && was.type === 'assumed') this.verified = (this.verified || 0) + 1
        const rev = opposite(dir)
        if (rev && !room.exits[rev]) room.exits[rev] = { to: from, type: 'assumed' }
      }
      this.at = key
    } else if (dir) {
      // We asked to go that way and did not arrive. That is ALL the evidence
      // needed to close the exit — no regex over the game's excuses required.
      //
      // This replaced a check on `verdict === 'blocked'`, which failed on Zork's
      // most politely refused exit of all: "The forest becomes impenetrable to
      // the north." A perfectly clear *no*, classified `ok` because it is not
      // phrased as a complaint, so the direction stayed on the frontier and the
      // explorer asked the same question twenty times in a row. Deriving the
      // fact from the map ("asked, did not move") instead of from the prose makes
      // the phrasing irrelevant, and is the difference between an agent that
      // stalls on a sentence and one that cannot.
      const origin = this.ensure(from || key)
      const prior = origin.exits[dir]
      if (!prior || prior.type === 'assumed') {
        origin.exits[dir] = { to: null, type: 'blocked' }
      } else if (prior.type === 'proven' && prior.to) {
        // PROOF OF A BAD MERGE. This node claims the way leads to `prior.to` and
        // we just watched the game refuse it, so the room under this name is not
        // the room we mapped. Re-key it as a fresh room and forget the inherited
        // exits — keeping them is what produced the endless walk into "Storm-tossed
        // trees block your way" that this whole mechanism exists to prevent.
        this.splits = (this.splits || 0) + 1
        const fresh = this.claim(origin.base || base, null)
        if (fresh !== key) {
          this.rooms.delete(key)
          const moved = this.ensure(fresh)
          moved.base = origin.base || base
          moved.heading = origin.heading || base
          moved.visits = (origin.visits || 0) + 1
          moved.dark = origin.dark
          moved.splits = 1
          moved.announced = origin.announced
          moved.darkWays = origin.darkWays
          this.at = fresh
          this.splitsTo = fresh
        }
      }
    }
    if (dark) room.dark = true
    for (const v of visible) room.visible.add(v)
    // Ways the ROOM'S OWN PROSE says lead out, and the subset it called dark.
    // Deliberately NOT edges: "a passage leads to the west" is a claim, and a map
    // that turns claims into edges will route through a wall. Stored so the brain
    // can know, while still in the light, that the graph it has mapped has a lit
    // half and a dark half — the only way it can ever go looking for a lamp
    // instead of discovering it needs one while something is eating it.
    for (const d of announced || []) room.announced.add(d)
    for (const d of darkExits || []) room.darkWays.add(d)
    for (const [host, items] of Object.entries(contains || {})) {
      room.contains[host] = [...new Set([...(room.contains[host] || []), ...items])]
    }
    return room
  }

  /** Directions we have never tried here. The frontier of the known world. */
  untried(key) {
    const room = this.rooms.get(key)
    if (!room) return []
    return DIRS.filter((d) => !room.exits[d])
  }

  /**
   * Assumed edges waiting to be tested.
   *
   * Every reverse of a walked move is a hypothesis, and a hypothesis left
   * untested is a door left shut. This is how the agent ends up indoors at
   * all: it walked EAST from North of House into Behind House, which filed the
   * return trip as `west -> North of House (assumed)`. In Zork I, west from
   * Behind House is not North of House — it is a window, and beyond the window
   * the Kitchen. The assumption was wrong, and only walking it would say so; a
   * brain that only ever walks `proven` edges never finds out, and never opens
   * anything.
   */
  unverified(key) {
    const room = this.rooms.get(key)
    if (!room) return []
    return DIRS.filter((d) => room.exits[d] && room.exits[d].type === 'assumed')
  }

  get visitedCount() { return this.rooms.size }

  /**
   * BFS to the nearest room with an untried direction, over edges we believe in
   * (proven first-class, assumed allowed).
   * @returns {{path: string[], room: string}|null}
   */
  /**
   * @param {object} o  `avoidUnstable` never routes THROUGH a name we had to
   *   split into twins (the shifting forest). Used first, so the agent exhausts
   *   the ground it can trust before admitting the map has run out.
   */
  nearestFrontier({ avoidUnstable = false } = {}, from = this.at) {
    from = from || this.at
    if (!from) return null
    const shaky = (k) => avoidUnstable && this.unstable.has(String(k).split('#')[0])
    if (this.untried(from).length && !shaky(from)) return { path: [], room: from }
    const prev = new Map([[from, null]])
    const queue = [from]
    while (queue.length) {
      const cur = queue.shift()
      const room = this.rooms.get(cur)
      if (!room) continue
      for (const [dir, edge] of Object.entries(room.exits)) {
        if (!edge.to || edge.type === 'blocked') continue
        if (shaky(edge.to)) continue
        if (prev.has(edge.to)) continue
        prev.set(edge.to, { from: cur, dir })
        if (this.untried(edge.to).length) {
          const path = []
          let k = edge.to
          while (prev.get(k)) { path.unshift(prev.get(k).dir); k = prev.get(k).from }
          return { path, room: edge.to }
        }
        queue.push(edge.to)
      }
    }
    return null
  }

  /** Every move we are confident about, for the trace in the check output. */
  stats() {
    let proven = 0
    let assumed = 0
    let blocked = 0
    let dark = 0
    for (const r of this.rooms.values()) {
      if (r.dark) dark++
      for (const e of Object.values(r.exits)) {
        if (e.type === 'proven') proven++
        else if (e.type === 'assumed') assumed++
        else blocked++
      }
    }
    // Ways out that the GAME labelled dark, counted across every room we have
    // mapped, plus how many of those we have already tried and been refused.
    // Deliberately NOT filtered to proven edges: the interesting dark way is the
    // one we cannot walk yet (the Kitchen's chimney), so a count restricted to
    // walked exits is always zero and reads like "nothing left to find".
    // `darkClaims` is stage 2's goal trigger; `darkRefused` is the proof that the
    // agent already knocked and was turned away for lack of light.
    let darkClaims = 0
    let darkRefused = 0
    for (const r of this.rooms.values()) {
      for (const d of r.darkWays || []) {
        darkClaims++
        if (r.exits[d]?.type === 'blocked') darkRefused++
      }
    }
    return { darkClaims, darkRefused, rooms: this.rooms.size, proven, assumed, blocked, darkRooms: dark, unstable: [...this.unstable], splits: this.splits || 0, verified: this.verified || 0 }
  }
}

export default ZorkMap
