// PINBALL — the shared table engine with TWO cabinets (issue #3103 rungs 1-3,
// #3217 ball-ball, #3232 CABINET TWO + row-of-cabinets select).
// Shell only: loop, scaling, attract (row of cabinets), pause, pad, harness
// wiring. All rules and physics live in sim.js (pure, Node-auditable); look
// lives in art.js. Bar: MODERN — a lit, reflective cabinet you want to look
// at. Original art & audio, in code.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { exposeGame, unexposeGame, contractHoldsLoop, seedFromQuery, exposeFeedbackState, unexposeFeedbackState } from '../../utils/gameContract'
import {
    makeGame, stepGame, stateOf, stateHash, TABLE, TABLE_TWO, CABINETS, cabIndexOf, W, H, BALL_R, demoPad, demoOver,
    compileTable, sanitizeDef, validateSmith, SMITH_REFS, SMITH_LIMITS, bumperZoneOk, zoneGuidePath, tiltImpulse, soloBed, SOLO_CAP,
} from './sim.js'
import { tiltVec } from '../../components/padTypes.js'
import { PAL, PAL_EMBER, SCORE_X, SCORE_Y, SCORE_DIGITS, drawSevenSeg, paintField, PRESS, MESSAGES, MESSAGES_EMBER, drawDMD, dmdIdle, skinAt, skinsFor, parseStyle, styleIndex, kitIndex, styleWarn, KIT_STORE, ATTRACT_DMD, textFit, marqueeFit } from './art.js'

const FIXED_DT = 1000 / 60

// The row of cabinets: presentation metadata per cabinet. The SIM owns the
// table data; this file owns how each machine looks and talks.
// #3284 TABLE SMITH: slot 2 is the player-built cabinet. Unsaved it is a
// ghost ("DESIGN YOUR OWN" — START opens the editor); saved, its compiled
// table rides the row exactly like a stock machine: same renderer, same
// physics, its own kit dress (id `my-table` falls back to the house kits).
// #3284: the player's saved cabinet — the construction-set fantasy of
// "your machine in the arcade" — name + layout, re-editable.
// #3359: a garage of three slots per browser. A chooser strip on the slot 2
// card (1/2/3; A/B/C keys take cabinet-left/kit, so 1/2/3 are the digits)
// persists the pick at retrogames.pinball.slot = { slot: i }; each slot writes
// its own retrogames.pinball.cab.v1:<i> = { name, def }. The legacy blob
// (#3284, one cabinet per browser) migrates one-shot into slot 0 and is
// never deleted.
const MY_STORE = 'retrogames.pinball.mytable.v1'
let myRev = 0        // smith revisions bust the painted-field cache (#3284)
const GARAGE_SLOTS = 3
const GARAGE_PREFIX = 'retrogames.pinball.cab.v1'
const SLOT_STORE = 'retrogames.pinball.slot'
const slotKey = (i) => `${GARAGE_PREFIX}:${i}`
const loadMyRaw = () => { try { const j = JSON.parse(localStorage.getItem(MY_STORE)); return j && typeof j === 'object' ? j : null } catch { return null } }
const loadGarageSlot = (i) => { try { const j = JSON.parse(localStorage.getItem(slotKey(i))); return j && typeof j === 'object' ? j : null } catch { return null } }
const loadGarageSlots = () => { const out = []; for (let i = 0; i < GARAGE_SLOTS; i++) out.push(loadGarageSlot(i)); return out }
const saveGarageSlot = (i, name, def) => { try { localStorage.setItem(slotKey(i), JSON.stringify({ name, def })) } catch { /* private mode: memory is best-effort */ } }
const loadGarageSlotSel = () => { try { const j = JSON.parse(localStorage.getItem(SLOT_STORE)); const s = j && typeof j.slot === 'number' ? Math.trunc(j.slot) : 0; return s >= 0 && s < GARAGE_SLOTS ? s : 0 } catch { return 0 } }
const saveGarageSlotSel = (i) => { try { localStorage.setItem(SLOT_STORE, JSON.stringify({ slot: i })) } catch { /* private mode: best-effort */ } }
// One-shot legacy migration: if slot 0 is empty and the legacy blob's def
// compiles clean, lift it into slot 0 (a blob that doesn't compile is
// garbage — it reads as unsaved, never as a save).
const slots = loadGarageSlots()
const legacyRaw = loadMyRaw()
if (legacyRaw && !slots[0]) {
    const legacyDef = sanitizeDef(legacyRaw.def && typeof legacyRaw.def === 'object' ? legacyRaw.def : legacyRaw)
    if (validateSmith(legacyDef) === null) {
        const legacyName = legacyDef.name || legacyRaw.name || 'MY TABLE'
        slots[0] = { name: legacyName, def: legacyDef }
        saveGarageSlot(0, legacyName, legacyDef)
    }
}
// Builds the slot-2 card from a slot blob. A junk slot (missing def, or a
// def that doesn't compile) reads as unsaved — garbage is not a save.
const slotDefLegal = (s) => {
    const def = s && s.def && typeof s.def === 'object' ? sanitizeDef(s.def) : null
    return def && validateSmith(def) === null ? def : null
}
const buildCABS2 = (i) => {
    const def = slotDefLegal(garage.slots[i])
    if (!def) return { tb: TABLE, pal: PAL, tag: 'DESIGN YOUR OWN', msgs: MESSAGES, custom: true, saved: false, def: null }
    return { tb: compileTable(def).tb, pal: PAL, tag: def.name || 'MY TABLE', msgs: MESSAGES, custom: true, saved: true, def: { ...def, bumpers: def.bumpers.map((b) => [...b]) } }
}
const garage = { slots, sel: loadGarageSlotSel() }
const CABS = [
    { tb: TABLE, pal: PAL, tag: 'CABINET ONE', msgs: MESSAGES },
    { tb: TABLE_TWO, pal: PAL_EMBER, tag: 'EMBER RIDER', msgs: MESSAGES_EMBER },
    buildCABS2(garage.sel),
]
// #3290 item 2 — the unsaved ghost stops lying. Until the player saves, the
// demo and the card face show the bench's OWN default layout (openEditor
// starts from SMITH_REFS.nova), so the card previews exactly what the smith
// opens with. Saved cabinets are untouched (their real table rides the row).
const NOVA_TB = compileTable(SMITH_REFS.nova).tb
const previewTb = (ci) => (CABS[ci].custom && !CABS[ci].saved ? NOVA_TB : CABS[ci].tb)
// Mini-cabinet card geometry on the 360x600 attract field (#3232; #3284 grew
// the row to three — narrower cards keep the original's portrait proportions).
const CARD_W = 104, CARD_H = 173
const CARDS = [{ x: 16, y: 224 }, { x: 128, y: 224 }, { x: 240, y: 224 }]

// ---- TABLE SMITH editor (#3284) — the build side of the cabinet row ----
// Pinball Construction Set (Evolution Systems, 1983) idiom: a cursor, a part
// palette, instant playtest, and your name on the marquee. Pad-first: the
// arrows walk the cursor, A acts, B cycles the tool, ? leaves.
const TOOLS = ['BUMPER', 'SLING', 'BANK', 'MAGNET', 'WIPE', 'NAME', 'TEST', 'SAVE']
// #3290 item 4: one source for the palette rect — drawEditor paints it and
// onPointer hit-tests it. y488 clears the VirtualControls pad (the up-arrow
// nub's top measures ≈y515 at 375×812; the old y560 sat fully under it).
const SMITH_BAR = { bw: 38, x0: 28, y0: 488, h: 22 }
const NAME_A = ['SUPER', 'NOVA', 'HYPER', 'IRON', 'MOON', 'TURBO', 'NEON', 'GOLD']
const NAME_B = ['RIDER', 'STAR', 'RUSH', 'COMET', 'KNIGHT', 'DRIFT', 'FANG', 'TIDE']

// The one shape every action takes: candidate def for the tool at (cx,cy),
// or null when the action isn't a placement. act() and the editor's ghost
// both read this, so what the cursor shows green IS what will be accepted.
// #3446 item 1: graduated spinner read — the feed speed carried on the spinner
// event (ev.v = |vy| at the turn) sets how long the flash persists and whether
// the blade smears. A fast ramp feed blurs; a limp outlane trickle does not.
function spinPersist(ev) { return Math.min(14, 4 + Math.round((ev.v || 0) / 60)) }

function toolCandidate(d, cx, cy, tool) {
    const t = TOOLS[tool]
    if (t === 'BUMPER') {
        // the cursor's own zone first (same law the compiler will apply), then the cap
        if (!bumperZoneOk(SMITH_LIMITS, cx, cy)) return 'BUMPER OUT OF ZONE'
        if (d.bumpers.length >= SMITH_LIMITS.bumperMax && !d.bumpers.some((p) => Math.hypot(p[0] - cx, p[1] - cy) < 18)) return 'MAX 3 BUMPS'
        return { ...d, bumpers: [...d.bumpers.filter((p) => Math.hypot(p[0] - cx, p[1] - cy) >= 18), [cx, cy]] }
    }
    if (t === 'SLING') return cx < 180 ? { ...d, slingL: [cx, cy] } : { ...d, slingR: [cx, cy] }
    if (t === 'BANK') return { ...d, bank: [cx, cy] }
    if (t === 'MAGNET') return { ...d, magnet: [cx, cy] }
    return null
}

// WIPE: which part sits under the cursor (nearest within reach), or null.
function wipeTarget(d, cx, cy) {
    let best = null, bd = 26
    d.bumpers.forEach((p, i) => { const dd = Math.hypot(p[0] - cx, p[1] - cy); if (dd < bd) { bd = dd; best = ['bumper', i] } })
    if (d.magnet && Math.hypot(d.magnet[0] - cx, d.magnet[1] - cy) < bd) { bd = Math.hypot(d.magnet[0] - cx, d.magnet[1] - cy); best = ['magnet'] }
    if (d.bank && Math.abs(d.bank[1] - cy) < 16 && Math.abs(cx - d.bank[0]) <= SMITH_LIMITS.bankSpan) best = ['bank']
    const sReach = (sx, sy, tx, ty) => {
        const dx = tx - sx, dy = ty - sy, l2 = dx * dx + dy * dy
        const tt = l2 ? Math.max(0, Math.min(1, ((cx - sx) * dx + (cy - sy) * dy) / l2)) : 0
        return Math.hypot(cx - (sx + dx * tt), cy - (sy + dy * tt))
    }
    if (d.slingL && sReach(d.slingL[0], d.slingL[1], d.slingL[0] + SMITH_LIMITS.slingRun, d.slingL[1] + SMITH_LIMITS.slingDrop) < bd) best = ['slingL']
    if (d.slingR && sReach(d.slingR[0], d.slingR[1], d.slingR[0] - SMITH_LIMITS.slingRun, d.slingR[1] + SMITH_LIMITS.slingDrop) < bd) best = ['slingR']
    return best
}

// #3290 item 6 — ONE part idiom for the whole bench: grab, walk, drop. Every
// part lives in the same def shape, so GRAB reads the exact reach wipeTarget
// already uses for WIPE: whatever the eraser can touch, the hand can lift.
// The tool decides which parts are liftable, the shared reach decides which is
// under the cursor. (Before this, only bumpers moved — 18 px auto-shift — while
// slings, the bank and the magnet replaced themselves where they stood, so the
// same gesture meant two different things depending on the part.)
const GRAB_KINDS = { BUMPER: ['bumper'], SLING: ['slingL', 'slingR'], BANK: ['bank'], MAGNET: ['magnet'] }
const KIND_TOOL = { bumper: 'BUMPER', slingL: 'SLING', slingR: 'SLING', bank: 'BANK', magnet: 'MAGNET' }
function grabTarget(d, cx, cy, tool) {
    const kinds = GRAB_KINDS[TOOLS[tool]]
    if (!kinds) return null
    const w = wipeTarget(d, cx, cy)
    if (!w) return null
    const key = w[0] === 'bumper' ? 'bumper' : w[0]
    if (!kinds.includes(key)) return null
    return w
}

// The draft with the carried part back down at (cx,cy). Bumpers live in an
// array, so the carried one is appended; single-part tools own their key.
function dropDraft(d, kind, cx, cy) {
    return kind === 'bumper'
        ? { ...d, bumpers: [...d.bumpers, [cx, cy]] }
        : { ...d, [kind]: [cx, cy] }
}
// Lifting a part off the draft (the mirror image of dropDraft).
function liftDraft(d, w) {
    const next = { ...d }
    if (w[0] === 'bumper') next.bumpers = d.bumpers.filter((_, i) => i !== w[1])
    else next[w[0]] = null
    return next
}

// ?style=<kit> (#3259) — same URL-override idiom as TidyBot/QBert.
const qStyle = () => { try { return new URLSearchParams(window.location.search).get('style') } catch { return null } }

// Kit memory (#3237 tail): per-cabinet art-kit picks survive a page reload —
// the cabinet you dressed is still dressed when you walk back. ?style=<kit>
// outranks memory; a stale id (kit retired from the registry) falls back to
// the house dress through kitIndex. Private-mode failures are silent by law.
const loadKits = () => { try { const j = JSON.parse(localStorage.getItem(KIT_STORE)); return j && typeof j === 'object' ? j : {} } catch { return {} } }
const saveKit = (tableId, kitId) => { try { const m = loadKits(); m[tableId] = kitId; localStorage.setItem(KIT_STORE, JSON.stringify(m)) } catch { /* private mode: memory is best-effort */ } }

const sfxFor = (ev) => {
    const a = audioController
    switch (ev.type) {
        case 'flip': a.playNoise(0.03, 0.12); a.playTone(150, 0.03, 'triangle', 0.07); break
        case 'bumper': a.playTone(660, 0.05, 'square', 0.12); a.playNoise(0.04, 0.13); a.playTone(880, 0.04, 'square', 0.07, 0.03); break
        case 'sling': a.playTone(320, 0.05, 'square', 0.1); a.playNoise(0.03, 0.09); break
        case 'target': a.playSweep(520, 980, 0.09, 'square', 0.1); break
        case 'bank':
            a.playTone(523, 0.08, 'square', 0.1); a.playTone(659, 0.08, 'square', 0.1, 0.08)
            a.playTone(784, 0.12, 'square', 0.11, 0.16); a.playNoise(0.06, 0.1, 0.2); break
        case 'spinner': a.playTone(1500, 0.025, 'square', 0.05); break
        case 'kicker': a.playSweep(220, 660, 0.15, 'triangle', 0.12); break
        case 'kickback': // #3250: solenoid snap + a harder, higher launch than the kicker
            a.playNoise(0.05, 0.16); a.playSweep(140, 920, 0.14, 'square', 0.13); a.playTone(880, 0.05, 'square', 0.07, 0.1); break
        case 'plunge': a.playSweep(120, 700, 0.22, 'triangle', 0.14); break
        case 'ratchet': a.playTone(160 + 460 * (ev.power || 0), 0.02, 'square', 0.06); a.playNoise(0.015, 0.05); break
        case 'powerzone': a.playTone(110 + ev.zone * 45, 0.05, 'square', 0.12); a.playNoise(0.03, 0.08); break
        case 'drain': a.playSweep(420, 70, 0.35, 'sawtooth', 0.12); a.playNoise(0.15, 0.1); break
        case 'bonus':
            a.playTone(523, 0.05, 'square', 0.08); a.playTone(659, 0.05, 'square', 0.08, 0.06)
            a.playTone(784, 0.09, 'square', 0.09, 0.12); break
        case 'tiltwarn': a.playTone(220, 0.08, 'square', 0.09); break
        case 'tilt': a.playTone(180, 0.28, 'square', 0.13); break
        case 'nudge': a.playNoise(0.05, 0.07); break
        case 'ballstart': a.playTone(784, 0.06, 'square', 0.1); a.playTone(1046, 0.08, 'square', 0.1, 0.07); break
        // ---- rung 2 ----
        case 'ramp': case 'rampL': a.playTone(980, 0.04, 'square', 0.09); break
        // #3432: the flank set rings the same chord as the launch-lane set —
        // same money, same read. kbarm is the save clicking back on.
        // #3438 item 5: the left set now rings a LOWER voicing (D–E–G under the
        // right's D–F#–A) so the two ramps tell apart by ear.
        case 'kbarm':
            a.playTone(660, 0.04, 'square', 0.08); a.playTone(990, 0.07, 'square', 0.08, 0.05); break
        case 'rampset':
            a.playTone(587, 0.07, 'square', 0.1); a.playTone(740, 0.07, 'square', 0.1, 0.06)
            a.playTone(880, 0.1, 'square', 0.11, 0.12); break
        case 'ramplset':
            a.playTone(523, 0.07, 'square', 0.1); a.playTone(659, 0.07, 'square', 0.1, 0.06)
            a.playTone(784, 0.1, 'square', 0.11, 0.12); break
        // lane rollovers step up a pitch ladder with the sweep: each of the
        // three LANE rollovers rings brighter than the last, so the descent
        // teaches its own progress by ear (#3178)
        case 'lane': a.playTone(1240 + 240 * (ev.i || 0), 0.035, 'square', 0.08); break
        case 'lanesweep':
            a.playTone(740, 0.06, 'square', 0.1); a.playTone(988, 0.1, 'square', 0.11, 0.05); break
        case 'lock': a.playTone(196, 0.12, 'square', 0.14); a.playNoise(0.06, 0.12, 0.15); break
        case 'multiball':
            [523, 659, 784, 1046].forEach((f, i) => a.playTone(f, 0.1, 'square', 0.11, i * 0.09))
            a.playSweep(180, 720, 0.3, 'sawtooth', 0.12); break
        case 'save': a.playSweep(330, 880, 0.22, 'triangle', 0.12); break
        case 'extraball': a.playTone(1318, 0.08, 'square', 0.1); a.playTone(1568, 0.12, 'square', 0.1, 0.08); break
        case 'extraballpaid':
            [784, 988, 1175].forEach((f, i) => a.playTone(f, 0.09, 'square', 0.1, i * 0.08)); break
        case 'packdrain': a.playNoise(0.08, 0.08); break
        case 'ballhit': // steel on steel (#3217): bright short clack, pitched by impact
            a.playTone(1750 + 650 * Math.min(1, (ev.v || 0) / 500), 0.035, 'triangle', 0.08);
            a.playTone(2600, 0.02, 'square', 0.05, 0.01); a.playNoise(0.012, 0.05); break
        case 'feed': a.playSweep(140, 420, 0.14, 'triangle', 0.08); break
        case 'gameover':
            [392, 311, 262, 196].forEach((f, i) => a.playTone(f, 0.14, 'square', 0.1, i * 0.13)); break
        // ---- rung 3 ----
        case 'curl': a.playSweep(300, 720, 0.16, 'triangle', 0.08); a.playNoise(0.04, 0.05); break
        case 'orbitarm': a.playTone(1180, 0.03, 'square', 0.07); break
        // magnet grab: a gentler triangle sweep + a breath of air, no sawtooth snarl —
        // it must not mask the chain it feeds into.
        case 'maggrab': a.playSweep(520, 220, 0.10, 'triangle', 0.07); a.playNoise(0.04, 0.05); break
        // orbit completion: a low kick under the triad — bigger than a lane rollover
        case 'orbit':
            a.playTone(196, 0.12, 'square', 0.09);
            [523, 659, 784].forEach((f, i) => a.playTone(f, 0.06, 'square', 0.1, i * 0.05 + 0.02))
            a.playNoise(0.04, 0.06); break
        // orbit set: low kick + triad — louder than the routine ramp set
        case 'orbitset':
            a.playTone(147, 0.15, 'square', 0.1);
            [587, 740, 880, 1175].forEach((f, i) => a.playTone(f, 0.08, 'square', 0.11, i * 0.07 + 0.02)); break
        // orbit lock: a low thump under the ring — chunky, not glassy
        case 'orbitlock':
            a.playTone(98, 0.16, 'sawtooth', 0.09)
            a.playTone(196, 0.12, 'square', 0.14); a.playSweep(900, 300, 0.18, 'sawtooth', 0.08); break
        case 'magfree':
            a.playSweep(320, 1568, 0.12, 'square', 0.09); a.playNoise(0.03, 0.06); break
        case 'magready': a.playTone(1568, 0.05, 'square', 0.05); break
        case 'start': a.playTone(392, 0.07, 'square', 0.1); a.playTone(523, 0.07, 'square', 0.1, 0.07); a.playTone(659, 0.1, 'square', 0.1, 0.14); break
        // cabinet select click (#3232): a dry relay tick, not a jingle
        case 'cabinet': a.playTone(460, 0.025, 'square', 0.07); a.playNoise(0.012, 0.05); break
        // kit dress-flip (#3237): the dress deserves its own sound — a brighter
        // snap than the cabinet relay, so a flip on the row *sounds* different.
        case 'dressflip': a.playSweep(300, 900, 0.06, 'triangle', 0.09); a.playNoise(0.02, 0.05, 0.02); break
        default: break
    }
}

const mkFlash = (tb) => ({
    bumpers: tb.bumpers.map(() => 0), slings: tb.slings.map(() => 0), targets: tb.targets.map(() => 0),
    bank: 0, spinner: 0, drain: 0, tilt: 0, ramp: 0, lane: tb.laneRollovers.map(() => 0), lock: 0, mb: 0,
    flash: 0, // #3178 tower-kick white-out
    orbit: 0, orbitArm: 0, mag: 0, magFree: 0,
    kb: 0, // #3250 kickback pop
    rampL: 0, kbL: 0, kbLArm: 0, // #3432 JET LANE wires + mirror save + re-arm pulse
    wobble: 0, // #3297 tilt-warning cabinet wobble (22 → 0, a damped lean)
    pzone: 0, // #3297 fresh power-zone tick (lights the meter steps briefly)
})

const PinballGame = () => {
    const canvasRef = useRef(null)
    // #1473 seed pin: a filed report carries the seed, feedbackreplay opens
    // `/pinball?seed=N` — honor it at every human start, keep own RNG otherwise.
    const freshSeed = () => (seedFromQuery() ?? (Date.now() >>> 0))
    const cabRef = useRef(0)                    // selected cabinet (#3232), persists across games
    const [cabIdx, setCabIdx] = useState(0)
    // #3359: bumps the React pad/AttractMessage so a garage slot switch (which
    // repaints everything through the canvas) is also reflected by the JSX.
    // The value is never read — the re-render alone redraws the labels.
    const [, setGarageRev] = useState(0)
    // #3259 art kit per cabinet — persists across games and quick-retries, and
    // #3237 across page reloads (localStorage, per cabinet). ?style=<kit>
    // outranks memory on every cabinet that ships the kit.
    const skinRef = useRef(CABS.map((c) => styleIndex(c.tb.id, parseStyle(qStyle()), kitIndex(c.tb.id, loadKits()[c.tb.id]))))
    const gsRef = useRef(makeGame(freshSeed()))
    const keysRef = useRef({ left: false, right: false, a: false, down: false, b: false })
    // #3237 TILT-TO-NUDGE: lean the phone and the cabinet takes a nudge.
    // Consent is the honest tap (iOS wants a gesture, same law as the pad's
    // ENABLE TILT); the lean maps through padTypes.tiltVec (screen-rotation
    // aware, re-centres on the pose in hand) and the fire/latch/re-arm law
    // lives in sim.js — one nudge per lean-and-return, never farmed.
    const [tiltOn, setTiltOn] = useState(false)
    const tiltOnRef = useRef(false)
    tiltOnRef.current = tiltOn
    const tiltBaseRef = useRef({ b: 0, g: 0 })
    const tiltSeenRef = useRef({ b: 0, g: 0 })
    const tiltLatchRef = useRef(false)
    const tiltPulseRef = useRef(0)
    const partsRef = useRef([])
    const flashRef = useRef(mkFlash(TABLE))
    const shakeRef = useRef(0)
    const mbBedRef = useRef(false)
    const soloBedRef = useRef(0) // #3304: quantized level of the running solo bed (0 = off)
    const bedSeamRef = useRef(null) // #3313: {left: ms} while a glide is dipping the bus toward a track swap
    // #3304 DEV rig overlay for the bed seam ONLY: the rules never read it —
    // sim.js owns gs.multiball. The mb bed trigger ORs this in so the live
    // hand-off is driveable without faking pack state (drains stay honest).
    const devMbRef = useRef(false)
    const trailRef = useRef([])
    const ringsRef = useRef([])  // rung 3: expanding event rings (presentation only)
    const fieldsRef = useRef({}) // painted playfield canvas per cabinet id
    // #3237 attract show-off: the self-playing demo sim + its own fx kit.
    const demoRef = useRef(null)
    // #3284 TABLE SMITH state: the working draft (a def, always re-compiled
    // through sim.compileTable), the cursor/tool, and the test-drop redirect.
    const draftRef = useRef(CABS[2].def ? sanitizeDef(CABS[2].def) : sanitizeDef(SMITH_REFS.nova))
    const draftVerRef = useRef(0)
    // carry (#3290 item 6): the part lifted off the bench, {kind, from} —
    // null while every part sits on the field.
    const edRef = useRef({ tool: 0, cx: 180, cy: 190, notice: '', noticeT: 0, nameIdx: 0, carry: null })
    const testBackRef = useRef(false)
    const screenRef = useRef('attract')
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const pausedRef = useRef(false)
    pausedRef.current = paused
    screenRef.current = screen

    // #3237: tilt nudge lives on touch devices with orientation sensors; a
    // desktop with a keyboard keeps B as its nudge.
    const tiltCapable = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
        && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
    const enableTiltNudge = () => {
        const DOE = window.DeviceOrientationEvent
        if (DOE && typeof DOE.requestPermission === 'function') {
            DOE.requestPermission().then((s) => setTiltOn(s === 'granted')).catch(() => setTiltOn(false))
        } else {
            setTiltOn(true)
        }
    }
    const recenterTiltNudge = () => { tiltBaseRef.current = { ...tiltSeenRef.current }; tiltLatchRef.current = false }
    useEffect(() => {
        if (!tiltOn) return undefined
        const onOri = (e) => {
            tiltSeenRef.current = { b: e.beta || 0, g: e.gamma || 0 }
            const angle = (window.screen && window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0
            const v = tiltVec(e.beta || 0, e.gamma || 0, angle, tiltBaseRef.current.b, tiltBaseRef.current.g)
            const r = tiltImpulse(v.x, tiltLatchRef.current)
            tiltLatchRef.current = r.latched
            // Nudges exist only inside an unpaused run, and a finger already
            // holding NUDGE owns the button — a lean that lands on a held b
            // is skipped (it would be swallowed) and re-arms on the return.
            if (r.fire && screenRef.current === 'play' && !pausedRef.current && !keysRef.current.b) {
                keysRef.current.b = true
                tiltPulseRef.current = 2
            }
        }
        const onRot = () => { tiltBaseRef.current = { ...tiltSeenRef.current } }
        window.addEventListener('deviceorientation', onOri)
        window.addEventListener('orientationchange', onRot)
        return () => {
            window.removeEventListener('deviceorientation', onOri)
            window.removeEventListener('orientationchange', onRot)
        }
    }, [tiltOn])

    const setCab = useCallback((i) => {
        const j = ((Math.trunc(i) % CABS.length) + CABS.length) % CABS.length   // #3284: the row wraps through slot 2
        if (j === cabRef.current) return
        cabRef.current = j; setCabIdx(j)
        sfxFor({ type: 'cabinet' })
    }, [])

    // #3259: cycle the selected cabinet's art kit (B / ▲▼ on the row). The
    // wrap law lives in art.js (skinsFor) so pinballcheck pins the same one.
    // #3237 tail: its own dress-flip sound, memory across reloads, and the
    // dress names itself on the attract DMD of the machine being dressed.
    const cycleSkin = useCallback((d) => {
        const id = CABS[cabRef.current].tb.id
        const n = skinsFor(id).length
        const i = (((skinRef.current[cabRef.current] + d) % n) + n) % n
        skinRef.current[cabRef.current] = i
        const kit = skinAt(id, i)
        sfxFor({ type: 'dressflip' })
        saveKit(id, kit.id)
        const dgs = demoRef.current && demoRef.current.gs
        if (dgs) dgs.msg = { text: `KIT ${kit.label}`, t: 110, T: 110 }
    }, [])

    // #3284: the ghost slot's START walks into the TABLE SMITH editor.
    const openEditor = useCallback(() => {
        // The bench opens on the current slot's saved layout — the same legal
        // law buildCABS2 pays: a junk slot (uncompilable def) reads ghost and
        // opens on the smith's own default, never on junk.
        const d = slotDefLegal(garage.slots[garage.sel])
        draftRef.current = d ? { ...d, bumpers: d.bumpers.map((b) => [...b]) } : sanitizeDef(SMITH_REFS.nova)
        draftVerRef.current += 1
        edRef.current = { tool: 0, cx: 180, cy: 190, notice: '', noticeT: 0, nameIdx: 0, carry: null }
        screenRef.current = 'edit'; setScreen('edit')
        sfxFor({ type: 'start' })
    }, [])

    const startPlay = useCallback((cab = cabRef.current) => {
        const j = ((Math.trunc(cab) % CABS.length) + CABS.length) % CABS.length
        if (j === 2 && !CABS[2].saved) { openEditor(); return }   // #3284
        cabRef.current = j; setCabIdx(j)
        const tb = CABS[j].tb
        gsRef.current = makeGame(freshSeed(), tb)
        flashRef.current = mkFlash(tb)
        // #3259: the dress announces itself on the DMD as the ball loads;
        // #3237 tail: if the URL named a kit this cabinet doesn't ship, the
        // strip says NO SUCH KIT instead of dressing silently.
        const sid0 = parseStyle(qStyle())
        gsRef.current.msg = sid0 && styleWarn(tb.id, sid0)
            ? { text: 'NO SUCH KIT', t: 110, T: 110 }
            : { text: `KIT ${skinAt(tb.id, skinRef.current[cabRef.current]).label}`, t: 110, T: 110 }
        partsRef.current = []
        trailRef.current = []
        screenRef.current = 'play'; setScreen('play')
        sfxFor({ type: 'start' })
    }, [openEditor])

    useEffect(() => {
        const cvs = canvasRef.current
        if (!cvs) return undefined
        cvs.width = W; cvs.height = H
        const ctx = cvs.getContext('2d')
        ctx.imageSmoothingEnabled = true
        // field paint cache, keyed per cabinet id + kit (+ smith rev, since a
        // re-saved custom table keeps the id `my-table` but not the layout).
        const fieldFor = (tb, ci) => {
            const k = skinAt(tb.id, skinRef.current[ci ?? cabIndexOf(tb.id)])
            const key = `${tb.id}#${k.id}${ci === 2 ? '#' + myRev : ''}`
            if (!fieldsRef.current[key]) {
                const f = document.createElement('canvas')
                f.width = W; f.height = H
                paintField(f.getContext('2d'), W, H, k.pal, tb)
                fieldsRef.current[key] = f
            }
            return fieldsRef.current[key]
        }
        fieldFor(TABLE); fieldFor(TABLE_TWO)

        const fit = () => {
            const par = cvs.parentElement
            if (!par) return
            const aw = par.clientWidth, ah = par.clientHeight
            const s = Math.min(aw / W, ah / H)
            cvs.style.width = `${Math.floor(W * s)}px`
            cvs.style.height = `${Math.floor(H * s)}px`
        }
        fit()
        window.addEventListener('resize', fit)

        const padNow = () => keysRef.current

        const spawnRing = (x, y, color, max = 34, ticks = 16) => {
            ringsRef.current.push({ x, y, color, t: 0, ticks, max })
        }

        const spawn = (x, y, n, color, spd = 130) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2
                const v = spd * (0.4 + Math.random() * 0.8)
                partsRef.current.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.5 + Math.random() * 0.3, color })
            }
        }

        const react = (gs) => {
            const fl = flashRef.current
            const tb = gs.table, pal = skinAt(tb.id, skinRef.current[cabRef.current]).pal, v = tb.view
            for (const ev of gs.events) {
                sfxFor(ev)
                if (ev.type === 'bumper') { fl.bumpers[ev.i] = 9; spawn(ev.x, ev.y, 10, pal.hot, 190) }
                else if (ev.type === 'sling') { fl.slings[ev.i] = 7; spawn(ev.x, ev.y, 6, pal.sling, 150) }
                else if (ev.type === 'target') { fl.targets[ev.i] = 8; spawn(ev.x, ev.y, 7, pal.neon) }
                else if (ev.type === 'bank') { fl.bank = 40; shakeRef.current = Math.max(shakeRef.current, 5) }
                else if (ev.type === 'spinner') { fl.spinner = Math.max(fl.spinner, spinPersist(ev)); spawn(ev.x, ev.y, 3, pal.glow, 90) }
                else if (ev.type === 'kicker') { spawn(ev.x, ev.y, 12, pal.lane, 220) }
                // #3250 kickback: the loudest rescue on the table — plunger pop,
                // ring, upward shower and a shake (it saves the ball from death).
                // #3432: the left save reads its own lamp (ev.side).
                else if (ev.type === 'kickback') {
                    fl[ev.side === 'L' ? 'kbL' : 'kb'] = 18
                    shakeRef.current = Math.max(shakeRef.current, 8)
                    spawn(ev.x, ev.y, 16, pal.hot, 260)
                    spawnRing(ev.x, ev.y, pal.hot, 30, 16)
                }
                else if (ev.type === 'plunge') { spawn(tb.plunger.x, tb.plunger.restY, 8, pal.chrome, 120) }
                else if (ev.type === 'ratchet') { spawn(tb.plunger.x, 566 + (ev.power || 0) * 14, 2, pal.chrome, 60) }
                else if (ev.type === 'drain') { shakeRef.current = 10; fl.drain = 24 }
                else if (ev.type === 'tilt') { fl.tilt = 90; shakeRef.current = 14 }
                // #3297: the CAREFUL warning visibly rocks the cabinet — a player
                // who has never heard the tone still feels the machine say no.
                else if (ev.type === 'tiltwarn') { fl.wobble = 22 }
                else if (ev.type === 'powerzone') { fl.pzone = 10; spawn(v.meterX + 3, 592 - 60 * (ev.power || 0), 3, pal.hot, 90) }
                else if (ev.type === 'ramp') { fl.ramp = 8; spawn(ev.x, ev.y, 4, pal.lane, 110) }
                else if (ev.type === 'rampset') { fl.ramp = 20; shakeRef.current = Math.max(shakeRef.current, 3) }
                // #3432: the flank lamps live on their own flash field, and the
                // SET gets its own (smaller) shake + a charged ring on the re-arm.
                else if (ev.type === 'rampL') { fl.rampL = 8; spawn(ev.x, ev.y, 4, pal.lane, 110) }
                else if (ev.type === 'ramplset') { fl.rampL = 20; shakeRef.current = Math.max(shakeRef.current, 3) }
                else if (ev.type === 'kbarm') { fl.kbLArm = 24; spawnRing(ev.x, ev.y, pal.hot, 22, 14) }
                else if (ev.type === 'lane') { fl.lane[ev.i] = 8; spawn(v.laneCx, ev.y, 4, pal.lane, 110) }
                else if (ev.type === 'lanesweep') { shakeRef.current = Math.max(shakeRef.current, 3) }
                else if (ev.type === 'lock') { fl.lock = 16; shakeRef.current = Math.max(shakeRef.current, 4) }
                else if (ev.type === 'multiball') {
                    fl.mb = 90; fl.flash = 14; shakeRef.current = Math.max(shakeRef.current, 12)
                    // the tower mouth erupts: a ring + shower from each kick port so the
                    // pack-off lands on a 6-inch screen, not only at desk width (#3178)
                    for (const k of tb.mbKick) { spawnRing(k.x, k.y, pal.glow, 26, 14); spawn(k.x, k.y, 14, pal.glow, 220) }
                }
                // ---- rung 3 (messages are SIM state now — drawn by the DMD) ----
                else if (ev.type === 'curl') spawn(ev.x, ev.y, 4, pal.glow, 90)
                else if (ev.type === 'orbitarm') { fl.orbitArm = 8; spawn(ev.x, ev.y, 6, pal.lane, 100) }
                // orbit completion: a bigger punch than a lane rollover — ring + shower + shake
                else if (ev.type === 'orbit') {
                    fl.orbit = 20; shakeRef.current = Math.max(shakeRef.current, 6)
                    spawn(ev.x, ev.y, 18, pal.lane, 200)
                    spawnRing(ev.x, ev.y, pal.lane, 34, 16)
                }
                // orbit set: the set wave off the done pad — stronger than a ramp set
                else if (ev.type === 'orbitset') {
                    fl.orbit = 34; shakeRef.current = Math.max(shakeRef.current, 8)
                    spawn(tb.orbit.donePad.x, tb.orbit.donePad.y, 16, pal.lane, 180)
                    spawnRing(tb.orbit.donePad.x, tb.orbit.donePad.y, pal.hot, 40, 18)
                }
                // orbit lock: chunky ring + shower at the done pad
                else if (ev.type === 'orbitlock') {
                    fl.orbit = 28; shakeRef.current = Math.max(shakeRef.current, 7)
                    const dx = ev.x ?? tb.orbit.donePad.x, dy = ev.y ?? tb.orbit.donePad.y
                    spawn(dx, dy, 14, pal.hot, 180)
                    spawnRing(dx, dy, pal.hot, 36, 18)
                }
                else if (ev.type === 'maggrab') { fl.mag = 14; spawn(ev.x, ev.y, 8, pal.mag, 120) }
                // magfree snap deserves the same treatment as an orbit beat
                else if (ev.type === 'magfree') {
                    fl.magFree = 18; shakeRef.current = Math.max(shakeRef.current, 2)
                    spawn(ev.x, ev.y, 16, pal.mag, 190)
                    spawnRing(ev.x, ev.y, pal.mag, 30, 16)
                }
                else if (ev.type === 'magready') { fl.mag = 8 }
                else if (ev.type === 'ballhit') spawn(ev.x, ev.y, 5, pal.chrome, 150)
            }
            gs.events.length = 0
        }

        // ---- attract show-off (#3237): the row plays itself ----
        // The attract background and the selected mini-card are the SELECTED
        // cabinet running the demo bot (sim.js demoPad — the same medium-plunge
        // line pinballcheck proves human-winnable) through the game's own
        // drawTable, painted into an offscreen canvas once per frame. The play
        // path stays byte-identical: MAIN wraps the live refs through getters
        // (startPlay swaps flashRef/partsRef/trailRef — getters track that).
        const dCan = document.createElement('canvas')
        dCan.width = W; dCan.height = H
        const dCtx = dCan.getContext('2d')
        const MAIN = {
            ctx,
            getFl: () => flashRef.current, getTrail: () => trailRef.current,
            getParts: () => partsRef.current, getRings: () => ringsRef.current,
            getShk: () => shakeRef,
        }
        let demoRuns = 0
        const attractLine = (id) => { const l = ATTRACT_DMD[id] || ATTRACT_DMD['cabinet-one']; return l[demoRuns % l.length] }
        const demoRebuild = () => {
            // #3290 item 2: an unsaved smith slot demos NOVA — the layout the
            // bench opens with — and sells the bench itself on the strip.
            const ghost = !!CABS[cabRef.current].custom && !CABS[cabRef.current].saved
            const gs = makeGame((0xa11ce + demoRuns * 7919) >>> 0, previewTb(cabRef.current))
            demoRuns += 1
            const sid = parseStyle(qStyle())
            // every run opens with an ad line on the strip; a ?style naming a
            // kit this cabinet doesn't ship answers instead of silence.
            gs.msg = { text: sid && !ghost && styleWarn(gs.table.id, sid) ? 'NO SUCH KIT' : attractLine(ghost ? 'ghost' : gs.table.id), t: 200, T: 200 }
            demoRef.current = { gs, fl: mkFlash(gs.table), trail: [], parts: [], rings: [], shk: { current: 0 }, mbSeen: false, sinceMb: 0, acc: 0, sid }
        }
        demoRebuild()
        const DLIVE = {
            ctx: dCtx,
            getFl: () => demoRef.current.fl, getTrail: () => demoRef.current.trail,
            getParts: () => demoRef.current.parts, getRings: () => demoRef.current.rings,
            getShk: () => demoRef.current.shk,
        }
        const sparkD = (d, x, y, n, color, spd = 160) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2
                const v = spd * (0.4 + Math.random() * 0.8)
                d.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.4 + Math.random() * 0.3, color })
            }
        }
        const ringD = (d, x, y, color, max = 30, ticks = 15) => { d.rings.push({ x, y, color, t: 0, ticks, max }) }
        // event juice for the demo — the same lamps the player's hits light,
        // minus the audio: an attract mode that talks over the row stays quiet.
        const reactDemo = (gs, d) => {
            const fl = d.fl
            const pal = skinAt(gs.table.id, skinRef.current[cabRef.current]).pal
            for (const ev of gs.events) {
                if (ev.type === 'bumper') { fl.bumpers[ev.i] = 9; sparkD(d, ev.x, ev.y, 8, pal.hot, 190) }
                else if (ev.type === 'sling') { fl.slings[ev.i] = 7; sparkD(d, ev.x, ev.y, 5, pal.sling) }
                else if (ev.type === 'target') { fl.targets[ev.i] = 8 }
                else if (ev.type === 'bank') { fl.bank = 40; d.shk.current = Math.max(d.shk.current, 4) }
                else if (ev.type === 'spinner') { fl.spinner = Math.max(fl.spinner, spinPersist(ev)) }
                else if (ev.type === 'kicker') { sparkD(d, ev.x, ev.y, 9, pal.lane, 220) }
                else if (ev.type === 'kickback') { fl[ev.side === 'L' ? 'kbL' : 'kb'] = 18; sparkD(d, ev.x, ev.y, 12, pal.hot, 240) }
                else if (ev.type === 'ramp') { fl.ramp = 8; sparkD(d, ev.x, ev.y, 4, pal.lane, 110) }
                else if (ev.type === 'rampset') { fl.ramp = 20 }
                else if (ev.type === 'rampL') { fl.rampL = 8; sparkD(d, ev.x, ev.y, 4, pal.lane, 110) }
                else if (ev.type === 'ramplset') { fl.rampL = 20 }
                else if (ev.type === 'kbarm') { fl.kbLArm = 24 }
                else if (ev.type === 'lane') { fl.lane[ev.i] = 8; sparkD(d, ev.x, ev.y, 4, pal.lane, 110) }
                else if (ev.type === 'powerzone') { fl.pzone = 10 }
                else if (ev.type === 'lock') {
                    fl.lock = 16; d.shk.current = Math.max(d.shk.current, 4)
                    ringD(d, gs.table.view.lockCx, gs.table.view.lockGlowY, pal.hot)
                }
                else if (ev.type === 'multiball') {
                    fl.mb = 90; fl.flash = 14; d.shk.current = Math.max(d.shk.current, 10)
                    for (const k of gs.table.mbKick) { ringD(d, k.x, k.y, pal.glow, 24, 13); sparkD(d, k.x, k.y, 10, pal.glow, 200) }
                }
                else if (ev.type === 'orbitarm') { fl.orbitArm = 8 }
                else if (ev.type === 'orbit') { fl.orbit = 20; sparkD(d, ev.x, ev.y, 12, pal.lane, 180); ringD(d, ev.x, ev.y, pal.lane) }
                else if (ev.type === 'orbitset') { fl.orbit = 34; ringD(d, gs.table.orbit.donePad.x, gs.table.orbit.donePad.y, pal.hot, 36, 18) }
                else if (ev.type === 'orbitlock') { fl.orbit = 28 }
                else if (ev.type === 'maggrab') { fl.mag = 14 }
                else if (ev.type === 'magfree') { fl.magFree = 18; ringD(d, ev.x, ev.y, pal.mag) }
            }
            gs.events.length = 0
        }
        // the demo clock: fixed steps through the real sim, a lamp chase over
        // the first bars of a run (bumpers chase, lane ripple, pad + lock
        // slam — the cabinet does its trick before the ball even earns it),
        // and the demoOver law re-deals after the money shot.
        const stepDemo = (dt) => {
            const d = demoRef.current
            d.acc += dt
            let steps = 0
            while (d.acc >= FIXED_DT && steps < 8) {
                const gs = d.gs
                const t = gs.tick
                if (t <= 84) {
                    const b = t % 12
                    if (b < 3) d.fl.bumpers[b] = Math.max(d.fl.bumpers[b], 9)
                    const l = t - 30
                    if (l >= 0 && l < 15 && l % 5 === 0) d.fl.lane[l / 5] = 8
                    if (t === 50) d.fl.ramp = 10
                    if (t === 58) d.fl.orbitArm = 8
                    if (t === 66) d.fl.orbit = 20
                    if (t === 74) d.fl.lock = 14
                }
                stepGame(gs, demoPad(gs, t))
                reactDemo(gs, d)
                if (gs.multiball) { d.mbSeen = true; d.sinceMb = 0 } else if (d.mbSeen) d.sinceMb += 1
                if (demoOver(gs, d.mbSeen, d.sinceMb)) demoRebuild()
                d.acc -= FIXED_DT; steps += 1
            }
        }
        // picking a machine re-deals its demo — the card you look at is the
        // machine you're about to play, dressed in the kit you left it in.
        const selCab = (i) => { setCab(i); demoRebuild() }

        // #3359: the garage — move the slot-2 card to another saved slot. The
        // choice persists; the smith's own draft is NOT reset (the bench owns
        // the draft) but the painted-field cache must never show the previous
        // slot's layout, so every `my-table#` cache entry dies here.
        const selectSlot = (i) => {
            if (!Number.isInteger(i) || i < 0 || i >= GARAGE_SLOTS || i === garage.sel) return
            garage.sel = i
            saveGarageSlotSel(i)
            CABS[2] = buildCABS2(i)
            myRev += 1
            for (const k of Object.keys(fieldsRef.current)) if (k.startsWith('my-table#')) delete fieldsRef.current[k]
            demoRebuild()
            setGarageRev((r) => r + 1)
            sfxFor({ type: 'cabinet' })
        }

        // ---------------------------------------------------------------- draw ----
        const drawTable = (gs, L = MAIN) => {
            const ctx = L.ctx
            const shk = L.getShk()
            const tb = gs.table, pal = skinAt(tb.id, skinRef.current[cabRef.current]).pal, v = tb.view
            ctx.save()
            if (shk.current > 0) {
                ctx.translate((Math.random() - 0.5) * shk.current, (Math.random() - 0.5) * shk.current)
                shk.current = Math.max(0, shk.current - 0.7)
            }
            // #3297 tilt-warning wobble: a quick damped rock of the whole cabinet
            // (deterministic — driven by gs.tick, not Math.random — so replays
            // and the attract demo show it the same way every time).
            const wob = L.getFl().wobble
            if (wob > 0) {
                ctx.translate(W / 2, H / 2)
                ctx.rotate(Math.sin(gs.tick * 0.9) * 0.018 * (wob / 22))
                ctx.translate(-W / 2, -H / 2)
            }
            ctx.drawImage(fieldFor(tb, cabRef.current), 0, 0)

            // cabinet rail + arc wall
            ctx.strokeStyle = pal.wood; ctx.lineWidth = 10; ctx.lineCap = 'round'
            ctx.beginPath()
            const arc = tb.arc
            for (let i = 0; i <= arc.segs; i++) {
                const a = arc.from + (arc.to - arc.from) * (i / arc.segs)
                const x = arc.cx + Math.cos(a) * arc.rx, y = arc.cy + Math.sin(a) * arc.ry
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
            }
            ctx.stroke()
            ctx.strokeStyle = pal.woodHi; ctx.lineWidth = 3; ctx.stroke()

            // side walls / lane / aprons — neon-roped rubber look
            ctx.strokeStyle = pal.chrome; ctx.lineWidth = 3
            for (const w of tb.walls) {
                ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke()
            }
            const og = tb.outlaneGuide
            ctx.beginPath(); ctx.moveTo(og.x1, og.y1); ctx.lineTo(og.x2, og.y2); ctx.stroke()

            // lane guide glow down the launch lane
            ctx.save(); ctx.globalAlpha = 0.35 + 0.25 * Math.sin(gs.tick / 8)
            ctx.strokeStyle = pal.lane; ctx.lineWidth = 2
            ctx.beginPath(); ctx.moveTo(tb.plunger.x, 520); ctx.lineTo(tb.plunger.x, 210); ctx.stroke()
            ctx.restore()

            const fl = L.getFl()
            Object.keys(fl).forEach((k) => { if (Array.isArray(fl[k])) fl[k] = fl[k].map((x) => Math.max(0, x - 1)); else fl[k] = Math.max(0, fl[k] - 1) })

            // ---- rung 2: firelane lamp set + rollover rings + lock tower ----
            {
                const lit = gs.lockFlash > 0 || gs.mbFlash > 0
                // lane rope glow while the lane is armed (pulses when a lock is banked)
                ctx.save()
                ctx.globalAlpha = 0.22 + 0.18 * Math.sin(gs.tick / 9) + (lit ? 0.25 : 0)
                ctx.strokeStyle = pal.lane; ctx.lineWidth = 2
                ctx.beginPath(); ctx.moveTo(v.laneCx, 200); ctx.lineTo(v.laneCx, 430); ctx.stroke()
                ctx.restore()
                // descending LANE rollovers
                tb.laneRollovers.forEach((lr, i) => {
                    const glow = fl.lane[i]
                    ctx.save()
                    ctx.strokeStyle = glow > 0 ? '#ffffff' : pal.lane
                    ctx.globalAlpha = glow > 0 ? 0.95 : 0.5
                    ctx.lineWidth = 2.5
                    ctx.beginPath(); ctx.arc(v.laneCx, lr.y, 7, 0, 7); ctx.stroke()
                    if (glow > 0) { ctx.shadowColor = pal.lane; ctx.shadowBlur = 14; ctx.stroke() }
                    ctx.restore()
                })
                // RAMP rollovers in the launch lane
                tb.rampRollovers.forEach((rr) => {
                    ctx.save()
                    ctx.strokeStyle = fl.ramp > 0 ? '#ffffff' : pal.lane
                    ctx.globalAlpha = fl.ramp > 0 ? 0.95 : 0.45
                    ctx.lineWidth = 2.5
                    ctx.beginPath(); ctx.arc(v.rampCx, rr.y, 7, 0, 7); ctx.stroke()
                    ctx.restore()
                })
                // #3432: JET LANE — the left ramp. Flank rope, chrome wire pair,
                // two progress lamps and a SET lamp; the flank has its own flash
                // field so the two ramps never cross-light.
                if (tb.rampL) {
                    const rcx = (tb.rampL.x1 + tb.rampL.x2) / 2
                    if (gs.rampLHits > 0 || fl.rampL > 0) {
                        ctx.save()
                        ctx.globalAlpha = 0.18 + 0.14 * Math.sin(gs.tick / 9)
                        ctx.strokeStyle = pal.lane; ctx.lineWidth = 2
                        ctx.beginPath(); ctx.moveTo(rcx, 284); ctx.lineTo(rcx, 372); ctx.stroke()
                        ctx.restore()
                    }
                    tb.rampL.rolls.forEach((rr) => {
                        ctx.save()
                        ctx.strokeStyle = fl.rampL > 0 ? '#ffffff' : pal.lane
                        ctx.globalAlpha = fl.rampL > 0 ? 0.95 : 0.45
                        ctx.lineWidth = 2.5
                        ctx.beginPath(); ctx.arc(rcx, rr.y, 7, 0, 7); ctx.stroke()
                        ctx.restore()
                    })
                    for (let i = 0; i < tb.rampL.rolls.length; i++) {
                        const on = gs.rampLHits > i || fl.rampL > 0
                        ctx.fillStyle = on ? '#ffffff' : pal.hotOff
                        ctx.beginPath(); ctx.arc(rcx - 6 + i * 12, 288, 2.4, 0, 7); ctx.fill()
                    }
                    if (gs.rampLLit) {
                        ctx.save()
                        ctx.shadowColor = pal.hot; ctx.shadowBlur = 8 + 4 * Math.sin(gs.tick / 6)
                        ctx.fillStyle = (gs.tick >> 3) % 2 === 0 ? '#ffffff' : pal.hot
                        ctx.beginPath(); ctx.arc(rcx, 276, 3, 0, 7); ctx.fill()
                        ctx.restore()
                    }
                    // #3438 item 2: lane-entry chevrons above the flank flipper —
                    // a steady upward pulse teaching the line into the corridor;
                    // brighter once the flank is scoring. Visual only, no law.
                    ctx.save()
                    ctx.strokeStyle = pal.lane
                    ctx.globalAlpha = 0.28 + 0.18 * Math.sin(gs.tick / 10) + (gs.rampLHits > 0 ? 0.25 : 0)
                    ctx.lineWidth = 2.5
                    for (const yy of [428, 442]) {
                        ctx.beginPath(); ctx.moveTo(rcx - 9, yy); ctx.lineTo(rcx, yy - 11); ctx.lineTo(rcx + 9, yy); ctx.stroke()
                    }
                    ctx.restore()
                }
                // lock tower — a chrome gate housing with three lock lamps
                ctx.save()
                const tg = ctx.createLinearGradient(v.towerX1, 0, v.towerX2, 0)
                tg.addColorStop(0, 'rgba(201,212,232,0.25)'); tg.addColorStop(0.5, 'rgba(201,212,232,0.08)'); tg.addColorStop(1, 'rgba(201,212,232,0.25)')
                ctx.fillStyle = tg
                ctx.beginPath(); ctx.moveTo(v.towerX1, v.lockBase); ctx.lineTo(v.towerX2, v.lockBase); ctx.lineTo(v.towerIn2, v.lockTop); ctx.lineTo(v.towerIn1, v.lockTop); ctx.closePath(); ctx.fill()
                ctx.strokeStyle = pal.chrome; ctx.lineWidth = 2
                ctx.beginPath(); ctx.moveTo(v.towerX1, v.lockBase); ctx.lineTo(v.towerIn1, v.lockTop); ctx.lineTo(v.towerIn2, v.lockTop); ctx.lineTo(v.towerX2, v.lockBase); ctx.stroke()
                for (let i = 0; i < tb.lock.need; i++) {
                    const on = i < gs.locks
                    const pulse = on && (gs.tick >> 3) % 2 === 0
                    ctx.fillStyle = on ? (pulse ? '#ffffff' : pal.hot) : pal.hotOff
                    if (on) { ctx.shadowColor = pal.hot; ctx.shadowBlur = 10 }
                    ctx.beginPath(); ctx.arc(v.lampX0 + i * v.lockLampStep, v.lampY, v.lockLampR, 0, 7); ctx.fill()
                    ctx.shadowBlur = 0
                }
                // #3297 gate slam: a chrome gate slams shut across the tower mouth
                // while balls are banked, and lifts on the pack-off. Same gs.locks
                // truth the lamps read — this is the mouth lip-syncing the capture.
                let gateAmt = 0
                if (gs.locks > 0) gateAmt = Math.min(1, (16 - fl.lock) / 6)
                else if (gs.multiball && fl.mb > 60) gateAmt = (fl.mb - 60) / 30
                if (gateAmt > 0) {
                    const gw = v.towerIn2 - v.towerIn1
                    const gy = v.lockTop - 14 * (1 - gateAmt)
                    ctx.fillStyle = 'rgba(4,6,15,0.5)'
                    ctx.fillRect(v.towerIn1, v.lockTop, gw, 13)
                    const gg = ctx.createLinearGradient(0, gy, 0, gy + 12)
                    gg.addColorStop(0, pal.chrome); gg.addColorStop(1, 'rgba(96,108,132,0.92)')
                    ctx.fillStyle = gg
                    ctx.fillRect(v.towerIn1 + 1, gy, gw - 2, 12)
                    ctx.fillStyle = 'rgba(4,6,15,0.35)'
                    ctx.fillRect(v.towerIn1 + 1, gy + 4, gw - 2, 1.5)
                    ctx.fillRect(v.towerIn1 + 1, gy + 8, gw - 2, 1.5)
                    const impact = gs.locks > 0 && fl.lock > 0 && fl.lock <= 10 ? fl.lock / 10 : 0
                    if (impact > 0) {
                        ctx.globalAlpha = impact
                        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2
                        ctx.strokeRect(v.towerIn1, gy - 1, gw, 14)
                        ctx.globalAlpha = 1
                    }
                }
                if (fl.lock > 0) {
                    const rg = ctx.createRadialGradient(v.lockCx, v.lockGlowY, 4, v.lockCx, v.lockGlowY, 34)
                    rg.addColorStop(0, `rgba(${pal.hotRgb},${0.5 * (fl.lock / 16)})`); rg.addColorStop(1, `rgba(${pal.hotRgb},0)`)
                    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(v.lockCx, v.lockGlowY, 34, 0, 7); ctx.fill()
                }
                ctx.restore()
            }
            // ---- rung 3: orbit pads + bank lamps + magnet post ----
            {
                const armed = gs.pucks.some((p) => p.orbitArmed)
                const S = tb.orbit.ch.side
                // climbing-rail glow while a ball is armed for the wrap:
                // a thicker rail + 3 chevrons sweeping up the channel
                if (armed) {
                    ctx.save(); ctx.globalAlpha = 0.5 + 0.2 * Math.sin(gs.tick / 6)
                    ctx.strokeStyle = pal.lane; ctx.lineWidth = 3
                    ctx.beginPath(); ctx.moveTo(v.railCx, v.chBot); ctx.lineTo(v.railCx, v.chTop + 3); ctx.stroke()
                    ctx.restore()
                    ctx.save(); ctx.globalAlpha = 0.75; ctx.lineWidth = 2.5
                    ctx.strokeStyle = pal.lane
                    for (let i = 0; i < 3; i++) {
                        const yy = v.chBot - ((gs.tick * 2.2 + i * 85) % (v.chBot - v.chTop + 27))
                        if (yy < v.chTop + 3) continue
                        ctx.beginPath(); ctx.moveTo(v.railCx - v.chevSplay * S, yy); ctx.lineTo(v.railCx, yy - 12); ctx.lineTo(v.railCx + v.chevSplay * S, yy); ctx.stroke()
                    }
                    ctx.restore()
                }
                // arm pad — hot while armed
                ctx.save()
                const al = armed || fl.orbitArm > 0
                ctx.strokeStyle = al ? '#ffffff' : pal.lane
                ctx.globalAlpha = al ? 0.95 : 0.45
                ctx.lineWidth = 3
                ctx.beginPath(); ctx.arc(tb.orbit.armPad.x, tb.orbit.armPad.y, 8, 0, 7); ctx.stroke()
                if (al) { ctx.shadowColor = pal.lane; ctx.shadowBlur = 18; ctx.stroke() }
                ctx.restore()
                // done pad — hot while the set is lit / just scored
                ctx.save()
                const dl = gs.orbitLit || fl.orbit > 0
                ctx.strokeStyle = dl ? pal.hot : pal.lane
                ctx.globalAlpha = dl ? 0.95 : 0.45
                ctx.lineWidth = 3
                ctx.beginPath(); ctx.arc(tb.orbit.donePad.x, tb.orbit.donePad.y, 8, 0, 7); ctx.stroke()
                if (dl) { ctx.shadowColor = pal.hot; ctx.shadowBlur = 18; ctx.stroke() }
                ctx.restore()
                // orbit bank lamps, seated under the DMD insert
                for (let i = 0; i < tb.orbit.need; i++) {
                    const on = gs.orbitLit || i < gs.orbitBank
                    const pulse = on && (gs.tick >> 3) % 2 === 0
                    ctx.fillStyle = on ? (pulse ? '#ffffff' : pal.hot) : pal.hotOff
                    if (on) { ctx.shadowColor = pal.hot; ctx.shadowBlur = 8 }
                    ctx.beginPath(); ctx.arc(v.orbitLampX0 + i * 12, 276, 3, 0, 7); ctx.fill()
                    ctx.shadowBlur = 0
                }
                // magnet post — halo pulses while armed; energy tether
                // and bloom while it holds a ball; dull when spent.
                if (tb.magnet) {                          // #3284: a smithed table may skip the magnet
                    const M = tb.magnet
                    const held = gs.magHold > 0
                    const charge = gs.magCharge > 0
                    ctx.save()
                    if (charge) {
                        ctx.globalAlpha = 0.14 + 0.1 * Math.sin(gs.tick / 5)
                        ctx.strokeStyle = pal.mag; ctx.lineWidth = 2
                        ctx.beginPath(); ctx.arc(M.x, M.y, M.field * (0.7 + 0.3 * Math.sin(gs.tick / 9)), 0, 7); ctx.stroke()
                    }
                    if (held) {
                        const rg = ctx.createRadialGradient(M.x, M.y, 4, M.x, M.y, 30)
                        rg.addColorStop(0, `rgba(${pal.magRgb},0.55)`); rg.addColorStop(1, `rgba(${pal.magRgb},0)`)
                        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(M.x, M.y, 30, 0, 7); ctx.fill()
                        const hp = gs.pucks.find((p) => p.magHeld)
                        if (hp) {
                            ctx.globalAlpha = 0.7; ctx.strokeStyle = pal.mag; ctx.lineWidth = 1.5
                            ctx.beginPath(); ctx.moveTo(M.x, M.y); ctx.lineTo(hp.bx, hp.by); ctx.stroke()
                        }
                    }
                    ctx.globalAlpha = 1
                    if (fl.mag > 0) { ctx.shadowColor = pal.mag; ctx.shadowBlur = 16 }
                    ctx.fillStyle = charge ? pal.mag : pal.magOff
                    ctx.beginPath(); ctx.arc(M.x, M.y, M.r, 0, 7); ctx.fill()
                    ctx.shadowBlur = 0
                    ctx.strokeStyle = pal.chrome; ctx.lineWidth = 2
                    ctx.beginPath(); ctx.arc(M.x, M.y, M.r + 2.5, 0, 7); ctx.stroke()
                    ctx.fillStyle = pal.chrome; ctx.beginPath(); ctx.arc(M.x, M.y, 2.5, 0, 7); ctx.fill()
                    ctx.restore()
                }
            }
            tb.bumpers.forEach((b, i) => {
                const glow = fl.bumpers[i]
                ctx.save()
                if (glow > 0) {
                    const rg = ctx.createRadialGradient(b.x, b.y, b.r, b.x, b.y, b.r + 26)
                    rg.addColorStop(0, `rgba(${pal.hotRgb},${0.5 * (glow / 9)})`); rg.addColorStop(1, `rgba(${pal.hotRgb},0)`)
                    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 26, 0, 7); ctx.fill()
                }
                ctx.strokeStyle = pal.chrome; ctx.lineWidth = 3
                ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, 0, 7); ctx.stroke()
                const cap = ctx.createRadialGradient(b.x - 4, b.y - 5, 2, b.x, b.y, b.r)
                cap.addColorStop(0, glow > 0 ? '#ffffff' : pal.capHi); cap.addColorStop(1, pal.hot)
                ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill()
                ctx.restore()
            })

            // slingshots
            tb.slings.forEach((s, i) => {
                ctx.save()
                if (fl.slings[i] > 0) { ctx.shadowColor = pal.sling; ctx.shadowBlur = 14 }
                ctx.strokeStyle = pal.sling; ctx.lineWidth = 6; ctx.lineCap = 'round'
                ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke()
                ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke()
                ctx.restore()
            })

            // drop targets: up = glowing bars, down = dark slots
            tb.targets.forEach((tp, i) => {
                const down = gs.targetDown[i]
                ctx.save()
                if (down) {
                    ctx.fillStyle = 'rgba(10,14,30,0.9)'
                    ctx.fillRect(tp.x1, tb.targetY - 3, tp.x2 - tp.x1, 6)
                } else {
                    if (fl.targets[i] > 0) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16 }
                    ctx.fillStyle = fl.bank > 0 ? '#9ff3ff' : pal.neon
                    ctx.fillRect(tp.x1, tb.targetY - 3, tp.x2 - tp.x1, 6)
                    ctx.fillStyle = 'rgba(255,255,255,0.7)'
                    ctx.fillRect(Math.min(tp.x1, tp.x2) + 2, tb.targetY - 2, 3, 4)
                }
                ctx.restore()
            })

            // rung 3: the DMD insert — text is SIM state (gs.msg); when idle
            // it crawls live status. Balls roll over it like glass over LEDs.
            drawDMD(ctx, {
                text: gs.msg.t > 0 ? gs.msg.text : '', t: gs.msg.t, T: gs.msg.T || 0, tick: gs.tick,
                idle: dmdIdle(gs.score, gs.mult, gs.balls, gs.locks, gs.orbitBank, gs.orbitLit, gs.magCharge)[Math.floor(gs.tick / 96) % 4],
                // #3313 item 2 heat tell: the bed swells 0.16→0.30 with the run
                // and nothing on the table said so — the DMD now warms with the
                // SAME law value the bus rides, so the swell is taught, not felt.
                heat: Math.max(0, Math.min(1, soloBed(gs) / SOLO_CAP)),
            }, pal)

            // spinner (outlane): tilts while a ball passes through
            const p0 = gs.pucks[0] || { spin: 0, spinArm: true }
            const sp = tb.spinner
            ctx.save()
            ctx.translate(v.spinnerX, (sp.yFrom + sp.yTo) / 2)
            const bladeA = p0.spinArm ? 0.4 : 0.4 + (p0.spin / sp.pxPerTurn) * Math.PI * 2 + gs.spinnerTurns * 0.6
            // #3446 item 1: motion ghosts trail the blade — flash persistence encodes
            // feed speed (spinPersist), so a fast feed smears, a trickle doesn't.
            if (!p0.spinArm && fl.spinner > 8) {
                for (let g = 2; g >= 1; g--) {
                    ctx.save()
                    ctx.rotate(bladeA - g * (0.08 + fl.spinner * 0.011))
                    ctx.fillStyle = `rgba(255,255,255,${(0.28 - g * 0.1).toFixed(2)})`
                    ctx.fillRect(-2, -14, 4, 28)
                    ctx.restore()
                }
            }
            ctx.rotate(bladeA)
            ctx.fillStyle = fl.spinner > 0 ? '#ffffff' : pal.chrome
            ctx.fillRect(-2, -14, 4, 28)
            ctx.restore()
            // kicker mouth
            ctx.fillStyle = `rgba(${pal.kickerRgb},${0.25 + 0.2 * Math.sin(gs.tick / 7)})`
            ctx.beginPath(); ctx.moveTo(v.outMouthX1, 505); ctx.lineTo(v.outMouthX2, 505); ctx.lineTo(v.outMouthTip, 526); ctx.closePath(); ctx.fill()

            // #3250 KICKBACK — chrome button in a rubber ring at the drain mouth,
            // armed-pulse while its one save per ball is live, plunger pop on fire.
            // #3432: the mirror save shares the draw; a freshly RE-armed left
            // save rings white (kbLArm) so the ramp→save combo is visible.
            const kbUnits = [[tb.kb, gs.kbUsed, fl.kb, 0]]
            if (tb.kbL) kbUnits.push([tb.kbL, gs.kbLUsed, fl.kbL, fl.kbLArm])
            for (const [KB, used, lit, arm] of kbUnits) {
                const kbCx = (KB.x1 + KB.x2) / 2, kbCy = KB.yFrom - 3
                const kbArmed = !used && gs.launched && !gs.done
                const kbLit = lit > 0
                ctx.save()
                if (kbLit) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16 }
                else if (arm > 0) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 12 + 6 * Math.sin(gs.tick / 4) }
                else if (kbArmed) { ctx.shadowColor = pal.hot; ctx.shadowBlur = 8 + 5 * Math.sin(gs.tick / 6) }
                // plunger shaft pops up through the ring on fire
                if (kbLit) {
                    ctx.fillStyle = pal.chrome
                    ctx.fillRect(kbCx - 4, kbCy - (lit / 18) * 10, 8, (lit / 18) * 10 + 4)
                }
                // rubber ring
                ctx.strokeStyle = kbLit || arm > 0 ? '#ffffff' : (kbArmed ? pal.hot : 'rgba(148,163,184,0.5)')
                ctx.lineWidth = 3
                ctx.beginPath(); ctx.arc(kbCx, kbCy, 7.5, 0, 7); ctx.stroke()
                // chrome face
                ctx.fillStyle = kbLit ? '#ffffff'
                    : arm > 0 ? `rgba(255,255,255,${0.55 + 0.35 * Math.sin(gs.tick / 4)})`
                    : kbArmed ? `rgba(${pal.hotRgb},${0.55 + 0.3 * Math.sin(gs.tick / 6)})`
                    : 'rgba(148,163,184,0.35)'
                ctx.beginPath(); ctx.arc(kbCx, kbCy, 4.5, 0, 7); ctx.fill()
                ctx.restore()
            }

            // flippers — chrome capsules
            const f = tb.flippers
            ;['L', 'R'].forEach((side) => {
                const px = side === 'L' ? f.L.px : f.R.px
                const a = gs.ang[side] * Math.PI / 180
                ctx.save()
                ctx.shadowColor = pal.glow; ctx.shadowBlur = gs.angV[side] !== 0 ? 12 : 4
                ctx.strokeStyle = gs.tilt ? '#5a6478' : pal.chrome
                ctx.lineWidth = f.halfW * 2; ctx.lineCap = 'round'
                ctx.beginPath(); ctx.moveTo(px, f.pivotY); ctx.lineTo(px + Math.cos(a) * f.len, f.pivotY + Math.sin(a) * f.len); ctx.stroke()
                ctx.fillStyle = pal.woodHi; ctx.beginPath(); ctx.arc(px, f.pivotY, 5, 0, 7); ctx.fill()
                ctx.restore()
            })

            // plunger: spring + power meter
            const pPull = gs.launched ? 0 : gs.power
            ctx.strokeStyle = pal.chrome; ctx.lineWidth = 4
            ctx.beginPath(); ctx.moveTo(tb.plunger.x, 564 + pPull * 14); ctx.lineTo(tb.plunger.x, 586 + pPull * 14); ctx.stroke()
            if (!gs.launched) {
                if (gs.power > 0.02) {
                    ctx.fillStyle = pal.hot
                    ctx.fillRect(v.meterX, 592 - 60 * gs.power, 6, 60 * gs.power)
                }
                // #3297: three power zones (LIGHT / FIRM / MAX) — fixed steps on
                // the bar so the pull reads in three mechanical stages even muted.
                for (let z = 1; z <= 2; z++) {
                    const zy = 592 - 20 * z
                    const passed = gs.power >= z / 3
                    ctx.fillStyle = passed ? (fl.pzone > 0 ? '#ffffff' : pal.hot) : 'rgba(201,212,232,0.45)'
                    ctx.fillRect(v.meterX - 2, zy, 10, passed ? 2 : 1)
                }
                if (gs.powerZone === 3) {
                    ctx.fillStyle = fl.pzone > 0 ? '#ffffff' : pal.hot
                    ctx.fillRect(v.meterX - 2, 530, 10, 3)
                }
            }

            // trails + every live ball (MULTIBALL draws the whole pack)
            const tr = L.getTrail()
            if (gs.pucks.length) {
                tr.push({ x: gs.pucks[0].bx, y: gs.pucks[0].by })
                if (tr.length > 7) tr.shift()
                tr.forEach((p, i) => {
                    const a = (i / tr.length) * 0.28
                    ctx.fillStyle = `rgba(${pal.trailRgb},${a.toFixed(3)})`
                    ctx.beginPath(); ctx.arc(p.x, p.y, BALL_R * (0.5 + 0.5 * i / tr.length), 0, 7); ctx.fill()
                })
            } else tr.length = 0
            for (const p of gs.pucks) {
                const bg = ctx.createRadialGradient(p.bx - 3, p.by - 4, 1, p.bx, p.by, BALL_R)
                bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.55, '#aab8cf'); bg.addColorStop(1, '#39435a')
                ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(p.bx, p.by, BALL_R, 0, 7); ctx.fill()
                ctx.fillStyle = 'rgba(255,255,255,0.85)'
                ctx.beginPath(); ctx.arc(p.bx - 3, p.by - 4, 2.2, 0, 7); ctx.fill()
            }

            // glossy sheen — the reflective MODERN bar
            const sheen = ctx.createRadialGradient(110, 120, 20, 110, 120, 260)
            sheen.addColorStop(0, 'rgba(255,255,255,0.07)'); sheen.addColorStop(1, 'rgba(255,255,255,0)')
            ctx.fillStyle = sheen; ctx.fillRect(0, 0, W, H)

            // particles — mutated in place so the renderer bundle keeps its
            // array identity across frames (MAIN's getters track ref swaps).
            const ps = L.getParts()
            for (let i = ps.length - 1; i >= 0; i--) {
                const p = ps[i]
                p.life -= 1 / 60; p.x += p.vx / 60; p.y += p.vy / 60; p.vy += 300 / 60
                if (p.life <= 0) { ps.splice(i, 1); continue }
                ctx.globalAlpha = Math.max(0, p.life)
                ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 2, 2)
            }
            ctx.globalAlpha = 1

            // rung 3: expanding event rings (orbit beats, mag snap)
            const rs = L.getRings()
            for (let i = rs.length - 1; i >= 0; i--) {
                const r = rs[i]
                if (r.t >= r.ticks) { rs.splice(i, 1); continue }
                r.t += 1
                const p = r.t / r.ticks
                const rad = 6 + r.max * p
                ctx.globalAlpha = (1 - p) * 0.8
                ctx.strokeStyle = r.color
                ctx.lineWidth = 2.5
                ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, 7); ctx.stroke()
            }
            ctx.globalAlpha = 1

            // tower-kick white-out (#3178): the instant the pack is loose the whole
            // cabinet blinks — the MULTIBALL moment has to read at phone width
            if (fl.flash > 0) {
                ctx.fillStyle = `rgba(255,255,255,${(0.38 * fl.flash / 14).toFixed(3)})`
                ctx.fillRect(0, 0, W, H)
            }

            // HUD — 7-seg score centred (corner clearance law #2899 respected)
            ctx.fillStyle = 'rgba(4,6,16,0.72)'
            ctx.fillRect(SCORE_X - 12, SCORE_Y - 10, SCORE_DIGITS * 22 + 24, 44)
            const sc = String(Math.min(999999, gs.score)).padStart(SCORE_DIGITS, '0')
            for (let i = 0; i < SCORE_DIGITS; i++) drawSevenSeg(ctx, SCORE_X + i * 22, SCORE_Y, +sc[i], pal.score, fl.drain > 0 && fl.drain % 2 === 0)
            // balls + mult lamps
            const lampN = Math.max(tb.balls, Math.min(9, gs.balls))
            for (let i = 0; i < lampN; i++) {
                ctx.fillStyle = i < gs.balls ? pal.glow : pal.glowOff
                ctx.beginPath(); ctx.arc(SCORE_X + SCORE_DIGITS * 22 + 10, SCORE_Y + 6 + i * 12, 4, 0, 7); ctx.fill()
            }
            // rung 2: lock bank lamps + MULTIBALL banner
            for (let i = 0; i < tb.lock.need; i++) {
                ctx.fillStyle = i < gs.locks ? pal.hot : pal.hotOff
                ctx.beginPath(); ctx.arc(SCORE_X + SCORE_DIGITS * 22 + 26, SCORE_Y + 6 + i * 12, 4, 0, 7); ctx.fill()
            }
            if (gs.multiball && (gs.tick >> 4) % 2 === 0) {
                ctx.fillStyle = pal.hot; ctx.font = 'bold 13px monospace'
                ctx.fillText('MULTIBALL x2', 180, SCORE_Y + 54)
            }
            ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
            ctx.fillStyle = gs.mult > 1 ? pal.hot : pal.hotDim
            ctx.fillText(`BONUS x${gs.mult}`, 180, SCORE_Y + 40)
            if (gs.nudgeMeter > 0 && !gs.tilt) {
                ctx.fillStyle = 'rgba(255,176,46,0.8)'
                ctx.fillText('~ NUDGE ~', 180, SCORE_Y + 54)
            }
            if (fl.tilt > 0 && fl.tilt % 8 < 4) {
                ctx.fillStyle = pal.hot; ctx.font = 'bold 26px monospace'
                ctx.fillText('TILT', 180, 360)
            }
            ctx.restore()
        }

        // ---- attract: the ROW OF CABINETS (#3232) + show-off (#3237) ----
        const drawAttract = (t) => {
            const sel = cabRef.current
            ctx.fillStyle = '#04060f'; ctx.fillRect(0, 0, W, H)
            // living preview (#3237): the selected machine, playing itself —
            // real sim, real lamps, real DMD — dimmed behind the row.
            const d = demoRef.current
            drawTable(d.gs, DLIVE)
            ctx.save(); ctx.globalAlpha = 0.3
            ctx.drawImage(dCan, 0, 0)
            ctx.restore()
            ctx.save(); ctx.textAlign = 'center'
            const sp = skinAt(CABS[sel].tb.id, skinRef.current[sel]).pal
            ctx.font = 'bold 34px monospace'
            ctx.shadowColor = sp.neon; ctx.shadowBlur = 16 + 6 * Math.sin(t / 350)
            ctx.fillStyle = '#e9fbff'
            ctx.fillText('PINBALL', 180, 116)
            ctx.font = 'bold 13px monospace'
            ctx.shadowColor = sp.lane; ctx.shadowBlur = 8
            ctx.fillStyle = 'rgba(255,223,158,0.9)'
            ctx.fillText('PICK A CABINET', 180, 142)
            ctx.restore()
            // the cabinets: lit mini playfields, selected one lifted + roped
            for (let i = 0; i < CABS.length; i++) {
                const c = CABS[i], r = CARDS[i]
                const k = skinAt(c.tb.id, skinRef.current[i])   // #3259 art kit
                const isSel = i === sel
                const bob = isSel ? -6 + Math.sin(t / 420) * 2 : 8
                ctx.save()
                ctx.translate(r.x + CARD_W / 2, r.y + CARD_H / 2 + bob)
                const s = isSel ? 1 : 0.88
                ctx.scale(s, s)
                ctx.globalAlpha = isSel ? 1 : 0.55
                ctx.fillStyle = 'rgba(4,6,16,0.92)'
                ctx.fillRect(-CARD_W / 2 - 5, -CARD_H / 2 - 5, CARD_W + 10, CARD_H + 10)
                ctx.strokeStyle = isSel ? k.pal.lane : 'rgba(201,212,232,0.25)'
                ctx.lineWidth = isSel ? 2.5 : 1.5
                if (isSel) { ctx.shadowColor = k.pal.lane; ctx.shadowBlur = 14 }
                ctx.strokeRect(-CARD_W / 2 - 5, -CARD_H / 2 - 5, CARD_W + 10, CARD_H + 10)
                ctx.shadowBlur = 0
                if (i === 2 && !CABS[2].saved) {
                    // ghost slot: a blueprint card inviting the editor (#3284)
                    ctx.fillStyle = 'rgba(57,225,255,0.05)'
                    ctx.fillRect(-CARD_W / 2, -CARD_H / 2 + 20, CARD_W, CARD_H - 20)
                    ctx.setLineDash([6, 5])
                    // #3290 item 1: the blueprint shimmers unselected too — a
                    // still card on the row reads as furniture; a shimmering one
                    // reads as an invitation.
                    ctx.strokeStyle = `rgba(57,225,255,${(isSel ? 0.45 : 0.25 + 0.2 * Math.sin(t / 320)).toFixed(3)})`; ctx.lineWidth = 1.5
                    ctx.strokeRect(-CARD_W / 2 + 6, -CARD_H / 2 + 26, CARD_W - 12, CARD_H - 32)
                    ctx.setLineDash([])
                    ctx.textAlign = 'center'
                    ctx.fillStyle = 'rgba(233,251,255,0.8)'
                    ctx.font = 'bold 13px monospace'
                    ctx.fillText('BUILD', 0, -16)
                    ctx.fillText('YOUR OWN', 0, 2)
                    ctx.font = 'bold 9px monospace'
                    ctx.fillStyle = 'rgba(255,217,122,0.85)'
                    ctx.fillText('TABLE SMITH', 0, 26)
                    ctx.fillText('A CURSOR B PART', 0, 42)
                } else {
                    // #3290 item 2: an unsaved slot's face paints the bench default,
                    // not CABINET ONE's field — the card previews the smith's opening.
                    ctx.drawImage(isSel ? dCan : fieldFor(previewTb(i), i), -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H)
                }
                // #3290 item 4: a legible line on the selected mini-card — the
                // full-frame crawl shrinks to illegibility at card scale, so the
                // card carries its own fitted copy of the demo's current line.
                if (isSel) {
                    const mt = d.gs.msg.t > 0 ? d.gs.msg.text : ''
                    if (mt) {
                        const mf = textFit(mt, CARD_W - 10, [9, 8, 7, 6])
                        ctx.fillStyle = 'rgba(4,6,16,0.88)'
                        ctx.fillRect(-CARD_W / 2 + 3, 48, CARD_W - 6, 16)
                        ctx.strokeStyle = 'rgba(201,212,232,0.3)'; ctx.lineWidth = 1
                        ctx.strokeRect(-CARD_W / 2 + 2.5, 47.5, CARD_W - 5, 17)
                        ctx.textAlign = 'center'
                        ctx.font = `bold ${mf.size}px monospace`
                        ctx.shadowColor = k.pal.dmd; ctx.shadowBlur = 6
                        ctx.fillStyle = k.pal.dmd
                        ctx.fillText(mf.text, 0, 59)
                        ctx.shadowBlur = 0
                    }
                }
                // marquee name plate on the card's crown — with the live kit
                ctx.fillStyle = 'rgba(4,6,16,0.85)'
                ctx.fillRect(-CARD_W / 2, -CARD_H / 2, CARD_W, 20)
                ctx.strokeStyle = `rgba(${k.pal.hotRgb},0.5)`; ctx.lineWidth = 1
                ctx.beginPath(); ctx.moveTo(-CARD_W / 2, -CARD_H / 2 + 20); ctx.lineTo(CARD_W / 2, -CARD_H / 2 + 20); ctx.stroke()
                ctx.fillStyle = k.pal.glow
                ctx.textAlign = 'center'
                // #3290 item 4: marquee labels never clip the card (fit law; a
                // too-long ` · KIT` tail drops — the badge below names the kit).
                const mq = marqueeFit(isSel ? `${c.tag} · ${k.label}` : c.tag, CARD_W)
                ctx.font = `bold ${mq.size}px monospace`
                ctx.fillText(mq.text, 0, -CARD_H / 2 + 14)
                // #3359: the garage chooser strip — the slot this card shows,
                // lit, sits alongside its siblings (saved = bright, unsaved = dim).
                if (i === 2) {
                    const cellW = 30, pitch = 33, stripY = 66, cellH = 18
                    for (let s = 0; s < GARAGE_SLOTS; s++) {
                        const x0 = -48 + s * pitch
                        const current = garage.sel === s
                        const saved = !!slotDefLegal(garage.slots[s])
                        ctx.fillStyle = current ? 'rgba(57,225,255,0.25)' : 'rgba(4,6,16,0.55)'
                        ctx.fillRect(x0, stripY, cellW, cellH)
                        ctx.strokeStyle = current ? '#39e1ff' : saved ? 'rgba(233,251,255,0.45)' : 'rgba(233,251,255,0.2)'
                        ctx.lineWidth = current ? 1.5 : 1
                        ctx.strokeRect(x0 + 0.5, stripY + 0.5, cellW - 1, cellH - 1)
                        ctx.textAlign = 'center'
                        ctx.font = 'bold 11px monospace'
                        ctx.fillStyle = current ? '#e9fbff' : saved ? 'rgba(233,251,255,0.85)' : 'rgba(233,251,255,0.35)'
                        ctx.fillText(String(s + 1), x0 + cellW / 2, stripY + cellH / 2 + 4)
                    }
                }
                ctx.restore()
                // picker chevron above the selected card
                if (isSel) {
                    ctx.save()
                    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t / 260)
                    ctx.fillStyle = k.pal.lane
                    const px = r.x + CARD_W / 2, py = r.y - 20 + Math.sin(t / 420) * 2
                    ctx.beginPath(); ctx.moveTo(px - 8, py - 8); ctx.lineTo(px + 8, py - 8); ctx.lineTo(px, py + 2); ctx.closePath(); ctx.fill()
                    ctx.restore()
                }
                // badge under the card (#3259 kit / #3284 smith). #3290 item 1:
                // the unsaved bench advertises itself from EVERY frame, pulsing
                // while unselected — a first-time phone player can't miss it.
                const ghostCard = i === 2 && !CABS[2].saved
                if (isSel || ghostCard) {
                    ctx.save()
                    ctx.textAlign = 'center'
                    ctx.shadowColor = ghostCard && !isSel ? '#39e1ff' : k.pal.dmd
                    ctx.shadowBlur = 7
                    ctx.fillStyle = ghostCard ? '#39e1ff' : k.pal.dmd
                    if (ghostCard && !isSel) ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t / 300)
                    // #3290 item 4: badges hug the screen edge at side cards —
                    // fit law keeps the whole line on the 360-wide field.
                    const bg = textFit(ghostCard ? '◆ START OPENS THE SMITH'
                        : isSel && i === 2 ? '◆ B TO REDESIGN'
                        : d.sid && styleWarn(c.tb.id, d.sid) ? '◆ NO SUCH KIT HERE'
                        : `◆ KIT: ${k.label}`, 126, [10, 9, 8])
                    ctx.font = `bold ${bg.size}px monospace`
                    ctx.fillText(bg.text, r.x + CARD_W / 2, r.y + CARD_H + 26 + bob * 0.4)
                    ctx.restore()
                }
            }
            ctx.save(); ctx.textAlign = 'center'
            if (Math.floor(t / 500) % 2 === 0) {
                // #3338: on the SAVED custom cabinet, B means REDESIGN — the
                // line must not promise the kit-cycle it no longer does
                const hint = cabRef.current === 2 && CABS[2].saved ? '◀ ▶ CABINET · ▲▼ KIT · B REDESIGN · SPACE START' : '◀ ▶ CABINET · B / ▲▼ KIT · SPACE START'
                const hf = textFit(hint, 330, [12, 10, 9])
                ctx.font = `bold ${hf.size}px monospace`
                ctx.shadowColor = '#fff'; ctx.shadowBlur = 6
                ctx.fillStyle = '#fff'
                ctx.fillText(hf.text, 180, 520)
            }
            ctx.restore()
        }

        let raf = 0, prev = performance.now(), acc = 0
        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            const dt = Math.min(100, now - prev); prev = now
            const gs = gsRef.current
            if (screenRef.current === 'play' && !pausedRef.current && !contractHoldsLoop()) {
                acc += dt
                let steps = 0
                while (acc >= FIXED_DT && steps < 8) {
                    stepGame(gs, padNow()); acc -= FIXED_DT; steps++
                    // #3237 tilt pulse: b rides the sim for two steps (a solid
                    // rising edge), then the lean releases it — never longer,
                    // so a lean can never hold-nudge into TILT.
                    if (tiltPulseRef.current > 0 && --tiltPulseRef.current === 0) keysRef.current.b = false
                }
                react(gs)
                if (gs.done) { screenRef.current = 'over'; setScreen('over') }
            }
            // rung 3: magnet-hold hum bed — quiet under the chain, never a drone
            if (screenRef.current === 'play' && !pausedRef.current && gs.magHold > 0) {
                audioController.startLoopVoice(80, 0.04)
                audioController.setLoopVoice(78, 0.035)
            } else {
                audioController.stopLoopVoice()
            }
            // #3178: MULTIBALL tension bed — runs while the pack is down. The
            // trigger is SIM state (gs.multiball), so the start/stop seam is
            // deterministic; pause, drain-home and game-over all cut it the same way.
            // #3304 adds devMbRef — a DEV-rig overlay for the seam alone; the
            // rules read only gs.multiball, so a rigged pack drains fair.
            const bedOn = screenRef.current === 'play' && !pausedRef.current && (gs.multiball || devMbRef.current)
            // #3313 seam glide: the pack ARRIVES instead of splicing the record.
            // The running bed dips to near-silence, the track swaps at the bottom
            // of the dip, and the new bed rises on the bus's own τ. Both swaps
            // replace-and-relight in the SAME turn — stopMusic's recover-to-full
            // and the new held level are scheduled together, so the bus never
            // bursts up between them (that burst was half the record-skip tell).
            const seam = bedSeamRef.current
            if (seam) {
                seam.left -= dt
                if (seam.left <= 0) {
                    bedSeamRef.current = null
                    if (bedOn) {
                        audioController.startMusic('pinballMb'); audioController.setMusicLevel(0.55)
                        mbBedRef.current = true; soloBedRef.current = 0
                    } else {
                        const lvl = screenRef.current === 'play' && !pausedRef.current ? soloBed(gs) : 0
                        const q = Math.round(lvl / 0.02) * 0.02
                        if (q > 0) { audioController.startMusic('pinballSolo'); audioController.setMusicLevel(q); soloBedRef.current = q; mbBedRef.current = false }
                        else { audioController.stopMusic(); mbBedRef.current = false; soloBedRef.current = 0 }
                    }
                }
            }
            else if (bedOn && !mbBedRef.current) { audioController.setMusicLevel(0.001); bedSeamRef.current = { left: 150 } }
            else if (!bedOn && mbBedRef.current) { audioController.setMusicLevel(0.001); bedSeamRef.current = { left: 150 } }
            // #3304: SOLO bed — single-ball play is no longer dry. The level is
            // the sim law (soloBed: heat swells with the run, tilt plays thin);
            // quantized to 0.02 audible steps so a rising score never spams the
            // bus. The pack never hears it: bedOn owns MULTIBALL exclusively, and
            // attract/edit/pause/over cut it exactly like the mb bed does.
            if (!bedOn && !bedSeamRef.current) {
                const lvl = screenRef.current === 'play' && !pausedRef.current ? soloBed(gs) : 0
                const q = Math.round(lvl / 0.02) * 0.02
                if (q > 0 && soloBedRef.current <= 0) { audioController.startMusic('pinballSolo'); audioController.setMusicLevel(q); soloBedRef.current = q }
                else if (q > 0 && Math.abs(q - soloBedRef.current) >= 0.02) { audioController.setMusicLevel(q); soloBedRef.current = q }
                else if (q <= 0 && soloBedRef.current > 0) { audioController.stopMusic(); soloBedRef.current = 0 }
            }
            ctx.clearRect(0, 0, W, H)
            if (screenRef.current === 'attract') {
                if (!pausedRef.current) stepDemo(dt)
                drawAttract(now)
            } else if (screenRef.current === 'edit') drawEditor(now)
            else drawTable(gs)
        }
        raf = requestAnimationFrame(frame)

        // ------------------------------------------------------ smith ----
        // #3284 TABLE SMITH — build your own cabinet. Every part lands on the
        // shared engine through sim.compileTable (the #3103 contract: data,
        // never physics). The draft is validated on every placement, so what
        // the cursor shows green is exactly what TEST/SAVE accept.
        // Leaving the tool while a part is in the hand puts it back where it
        // was lifted from — the part is never lost to a tool change.
        const carryHome = () => {
            const ed = edRef.current
            if (!ed.carry) return
            draftRef.current = dropDraft(draftRef.current, ed.carry.kind, ed.carry.from[0], ed.carry.from[1])
            draftVerRef.current += 1
            ed.carry = null
        }
        const startTest = () => {
            const r = compileTable(draftRef.current)
            if (r.error) { edRef.current.notice = r.error; edRef.current.noticeT = 100; sfxFor({ type: 'tiltwarn' }); return }
            testBackRef.current = true
            cabRef.current = 2; setCabIdx(2)
            gsRef.current = makeGame(freshSeed(), r.tb)
            gsRef.current.balls = 1
            gsRef.current.msg = { text: `TEST ${r.tb.label}`, t: 110, T: 110 }
            flashRef.current = mkFlash(r.tb)
            partsRef.current = []; trailRef.current = []; ringsRef.current = []
            screenRef.current = 'play'; setScreen('play')
            sfxFor({ type: 'start' })
        }
        const editAct = () => {
            const ed = edRef.current, d = draftRef.current
            const cx = Math.round(ed.cx / 2) * 2, cy = Math.round(ed.cy / 2) * 2
            const t = TOOLS[ed.tool]
            if (t === 'WIPE') {
                const w = wipeTarget(d, cx, cy)
                if (!w) { ed.notice = 'NOTHING THERE'; ed.noticeT = 80; sfxFor({ type: 'tiltwarn' }); return }
                const next = { ...d }
                if (w[0] === 'bumper') next.bumpers = d.bumpers.filter((_, i) => i !== w[1])
                else next[w[0]] = null
                draftRef.current = next; draftVerRef.current += 1
                sfxFor({ type: 'drain' }); return
            }
            if (t === 'NAME') {
                ed.nameIdx = (ed.nameIdx + 1) % (NAME_A.length * NAME_B.length)
                draftRef.current = { ...d, name: `${NAME_A[Math.floor(ed.nameIdx / NAME_B.length)]} ${NAME_B[ed.nameIdx % NAME_B.length]}` }
                sfxFor({ type: 'spinner' }); return
            }
            if (t === 'TEST') { startTest(); return }
            if (t === 'SAVE') {
                const r = compileTable(d)
                if (r.error) { ed.notice = r.error; ed.noticeT = 100; sfxFor({ type: 'tiltwarn' }); return }
                // #3359: the save lands in the garage slot the card is showing
                const savedDef = { ...d, bumpers: d.bumpers.map((b) => [...b]) }
                const savedName = d.name || 'MY TABLE'
                saveGarageSlot(garage.sel, savedName, savedDef)
                garage.slots[garage.sel] = { name: savedName, def: savedDef }
                CABS[2] = buildCABS2(garage.sel)
                myRev += 1                                  // bust the painted-field cache
                screenRef.current = 'attract'; setScreen('attract')
                demoRebuild()                              // the row shows the new machine self-playing
                sfxFor({ type: 'save' }); return
            }
            // #3290 item 6: while a part is in the hand, A is the DROP — the
            // same compile law a fresh placement pays, so green ghosts land.
            if (ed.carry) {
                const cand = dropDraft(d, ed.carry.kind, cx, cy)
                const r = compileTable(cand)
                if (r.error) { ed.notice = r.error; ed.noticeT = 90; sfxFor({ type: 'tiltwarn' }); return }
                draftRef.current = cand; draftVerRef.current += 1
                ed.carry = null
                sfxFor({ type: 'target' }); return
            }
            // …otherwise A first tries to LIFT the part this tool builds that
            // already sits under the cursor (grab-walk-drop, one idiom).
            const g = grabTarget(d, cx, cy, ed.tool)
            if (g) {
                ed.carry = {
                    kind: g[0] === 'bumper' ? 'bumper' : g[0],
                    from: [...(g[0] === 'bumper' ? d.bumpers[g[1]] : d[g[0]])],
                }
                draftRef.current = liftDraft(d, g); draftVerRef.current += 1
                sfxFor({ type: 'spinner' }); return
            }
            const cand = toolCandidate(d, cx, cy, ed.tool)
            if (!cand) return
            if (typeof cand === 'string') { ed.notice = cand; ed.noticeT = 80; sfxFor({ type: 'tiltwarn' }); return }
            const r = compileTable(cand)
            if (r.error) { ed.notice = r.error; ed.noticeT = 90; sfxFor({ type: 'tiltwarn' }); return }
            draftRef.current = cand; draftVerRef.current += 1
            sfxFor({ type: 'target' })
        }
        const drawEditor = (t) => {
            const ed = edRef.current, d = draftRef.current
            const r = compileTable(d)
            if (ed.noticeT > 0) ed.noticeT -= 1
            const key = `my-table#smith#${draftVerRef.current}`
            if (!fieldsRef.current[key]) {
                const f = document.createElement('canvas')
                f.width = W; f.height = H
                paintField(f.getContext('2d'), W, H, PAL, r.tb)
                fieldsRef.current[key] = f
                const ks = Object.keys(fieldsRef.current).filter((x) => x.startsWith('my-table#smith#'))
                if (ks.length > 8) ks.slice(0, ks.length - 4).forEach((x) => delete fieldsRef.current[x])
            }
            ctx.fillStyle = '#04060f'; ctx.fillRect(0, 0, W, H)
            ctx.save(); ctx.globalAlpha = 0.55; ctx.drawImage(fieldsRef.current[key], 0, 0); ctx.restore()
            // drafting grid over the bench
            ctx.save(); ctx.globalAlpha = 0.09; ctx.strokeStyle = '#39e1ff'; ctx.lineWidth = 1
            for (let x = 40; x <= 320; x += 20) { ctx.beginPath(); ctx.moveTo(x, 76); ctx.lineTo(x, 548); ctx.stroke() }
            for (let y = 76; y <= 548; y += 20) { ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(320, y); ctx.stroke() }
            ctx.restore()
            // #3290 item 3: while the BUMPER tool is selected the dome zone is
            // DRAWN (same law zoneGuidePath traces from bumperZoneOk's own
            // bounds) — refusals become rules, the way construction-set
            // screens showed part bounds.
            if (TOOLS[ed.tool] === 'BUMPER') {
                ctx.save()
                ctx.fillStyle = 'rgba(57,225,255,0.045)'
                ctx.strokeStyle = 'rgba(57,225,255,0.55)'
                ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5
                ctx.beginPath()
                zoneGuidePath(SMITH_LIMITS).forEach(([x, y], i) => { if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y) })
                ctx.closePath(); ctx.fill(); ctx.stroke()
                ctx.restore()
            }
            // marquee
            ctx.save(); ctx.textAlign = 'center'
            ctx.font = 'bold 22px monospace'; ctx.shadowColor = '#39e1ff'; ctx.shadowBlur = 10 + 4 * Math.sin(t / 400)
            ctx.fillStyle = '#e9fbff'; ctx.fillText('TABLE SMITH', 180, 36)
            ctx.font = 'bold 12px monospace'; ctx.fillStyle = '#ffd97a'; ctx.shadowColor = '#ffd97a'; ctx.shadowBlur = 6
            ctx.fillText(`◆ ${d.name || 'MY TABLE'} ◆`, 180, 56)
            ctx.restore()
            // ghost of the selected part at the cursor — green commits, red refuses.
            // #3290 item 6: while a part is in the hand, the ghost IS the part —
            // it rides the cursor and its colour is the verdict of the drop spot.
            const cx = Math.round(ed.cx / 2) * 2, cy = Math.round(ed.cy / 2) * 2
            const carried = ed.carry
            const grabHint = carried ? null : grabTarget(d, cx, cy, ed.tool)
            const cand = carried ? dropDraft(d, carried.kind, cx, cy) : toolCandidate(d, cx, cy, ed.tool)
            const placeable = carried || grabHint || (cand && typeof cand !== 'string')
            const ghostOk = placeable && (grabHint ? true : compileTable(cand).error === null)
            const gc = TOOLS[ed.tool] === 'WIPE' ? '#ff9f43' : ghostOk ? '#5dff9b' : '#ff3d5e'
            ctx.save(); ctx.globalAlpha = carried ? 0.85 : 0.65; ctx.strokeStyle = gc; ctx.fillStyle = gc; ctx.lineWidth = 2
            const T = carried ? KIND_TOOL[carried.kind] : TOOLS[ed.tool]
            if (T === 'BUMPER') { ctx.beginPath(); ctx.arc(cx, cy, 15, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.fill() }
            else if (T === 'SLING') { const dir = carried ? (carried.kind === 'slingL' ? 1 : -1) : (cx < 180 ? 1 : -1); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 53 * dir, cy + 48); ctx.stroke() }
            else if (T === 'BANK') { for (let i = 0; i < 4; i++) ctx.strokeRect(cx - 72 + i * 36, cy - 4, 30, 8) }
            else if (T === 'MAGNET') { ctx.beginPath(); ctx.arc(cx, cy, 10, 0, 7); ctx.stroke(); ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(cx, cy, 24, 0, 7); ctx.stroke() }
            else if (T === 'WIPE') { ctx.beginPath(); ctx.moveTo(cx - 9, cy - 9); ctx.lineTo(cx + 9, cy + 9); ctx.moveTo(cx + 9, cy - 9); ctx.lineTo(cx - 9, cy + 9); ctx.stroke() }
            ctx.restore()
            // crosshair
            ctx.save(); ctx.globalAlpha = 0.85; ctx.strokeStyle = '#e9fbff'; ctx.lineWidth = 1
            ctx.beginPath(); ctx.arc(cx, cy, 2, 0, 7); ctx.stroke()
            ctx.beginPath(); ctx.moveTo(cx - 20, cy); ctx.lineTo(cx - 6, cy); ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + 20, cy)
            ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy - 6); ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + 20); ctx.stroke(); ctx.restore()
            // palette strip: 8 tools, current one boxed and named (construction-set icon row).
            // #3290 item 4: the strip lives at SMITH_BAR y488 — the old y560 sat
            // under the VirtualControls pad on phones (measured up-arrow nub top
            // ≈y515, face-button tops ≈y555 at 375×812), so SAVE/TEST were
            // invisible AND untappable for phone smiths.
            ctx.save(); ctx.textAlign = 'center'
            const { bw, x0, y0 } = SMITH_BAR
            TOOLS.forEach((name, i) => {
                const on = i === ed.tool
                ctx.fillStyle = on ? 'rgba(57,225,255,0.18)' : 'rgba(8,12,26,0.9)'
                ctx.fillRect(x0 + i * bw + 1, y0, bw - 2, 22)
                ctx.strokeStyle = on ? '#39e1ff' : 'rgba(201,212,232,0.25)'; ctx.lineWidth = on ? 2 : 1
                ctx.strokeRect(x0 + i * bw + 1, y0, bw - 2, 22)
                ctx.fillStyle = on ? '#e9fbff' : 'rgba(233,251,255,0.5)'
                ctx.font = `bold ${name.length > 6 ? 7 : 8}px monospace`
                ctx.fillText(name, x0 + i * bw + bw / 2, y0 + 14)
            })
            ctx.restore()
            // status line: the draft's own verdict, or the refusal that just landed
            ctx.save(); ctx.textAlign = 'center'; ctx.font = 'bold 11px monospace'
            if (ed.noticeT > 0) {
                ctx.fillStyle = '#ff3d5e'; ctx.shadowColor = '#ff3d5e'; ctx.shadowBlur = 8
                ctx.fillText(`! ${ed.notice}`, 180, 482)
            } else if (ed.carry) {
                ctx.fillStyle = '#39e1ff'; ctx.shadowColor = '#39e1ff'; ctx.shadowBlur = 8
                ctx.fillText(`HOLDING ${KIND_TOOL[ed.carry.kind]} · A DROP · B PART BRINGS IT BACK`, 180, 482)
            } else if (r.error) {
                ctx.fillStyle = '#ff9f43'
                ctx.fillText(`! ${r.error}`, 180, 482)
            } else {
                ctx.fillStyle = 'rgba(93,255,155,0.9)'
                ctx.fillText('LAYOUT OK · A PLACE · B PART · ? DONE', 180, 482)
            }
            ctx.restore()
            // bumper count + part census under the marquee
            ctx.save(); ctx.textAlign = 'center'; ctx.font = '9px monospace'; ctx.fillStyle = 'rgba(233,251,255,0.55)'
            ctx.fillText(`BUMPS ${d.bumpers.length}/3 · SLINGS ${(d.slingL ? 1 : 0) + (d.slingR ? 1 : 0)}/2 · BANK ${d.bank ? 1 : 0}/1 · MAG ${d.magnet ? 1 : 0}/1`, 180, 70)
            ctx.restore()
        }

        // ------------------------------------------------------------- input ----
        const startable = () => screenRef.current === 'attract' || screenRef.current === 'over'
        // #3290: tapStart (#GAME-SHELL) answers ANY canvas tap with a synthetic
        // Space keydown — in the bench that meant every tap secretly pressed A
        // and dropped a part at the cursor. The bench owns its taps (palette
        // cells, and field taps are cursor-free by design), so a tap arms a
        // one-shot guard that swallows the matching Space. The pad's A button
        // dispatches its own Space WITHOUT a canvas pointerdown (it is
        // [data-vc], App skips those) and a real key press is trusted — both
        // still act normally.
        let tapSpaceGuard = false
        let garageStripGuard = false
        const onKeyDown = (e) => {
            // #3284 TABLE SMITH: the editor answers first — arrows walk the
            // cursor (held repeat ON, unlike game keys), A acts, B cycles the
            // part, ? walks back out to the row. A draft never saved stays a
            // draft: leaving is safe.
            if (e.isTrusted) { tapSpaceGuard = false; garageStripGuard = false }    // a real keystroke outranks both guards
            if (screenRef.current === 'edit') {
                const ed = edRef.current
                if (e.code === 'Escape' || e.code === 'QuestionMark' || e.key === '?' || e.code === 'Backquote') {
                    carryHome()          // #3290: a part in the hand walks home, not out
                    screenRef.current = 'attract'; setScreen('attract'); e.preventDefault(); return
                }
                if (e.code === 'ArrowLeft') { ed.cx = Math.max(40, ed.cx - 6); e.preventDefault(); return }
                if (e.code === 'ArrowRight') { ed.cx = Math.min(320, ed.cx + 6); e.preventDefault(); return }
                if (e.code === 'ArrowUp') { ed.cy = Math.max(80, ed.cy - 6); e.preventDefault(); return }
                if (e.code === 'ArrowDown') { ed.cy = Math.min(468, ed.cy + 6); e.preventDefault(); return }
                if (e.repeat) return
                if (e.code === 'Space') { if (tapSpaceGuard) { tapSpaceGuard = false; e.preventDefault(); return } editAct(); e.preventDefault(); return }
                if (e.code === 'KeyB' || e.code === 'ShiftLeft') { carryHome(); ed.tool = (ed.tool + 1) % TOOLS.length; sfxFor({ type: 'ratchet' }); e.preventDefault(); return }
                return
            }
            if (e.repeat) return
            if (e.code === 'Escape' || e.code === 'QuestionMark' || e.key === '?' || e.code === 'Backquote') {
                if (screenRef.current === 'play') setPaused((p) => !p)
                return
            }
            if (screenRef.current === 'over' && testBackRef.current) {   // a TEST drop goes home to the bench
                testBackRef.current = false
                screenRef.current = 'edit'; setScreen('edit'); e.preventDefault(); return
            }
            if (startable()) {
                // #3359: a garage-strip tap armed a one-shot guard — the App's
                // tapStart synthetic Space must not start a game the tap never
                // asked for. (Trusted keys clear it above.)
                if (garageStripGuard) { garageStripGuard = false; e.preventDefault(); return }
                // the row of cabinets answers the arrows first (#3232): in
                // attract they switch picks; at GAME OVER they step back to the
                // row. SPACE/tap keeps the original quick-retry on the same cab.
                if (screenRef.current === 'attract' && (e.code === 'ArrowLeft' || e.code === 'KeyA')) { selCab(cabRef.current - 1); e.preventDefault(); return }
                if (screenRef.current === 'attract' && (e.code === 'ArrowRight' || e.code === 'KeyD')) { selCab(cabRef.current + 1); e.preventDefault(); return }
                // #3359: 1/2/3 pick the garage slot on the smith card (same
                // frame the ghost/kit laws read). A/B/C stay cabinets/kit.
                if (screenRef.current === 'attract' && cabRef.current === 2 && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3')) {
                    selectSlot(Number(e.code.slice(-1)) - 1); e.preventDefault(); return
                }
                // #3259: B / ▲▼ dress the selected cabinet in its next art kit
                if (screenRef.current === 'attract' && (e.code === 'KeyB' || e.code === 'ShiftLeft' || e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
                    // #3284: on the SAVED custom cabinet B means "back to the
                    // bench" — redesigning your own machine outranks dressing it.
                    if (cabRef.current === 2 && CABS[2].saved && (e.code === 'KeyB' || e.code === 'ShiftLeft')) {
                        openEditor(); e.preventDefault(); return
                    }
                    cycleSkin(e.code === 'ArrowUp' ? -1 : 1); e.preventDefault(); return
                }
                if (screenRef.current === 'over' && (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ArrowRight' || e.code === 'KeyD')) {
                    if (e.code === 'ArrowLeft' || e.code === 'KeyA') selCab(0); else selCab(1)
                    screenRef.current = 'attract'; setScreen('attract'); e.preventDefault(); return
                }
                if (!paused) startPlay()
                return
            }
            if (paused) return
            const k = keysRef.current
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') k.left = true
            else if (e.code === 'ArrowRight' || e.code === 'KeyD') k.right = true
            else if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyS') { k.a = true; k.down = true }
            else if (e.code === 'KeyB' || e.code === 'ShiftLeft') k.b = true
            if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
        }
        const onKeyUp = (e) => {
            if (e.code === 'Space') tapSpaceGuard = false
            const k = keysRef.current
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') k.left = false
            else if (e.code === 'ArrowRight' || e.code === 'KeyD') k.right = false
            else if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyS') { k.a = false; k.down = false }
            else if (e.code === 'KeyB' || e.code === 'ShiftLeft') k.b = false
        }
        const onPointer = (e) => {
            if (pausedRef.current) return
            // Any canvas tap is answered by App's tapStart with a synthetic
            // Space — arm the guard for EVERY canvas tap so a tap that OPENS
            // the bench (attract slot 2) can't also press A inside it.
            tapSpaceGuard = true
            // #3290 item 4: bench taps pick tools from the palette (the pad
            // still drives cursor + A/B); the bench is not a start surface.
            if (screenRef.current === 'edit') {
                const rectE = cvs.getBoundingClientRect()
                const pxE = (e.clientX - rectE.left) * (W / rectE.width)
                const pyE = (e.clientY - rectE.top) * (H / rectE.height)
                if (pyE >= SMITH_BAR.y0 && pyE <= SMITH_BAR.y0 + SMITH_BAR.h && pxE >= SMITH_BAR.x0) {
                    const ti = Math.floor((pxE - SMITH_BAR.x0) / SMITH_BAR.bw)
                    if (ti >= 0 && ti < TOOLS.length) {
                        if (ti !== edRef.current.tool) carryHome()   // #3290: a tool change puts the held part back
                        edRef.current.tool = ti; sfxFor({ type: 'ratchet' })
                    }
                }
                return
            }
            if (!startable()) return
            if (screenRef.current === 'over') {
                if (testBackRef.current) { testBackRef.current = false; screenRef.current = 'edit'; setScreen('edit'); return }
                screenRef.current = 'attract'; setScreen('attract'); return
            }
            // #3359: the garage chooser strip on the smith card — a tap anywhere
            // in the band selects the slot under the finger and is consumed
            // here: no game start, no card fall-through. The whole band is
            // consumed (a gap between cells is a no-op), and the App's
            // tapStart synthetic Space is swallowed by garageStripGuard.
            if (screenRef.current === 'attract') {
                const r = CARDS[2]
                const sel = cabRef.current === 2
                const scale = sel ? 1 : 0.88
                const bob = sel ? -6 + Math.sin(performance.now() / 420) * 2 : 8
                const rectS = cvs.getBoundingClientRect()
                const pxS = (e.clientX - rectS.left) * (W / rectS.width)
                const pyS = (e.clientY - rectS.top) * (H / rectS.height)
                const relX = (pxS - (r.x + CARD_W / 2)) / scale
                const relY = (pyS - (r.y + CARD_H / 2 + bob)) / scale
                if (relY >= 64 && relY <= 86) {
                    garageStripGuard = true
                    for (let s = 0; s < GARAGE_SLOTS; s++) {
                        const x0 = -48 + s * 33
                        if (relX >= x0 && relX <= x0 + 30) { selectSlot(s); return }
                    }
                    return
                }
            }
            // tap a cabinet card to pick AND start it in one input (#3232).
            // #3290 item 4: among the cards a tap touches, the NEAREST centre
            // wins — the 8 px seams used to hand the tap to whichever card the
            // loop met first (±8 margins made every seam a coin-toss).
            const rect = cvs.getBoundingClientRect()
            const px = (e.clientX - rect.left) * (W / rect.width)
            const py = (e.clientY - rect.top) * (H / rect.height)
            let best = -1, bd = Infinity
            for (let i = 0; i < CARDS.length; i++) {
                const r = CARDS[i]
                if (px >= r.x - 8 && px <= r.x + CARD_W + 8 && py >= r.y - 26 && py <= r.y + CARD_H + 12) {
                    const dd = Math.abs(px - (r.x + CARD_W / 2))
                    if (dd < bd) { bd = dd; best = i }
                }
            }
            if (best >= 0) { cabRef.current = best; setCabIdx(best); startPlay(best); return }
            startPlay()
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        cvs.addEventListener('pointerdown', onPointer)

        // #1200 feedback report (production build too): the in-game report
        // button files live state so a report can be replayed at ?seed=N.
        exposeFeedbackState(() => ({ tick: gsRef.current.tick, score: gsRef.current.score, done: gsRef.current.done, seed: gsRef.current.seed, cab: gsRef.current.table.id }))

        if (import.meta.env.DEV) {
            window.__pinballTest = {
                // #3237 dev rig: peek the tilt-nudge channel (grant + latch),
                // ref-backed so the harness never reads a stale closure.
                tiltInfo: () => ({ on: tiltOnRef.current, latched: tiltLatchRef.current, held: keysRef.current.b }),
                // dev rig (#3297): park balls in the tower so the gate slam can
                // be screenshotted without farming 3 locks. DEV-only, like tiltInfo.
                devLock: (n) => { gsRef.current.locks = n },
                // dev rig (#3304): flip the bed's pack overlay so the hand-off
                // (solo → mb → solo) is driveable without farming three locks.
                // Seam-only: it never touches gs.multiball, so drains, locks and
                // scoring stay the sim's honest rules.
                devMb: (on = true) => { devMbRef.current = Boolean(on); return { rigMb: devMbRef.current } },
                state: () => ({ ...stateOf(gsRef.current), power: gsRef.current.power, screen: screenRef.current, skinId: skinAt(CABS[cabRef.current].tb.id, skinRef.current[cabRef.current]).id }),
                // dev rig: pick a cabinet without keys (#3232) — re-deals its
                // attract demo too, same law as the arrow keys.
                setCab: (i) => { cabRef.current = ((Math.trunc(i) % CABS.length) + CABS.length) % CABS.length; setCabIdx(cabRef.current); demoRebuild(); return { cab: CABS[cabRef.current].tb.id } },
                // dev rig: set/cycle the art kit (#3259) — absolute index wraps;
                // #3237 persists it and announces it on the attract DMD.
                setSkin: (i) => {
                    const id = CABS[cabRef.current].tb.id
                    const n = skinsFor(id).length
                    const j = ((Math.trunc(i) % n) + n) % n
                    skinRef.current[cabRef.current] = j
                    const kit = skinAt(id, j)
                    saveKit(id, kit.id)
                    const dgs = demoRef.current && demoRef.current.gs
                    if (dgs) dgs.msg = { text: `KIT ${kit.label}`, t: 110, T: 110 }
                    return { skin: kit.id }
                },
                // dev rig: peek at the attract demo (#3237) — sim state +
                // lamp flashes, so the driven show-off is assertable, not vibes.
                demoState: () => {
                    const d = demoRef.current
                    return {
                        ...stateOf(d.gs),
                        lamps: { bumpers: [...d.fl.bumpers], lane: [...d.fl.lane], ramp: d.fl.ramp, lock: d.fl.lock, orbitArm: d.fl.orbitArm },
                        runs: demoRuns,
                    }
                },
                // dev rig: drop a ball straight into the firelane (visual QA of
                // the lamp set / tower / pack — the rules themselves are pinned
                // deterministically by pinballcheck in Node)
                laneDrop: () => {
                    const gs = gsRef.current
                    gs.pucks.push({ bx: gs.table.view.laneCx, by: 235, vx: 0, vy: 160, prevY: 235, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false })
                    return stateOf(gs)
                },
                // dev rig: feed the orbit channel / drop a ball into the magnet
                orbitFeed: () => {
                    const gs = gsRef.current
                    const bx = gs.table.view.railCx - 5 * gs.table.orbit.ch.side
                    gs.pucks.push({ bx, by: 498, vx: gs.table.kicker.vx, vy: gs.table.kicker.vy, prevY: 498, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false })
                    return stateOf(gs)
                },
                // dev rig: drop a ball fast down a kickback column (#3250, side
                // param #3432 — 'L' takes the mirror column; visual QA of the
                // pop; rules are pinned in Node by pinballcheck)
                kbDrop: (side) => {
                    const gs = gsRef.current
                    const KB = side === 'L' ? gs.table.kbL : gs.table.kb
                    gs.pucks.push({ bx: (KB.x1 + KB.x2) / 2, by: KB.yFrom + 2, vx: 0, vy: 300, prevY: KB.yFrom + 2, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false })
                    return stateOf(gs)
                },
                // dev rig (#3432): feed a ball up the JET LANE corridor — crosses
                // both flank wires on the way to the dome flank (visual QA; the
                // ladder is pinned in Node).
                rampLFeed: () => {
                    const gs = gsRef.current
                    const RL = gs.table.rampL
                    gs.pucks.push({ bx: (RL.x1 + RL.x2) / 2, by: 400, vx: 0, vy: -520, prevY: 400, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false })
                    return stateOf(gs)
                },
                magDrop: () => {
                    const gs = gsRef.current
                    gs.pucks.push({ bx: gs.table.magnet.x, by: gs.table.magnet.y - 40, vx: 0, vy: 60, prevY: gs.table.magnet.y - 40, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false })
                    return stateOf(gs)
                },
                hash: () => stateHash(gsRef.current),
                // dev rig (#3304): peek at the music beds — which track owns the
                // bus, the held bus fraction, the ref-quantized level and the raw
                // law value — so the solo/mb seam is assertable, not vibes.
                bed: () => ({
                    track: audioController.music && audioController.music.playing ? audioController.music.track : null,
                    level: audioController.musicScale,
                    law: soloBed(gsRef.current),
                    mb: mbBedRef.current,
                    solo: soloBedRef.current,
                    rig: devMbRef.current,
                    // #3313: seam = ms left in the glide (0 = no glide), heat =
                    // the swell fraction the DMD glow rides (law / cap).
                    seam: bedSeamRef.current ? bedSeamRef.current.left : 0,
                    heat: soloBed(gsRef.current) / SOLO_CAP,
                }),
                // dev rig: peek at the TABLE SMITH bench (#3284) — draft, tool,
                // verdict — so a driven build leg is assertable, not vibes.
                smith: () => ({
                    draft: JSON.parse(JSON.stringify(draftRef.current)),
                    tool: TOOLS[edRef.current.tool],
                    notice: edRef.current.noticeT > 0 ? edRef.current.notice : '',
                    cursor: [edRef.current.cx, edRef.current.cy],
                    valid: compileTable(draftRef.current).error === null,
                    screen: screenRef.current,
                    saved: CABS[2].saved,
                    // #3290 item 6: what's in the hand (null = every part on the field)
                    carry: edRef.current.carry ? edRef.current.carry.kind : null,
                    tag: CABS[2].tag,
                    slot: garage.sel,
                    slots: garage.slots.map((s, i) => ({ i, saved: !!slotDefLegal(s), name: s ? (s.name || (s.def && s.def.name) || null) : null })),
                    sel: cabRef.current,
                    tbId: gsRef.current.table.id,
                    // #3290: what the ghost demo honestly runs (bench default
                    // until the first save) + the strip line it advertises —
                    // so the honesty legs assert state, not pixels-of-vibes.
                    demoTbId: demoRef.current.gs.table.id,
                    demoMsg: demoRef.current.gs.msg.text,
                }),
                reset: (seed) => { gsRef.current = makeGame(seed >>> 0, CABS[cabRef.current].tb); devMbRef.current = false; return stateOf(gsRef.current) },
                press: (code) => {
                    const k = keysRef.current
                    if (code === 'left') k.left = true; else if (code === 'right') k.right = true
                    else if (code === 'a' || code === 'down') { k.a = true; k.down = true }
                    else if (code === 'b') k.b = true
                },
                release: (code) => {
                    const k = keysRef.current
                    if (code === 'left') k.left = false; else if (code === 'right') k.right = false
                    else if (code === 'a' || code === 'down') { k.a = false; k.down = false }
                    else if (code === 'b') k.b = false
                },
                step: (n = 1) => { for (let i = 0; i < n; i++) stepGame(gsRef.current, keysRef.current); react(gsRef.current); return stateOf(gsRef.current) },
            }
            exposeGame({
                id: 'pinball',
                buttons: ['left', 'right', 'a', 'b', 'down'],
                reset: (seed) => { gsRef.current = makeGame(seed >>> 0, CABS[cabRef.current].tb); flashRef.current = mkFlash(CABS[cabRef.current].tb); screenRef.current = 'play'; setScreen('play'); devMbRef.current = false; return stateOf(gsRef.current) },
                tick: (pad) => { stepGame(gsRef.current, pad || {}); react(gsRef.current); return stateOf(gsRef.current) },
                state: () => ({ ...stateOf(gsRef.current), skinId: skinAt(CABS[cabRef.current].tb.id, skinRef.current[cabRef.current]).id }),
                canvas: () => canvasRef.current,
            })
        }

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('resize', fit)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            cvs.removeEventListener('pointerdown', onPointer)
            audioController.stopLoopVoice()
            audioController.stopMusic() // #3178: never leak the multiball bed timer
            unexposeFeedbackState()
            if (import.meta.env.DEV) { if (window.__pinballTest) delete window.__pinballTest; unexposeGame() }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startPlay, setCab])

    return (
        <div className="relative flex h-full w-full items-center justify-center">
            <canvas ref={canvasRef} className="rounded-lg shadow-[0_0_40px_rgba(49,225,255,0.15)]" />
            {screen === 'attract' && (
                <div className="pointer-events-none absolute inset-x-0 bottom-[6%] flex flex-col items-center">
                    <AttractMessage className="text-cyan-200/85 mt-2" messages={CABS[cabIdx].msgs} />
                </div>
            )}
            {/* #3237 tilt-to-nudge affordance: one honest tap grants the lean,
                RE-CENTER pins the pose in hand. z-30 — under the pad (z-50). */}
            {tiltCapable && screen === 'play' && !paused && (
                <div className="absolute left-1/2 top-2 z-30 flex -translate-x-1/2 items-center gap-2">
                    {tiltOn ? (
                        <>
                            <span className="font-mono text-[8px] font-bold tracking-[0.2em] text-cyan-200/70" style={{ textShadow: '0 0 8px rgba(49,225,255,0.5)' }}>LEAN = NUDGE</span>
                            <button data-tilt="recenter" onPointerDown={(e) => { e.preventDefault(); recenterTiltNudge() }} className="rounded border border-cyan-400/40 bg-cyan-950/70 px-2 py-1 font-mono text-[8px] font-bold tracking-[0.2em] text-cyan-200">RE-CENTER</button>
                        </>
                    ) : (
                        <button data-tilt="nudge-enable" onPointerDown={(e) => { e.preventDefault(); enableTiltNudge() }} className="rounded border border-amber-400/50 bg-amber-950/70 px-2 py-1 font-mono text-[8px] font-bold tracking-[0.2em] text-amber-200">TILT NUDGE — TAP</button>
                    )}
                </div>
            )}
            {screen === 'over' && (() => {
                const k = skinAt(CABS[cabRef.current].tb.id, skinRef.current[cabRef.current])
                return (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <p className="font-mono text-2xl font-bold text-rose-300" style={{ textShadow: '0 0 12px rgba(255,61,94,0.8)' }}>GAME OVER</p>
                        <p className="font-mono text-sm text-amber-200">FINAL {String(gsRef.current.score).padStart(6, '0')}</p>
                        {/* #3237 tail: the dress reaches the results screen */}
                        <p className="font-mono text-[11px]" style={{ color: k.pal.dmd, textShadow: `0 0 8px ${k.pal.dmd}` }}>◆ KIT {k.label}</p>
                        <p className="font-mono text-[11px] text-white/70">PICK A CABINET</p>
                    </div>
                )
            })()}
            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'PINBALL')} onResume={() => setPaused(false)} />}
            <VirtualControls visible={(screen === 'play' || screen === 'attract' || screen === 'edit') && !paused} secondAction={{ label: screen === 'attract' ? (cabIdx === 2 && CABS[2]?.saved ? 'REDESIGN' : 'KIT') : screen === 'edit' ? 'TOOL' : 'NUDGE', code: 'KeyB' }} />
        </div>
    )
}

export default PinballGame
