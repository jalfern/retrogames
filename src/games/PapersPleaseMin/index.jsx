// PAPERS, PLEASE-MIN — the booth. The rules are the pure engine in
// ./rules.js, the week is the seeded generator in ./gen.js (every deny it
// produces has a witness printed on this canvas), and ./sim.js is a pure
// (state, input) day loop. The attract demo is the autopilot's own proven
// week, stamped tick for tick — the same script scripts/paperscheck.mjs
// grades and scripts/papersplay.mjs drives with real keys.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { PRESS, MESSAGES } from './attract.js'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { CFG, newRun, step, tick, stateHash, current, autopilot, gameClock, monthTurn, rentDue, isMoneyDeath } from './sim.js'
import { REGULARS } from './gen.js'
import { exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { decide, RULES, dfmt, dshow, isAdult, stampLines } from './rules.js'
import { CW, CHS, STRIP_H, WALL, SCALE, PORTRAIT, PAPERS, ID, STAMP, PHOTO, PHOTO_TINT, PHOTO_ZOOM, CLOCK, SLIP, RENT, PAYFX, BUBBLE, BUBBLE_TAIL, EVID, SETTLE, QUOTE, RECOGNITION, ARC_MUG, ARC_HL, SEIZE, CHAR, wallRows, bulletinRows } from './layout.js'

const SIM_MS = 1000 / 60

const COL = {
    wall: '#1c2130', wallLine: '#323a52', paper: '#d8d2b8', paperLine: '#8f8a70',
    ink: '#20242e', red: '#d84343', green: '#49b25a', gold: '#e8c15a', text: '#cfd6e6',
    // #1908 LEGIBILITY — the wanted rows are 9px on a dark wall at the fit-law
    // ceiling (worst bottom y=356 vs the scale box at 358: two px of slack, the
    // rows cannot grow). The honest lever left is contrast: a brighter red at
    // the same size reads at arm's length on a phone where #d84343 blurs.
    wallRed: '#ff6f5e',
}

// #1938 PORTRAIT — faces are painted from a descriptor, not from the
// pic: the live booth face, the passport photo and the DEV pixel probe all
// run through drawFace, so "the photo differs" means "this function's
// pixels differ". Structural features (hair cut, face width, glasses,
// facial hair — plus brows and mouth since #1972, and the face gained the
// parts the original's eye roams: sclera+pupils, ears, nose) are what the
// PORTRAIT rule compares; colors are atmosphere — time fades hair, and an
// old photo of the right person is not a lie.
const SKINS = ['#e8c39e', '#d2a679', '#b07f55', '#8a5a3a', '#f0d3b4']
const HAIRS = ['#2c2622', '#5a3b1e', '#8d1f1f', '#b3b6bd', '#1e1e28']
// #2072 HAIR SHADOW — one tone darker per cut color, derived at module level
// so it is a pure function of hairC: the counter face and its photo (which
// inherits the descriptor, grey only in color) land on the SAME shadow, and
// the byte-identity doctrine stands. 26/255 steps keep the grey cut readable.
const HAIR_SHADOW = HAIRS.map((h) => '#' + [1, 3, 5].map((i) => Math.max(0, parseInt(h.slice(i, i + 2), 16) - 26).toString(16).padStart(2, '0')).join(''))
const SHIRTS = ['#39466e', '#6e4b7a', '#4b7a5e', '#7a634b']
// #1989 ONE-OFF CROWD inks — headwear and marks of a life, each its own exact
// color so papersplay can count them as pixels. Chosen clear of every counted
// ink on the canvas: brow/mouth ink #20242e (the unibrow's #262b36 is one
// step off, so the brow gate keeps counting brows, not bridges), eye whites
// #d8dce8 (teeth are #e6ebf2), the regulars' mark ink #8f4a3e, and the
// stamp's red/green hue tests (the scarf's wool-brown fails rr>140).
const HAT_COLS = { 1: '#3a4257', 2: '#6b4a2f', 3: '#7d4a33' } // cap / ushanka / scarf
const CAP_BRIM = '#2b3243'
const SCARF_KNOT = '#5f3722'
const UNI_COL = '#262b36'
const EAR_COL = '#d8b23a'
const TOOTH_COL = '#e6ebf2'

const PapersPleaseMinGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const [watching, setWatching] = useState(false) // #1637 WATCH: sim.js autopilot() stamps the booth
    const watchingRef = useRef(false)
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.ppStage = '1'
        canvas.width = CW; canvas.height = CHS
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = newRun(0)
        let raf = 0, last = 0, acc = 0
        let simTick = 0           // #1473: play-frame counter for the feedback report
        let stamp = null            // {ok, why, ticks}
        // #1976 EVIDENCE AUDIO — a correct PORTRAIT deny that names a brow or
        // mouth break gets its own tick (the coin-clack+wail doctrine of #1966:
        // each verdict family earns its own sound). Counted by papersplay.
        let sfxTicks = 0
        // #1982 THE RECOGNITION CUE — count of arrivals that rang the door's
        // welcome (a familiar face stepped up). Counted by papersplay.
        let sfxAgain = 0
        const againLog = []
        // #1988 DENY AFTERSHOCK — the stamp on a SEIZED neighbor thuds lower,
        // and their argue line rides the inspector pin. Counted by papersplay.
        let sfxSeize = 0
        // #2021 THE INSPECTOR STAYS — the booth's case outlives its ink:
        // {ok, witness, evidence, ticks} rides after the stamp fades and ends
        // when the next applicant's papers land on the counter (settle → 0).
        let insp = null
        let banner = null           // {text, sub, month, ticks}
        let settle = 0            // #1891 PAPER WEIGHT — drop/settle counter for new papers
        // #2072 HOLD TO INSPECT — decor only (like settle/banner): the sim
        // never sees it, so determinism and replay pins stand untouched.
        // A press that lands on the passport's photo does NOT stamp — it is
        // the inspector leaning in; holding PHOTO_ZOOM.hold ticks grows the
        // print, and any release lifts it back.
        let holdDown = false, holdInPhoto = false, photoHold = 0, photoZoom = false
        // #1968 THE WAGE FLICKER — decor only (like settle/banner): the sim
        // never sees it, so determinism and every replay pin stand untouched.
        let payFx = 0
        let demoScript = null, demoAt = 0, demoWait = 0, demoSeed = 0
        const evLog = []
        // #1637 WATCH — seat the perfect inspector paperscheck proves survives
        // the week: clone the live booth, ask autopilot() for the calls, decline
        // honestly if the booth can no longer survive. The sim is deterministic
        // (paperscheck replays the week tick for tick), so the clone's verdicts
        // applied at their waits are the proven line, live.
        let watchScript = null, watchI = 0, watchWait = 0
        const seatWatcher = () => {
            if (!gs || gs.end || screenRef.current !== 'play' || pausedRef.current) return false
            const r = autopilot(structuredClone(gs), 999)
            if (!r.ok || !r.script.length) return false
            watchScript = r.script; watchI = 0; watchWait = 0
            return true
        }
        const releaseWatch = () => { watchingRef.current = false; setWatching(false); watchScript = null; playWatchStop() }

        // #1960 events from clock advance — the gate-close beat. In one batch
        // the close banner outranks the morning banner: the slam of the gate
        // must not be swallowed by tomorrow's new rule.
        const drainEvents = () => {
            if (!gs.events.length) return
            for (const e of gs.events) evLog.push({ ...e })
            const cl = gs.events.find((e) => e.type === 'close')
            // #1966 night money: the coin clack of the deduction slip, and a
            // low warning wail if the booth had to go without soup or heat.
            const py = gs.events.find((e) => e.type === 'pay')
            if (py && !py.evicted) {
                audioController.playTone(880, 0.05, 'square', 0.045)
                audioController.playTone(1175, 0.08, 'square', 0.045)
                if (py.hungry || py.cold) audioController.playSweep(300, 120, 0.5, 'sawtooth', 0.07)
            }
            if (cl && cl.missed > 0) {
                banner = { text: 'GATE CLOSED', sub: `${cl.missed} TURNED AWAY — DOCKED ${CFG.MISS_DOCK * cl.missed}`, ticks: 220 }
                audioController.playSweep(240, 70, 0.5, 'square', 0.09)
            } else {
                const ed = gs.events.find((e) => e.type === 'endday')
                if (ed) {
                    const nRules = gs.week.days[gs.day - 1].rules
                    const newest = nRules[nRules.length - 1]
                    // #1891 THE NEW MONTH — when the calendar crossed a seam
                    // overnight (day 6: OCT 31 → NOV 01), the morning says so.
                    banner = {
                        text: `DAY ${gs.day} — THE LINE MOVES`,
                        sub: `NEW RULE: ${RULES[newest].text}`,
                        month: monthTurn(gs.week, gs.day),
                        ticks: 200,
                    }
                    audioController.playSweep(420, 760, 0.4, 'triangle', 0.06)
                    if (banner.month) audioController.playTone(988, 0.12, 'triangle', 0.06) // the calendar turning gets its own chime
                }
            }
            gs.events.length = 0
            if (gs.end) finish(gs.end)
        }

        const act = (action) => {
            if (screenRef.current !== 'play' || pausedRef.current || gs.end) return
            const stamped = current(gs).applicant.person   // stamp the papers YOU just judged
            const before = gs.strikes
            const paidBefore = gs.paidToday
            settle = 0 // #1891 a fresh stamp interrupts any settling — the frame and the document must sit exactly still while the stamp holds
            step(gs, { action })
            if (gs.paidToday > paidBefore) payFx = PAYFX.ticks // #1968 payday per stamp: the purse visibly fills on the correct call
            if (!gs.end) {
                stamp = { ok: gs.last?.ok, why: gs.last?.why, verdict: action, person: stamped, ticks: 30 }
                // #2021 snapshot the case the moment it stamps — the citation
                // paints through the ink AND the pin, and a ruling without a
                // witness (the clean admit) replaces the pin with silence.
                const sl = stampLines(gs.last, EVID.wrap)
                insp = sl.witness ? { ok: !!gs.last?.ok, witness: sl.witness, evidence: sl.evidence, ticks: QUOTE.hold } : null
                // #1988 DENY AFTERSHOCK — the original lingers when a familiar
                // face is taken: the seized neighbor argues as they're led away.
                // The authored line rides under the DENIED stamp for the life of
                // the #2021 pin, and the stamp lands with a lower thunk than any
                // fixed tone the booth owns. Decor for the shell — gs untouched.
                if (insp && stamped.arc && action === 'deny') {
                    insp.argue = stamped.seize || null
                    audioController.playTone(SEIZE.tone, 0.10, 'square', 0.07)
                    sfxSeize++
                }
                audioController.playTone(action === 'approve' ? 300 : 190, 0.06, 'square', 0.06)
                // #1976 the face-reading deny is the title's signature call —
                // when the witness names the face (brows/mouth), add a sharp
                // tick over the deny thunk so the ear learns what the eye saw.
                if (gs.last?.ok && action === 'deny' && /BROW|MOUTH/.test(gs.last.evidence || '')) { audioController.playTone(1050, 0.03, 'square', 0.05); sfxTicks++ }
                if (gs.strikes > before) audioController.playSweep(220, 90, 0.35, 'sawtooth', 0.08)
                else if (gs.last?.ok) audioController.playTone(action === 'deny' ? 760 : 560, 0.07, 'square', 0.05)
                // #1982 THE RECOGNITION CUE — when the ruling takes the last
                // face away and the NEXT applicant is a returning neighbor, the
                // door rings its welcome as they step up. Decor: guarded by the
                // generator's structural `recall`, never by speech, so a muted
                // neighborhood stays fair and a chatty stranger stays silent.
                const nextP = current(gs).applicant.person
                if (nextP && nextP.recall) {
                    audioController.playTone(RECOGNITION.notes[0], RECOGNITION.dur[0], RECOGNITION.wave, RECOGNITION.gain)
                    audioController.playTone(RECOGNITION.notes[1], RECOGNITION.dur[1], RECOGNITION.wave, RECOGNITION.gain)
                    sfxAgain++
                    againLog.push(`${gs.day}|${nextP.regular}|${nextP.recall}`) // who the door welcomed, and when
                }
            }
            drainEvents()
        }

        const finish = (res) => {
            watchingRef.current = false; setWatching(false); watchScript = null // #1637 the week ends in your hands
            const money = isMoneyDeath(gs.endWhy) // #1968 badge death vs purse death
            setEnd({ win: res === 'win', why: gs.endWhy, score: gs.score, caught: gs.caught, day: gs.day, credits: gs.credits, money })
            if (res === 'win') audioController.playSweep(400, 1500, 0.9, 'square', 0.08)
            else if (money) {
                // #1968 the landlord, not the badge: a heavier, duller slam
                // than the three-strike sawtooth — a door, not a siren.
                audioController.playNoise(0.25, 0.14)
                audioController.playSweep(150, 40, 0.55, 'square', 0.1)
            }
            else audioController.playSweep(300, 50, 1.2, 'sawtooth', 0.1)
            overAtRef.current = performance.now()
            setMode('over')
        }

        const startPlay = (seed = 0) => {
            // #1473: honor ?seed=N at the default human-start so a filed
            // report replays this exact week (applicants, rules and all).
            // Digit2-4 stay explicit picks; the report carries gs.seed.
            const pin = seedFromQuery()
            if (seed === 0 && pin != null) seed = pin >>> 0
            gs = newRun(seed)
            simTick = 0
            demoSeed = seed
            evLog.length = 0
            stamp = null; banner = null; insp = null; payFx = 0
            settle = SETTLE.ticks // #1891 the first papers of the week drop onto the counter
            watchingRef.current = false; setWatching(false); watchScript = null // #1637 a new week starts in your hands
            audioController.playSweep(220, 440, 0.25, 'square', 0.07)
            setMode('play')
        }

        const demoRun = (seed) => {
            if (!demoScript || demoRun.seed !== seed) {
                demoRun.seed = seed
                const r = autopilot(newRun(seed), 999)
                demoScript = r.script.slice(0, Math.min(r.script.length, 16))
                demoAt = 0
            }
            return demoScript
        }

        const doFrameSim = () => {
            // #2072 the photo-hold ticks with the world clock (never a timer);
            // releasing the press or leaving the booth lifts the magnifier.
            if (screenRef.current === 'play' && holdDown && holdInPhoto) {
                photoHold++
                if (photoHold >= PHOTO_ZOOM.hold) photoZoom = true
            } else { photoHold = 0; photoZoom = false }
            if (screenRef.current !== 'play') {
                if (screenRef.current === 'attract') {
                    // #1960 the booth keeps working behind the title card —
                    // the shift clock sweeps on the demo too (scripted play
                    // out-stamps the budget, so the gate never falls here)
                    tick(gs)
                    gs.events.length = 0
                    if (gs.end) { demoSeed = (demoSeed + 1) % 4; gs = newRun(demoSeed) }
                    if (demoWait > 0) { demoWait--; return }
                    const sc = demoRun(demoSeed)
                    const s = sc[demoAt % sc.length]
                    demoAt++
                    if (gs.end) { demoSeed = (demoSeed + 1) % 4; gs = newRun(demoSeed) }
                    step(gs, { action: s.action })
                    gs.events.length = 0
                    demoWait = s.wait
                }
                return
            }
            simTick++
            if (stamp && stamp.ticks > 0) {
                stamp.ticks--
                // #1891 PAPER WEIGHT — when the judged document is picked up
                // (the stamp hold ticks out), the next applicant's papers drop.
                // #2021: unless there is a case to read — then the pin rides
                // first and the pickup waits for the read window to close.
                if (stamp.ticks === 0 && !insp) settle = SETTLE.ticks
            } else if (insp && insp.ticks > 0 && stamp) {
                // #2021 THE INSPECTOR STAYS — the original keeps the violation
                // inspector on screen. The judged document holds the counter
                // while the citation stays readable; then it is taken up and
                // the next papers drop. Input is never blocked: act() cuts the
                // pin short with the next ruling.
                insp.ticks--
                if (insp.ticks === 0) settle = SETTLE.ticks
            }
            if (settle > 0) {
                settle--
                // #2021 the next papers landing ends the hearing — the wall
                // never shows yesterday's reason while today's face is judged.
                if (settle === 0) insp = null
            }
            if (banner && banner.ticks > 0) banner.ticks--
            if (payFx > 0) payFx-- // #1968 the wage flicker rides the booth clock
            // #1960 the shift moves; when the last hour burns down the booth
            // ticks softly through the glass, one blip per second of the wall
            tick(gs)
            drainEvents()
            if (!gs.end && screenRef.current === 'play') {
                const gc = gameClock(gs)
                if (gc.frac < 0.12 && gs.clock % CFG.SIM_HZ === 0) audioController.playTone(1150, 0.02, 'square', 0.028)
            }
            if (watchingRef.current && watchScript) {
                // #1637 the inspector's own waits ride the live booth
                if (watchWait > 0) watchWait--
                else if (watchI < watchScript.length) {
                    const s = watchScript[watchI++]
                    act(s.action)
                    watchWait = s.wait || 84
                }
            }
        }

        // ---------------------------------------------------------------- paint ----
        const box = (x, y, w, h, fill, stroke) => {
            ctx.fillStyle = fill; ctx.fillRect(x, y, w, h)
            ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
        }
        const text = (s, x, y, size = 11, color = COL.ink, align = 'left') => {
            ctx.fillStyle = color
            ctx.font = `${size}px monospace`
            ctx.textAlign = align
            ctx.fillText(s, x, y)
        }

        const drawFace = (c, f, x, y, s = 1) => {
            const P = (v) => v * s
            // #1943 MINIMUM INK — the thin COMPARED strokes (thin brow, glasses
            // bridge, shut-mouth bar) are 1.5-2.25px inside the photo at the old
            // 0.75 crop: antialiasing ate them at phone scale, and a compared
            // feature that vanishes is not a rule the eye can check. CLamps keep
            // every such stroke >= 2px at ANY scale. No-ops at s = 1 (every
            // value there is already >= 2), so the counter face and every
            // scale-1 probe (portraitPix/crowdPix/castPix byte-identity) are
            // untouched — doctrine: the two portraits stay the same function.
            const PL = (v, m = 2) => Math.max(v * s, m)
            c.fillStyle = SHIRTS[f.shirtC]; c.fillRect(x, y + P(92), P(110), P(30))
            c.strokeStyle = '#141824'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + P(92) + 0.5, P(110) - 1, P(30) - 1)
            c.fillStyle = SKINS[f.skin]
            c.beginPath(); c.ellipse(x + P(55), y + P(52), P(f.narrow ? 27 : 34), P(40), 0, 0, Math.PI * 2); c.fill()
            // #1972 ears, painted BEFORE the hair so a sideburn cut buries
            // them the way the original's sprite does. Decor — never compared.
            // #1979: a regular with the `ear` mark grows them taller — one of
            // the four signature marks, decor by the doctrine of the nose.
            const rx = P(f.narrow ? 27 : 34)
            const ey = f.mark === 'ear' ? P(40) : P(44), eh = f.mark === 'ear' ? P(18) : P(10)
            c.fillRect(x + P(55) - rx - P(4), y + ey, P(5), eh); c.fillRect(x + P(55) + rx - P(1), y + ey, P(5), eh)
            // #1989 the gold earring sits on the RIGHT lobe — clear of the
            // castPix ear window (left columns) and of every mark's region.
            if (f.ear) { c.fillStyle = EAR_COL; c.fillRect(x + P(55) + rx, y + ey + eh - P(2), P(3), P(3)) }
            c.fillStyle = HAIRS[f.hairC]
            c.fillRect(x + P(20), y + P(8), P(70), P(f.style === 0 ? 16 : f.style === 1 ? 10 : 22))
            // #1976 SIDEURNS STOP ABOVE THE EAR. The cuts reached row 52 and
            // buried the ears (rows 44-54) on one side only — at phone scale
            // the asymmetry read as a rendering bug, not a haircut. 36 puts
            // the longest sideburn at row 44 = the ear top: the cut still
            // frames the face, the ear stays alive under all four cuts.
            if (f.style === 2) c.fillRect(x + P(18), y + P(8), P(8), P(36))
            if (f.style === 3) c.fillRect(x + P(84), y + P(8), P(8), P(36))
            // #2072 HAIR SILHOUETTE — cuts carry a shape, not a flat block.
            // Each cut grows chunky temple/jaw steps, and the SHIRT (decor,
            // never compared, inherited identically by the photo) picks one of
            // two variants: silhouettes vary WITHIN a cut, never across it
            // (the cut stays the only silhouette difference the PORTRAIT rule
            // leans on — style is compared by descriptor, and both faces run
            // through this same pure function, so byte-identity holds; keying
            // on hairC would break it, the photo is forced grey).
            // The shadow tone sits one step darker at the hairline. All ink
            // stops at row 43: the #1976 ear law keeps rows 44-53 ear-live.
            const hb = f.style === 0 ? 24 : f.style === 1 ? 18 : 30
            const v = f.shirtC % 2
            if (v === 0) {
                c.fillRect(x + P(20), y + P(hb), P(8), P(4)); c.fillRect(x + P(20), y + P(hb + 4), P(5), P(6))
                c.fillRect(x + P(82), y + P(hb), P(8), P(4)); c.fillRect(x + P(85), y + P(hb + 4), P(5), P(6))
            } else {
                c.fillRect(x + P(28), y + P(4), P(16), P(4))
                c.fillRect(x + P(20), y + P(hb), P(6), P(6)); c.fillRect(x + P(20), y + P(hb + 6), P(3), P(4))
                c.fillRect(x + P(84), y + P(hb), P(6), P(6)); c.fillRect(x + P(87), y + P(hb + 6), P(3), P(4))
            }
            c.fillStyle = HAIR_SHADOW[f.hairC]
            c.fillRect(x + P(20), y + P(hb - 3), P(70), P(3))
            // #1989 HEADWEAR — the original's crowd wears its weather. Hats
            // cover the crown but never the whole head: the hairline stays
            // visible under the brim and past its edge (so a grey-haired
            // aged photo or a flipped cut still READS through the hat), and
            // the ushanka flaps stop above every compared band.
            if (f.hat === 1) {
                c.fillStyle = HAT_COLS[1]; c.fillRect(x + P(24), y + P(4), P(62), P(12))
                c.fillStyle = CAP_BRIM; c.fillRect(x + P(14), y + P(16), P(54), P(4))
            } else if (f.hat === 2) {
                c.fillStyle = HAT_COLS[2]
                c.fillRect(x + P(18), y + P(2), P(74), P(18))
                c.fillRect(x + P(18), y + P(20), P(10), P(20)); c.fillRect(x + P(82), y + P(20), P(10), P(20))
            } else if (f.hat === 3) {
                c.fillStyle = HAT_COLS[3]; c.fillRect(x + P(22), y + P(78), P(66), P(14))
                c.fillStyle = SCARF_KNOT; c.fillRect(x + P(48), y + P(74), P(14), P(6))
            }
            // #1972 eyes get whites + pupils — the small face reads as a face
            c.fillStyle = '#d8dce8'
            c.fillRect(x + P(38), y + P(44), P(10), P(8)); c.fillRect(x + P(62), y + P(44), P(10), P(8))
            c.fillStyle = '#20242e'
            c.fillRect(x + P(41), y + P(46), P(4), P(4)); c.fillRect(x + P(65), y + P(46), P(4), P(4))
            // #1972 brows — the compared thickness (thin 2px / thick 5px).
            // Constant ink: thickness is structure, color is never evidence.
            const bh = PL(f.brow ? 5 : 2)
            c.fillRect(x + P(38), y + P(38), P(10), bh); c.fillRect(x + P(62), y + P(38), P(10), bh)
            // #1989 the unibrow bridges the brows. Its ink sits one step off
            // the compared-brow ink (#20242e) on purpose: thickness stays the
            // evidence the PORTRAIT rule reads; the bridge is atmosphere.
            if (f.uni) { c.fillStyle = UNI_COL; c.fillRect(x + P(48), y + P(38), P(14), P(4)) }
            // #1972 nose — decor only, never compared
            c.fillStyle = 'rgba(20,24,36,0.28)'
            c.fillRect(x + P(53), y + P(50), P(4), P(8))
            // #1972 mouth: shut bar vs open block — a compared feature
            c.fillStyle = '#20242e'
            if (f.mouth) c.fillRect(x + P(49), y + P(63), P(12), P(9))
            else c.fillRect(x + P(48), y + P(66), P(16), P(3))
            if (f.must) { c.fillStyle = HAIRS[f.hairC]; c.fillRect(x + P(44), y + P(58), P(24), P(5)) }
            // #1989 the missing tooth: a light band of teeth with one dark
            // gap column. Open mouths get the full band; a shut mouth keeps
            // a smaller smirk — the notch reads either way. Teeth ink is
            // distinct from the eye whites (#d8dce8) so both counters stay
            // honest on their own pixels.
            if (f.gap) {
                if (f.mouth) {
                    c.fillStyle = TOOTH_COL; c.fillRect(x + P(49), y + P(63), P(12), P(3))
                    c.fillStyle = '#20242e'; c.fillRect(x + P(53), y + P(63), P(2), P(3))
                } else {
                    c.fillStyle = TOOTH_COL; c.fillRect(x + P(54), y + P(66), P(4), P(2))
                }
            }
            if (f.glasses) {
                c.fillStyle = '#10151f'
                c.fillRect(x + P(37), y + P(42), P(12), P(10)); c.fillRect(x + P(61), y + P(42), P(12), P(10))
                c.fillRect(x + P(49), y + P(46), P(12), PL(2))
                c.fillStyle = '#5a6b8a'
                c.fillRect(x + P(39), y + P(44), P(8), P(6)); c.fillRect(x + P(63), y + P(44), P(8), P(6))
            }
            // #1979 SIGNATURE MARKS — the authored regulars' scars of a life.
            // One ink, five shapes (the big ear grows above); decor by
            // doctrine — never a compared feature, never evidence.
            // Rows sit clear of every compared band: the scar rides the left
            // cheek at rows 50-55 (the narrow band starts at 56), the mole
            // clears the mustache bar's right edge (x68), the wrinkle rows
            // 32/35 sit above the brow row 38 and below the longest hair.
            // #1997 two more: the freckle cluster rides the left cheek BELOW
            // the scar window (rows 60-67, inside the narrow ellipse's edge)
            // and the forehead bandage sits rows 26-29 — above the wrinkle
            // window, below the hairline, clear of the glasses rim's rows.
            if (f.mark === 'scar') {
                c.fillStyle = '#8f4a3e'
                c.fillRect(x + P(30), y + P(50), P(2), P(2)); c.fillRect(x + P(32), y + P(52), P(2), P(2)); c.fillRect(x + P(34), y + P(54), P(2), P(2))
            } else if (f.mark === 'mole') {
                c.fillStyle = '#8f4a3e'
                c.fillRect(x + P(70), y + P(58), P(2), P(2))
            } else if (f.mark === 'wrinkle') {
                c.fillStyle = '#8f4a3e'
                c.fillRect(x + P(38), y + P(32), P(34), P(1)); c.fillRect(x + P(38), y + P(35), P(32), P(1))
            } else if (f.mark === 'freckles') {
                c.fillStyle = '#8f4a3e'
                c.fillRect(x + P(30), y + P(60), P(2), P(2)); c.fillRect(x + P(34), y + P(62), P(2), P(2)); c.fillRect(x + P(31), y + P(66), P(2), P(2))
            } else if (f.mark === 'patch') {
                c.fillStyle = '#8f4a3e'
                c.fillRect(x + P(60), y + P(26), P(6), P(4))
            }
        }

        const drawPassport = (pp, x, y, zoom = false) => {
            box(x, y, 300, 148, COL.paper, '#6f6a52')
            ctx.fillStyle = '#a33c3c'; ctx.fillRect(x, y, 300, 20)
            text('PASSPORT', x + 8, y + 15, 12, '#f2e8d8')
            text(`NAME ${pp.name}`, x + 10, y + 42)
            text(`NO. ${pp.id}`, x + 10, y + 58)
            text(`DOB ${dshow(pp.dob)}`, x + 10, y + 74)
            text(`SEX ${pp.sex}  HEIGHT ${pp.height}CM`, x + 10, y + 90)
            text(`WEIGHT ${pp.weight}KG`, x + 10, y + 106)
            text(`ISSUED ${pp.city}`, x + 10, y + 122)
            box(x + 140, y + 34, 84, 60, '#c9c2a4', COL.paperLine)
            text('ISSUED BY', x + 182, y + 48, 8, '#6b5d3a', 'center')
            text(`${pp.country}`, x + 182, y + 70, 11, COL.ink, 'center')
            // #1938 the photo on the paper — same drawFace, so an honest
            // photo is the identical face in miniature. #1972: the miniature
            // is a ZOOM-CROP now (s 0.75, clipped to the frame): the head
            // ~50px wide where the old flat 0.6 read ~40, chest cropped the
            // way an ID photo crops a person.
            box(x + PHOTO.x, y + PHOTO.y, PHOTO.w, PHOTO.h, '#c9c2a4', COL.paperLine)
            ctx.save()
            ctx.beginPath(); ctx.rect(x + PHOTO.x, y + PHOTO.y, PHOTO.w, PHOTO.h); ctx.clip()
            // #2072 held: the print grows past its frame and the frame clips —
            // the same way lifting a photo and leaning in crops the world.
            const sz = zoom ? PHOTO_ZOOM.s : PHOTO.s
            const oxz = zoom ? Math.round(PHOTO.w / 2 - 55 * sz) : PHOTO.ox
            drawFace(ctx, pp.photo, x + PHOTO.x + oxz, y + PHOTO.y + PHOTO.oy, sz)
            // #1976 aged print — the amber wash covers the whole print but not
            // the frame line (inset 1), so the photo reads as an old print IN a
            // fresh frame. Never inside drawFace: byte-identity of the two
            // portraits (portraitPix) is the fairness proof and stays untouched.
            ctx.fillStyle = PHOTO_TINT; ctx.fillRect(x + PHOTO.x + 1, y + PHOTO.y + 1, PHOTO.w - 2, PHOTO.h - 2)
            ctx.restore()
            text(`EXPIRES ${dshow(pp.expiry)}`, x + 10, y + 140)
            text(`VALID ${isAdult(pp.dob, gs.week.days[gs.day - 1].date) ? 'ADULT' : 'CHILD'}`, x + 240, y + 140, 10, '#6b5d3a', 'center')
        }

        const drawId = (id, x, y) => {
            box(x, y, 190, 64, '#b8c4d8', '#5a6b8a')
            text('ID CARD', x + 8, y + 15, 11, '#20304e')
            text(`${id.name}`, x + 8, y + 32)
            text(`HT ${id.height}CM  WT ${id.weight}KG`, x + 8, y + 46, 10)
            text(`DOB ${dshow(id.dob)}`, x + 8, y + 59, 10)
        }

        const paint = () => {
            ctx.fillStyle = COL.wall
            ctx.fillRect(0, 0, CW, CHS)
            ctx.strokeStyle = COL.wallLine
            for (let y = 14; y < CHS; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(250, y); ctx.stroke() }
            const { day, view } = current(gs)
            // the wall: date, rulebook, entry list, wanted sheet, scale
            // #1891 the header prints the month NAME (the original's wall):
            text(`DAY ${day.n}   ${dshow(day.date)}`, 12, 24, 15, COL.gold)
            let yy = WALL.top
            text('RULEBOOK TODAY:', WALL.x, yy, WALL.size, COL.text); yy += WALL.labelLine
            for (const r of day.rules) {
                const t = RULES[r].text
                const words = t.split(' ')
                let line = ''
                for (const w of words) {
                    if ((line + w).length > WALL.ruleWrap) { text(line, WALL.x + 2, yy, WALL.ruleSize, '#9fb0d6'); yy += WALL.ruleLine; line = '' }
                    line += w + ' '
                }
                text(line, WALL.x + 2, yy, WALL.ruleSize, '#9fb0d6'); yy += WALL.ruleLine
                yy += WALL.ruleGap
            }
            const rows = wallRows(day, day.rules.map((r) => RULES[r].text))
            text('ENTRY LIST:', WALL.x, rows.listsY, WALL.size, COL.text)
            text('WANTED:', WALL.x + 114, rows.listsY, WALL.size, COL.text)
            let ey = rows.entries
            for (const c of day.allowed) { text(`  ${c}`, WALL.x, ey, WALL.listSize, '#7ddc5d'); ey += WALL.listLine }
            // every name on the sheet must FIT on the wall — paperscheck
            // pins day.wanted.length <= 5 (the original bulletin's five) and
            // sweeps the fit, so no booth must ever hide one. #1908 made the
            // rows brighter (wallRed); #1943 made them BIGGER: ruleGap relief
            // pays for 10px rows on 11px pitch, worst day y=352 vs the scale
            // box at 358 — six px of slack — so the sheet reads by size AND
            // contrast at arm's length on a phone.
            // #1988 THE BULLETIN PRINTS A FACE + ANNOUNCES THE TURN: the arc
            // entry carries its authored face, painted as a small paper mugshot
            // under the name (same drawFace, third surface); and while that
            // face is AT the window, an ARC_HL underline + mug frame light the
            // row — the wall noticing the neighbor. View-side only: keyed off
            // the live applicant, never gs, so stateHash is byte-identical.
            for (const row of bulletinRows(day, day.rules.map((r) => RULES[r].text), !!(view.person && view.person.arc))) {
                const label = `  ${row.w.name} #${row.w.id}`
                text(label, WALL.x + 114, row.y, WALL.wantedSize, COL.wallRed)
                if (row.hl) {
                    ctx.fillStyle = ARC_HL
                    ctx.fillRect(WALL.x + 114, row.y + 3, label.length * WALL.wantedSize * CHAR, 2)
                }
                if (row.mug) {
                    box(row.mug.x, row.mug.y, row.mug.w, row.mug.h, COL.paper, COL.paperLine)
                    ctx.save()
                    ctx.beginPath(); ctx.rect(row.mug.x, row.mug.y, row.mug.w, row.mug.h); ctx.clip()
                    drawFace(ctx, row.w.face, row.mug.x + row.mug.w / 2 - 55 * ARC_MUG.s, row.mug.y - 1, ARC_MUG.s)
                    ctx.restore()
                    if (row.hl) {
                        ctx.strokeStyle = ARC_HL; ctx.lineWidth = 2
                        ctx.strokeRect(row.mug.x - 1, row.mug.y - 1, row.mug.w + 2, row.mug.h + 2)
                    }
                }
            }
            box(SCALE.x, SCALE.y, SCALE.w, SCALE.h, '#0f1420', '#4a5578')
            text('SCALE', SCALE.x + 48, SCALE.y + 12, 9, COL.text, 'center')
            text(`${view.scale}KG`, SCALE.x + 48, SCALE.y + 26, 12, COL.gold, 'center')
            // #1968 RENT AHEAD — on a rent night the booth prints tonight's
            // bill on the wall while you can still earn it away, in the
            // corridor under the SCALE box (paperscheck pins the corridor and
            // the width). No more dying to a bill the booth never mentioned.
            const rd = rentDue(day.n)
            if (rd) text(`RENT DUE TONIGHT -${rd}CR`, RENT.x, RENT.y, RENT.size, gs.credits < rd ? COL.red : COL.gold)
            // #1960 THE SHIFT CLOCK — the original's wall clock: the hands
            // sweep the printed shift 08:00→18:00 over the day's budget, the
            // last printed hour turns red and the ticks come through the glass.
            const gc = gameClock(gs)
            ctx.fillStyle = '#0f1420'
            ctx.beginPath(); ctx.arc(CLOCK.x, CLOCK.y, CLOCK.r, 0, Math.PI * 2); ctx.fill()
            ctx.strokeStyle = gc.red ? COL.red : '#4a5578'
            ctx.lineWidth = 1
            ctx.beginPath(); ctx.arc(CLOCK.x, CLOCK.y, CLOCK.r + 0.5, 0, Math.PI * 2); ctx.stroke()
            for (let i = 0; i < 4; i++) {
                const a = i * Math.PI / 2 - Math.PI / 2
                ctx.fillStyle = gc.red ? '#ff8080' : '#6d7a9c'
                ctx.fillRect(CLOCK.x + Math.cos(a) * (CLOCK.r - 3) - 1, CLOCK.y + Math.sin(a) * (CLOCK.r - 3) - 1, 2, 2)
            }
            const hand = (ang, len, w, col) => {
                ctx.strokeStyle = col; ctx.lineWidth = w
                ctx.beginPath(); ctx.moveTo(CLOCK.x, CLOCK.y)
                ctx.lineTo(CLOCK.x + Math.cos(ang) * len, CLOCK.y + Math.sin(ang) * len); ctx.stroke()
            }
            const hcol = gc.red ? COL.red : COL.gold
            hand((((gc.hh % 12) + gc.mm / 60) / 12) * Math.PI * 2 - Math.PI / 2, CLOCK.r - 8, 2, hcol)
            hand((gc.mm / 60) * Math.PI * 2 - Math.PI / 2, CLOCK.r - 4, 1, hcol)
            text(`${gc.hh}:${String(gc.mm).padStart(2, '0')}`, CLOCK.x, CLOCK.y + CLOCK.r + 6, 7, gc.red ? '#ff8080' : COL.text, 'center')
            // strikes: three slots, filled red
            for (let i = 0; i < CFG.STRIKE_MAX; i++) {
                box(12 + i * 26, CHS - 34, 20, 20, i < gs.strikes ? '#7a1f1f' : '#10141f', '#555f7d')
                if (i < gs.strikes) text('X', 22 + i * 26, CHS - 19, 13, '#ff8080', 'center')
            }
            text(`SCORE ${gs.score}`, 100, CHS - 19, 12, COL.gold)
            // #1966 the purse: credits ride beside the score — rent is due
            // whether the player remembers the bills or not
            text(`CR ${gs.credits}`, 170, CHS - 19, 12, gs.credits <= 0 ? COL.red : COL.gold)
            // #1968 THE WAGE FLICKER — the original ticks the readout with
            // every processed head; here +5 rises off the CR line whenever a
            // correct stamp earns it. Decor inside the strip band (PAYFX zone).
            if (payFx > 0) {
                const a = Math.min(1, payFx / 24)
                ctx.fillStyle = `rgba(125,220,93,${a.toFixed(3)})`
                ctx.font = `bold 12px monospace`
                ctx.textAlign = 'left'
                ctx.fillText(`+${CFG.PAY}`, PAYFX.x, PAYFX.base - (PAYFX.ticks - payFx) * (PAYFX.rise / PAYFX.ticks))
            }
            // the entrant (during a stamp, the papers shown are the ones
            // just judged — the stamp lands on its own document). #2021: the
            // judged document keeps the counter through the ink AND the pin —
            // the booth hands over only when the next papers land.
            const judged = (stamp && stamp.ticks > 0) || !!(insp && insp.ticks > 0)
            const shown = judged ? stamp.person : view.person
            drawFace(ctx, shown ? shown.face : view.person.face, PORTRAIT.x, PORTRAIT.y, 1)
            text(`ENTRANT ${gs.idx + (judged ? 0 : 1)}/${gs.week.days[gs.day - 1].queue.length}`, PORTRAIT.x + PORTRAIT.headCx, 168, 10, COL.text, 'center')
            // the papers — #1891 PAPER WEIGHT: while a new applicant's papers
            // settle (settle > 0), the whole stack rides dy: papers arrive,
            // they do not teleport. Decor only — the sim and every replay pin
            // never see it; the stamped document stays put (dy only runs while
            // the NEXT papers come in, after the hold ticks out).
            const dy = settle > 0 ? SETTLE.dy(settle) : 0
            if (shown && shown.passport) {
                drawPassport(shown.passport, PAPERS.x, PAPERS.y + dy, photoZoom)
                if (shown.idcard) drawId(shown.idcard, ID.x, ID.y + dy)
            } else {
                box(PAPERS.x, 60 + dy, PAPERS.w, 120, '#12161f', '#39415c')
                text('"I HAVE NO PAPERS."', STAMP.x, 125 + dy, 14, '#6d7a9c', 'center')
            }
            // #1983 THE ARC — the neighborhood remembers. A returning entrant
            // speaks at the counter: a printed paper bubble under the face
            // column, tail up toward the glass. Atmosphere by doctrine —
            // decide never reads `say` (paperscheck pins the purity by
            // verdict-twinning every paper) — but the booth prints the line
            // exactly when it is present, and papersplay proves those pixels.
            if (shown && shown.say) {
                // #2003: the thread's three-line return grows the field downward
                // (8 + 13n keeps 1–2 lines pixel-identical to the old h=34; the
                // worst case 302+47=349 stays inside the strip/witness bound of
                // 394 — paperscheck pins the growth law).
                const bubH = Math.max(BUBBLE.h, 8 + 13 * shown.say.length)
                box(BUBBLE.x, BUBBLE.y, BUBBLE.w, bubH, COL.paper, COL.paperLine)
                ctx.fillStyle = COL.paper
                ctx.beginPath()
                ctx.moveTo(BUBBLE.x + 18, BUBBLE.y); ctx.lineTo(BUBBLE.x + 38, BUBBLE.y); ctx.lineTo(BUBBLE.x + 22, BUBBLE.y - 16)
                ctx.closePath(); ctx.fill()
                ctx.strokeStyle = COL.paperLine; ctx.lineWidth = 1
                ctx.beginPath(); ctx.moveTo(BUBBLE.x + 18, BUBBLE.y + 1); ctx.lineTo(BUBBLE.x + 22, BUBBLE.y - 16); ctx.lineTo(BUBBLE.x + 38, BUBBLE.y + 1); ctx.stroke()
                shown.say.forEach((ln, i) => text(ln, BUBBLE.x + 8, BUBBLE.y + 15 + i * 13, 10, COL.ink))
            }
            // controls strip + last call feedback
            box(0, CHS - STRIP_H, CW, STRIP_H, '#10141f', '#000')
            text('A / SPACE: ADMIT        D: DENY', 12, CHS - 16, 13, COL.gold)
            if (gs.last) text(gs.last.ok ? 'CORRECT' : 'MISTAKE', CW - 12, CHS - 16, 13, gs.last.ok ? COL.green : COL.red, 'right')
            // the stamp: its COLOR is your call (green admit, red deny),
            // never your correctness — a wrong call gets the red/green of
            // what you did, plus the red double frame and the witness line
            // for what you missed. The player reads the stamp as ink; the
            // harness grades the same two rectangles. #2021: the mark rides
            // the judged document (like the original — a stamp stays on the
            // paper), not just the first half-second of ink.
            if (judged && stamp) {
                if (!stamp.ok) {
                    ctx.strokeStyle = COL.red
                    ctx.lineWidth = 4
                    ctx.strokeRect(PAPERS.x + 2, PAPERS.y + 2, PAPERS.w - 4, 226)
                    ctx.strokeRect(PAPERS.x - 4, PAPERS.y - 4, PAPERS.w + 8, 238)
                }
                ctx.save()
                ctx.translate(STAMP.x, STAMP.y)
                ctx.rotate(-0.18)
                const stampCol = stamp.verdict === 'approve' ? COL.green : COL.red
                ctx.strokeStyle = stampCol
                ctx.lineWidth = 3
                ctx.strokeRect(-86, -22, 172, 44)
                text(stamp.verdict === 'approve' ? 'APPROVED' : 'DENIED', 0, 6, 24, stampCol, 'center')
                ctx.restore()
            }
            // #1891 THE STAMP SPEAKS — the booth quotes its case, and #2021
            // keeps it on screen: the witness line and evidence clauses ride the
            // stamp's ink AND outlive it, pinned (same colors, same zones — the
            // EVID corridor of layout.js) through the read window, until the
            // next applicant's papers land (the pin machine in doFrameSim).
            // A miss keeps its red witness (what you missed); a correct deny
            // prints its gold witness too (what you caught, and WHY). A clean
            // admit has no witness — nothing pins.
            if (insp) {
                text(insp.witness, STAMP.x, 296, 12, insp.ok ? COL.gold : COL.red, 'center')
                insp.evidence.forEach((ln, i) => text(ln, EVID.cx, EVID.y + i * EVID.line, EVID.size, insp.ok ? COL.gold : COL.red, 'center'))
                // #1988 the seized neighbor's argue line, under the DENIED stamp
                // (SEIZE carries its own offsets — see layout for the measured box).
                if (insp.argue) text(insp.argue, SEIZE.x, SEIZE.y, SEIZE.size, COL.red, 'center')
            }
            // #1966 THE DEDUCTION SLIP — the printed paper the original
            // slides under the door at end of day: pay earned, rent (on the
            // nights it is due), soup, heat, and the balance that has to keep
            // the apartment alive. Hungry/cold nights print NONE in red.
            if (gs.slip) {
                const s = gs.slip
                box(SLIP.x, SLIP.y, SLIP.w, SLIP.h, COL.paper, '#6f6a52')
                ctx.strokeStyle = COL.paperLine
                ctx.setLineDash([2, 3])
                ctx.beginPath(); ctx.moveTo(SLIP.x + 4, SLIP.y + SLIP.dash); ctx.lineTo(SLIP.x + SLIP.w - 4, SLIP.y + SLIP.dash); ctx.stroke()
                ctx.setLineDash([])
                text(`END OF DAY ${s.day} — DEDUCTIONS`, SLIP.x + SLIP.w / 2, SLIP.y + SLIP.head, 9, '#6b5d3a', 'center')
                // #1968 PHONE LEGIBILITY: 11px rows on a 13px pitch (was
                // 10/12 ≈ 6px on a 390px phone), and the hungry/cold markers
                // name their own row (NO SOUP / NO HEAT) — shorter, clearer,
                // and the value column can never crowd the key column.
                const row = (i, k, v, col) => {
                    text(k, SLIP.x + 10, SLIP.y + SLIP.row0 + i * SLIP.pitch, SLIP.size)
                    text(v, SLIP.x + SLIP.w - 10, SLIP.y + SLIP.row0 + i * SLIP.pitch, SLIP.size, col, 'right')
                }
                row(0, 'PAY', `+${s.pay}`, COL.green)
                let ri = 1
                if (s.rent) row(ri++, 'RENT', `-${s.rent}`, COL.red)
                row(ri++, 'SOUP', s.soup ? `-${s.soup}` : 'NO SOUP', COL.red)
                row(ri++, 'HEAT', s.heat ? `-${s.heat}` : 'NO HEAT', COL.red)
                row(ri, 'BALANCE', `${s.balance}`, s.balance <= 0 ? COL.red : COL.ink)
            }
            // day banner
            if (banner && banner.ticks > 0) {
                const a2 = Math.min(1, banner.ticks / 40)
                ctx.fillStyle = `rgba(8,10,16,${0.82 * a2})`
                // #1891 THE NEW MONTH — the roll gets its own printed line,
                // and the overlay grows a row to hold it.
                ctx.fillRect(0, 150, CW, banner.month ? 116 : 96)
                text(banner.text, CW / 2, 196, 26, COL.gold, 'center')
                text(banner.sub, CW / 2, 224, 12, '#9fb0d6', 'center')
                if (banner.month) text(`* NEW MONTH: ${banner.month} *`, CW / 2, 248, 13, COL.gold, 'center')
            }
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                acc += ft
                while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS }
            }
            paint()
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                if (e.code === 'Digit1') return startPlay(0)
                if (e.code === 'Digit2') return startPlay(1)
                if (e.code === 'Digit3') return startPlay(2)
                if (e.code === 'Digit4') return startPlay(3)
                startPlay(0); return
            }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current || sc !== 'play') return
            // #1637 WATCH: Y seats the perfect inspector at any live booth it
            // can still survive; any real input takes over; Y re-seats from HERE.
            if (isWatchKey(e)) {
                if (watchingRef.current) releaseWatch()
                else if (seatWatcher()) { watchingRef.current = true; setWatching(true); playWatchStart() }
                return
            }
            if (watchingRef.current && isTakeoverKey(e)) releaseWatch()
            if (e.code === 'KeyA' || e.code === 'Space') act('approve')
            else if (e.code === 'KeyD') act('deny')
        }
        const onPointer = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(0); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (sc !== 'play' || pausedRef.current) return
            if (watchingRef.current) releaseWatch() // #1637 a tap on the counter takes the stamp
            const r = canvas.getBoundingClientRect()
            if (!r.width) return
            // #2072 HOLD TO INSPECT — a press on the photo (passport on the
            // counter) is the inspector leaning in, not a stamp: it swallows
            // the tap and grows the crop while held. Everywhere else on the
            // counter the old left/right stamp zones are untouched.
            const sx = ((e.clientX - r.left) / r.width) * CW
            const sy = ((e.clientY - r.top) / r.height) * CHS
            if (current(gs).view.person?.passport &&
                sx >= PAPERS.x + PHOTO.x - 6 && sx <= PAPERS.x + PHOTO.x + PHOTO.w + 6 &&
                sy >= PAPERS.y + PHOTO.y - 14 && sy <= PAPERS.y + PHOTO.y + PHOTO.h + 14) {
                holdDown = true; holdInPhoto = true
                return
            }
            act((e.clientX - r.left) / r.width > 0.55 ? 'deny' : 'approve')
        }
        const onUp = () => { holdDown = false; holdInPhoto = false; photoHold = 0; photoZoom = false }
        window.addEventListener('keydown', onDown)
        window.addEventListener('pointerdown', onPointer)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const s = Math.min(r.width / CW, r.height / CHS)
            canvas.style.width = `${CW * s}px`
            canvas.style.height = `${CHS * s}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            // #1938 PORTRAIT pixel probe: render the live face and the photo
            // descriptors through the SAME drawFace at one scale, and count
            // differing pixels per feature band. Papersplay gates it: honest
            // papers paint byte-identical faces (total 0); every break lights
            // its own band. Bands may overlap (they count DIFFERENCES, and a
            // break is exactly one feature), and only the named band is
            // load-bearing in the gates.
            const PIX = { w: 110, h: 122 }
            const portraitPix = () => {
                const p = current(gs).view.person
                if (!p.face || !p.passport || !p.passport.photo) return null
                const render = (f) => {
                    const c = document.createElement('canvas')
                    c.width = PIX.w; c.height = PIX.h
                    const cc = c.getContext('2d')
                    cc.imageSmoothingEnabled = false
                    drawFace(cc, f, 0, 0, 1)
                    return cc.getImageData(0, 0, PIX.w, PIX.h).data
                }
                const A = render(p.face), B = render(p.passport.photo)
                const band = (x0, y0, x1, y1) => {
                    let n = 0
                    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
                        const i = (yy * PIX.w + xx) * 4
                        if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) n++
                    }
                    return n
                }
                return {
                    total: band(0, 0, PIX.w, PIX.h),
                    style: band(16, 6, 94, 40) + band(16, 6, 28, 54) + band(82, 6, 94, 54),
                    narrow: band(20, 56, 32, 70) + band(78, 56, 92, 70),
                    glasses: band(35, 41, 75, 56),
                    must: band(42, 56, 70, 66),
                    // #1972 bands. brow rows 36-42 sit ABOVE the glasses rim
                    // (y42 starts the frame) so a glasses flip cannot light
                    // it; a thick brow adds rows 40-42 the thin one lacks.
                    // mouth rows 63-74 start below the mustache's last row
                    // (62) so only the compared mouth shape lights it.
                    brow: band(35, 36, 75, 42),
                    mouth: band(46, 63, 66, 74),
                    // eye evidence: count the whites in the LIVE face render
                    // (128px bare-eye, 0 behind opaque lenses) — proves the
                    // sclera+pupil art is real pixels, not a descriptor claim
                    whites: (() => {
                        let n = 0
                        for (let i = 0; i < A.length; i += 4) {
                            if (((A[i] << 16) | (A[i + 1] << 8) | A[i + 2]) === 0xd8dce8) n++
                        }
                        return n
                    })(),
                }
            }
            window.__ppTest = {
                cfg: CFG, // #1966 pay constants so the live gates read the law, not a copy
                // #2072 hold-to-inspect probes: the zoom flag and the photo's
                // stage rect (papersplay turns it into client coords to drive
                // real pointer events), plus the hair shadow palette so the
                // pixel gates can count the shadow tone where it must live.
                photoZoom: () => photoZoom,
                photoRect: () => ({ x: PAPERS.x + PHOTO.x, y: PAPERS.y + PHOTO.y, w: PHOTO.w, h: PHOTO.h }),
                hairShadow: () => HAIR_SHADOW,
                // #1979 cast pixel proof — render each authored regular through
                // the SAME drawFace and count its signature mark's own ink (all
                // four exact colors, never a descriptor claim). ear counts skin
                // ink in the ear's own columns (x0..x0+3 — the ellipse is
                // tangent at x0+4, so it is ear or nothing).
                castPix: () => REGULARS.map((c) => {
                    const cv = document.createElement('canvas')
                    cv.width = PIX.w; cv.height = PIX.h
                    const cc = cv.getContext('2d')
                    cc.imageSmoothingEnabled = false
                    drawFace(cc, { ...c.face, mark: c.mark }, 0, 0, 1)
                    const d = cc.getImageData(0, 0, PIX.w, PIX.h).data
                    const hexAt = (i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
                    const ink = (x0, y0, x1, y1, hex) => {
                        let n = 0
                        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) if (hexAt((yy * PIX.w + xx) * 4) === hex) n++
                        return n
                    }
                    const x0 = 55 - (c.face.narrow ? 27 : 34) - 4
                    const skinHex = parseInt(SKINS[c.face.skin].slice(1), 16)
                    return {
                        id: c.id, mark: c.mark, name: c.name,
                        scar: ink(28, 48, 38, 58, 0x8f4a3e), mole: ink(68, 56, 74, 62, 0x8f4a3e),
                        wrinkle: ink(36, 30, 74, 37, 0x8f4a3e), ear: ink(x0, 38, x0 + 4, 60, skinHex),
                        // #1997 the new signatures, windows disjoint from every
                        // mark above (freckles rows 58-69 below the scar, the
                        // bandage rows 24-31 above the wrinkle window).
                        freckles: ink(28, 58, 38, 70, 0x8f4a3e), patch: ink(58, 24, 68, 32, 0x8f4a3e),
                    }
                }),
                // #1989 ONE-OFF CROWD pixel probe: render the LIVE entrant's
                // face (and their photo, when honest papers carry one) through
                // the SAME drawFace the booth paints with, and count each
                // decor family's own inks — hat bodies, unibrow bridge,
                // earring gold, tooth band. papersplay gates: decor entrants
                // paint their pixels at the counter AND in the photo, bare
                // heads paint none.
                crowdPix: () => {
                    const p = current(gs).view.person
                    if (!p.face) return null
                    const HEXES = {
                        hat: [0x3a4257, 0x2b3243, 0x6b4a2f, 0x7d4a33, 0x5f3722],
                        uni: [0x262b36], ear: [0xd8b23a], gap: [0xe6ebf2],
                    }
                    const hexN = (d, hexes) => {
                        let n = 0
                        for (let i = 0; i < d.length; i += 4) if (hexes.includes((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])) n++
                        return n
                    }
                    const render = (f) => {
                        const cv = document.createElement('canvas')
                        cv.width = PIX.w; cv.height = PIX.h
                        const cc = cv.getContext('2d')
                        cc.imageSmoothingEnabled = false
                        drawFace(cc, f, 0, 0, 1)
                        return cc.getImageData(0, 0, PIX.w, PIX.h).data
                    }
                    const out = { acc: { hat: p.face.hat || 0, uni: p.face.uni || 0, ear: p.face.ear || 0, gap: p.face.gap || 0 } }
                    const A = render(p.face)
                    for (const k of ['hat', 'uni', 'ear', 'gap']) out[k] = hexN(A, HEXES[k])
                    if (p.passport && p.passport.photo) {
                        const B = render(p.passport.photo)
                        for (const k of ['hat', 'uni', 'ear', 'gap']) out[k + 'Photo'] = hexN(B, HEXES[k])
                        out.photoAcc = { hat: p.passport.photo.hat || 0, uni: p.passport.photo.uni || 0, ear: p.passport.photo.ear || 0, gap: p.passport.photo.gap || 0 }
                    }
                    return out
                },
                watching: () => watchingRef.current, // #1637 WATCH probes
                watchSfx: watchSfxLog,
                // #1976 ears must live under every hair cut: render one fixed
                // face per cut through the SAME drawFace and count skin ink in
                // the ear columns (left x17..19, right x90..92 — clear of the
                // cheek ellipse, tangent at x21/x89). Full ears = 30+30.
                earPix: () => [0, 1, 2, 3].map((style) => {
                    const cv = document.createElement('canvas')
                    cv.width = PIX.w; cv.height = PIX.h
                    const cc = cv.getContext('2d')
                    cc.imageSmoothingEnabled = false
                    drawFace(cc, { skin: 0, hairC: 0, shirtC: 0, style, narrow: 0, glasses: 0, must: 0, brow: 0, mouth: 0 }, 0, 0, 1)
                    const d = cc.getImageData(0, 0, PIX.w, PIX.h).data
                    const win = (x0, x1) => {
                        let n = 0
                        for (let yy = 44; yy < 54; yy++) for (let xx = x0; xx < x1; xx++) {
                            const i = (yy * PIX.w + xx) * 4
                            if (d[i] - d[i + 2] > 40 && d[i] > 120) n++
                        }
                        return n
                    }
                    return win(17, 20) + win(90, 93)
                }),
                sfxTicks: () => sfxTicks,
                sfxAgain: () => sfxAgain, // #1982 arrivals the door welcomed
                sfxSeize: () => sfxSeize, // #1988 stamps that thudded on a seized neighbor
                againLog: () => againLog.slice(), // #1982 "day|regular|recall" per ring
                // #1983 the bubble is pixels: count the bubble's own paper
                // color in its rect on the LIVE canvas (up ≈ full field,
                // down ≈ nothing — papersplay pins both).
                bubblePix: () => {
                    const d = ctx.getImageData(BUBBLE.x, BUBBLE.y, BUBBLE.w, BUBBLE.h).data
                    let paper = 0
                    for (let i = 0; i < d.length; i += 4) if (((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]) === 0xd8d2b8) paper++
                    return paper
                },
                // #2003 THE LONG CONVERSATION: the growth strip below the old
                // 34px field — paper appears there ONLY when a three-line
                // thread grew the bubble. Dark = the field stayed standard.
                bubbleGrowPix: () => {
                    const d = ctx.getImageData(BUBBLE.x + 4, BUBBLE.y + BUBBLE.h + 2, BUBBLE.w - 8, 9).data
                    let paper = 0
                    for (let i = 0; i < d.length; i += 4) if (((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]) === 0xd8d2b8) paper++
                    return paper
                },
                // #1988 THE TAIL IS PINNED TOO: the triangle above the field was
                // drawn but never counted — bubblePix saw only the field, so the
                // tail could silently vanish. Count the paper-family inside the
                // tail band (the triangle is ~170px at full size; AA shaves the
                // edges, so the gate sits well under and papersplay proves both
                // sides: a speaking neighbor lights it, strangers leave it dark).
                bubbleTailPix: () => {
                    const d = ctx.getImageData(BUBBLE_TAIL.x, BUBBLE_TAIL.y, BUBBLE_TAIL.w, BUBBLE_TAIL.h).data
                    let paper = 0
                    for (let i = 0; i < d.length; i += 4) {
                        const [rr, gg, bb] = [d[i], d[i + 1], d[i + 2]]
                        if (rr > 190 && rr < 235 && gg > 180 && gg < 225 && bb > 150 && bb < 200) paper++
                    }
                    return paper
                },
                // #1988 THE BULLETIN PRINTS A FACE — live proof of the arc
                // mugshot and its announcement. `paper` counts the frame+field
                // of the mug rect (face ink covers part of it), `hl` counts
                // ARC_HL-family px in the wanted column (underline + mug frame;
                // the stamp/strip/strike reds live outside this rect, and the
                // sheet's own wallRed has gg 80..150 — excluded here).
                bulletinPix: () => {
                    const day = current(gs).day
                    const rulesT = day.rules.map((r) => RULES[r].text)
                    const rows = wallRows(day, rulesT)
                    const arcRow = bulletinRows(day, rulesT, false).find((x) => x.w.face)
                    let paper = 0
                    if (arcRow) {
                        const d = ctx.getImageData(arcRow.mug.x, arcRow.mug.y, arcRow.mug.w, arcRow.mug.h).data
                        for (let i = 0; i < d.length; i += 4) {
                            const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
                            if (k === 0xd8d2b8 || k === 0x8f8a70) paper++
                        }
                    }
                    let hl = 0
                    const top = rows.entries - 12
                    const h2 = rows.wantedEnd - top + 8
                    const d2 = ctx.getImageData(WALL.x + 112, top, 136, h2).data
                    for (let i = 0; i < d2.length; i += 4) {
                        const [rr, gg, bb] = [d2[i], d2[i + 1], d2[i + 2]]
                        if (rr > 170 && gg < 80 && bb < 80) hl++
                    }
                    return { present: !!arcRow, paper, hl }
                },
                // #1988 THE DENY AFTERSHOCK: the argue line's red ink in the
                // zone under the stamp (cap ink y−5..descender y+1 at the SEIZE
                // baseline; dark document ink and the amber VALID stamp fail the
                // hue test, so any count is the seized voice on the paper).
                seizeInk: () => {
                    const d = ctx.getImageData(SEIZE.x, SEIZE.y - 5, 150, 8).data
                    let n = 0
                    for (let i = 0; i < d.length; i += 4) {
                        const [rr, gg, bb] = [d[i], d[i + 1], d[i + 2]]
                        if (rr > 150 && rr > gg + 60 && rr > bb + 60) n++
                    }
                    return { ink: n, argue: insp && insp.argue ? insp.argue : null, sfx: sfxSeize }
                },
                // #1908 THE WALL THAT LIVES: ink of the wanted column's own
                // brighter red, counted as the hue FAMILY (rr>170, gg 80..150,
                // bb 80..150) — 9px glyphs are mostly antialiased against the
                // dark wall, so a pure-#ff6f5e count would measure ~8 px and
                // prove nothing. The rect holds sheet rows only: the entry list
                // is green/gold, the header is #cfd6e6, and the stamp/strip/
                // strike reds live outside it (x>=416 or y>=400).
                wantedInk: () => {
                    const day = current(gs).day
                    const rulesT = day.rules.map((r) => RULES[r].text)
                    const rows = wallRows(day, rulesT)
                    const top = rows.entries - 10
                    const w0 = WALL.x + 112
                    const h0 = rows.wantedEnd - top + 4
                    const d = ctx.getImageData(w0, top, 130, h0).data
                    // #1988 mask the arc mugshot: its skin tones must not leak
                    // into the sheet's red-row count (bulletinPix measures the
                    // face on its own terms; this gate measures rows).
                    const mugRow = bulletinRows(day, rulesT, false).find((x) => x.mug)
                    const M = mugRow
                        ? { x0: mugRow.mug.x - w0 - 1, x1: mugRow.mug.x - w0 + mugRow.mug.w + 1, y0: mugRow.mug.y - top - 1, y1: mugRow.mug.y - top + mugRow.mug.h + 1 }
                        : null
                    let n = 0
                    for (let yy = 0; yy < h0; yy++) for (let xx = 0; xx < 130; xx++) {
                        if (M && xx >= M.x0 && xx <= M.x1 && yy >= M.y0 && yy <= M.y1) continue
                        const i = (yy * 130 + xx) * 4
                        const [rr, gg, bb] = [d[i], d[i + 1], d[i + 2]]
                        if (rr > 170 && gg > 80 && gg < 150 && bb > 80 && bb < 150) n++
                    }
                    return { ink: n, rows: day.wanted.length }
                },
                wageFx: () => ({ ticks: payFx }),
                // #1968 RENT AHEAD ink: bright warm pixels (gold or red) in the
                // corridor under the SCALE box — the wallpaper rule lines are dark
                // (#323a52) and nothing else paints there, so any count is the note.
                rentNoteInk: () => {
                    const x0 = RENT.x, y0 = SCALE.y + SCALE.h + 2
                    const d = ctx.getImageData(x0, y0, 250 - x0, CHS - STRIP_H - y0).data
                    let n = 0
                    for (let i = 0; i < d.length; i += 4) {
                        const [rr, , bb] = [d[i], d[i + 1], d[i + 2]]
                        if (rr > 150 && rr > bb) n++
                    }
                    return { ink: n, due: rentDue(current(gs).day.n), credits: gs.credits }
                },
                // #1968 the wage flicker's green, counted near the strip band
                // where it rises (bright alpha only — proof it actually painted).
                wageFxInk: () => {
                    const d = ctx.getImageData(PAYFX.x - 2, PAYFX.base - PAYFX.rise - 4, 24, PAYFX.rise + 10).data
                    let n = 0
                    for (let i = 0; i < d.length; i += 4) {
                        const [rr, gg, bb] = [d[i], d[i + 1], d[i + 2]]
                        if (gg > 110 && gg > rr + 30 && gg > bb + 30) n++
                    }
                    return n
                },
                probe: () => {
                    const { day, view } = current(gs)
                    return {
                        screen: screenRef.current, day: gs.day, idx: gs.idx, seed: gs.seed,
                        strikes: gs.strikes, score: gs.score, caught: gs.caught, admitted: gs.admitted,
                        end: gs.end, why: gs.endWhy, last: gs.last, stamp: stamp && { ...stamp },
                        rules: day.rules, date: dfmt(day.date), allowed: day.allowed, wanted: day.wanted,
                        clock: gameClock(gs), ticksLeft: gs.clock, // #1960 shift clock probes
                        credits: gs.credits, hungry: gs.hungry, cold: gs.cold, // #1966 the purse
                        payFx, // #1968 the wage flicker's remaining ticks
                        slip: gs.slip && { ...gs.slip },
                        banner: banner && { ...banner }, view, evLog: evLog.slice(-60),
                    }
                },
                ff: (n) => { tick(gs, n || CFG.SEAT_TICKS * 2); drainEvents(); return { clock: gs.clock, day: gs.day, end: gs.end, why: gs.endWhy, credits: gs.credits, slip: gs.slip && { ...gs.slip } } }, // #1960 wind the shift forward
                start: startPlay,
                // #1891 THE STAMP SPEAKS: the exact strings paint() prints with
                // the live stamp. #2021 THE INSPECTOR STAYS: they now ride the
                // pin too — `inked` says the stamp hold still runs, `pinned`
                // says the case is being held after the ink for the reading
                // window. papersplay pins the strings VERBATIM against decide's
                // witness, counts the strip's red pixels to prove the quote is
                // ink, and pins the LIFETIME: ink → pin → cleared when the
                // next papers land.
                evidencePaint: () => ({ ...(insp ? { witness: insp.witness, evidence: insp.evidence } : { witness: null, evidence: [] }), ok: !!gs.last?.ok, why: gs.last?.why || null, inked: !!(stamp && stamp.ticks > 0), pinned: !!insp && !(stamp && stamp.ticks > 0), pinTicks: insp ? insp.ticks : -1 }),
                // #1891 PAPER WEIGHT: the live settle offset (negative while
                // new papers drop, 0 at rest) + the law's start value, so the
                // gate can prove a drop actually ran.
                settlePx: () => (settle > 0 ? SETTLE.dy(settle) : 0),
                settleTop: SETTLE.dy(SETTLE.ticks),
                // #1891 MONTH-NAME DATES: the header the wall actually prints.
                wallDate: () => dshow(current(gs).day.date),
                portraitPix, // #1938 photo-vs-face pixel probe
                verdict: () => decide(current(gs).view).verdict,
                hash: () => stateHash(gs),
                stamp: act,
                runDay: () => { const d = gs.day; while (!gs.end && gs.day === d) act(decide(current(gs).view).verdict); return gs.day },
                runToEnd: () => { while (!gs.end) act(decide(current(gs).view).verdict) },
            }
            mountDbg({
                title: 'PAPERS, PLEASE-MIN',
                getState: () => {
                    const { day, view } = current(gs)
                    return [
                        `day ${gs.day} entrant ${gs.idx + 1}/${day.queue.length}  strikes ${gs.strikes}/${CFG.STRIKE_MAX}  score ${gs.score} caught ${gs.caught} admitted ${gs.admitted}  clock ${(() => { const g = gameClock(gs); return `${g.hh}:${String(g.mm).padStart(2, '0')}` })()}  CR ${gs.credits}${gs.hungry ? ' hungry' : ''}${gs.cold ? ' cold' : ''}`,
                        `truth: verdict=${decide(view).verdict} break=${gs.week.days[gs.day - 1].queue[gs.idx].breakRule || '-'} trap=${gs.week.days[gs.day - 1].queue[gs.idx].trap || '-'} scale=${view.scale}`,
                        `end ${gs.end || '-'} ${gs.endWhy || ''}`,
                    ]
                },
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const sim = newRun(gs.seed)
                            sim.day = gs.day; sim.idx = gs.idx; sim.strikes = gs.strikes; sim.score = gs.score
                            sim.credits = gs.credits; sim.hungry = gs.hungry; sim.cold = gs.cold; sim.paidToday = gs.paidToday // #1966 prognosis must inherit the purse: a doomed apartment stays doomed
                            sim.week = gs.week; sim.end = null
                            let n = 0
                            while (!sim.end && n++ < 300) step(sim, { action: decide(current(sim).view).verdict })
                            return sim.end === 'win'
                                ? `WINNABLE: from this exact booth state a perfect inspector still clears day ${sim.day} -> ${sim.endWhy}`
                                : `NOT WINNABLE: perfect play from here ends ${sim.end || 'stalled'} — ${sim.strikes} strikes already spent`
                        },
                    },
                    { label: 'STRIKE +1', run: () => { gs.strikes += 1; return `strike ${gs.strikes}/${CFG.STRIKE_MAX} — three and day ${gs.day} is over` } },
                    { label: 'SEIZE PAY', run: () => { gs.credits = 0; return `credits seized — rent night ${Object.keys(CFG.RENTS).join('/')} will evict, night without soup starves` } },
                    { label: 'NEXT WEEK +1', run: () => { startPlay(gs.seed + 1); return `booth rebuilt from seed ${gs.seed + 1}` } },
                ],
            })
        }

        // #1473: production-safe feedback state (seed for replay), every build
        exposeFeedbackState(() => ({ tick: simTick, score: gs.score, done: !!gs.end, seed: gs.seed, day: gs.day }))

        return () => {
            unexposeFeedbackState()
            if (import.meta.env.DEV) { if (window.__ppTest) delete window.__ppTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])

    const play = screen === 'play'
    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            {/* #1637 WATCH — the perfect inspector works the booth; any input
                takes the stamp back. */}
            {play && watching && <WatchToast className="absolute z-50" />}
            {play && !paused && (
                <div className="absolute z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}

            {screen === 'attract' && (
                <>
                    <div className="absolute inset-0 bg-black/55 pointer-events-none" />
                    {/* #1656 — the forgotten-how-to-play tap: start AND watch, one button. */}
                    <div className="absolute z-[70] left-1/2 -translate-x-1/2 pointer-events-auto" style={{ bottom: '24%' }}>
                        <AttractWatchButton />
                    </div>
                    <div className="absolute inset-x-0 top-16 text-center pointer-events-none">
                        <h1 className="text-4xl font-black" style={{ color: '#e8c15a', textShadow: '2px 0 0 #a33c3c, -2px 0 0 #49b25a, 0 10px 24px #000' }}>PAPERS, PLEASE-MIN</h1>
                        <p className="text-white font-mono font-bold mt-2 animate-pulse">{PRESS}</p>
                        <AttractMessage className="text-amber-100/80 mt-2 px-8" messages={MESSAGES} />
                        <span className="block mt-2 text-emerald-300/90 font-mono font-bold tracking-widest text-xs">{WATCH_ATTRACT_HINT}</span>
                    </div>
                </>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : end.money ? 'text-orange-400' : 'text-red-400'}`}>
                        {end.win ? 'GLORY TO ARSTOTZKA' : end.money ? 'OUT OF MONEY' : 'DEMOTED'}
                    </h2>
                    <p className="text-lg mb-1">{end.why}</p>
                    <p className="text-sm text-amber-200/80 mb-1">{end.score} correct &middot; {end.caught} turned back &middot; every denial had a witness on the wall</p>
                    <p className={`text-sm mb-4 ${end.win ? 'text-amber-300' : end.money ? 'text-orange-300 font-bold' : 'text-red-300/90'}`}>{end.win ? `the purse closed at ${end.credits} credits — glory to Arstotzka` : end.money ? `the bills outran the booth — final purse ${end.credits} CR` : `the apartment left ${end.credits} credits at the end`}</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'PAPERS, PLEASE-MIN')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default PapersPleaseMinGame
