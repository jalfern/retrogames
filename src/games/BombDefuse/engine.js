// BOMB DEFUSE — deterministic simultaneous two-hand defusal (#1800, PLAICRAFT #1711 fifth title).
//
// Pure module: Node + browser, no DOM, no React. All randomness comes from the
// seed (mulberry32). Seed + per-seat pad streams ⇒ identical hashes (#494).
//
// THE DIFFERENCE FROM TALK ME DOWN (#1252): TMD splits INFORMATION (defuser
// sees the bomb, manual owns the rules, verbs resolve sequentially). BOMB
// DEFUSE splits EFFORT: nothing one seat does counts. Every step needs both
// seats inside ONE sync window — the Cold-War two-key trope (Wargames 1983)
// as a whole game. Timings, not reading, are the pressure.
//
// STEPS (one per window, 3/4/5 per bomb):
//   SYNC — both seats TURN their key (A) inside the window; a lone key holds
//          the window open only until it expires (SLOW KEY strike, retry).
//   CUT  — a target color lights on the bomb plate; each seat cycles its own
//          cutter arm (up/down through RED/BLUE/GREEN/YELLOW) and snips (A).
//          Both blades must be on the right color and inside the window;
//          wrong color = a nick (−2 s, the wire survives), stale window =
//          strike.
//   VENT — one seat (the holder, seeded per step) pins the stabilizer bar (B)
//          while the other seats the swinging pressure needle (A) inside the
//          green zone. Seat while unvented = SURGE (extra fuse damage); an
//          unvented VENT step burns the fuse double every tick it waits. A
//          whiffed seat is only a dud — the sweeping gauge is the challenge.
//
// FUSE LEDGER: mistakes eat time — a nicked wrong wire −2 s, a broken sync
// window (strike) −4 s, a surge −6 s; zero fuse = boom. Three bombs
// (60/50/40 s, windows 1.25/1.00/0.80 s) cleared = won.
//
// HASHED STATE IS INTEGER-ONLY (needle rides a 360-entry integer sine table,
// never a hashed float) — the #1793 divergence lesson applied before the fact.
//
// SEATS: players=1 is solo — seat 2's partner pads are emitted INSIDE step()
// from fixed cadences (rng-free at tick time, so recorded streams replay
// identically). An empty seat-2 pad means "nobody home" → partner covers; any
// true field hands the seat to the human. solvePads() (attract, harness,
// evidence synthesis) drives BOTH seats cleanly with load-step jitter.

export const COLORS = ['RED', 'BLUE', 'GREEN', 'YELLOW']
export const SYNC = 0
export const CUT = 1
export const VENT = 2
export const KIND_NAME = ['SYNC', 'CUT', 'VENT']

export const BOMBS = 3
export const FUSE0 = [3600, 3000, 2400]   // frames per bomb
export const WINDOW = [75, 60, 48]        // sync window, frames
export const STEPS_PER_BOMB = [3, 4, 5]
export const ZONE_HALF = [190, 140, 100]  // green-zone half width (needle units)
export const NEEDLE_SPD = [2, 3, 4]      // degrees per tick
export const STRIKE_COST = 240           // −4 s per strike
export const SURGE_COST = 360          // −6 s per vent surge
export const NICK_COST = 120            // −2 s per wrong-wire nick
export const INTRO = 45                // ticks of "read the step" grace per step

// Integer sine table (quantized once at module load — bit-stable across node
// and browser, so the needle can ride the hash without ulp drift).
const SIN = Array.from({ length: 360 }, (_, d) => Math.round(Math.sin((d * Math.PI) / 180) * 1000))

const mulberry32 = (a) => {
    let x = a >>> 0
    const next = () => {
        x = (x + 0x6d2b79f5) >>> 0
        let t = x
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    // #1819 netplay: the snapshot carries the rng counter so a restored box
    // draws the same future steps. Read with .x(), load with .x(v).
    next.x = (v) => (v === undefined ? x : (x = v >>> 0))
    return next
}

const clampZone = (z) => Math.max(-700, Math.min(700, z))

export function createGame(seed, players = 1) {
    const s = (seed >>> 0) || 1
    const rng = mulberry32(s ^ 0xB0BB1E5)
    const bombs = []
    for (let b = 0; b < BOMBS; b++) {
        const steps = []
        let prev = -1
        for (let k = 0; k < STEPS_PER_BOMB[b]; k++) {
            // The very first step teaches SYNC; otherwise seeded, never twice
            // the same kind in a row (a run always asks both verbs).
            let kind = b === 0 && k === 0 ? SYNC : Math.floor(rng() * 3)
            if (kind === prev) kind = (kind + 1 + Math.floor(rng() * 2)) % 3
            prev = kind
            steps.push({
                kind,
                color: Math.floor(rng() * COLORS.length),
                holder: (b * 7 + k) % 2,
            })
        }
        bombs.push({ fuse0: FUSE0[b], steps, earned: 0 })
    }
    const gs = {
        seed: s,
        bombs,
        players: players > 1 ? 2 : 1,
        rng,
        tick: 0,
        bomb: 0,
        step: 0,
        fuse: FUSE0[0],
        score: 0,
        strikes: 0,
        done: false,
        won: false,
        events: [],
        // per-step live fields (loadStep owns them):
        intro: 0,
        stepT: 0,
        keys: [false, false],
        keyT: 0,
        sel: [0, 0],
        armed: [false, false],
        armedT: 0,
        needleT: 0,
        phase: 0,
        zone: 0,
        held: false,
        prevPad: [offPad(), offPad()],
        brain: { syncLead: 10, follow: 6 },
    }
    loadStep(gs)
    return gs
}

export const curStep = (gs) => gs.bombs[gs.bomb].steps[gs.step]
export const curWindow = (gs) => WINDOW[gs.bomb]
export const needleOf = (gs) => SIN[(gs.needleT + gs.phase) % 360]

// Arm a fresh step: all latches cleared, needle/zone re-seeded. Every rng
// draw a step ever needs happens HERE — tick-time logic is rng-free, which is
// what lets recorded pad streams replay identically.
function loadStep(gs) {
    const st = curStep(gs)
    gs.intro = INTRO
    gs.stepT = 0
    gs.keys = [false, false]
    gs.keyT = 0
    gs.sel = [0, 0]
    gs.armed = [false, false]
    gs.armedT = 0
    gs.held = false
    gs.prevPad = [offPad(), offPad()]
    gs.phase = Math.floor(gs.rng() * 360)
    gs.zone = clampZone(Math.floor(gs.rng() * 1401) - 700)
    gs.brain.syncLead = 8 + Math.floor(gs.rng() * Math.max(8, curWindow(gs) - 24))
    gs.brain.follow = 5 + Math.floor(gs.rng() * 8)
    if (st.kind === VENT) gs.events.push({ k: 'vent', holder: st.holder })
}

function strike(gs, why) {
    gs.strikes++
    gs.fuse -= STRIKE_COST
    gs.events.push({ k: 'strike', why })
}

function advance(gs) {
    // #1812 item 6: honest ledger — every point names the bomb that paid it.
    // `earned` rides the bomb, never the hash list (see winTally), so replay
    // hashes are byte-identical; the score law itself is untouched.
    gs.score += 50
    gs.bombs[gs.bomb].earned += 50
    gs.step++
    if (gs.step >= gs.bombs[gs.bomb].steps.length) {
        const bonus = 500 + Math.floor(gs.fuse / 60) * 5
        gs.score += bonus
        gs.bombs[gs.bomb].earned += bonus
        gs.events.push({ k: 'defused', bomb: gs.bomb + 1 })
        gs.bomb++
        gs.step = 0
        if (gs.bomb >= BOMBS) {
            gs.done = true
            gs.won = true
            gs.events.push({ k: 'win' })
            return
        }
        gs.fuse = gs.bombs[gs.bomb].fuse0
    }
    loadStep(gs)
}

// Seat-2 partner for solo play: fixed cadences (rng-free), honest pads.
// Leads when nobody has moved, follows as soon as the human arms anything.
function partnerPad(gs) {
    if (gs.done || gs.intro > 0) return {}
    const st = curStep(gs)
    if (st.kind === SYNC) {
        if (gs.keys[1] || gs.keys[0]) return {}
        return gs.stepT >= 20 && (gs.stepT === 20 || gs.stepT % 24 === 0) ? { a: true } : {}
    }
    if (st.kind === CUT) {
        const d = (st.color - gs.sel[1] + COLORS.length) % COLORS.length
        if (d !== 0) return gs.stepT % 4 === 0 ? { [d <= 2 ? 'up' : 'down']: true } : {}
        if (!gs.armed[1] && (gs.armed[0] || gs.stepT >= 90)) return { a: true }
        return {}
    }
    // VENT
    if (st.holder === 1) return { b: true }
    return Math.abs(needleOf(gs) - gs.zone) <= ZONE_HALF[gs.bomb] * 0.55 ? { a: true } : {}
}

// Both-seat solver: attract autopilot, evidence synthesis, the win gate.
// Zero strikes by construction: lead/follow offsets are loaded at step birth
// and every action is verified against the live integer state first.
export function solvePads(gs) {
    const pads = [{}, {}]
    if (gs.done || gs.intro > 0) return pads
    const st = curStep(gs)
    const w = curWindow(gs)
    if (st.kind === SYNC) {
        if (!gs.keys[0] && gs.stepT === gs.brain.syncLead) pads[0].a = true
        if (!gs.keys[1] && gs.keys[0] && gs.stepT >= gs.brain.syncLead + gs.brain.follow) pads[1].a = true
        // belt-and-braces re-lead if a window somehow closed (should never fire)
        if (!gs.keys[0] && gs.stepT > gs.brain.syncLead + w + 20 && (gs.stepT - gs.brain.syncLead) % (w + 40) === 0) pads[0].a = true
        return pads
    }
    if (st.kind === CUT) {
        // seat 0 leads: cycle onto the target, snip once it is right;
        // seat 1 follows: same walk, fires once the lead blade is armed.
        for (let i = 0; i < 2; i++) {
            const d = (st.color - gs.sel[i] + COLORS.length) % COLORS.length
            if (d !== 0) { if (gs.stepT % 4 === i) pads[i][d <= 2 ? 'up' : 'down'] = true; continue }
            if (gs.armed[i]) continue
            if (i === 0) { if (gs.stepT >= gs.brain.syncLead) pads[0].a = true }
            else if (gs.armed[0] && gs.stepT % 4 === 1) pads[1].a = true
        }
        return pads
    }
    // VENT — holder pins, worker seats on target
    const holder = st.holder
    const worker = 1 - holder
    pads[holder].b = true
    if (Math.abs(needleOf(gs) - gs.zone) <= ZONE_HALF[gs.bomb] * 0.55) pads[worker].a = true
    return pads
}

const norm = (p) => ({
    up: !!p.up, down: !!p.down, left: !!p.left, right: !!p.right,
    a: !!p.a, b: !!p.b,
})

const offPad = () => ({ up: false, down: false, left: false, right: false, a: false, b: false })

// One simulation tick. pads = [pad1, pad2?] — seat order per #494. A seat with
// an all-false pad while players=1 is covered by the internal partner.
export function step(gs, pads) {
    if (!gs || gs.done) return
    gs.tick++
    const raw1 = pads && pads[0] ? pads[0] : {}
    let p2 = pads && pads[1] ? pads[1] : {}
    if (gs.players === 1 && !p2.a && !p2.b && !p2.up && !p2.down && !p2.left && !p2.right) p2 = partnerPad(gs)
    const pad = [norm(raw1), norm(p2)]
    // #1831: a tap is ONE action. up/down/a fire on the RISING edge — a held
    // press must not cycle the arm, nick, or surge every tick it stays down
    // (the per-tick charge was the blocker: one tap could burn the fuse).
    // The pin (b) stays a level: holding the stabilizer bar IS the mechanic.
    // prevPad resets in loadStep, so a press carried across a step boundary
    // can fire at most once on the new step.
    const edge = pad.map((p, i) => ({
        up: p.up && !gs.prevPad[i].up,
        down: p.down && !gs.prevPad[i].down,
        a: p.a && !gs.prevPad[i].a,
    }))
    gs.prevPad = pad

    const st = curStep(gs)
    const win = curWindow(gs)
    // hash-visible: is THE holder of the live step pinning the bar?
    gs.held = st.kind === VENT ? !!pad[st.holder].b : false

    // fuse: baseline drain, double while a VENT step waits unvented
    gs.fuse--
    if (st.kind === VENT && gs.intro <= 0 && !pad[st.holder].b) gs.fuse--

    if (gs.fuse <= 0) {
        gs.fuse = 0
        gs.done = true
        gs.won = false
        gs.events.push({ k: 'boom' })
        return
    }

    if (gs.intro > 0) { gs.intro--; return }
    gs.stepT++
    if (st.kind === VENT) gs.needleT += NEEDLE_SPD[gs.bomb]

    if (st.kind === SYNC) {
        for (let i = 0; i < 2; i++) {
            if (pad[i].a && !gs.keys[i]) { gs.keys[i] = true; gs.events.push({ k: 'key', seat: i }) }
        }
        if (gs.keys[0] && gs.keys[1]) { gs.events.push({ k: 'click' }); advance(gs); return }
        if (gs.keys[0] !== gs.keys[1]) {
            gs.keyT++
            if (gs.keyT > win) {
                strike(gs, 'SLOW KEY')
                gs.keys = [false, false]
                gs.keyT = 0
            }
        } else gs.keyT = 0
        return
    }

    if (st.kind === CUT) {
        for (let i = 0; i < 2; i++) {
            if (edge[i].up) gs.sel[i] = (gs.sel[i] + 1) % COLORS.length
            else if (edge[i].down) gs.sel[i] = (gs.sel[i] + COLORS.length - 1) % COLORS.length
            if (edge[i].a) {
                if (gs.sel[i] === st.color) {
                    if (!gs.armed[i]) gs.events.push({ k: 'snip', seat: i })
                    gs.armed[i] = true
                } else {
                    // the blade nicks the wrong cable: time, not a strike —
                    // the wire survives, the fuse pays.
                    gs.fuse -= NICK_COST
                    gs.events.push({ k: 'nick', seat: i })
                }
            }
        }
        if (gs.armed[0] && gs.armed[1]) { gs.events.push({ k: 'cut' }); advance(gs); return }
        if (gs.armed[0] !== gs.armed[1]) {
            gs.armedT++
            if (gs.armedT > win) {
                strike(gs, 'WINDOW CLOSED')
                gs.armed = [false, false]
                gs.armedT = 0
            }
        } else gs.armedT = 0
        return
    }

    // VENT
    const worker = 1 - st.holder
    if (edge[worker].a) {
        if (Math.abs(needleOf(gs) - gs.zone) <= ZONE_HALF[gs.bomb]) {
            if (pad[st.holder].b) { gs.events.push({ k: 'sealed' }); advance(gs); return }
            gs.fuse -= SURGE_COST
            gs.events.push({ k: 'surge' })
            if (gs.fuse <= 0) {
                gs.fuse = 0
                gs.done = true
                gs.won = false
                gs.events.push({ k: 'boom' })
            }
        } else {
            // a whiffed seat is NOT a strike — the sweeping gauge and the
            // burning fuse already charge for it (time is the whole penalty
            // system here; strikes stay for real mistakes).
            gs.events.push({ k: 'dud' })
        }
    }
}

// ---- state + hash ------------------------------------------------------------
// Hashed fields are integers and booleans only (no floats) — see header note.

export function simState(gs) {
    return {
        tick: gs.tick,
        score: gs.score,
        done: gs.done,
        won: gs.won,
        seed: gs.seed,
        hash: hash(gs),
        bomb: gs.bomb,
        step: gs.step,
        fuse: gs.fuse,
    }
}

export function hash(gs) {
    const L = []
    for (const b of gs.bombs) L.push(b.fuse0, ...b.steps.flatMap((s) => [s.kind, s.color, s.holder]))
    const s = [
        gs.seed, gs.tick, gs.bomb, gs.step, gs.fuse, gs.score, gs.strikes,
        gs.done ? 1 : 0, gs.won ? 1 : 0, gs.intro, gs.stepT, gs.keyT, gs.armedT,
        gs.keys[0] ? 1 : 0, gs.keys[1] ? 1 : 0, gs.armed[0] ? 1 : 0, gs.armed[1] ? 1 : 0,
        gs.sel[0], gs.sel[1], gs.held ? 1 : 0,
        gs.phase, gs.needleT, gs.zone, gs.brain.syncLead, gs.brain.follow,
        L.join(','),
    ].join('|')
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return h >>> 0
}

// ---- key-turn feel (#1812 item 2) — view math only, never gs/hash ----------
// The sim truth stays at the press tick (gs.keys latches instantly); these
// helpers let the BARREL pose lag it: a damped spring toward the target pose,
// a detent crossing that sounds the ratchet, and a seat stagger so the pair's
// turns read as two hands, not one frame. Pure arithmetic — no state, no Math.
export const TURN = {
    K: 0.3,            // spring pull per tick
    D: 0.6,            // velocity damping per tick (<1 with this K overshoots once)
    STAGGER: 4,        // ticks seat 2's pose waits behind seat 1's before following
    RATCHET: 0.5,      // detent the click fires over (pose units)
    SETTLE: 24,        // ticks until the pose is considered home
    OFF: -0.35,        // legacy rest angle (rad)
    ON: 0.78,          // legacy turned angle (rad)
}

export const keyAngle = (pose) => TURN.OFF + (TURN.ON - TURN.OFF) * pose

// one detent crossing per motion: +1 turning over the ratchet, -1 falling back
export function turnClick(prev, cur) {
    if (prev < TURN.RATCHET && cur >= TURN.RATCHET) return 1
    if (prev >= TURN.RATCHET && cur < TURN.RATCHET) return -1
    return 0
}

// one spring step toward target; returns [pos, vel, click] — the view owns the
// pos/vel memory so pause and sim-freeze stop the wobble with the world.
export function turnStep(pos, vel, target) {
    const v = (vel + (target - pos) * TURN.K) * TURN.D
    const p = pos + v
    const c = turnClick(pos, p)
    return [p, v, c]
}

// ---- gauge redline (#1812 item 5) — view math only, never gs/hash -----------
// The needle computes across ±1000 units, but a real gauge has a stop just past
// the red ticks: past REDLINE the pointer stops following the number — it PEGS
// against PEG and stays parked through the top of the swing. The view adds the
// bezel shake and the red glass glint while hot; this helper is the law, pure
// arithmetic — no state, no gs write (the sim truth, needleOf, stands).
export const REDLINE = 900 // units — where the red ticks start biting
export const PEG = 945     // the needle parks here against the end stop

export function pegNeedle(raw) {
    const hot = raw > REDLINE || raw < -REDLINE
    const drawn = raw > PEG ? PEG : raw < -PEG ? -PEG : raw
    return { hot, drawn }
}

// ---- first-VENT coaching (#1932) — view math only, never gs/hash ----------
// The FIRST vent of a run teaches each seat its job by name. On a phone the
// only named control is the HOLD pad — before this, a newcomer had to map a
// seat number to a verb while the fuse burned double. Pure function of live
// state + view facts (which seat is yours, has the run learned yet): no rng,
// no gs write, hash-clean. The view pulses `pulseBar` on the bar that must
// be pinned (until it actually is) and `pulseGauge` the instant the worker's
// needle crosses the zone — the lesson names the job, the ring confirms the
// deed. `taught` latches when the crew seals, so veterans keep the clean plate.
// ---- window pre-flash (#1812 item 4) — view math only, never gs/hash ----------
// The SYNC WINDOW bar only appears once some seat has acted (drawWindowBar's
// hold > 0 law), so until the first press the window is invisible and the
// controls look inert. This helper names what the step is ASKING while NO seat
// has touched it yet — SYNC the key barrels, CUT the cutter arms, VENT the
// holder's bar — and returns null the moment any seat acts, exactly when the
// real window bar lights. The view adds the pulsing amber edge; the law is
// pure arithmetic on live state — no rng, no gs write, hash-clean.
export function preFlash(gs) {
    if (!gs || gs.done) return null
    const st = curStep(gs)
    const touched =
        st.kind === SYNC ? gs.keys[0] || gs.keys[1]
        : st.kind === CUT ? gs.sel[0] || gs.sel[1] || gs.armed[0] || gs.armed[1]
        : !!gs.held
    if (touched) return null
    return { kind: st.kind, intro: gs.intro > 0 }
}

// ---- active-seat ask (#1812 item 7) — view math only, never gs/hash ----------
// The HUD strip says WHO sits where (P2 CO-OP/P2 CPU) but never WHO THE STEP
// IS ASKING. This law names each seat's outstanding debt: SYNC/CUT demand
// both seats, and a seat leaves the list the moment it answers (key turned /
// blade armed); VENT splits the roles — the holder owes the pin until `gs.held`
// actually reads true, the worker owes the seat until the crew seals (which
// advances the step, ending the ask). null with no live run. Pure function of
// live state — no rng, no gs write, hash-clean. The view pulses the tasked
// seats' P-chips (index.jsx chipInk); the law lives here.
export function seatAsk(gs) {
    if (!gs || gs.done) return null
    const st = curStep(gs)
    if (st.kind === VENT) {
        const ask = [false, false]
        ask[st.holder] = !gs.held
        ask[1 - st.holder] = true
        return { kind: VENT, holder: st.holder, ask }
    }
    const done = st.kind === SYNC ? gs.keys : gs.armed
    return { kind: st.kind, ask: [!done[0], !done[1]] }
}

export function ventCoach(gs, you, taught) {
    if (!gs || gs.done || taught) return null
    const st = curStep(gs)
    if (st.kind !== VENT) return null
    const isHolder = you === st.holder
    const named = you === 0 || you === 1
    const inZone = Math.abs(needleOf(gs) - gs.zone) <= ZONE_HALF[gs.bomb]
    return {
        role: named ? (isHolder ? 'HOLD' : 'SEAT') : 'CREW',
        card: named
            ? (isHolder ? 'YOU HOLD THE BAR' : 'YOU SEAT THE NEEDLE')
            : `P${st.holder + 1} HOLDS · P${2 - st.holder} SEATS`,
        sub: named
            ? (isHolder ? 'PRESS B / HOLD PAD — KEEP DOWN' : 'TAP A WHEN NEEDLE CROSSES GREEN')
            : 'ONE PINS THE BAR, ONE SEATS GREEN',
        intro: gs.intro > 0,
        held: !!gs.held,
        inZone,
        pulseBar: named && isHolder && !gs.held,
        pulseGauge: named && !isHolder && inZone,
    }
}

// ---- win tally (#1812 item 6) — view math only, never gs/hash ----------
// Classic arcade score-salad: WON never dumps the total raw — it RECAPS what
// each bomb paid and rolls the grand total last. `winTally` is the honest
// ledger: per-bomb `earned` (written where the score is earned, advance()),
// summed it equals gs.score by construction. `tallyFrame` is the pure playback
// law: line i rolls 0→value over TALLY.ROLL starting at i*LINE, the total
// rolls after the last line over TALLY.TOTAL, every roll lands EXACTLY on its
// target (ease-out, rounded, capped — monotonic, never overshoots). `landed`
// counts lines home, +1 when the total lands; the view paints what this says
// and dings when the count grows. No gs write, no rng — hash-clean.
export const TALLY = { LINE: 620, ROLL: 380, TOTAL: 780 }

export function winTally(gs) {
    if (!gs || !gs.won) return []
    return gs.bombs.map((b, i) => ({ bomb: i + 1, value: b.earned | 0 }))
}

export const tallyDur = (values) => Math.max(0, (Array.isArray(values) ? values.length : 0) * TALLY.LINE + TALLY.TOTAL)

const easeOut = (v, f) => Math.min(v, Math.round(v * f * (2 - f)))

// #1812 online fold-in, item 1: THE LINK PILL — the play-screen answer to
// "is my crew still on the wire?". Room code + link state lived only in the
// Lobby/attract; mid-run the player flew blind until a banner fired. Pure law
// over shell net facts (never gs — hash-clean): the view paints what this says.
// Precedence is the law too: a seat on its way back reads RETURNING before
// jitter, and a demoted crew has no wire at all — CPU PARTNER outranks stalls.
export const LINK = { SHAKY: 8 } // stall ticks before the pill calls the link shaky

export function netPill(info) {
    if (!info || !info.code) return null
    if (info.reseat) return { text: 'LINK RETURNING', tone: 'amber' }
    if (info.solo) return { text: 'CPU PARTNER', tone: 'red' }
    if ((info.stallRun | 0) >= LINK.SHAKY) return { text: 'LINK SHAKY', tone: 'amber' }
    return { text: `NET ${String(info.code).slice(0, 4)} LIVE`, tone: 'green' }
}

export function tallyFrame(values, ms) {
    const vals = (Array.isArray(values) ? values : []).map((v) => v | 0)
    const sum = vals.reduce((a, b) => a + b, 0) | 0
    if (!vals.length || ms >= tallyDur(vals))
        return { lines: vals.slice(), total: sum, landed: vals.length + 1, done: true }
    const t = Math.max(0, ms)
    const totalAt = vals.length * TALLY.LINE
    const lines = []
    let landed = 0
    for (let i = 0; i < vals.length; i++) {
        const f = (t - i * TALLY.LINE) / TALLY.ROLL
        if (f <= 0) break
        lines.push(easeOut(vals[i], Math.min(1, f)))
        if (f >= 1) landed++
    }
    const total = t >= totalAt ? easeOut(sum, Math.min(1, (t - totalAt) / TALLY.TOTAL)) : 0
    return { lines, total, landed, done: false }
}
