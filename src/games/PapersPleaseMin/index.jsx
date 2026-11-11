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
import { CFG, newRun, step, tick, stateHash, current, autopilot, gameClock } from './sim.js'
import { REGULARS } from './gen.js'
import { exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { decide, RULES, dfmt, isAdult } from './rules.js'
import { CW, CHS, STRIP_H, WALL, SCALE, PORTRAIT, PAPERS, ID, STAMP, PHOTO, CLOCK, SLIP, BUBBLE, wallRows } from './layout.js'

const SIM_MS = 1000 / 60

const COL = {
    wall: '#1c2130', wallLine: '#323a52', paper: '#d8d2b8', paperLine: '#8f8a70',
    ink: '#20242e', red: '#d84343', green: '#49b25a', gold: '#e8c15a', text: '#cfd6e6',
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
        let banner = null           // {text, sub, ticks}
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
                    banner = { text: `DAY ${gs.day} — THE LINE MOVES`, sub: `NEW RULE: ${RULES[newest].text}`, ticks: 200 }
                    audioController.playSweep(420, 760, 0.4, 'triangle', 0.06)
                }
            }
            gs.events.length = 0
            if (gs.end) finish(gs.end)
        }

        const act = (action) => {
            if (screenRef.current !== 'play' || pausedRef.current || gs.end) return
            const stamped = current(gs).applicant.person   // stamp the papers YOU just judged
            const before = gs.strikes
            step(gs, { action })
            if (!gs.end) {
                stamp = { ok: gs.last?.ok, why: gs.last?.why, verdict: action, person: stamped, ticks: 30 }
                audioController.playTone(action === 'approve' ? 300 : 190, 0.06, 'square', 0.06)
                if (gs.strikes > before) audioController.playSweep(220, 90, 0.35, 'sawtooth', 0.08)
                else if (gs.last?.ok) audioController.playTone(action === 'deny' ? 760 : 560, 0.07, 'square', 0.05)
            }
            drainEvents()
        }

        const finish = (res) => {
            watchingRef.current = false; setWatching(false); watchScript = null // #1637 the week ends in your hands
            setEnd({ win: res === 'win', why: gs.endWhy, score: gs.score, caught: gs.caught, day: gs.day, credits: gs.credits })
            if (res === 'win') audioController.playSweep(400, 1500, 0.9, 'square', 0.08)
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
            stamp = null; banner = null
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
            if (stamp && stamp.ticks > 0) stamp.ticks--
            if (banner && banner.ticks > 0) banner.ticks--
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
            if (f.style === 2) c.fillRect(x + P(18), y + P(8), P(8), P(44))
            if (f.style === 3) c.fillRect(x + P(84), y + P(8), P(8), P(44))
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
            const bh = f.brow ? P(5) : P(2)
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
                c.fillRect(x + P(49), y + P(46), P(12), P(2))
                c.fillStyle = '#5a6b8a'
                c.fillRect(x + P(39), y + P(44), P(8), P(6)); c.fillRect(x + P(63), y + P(44), P(8), P(6))
            }
            // #1979 SIGNATURE MARKS — the authored regulars' scars of a life.
            // One ink, three shapes (the fourth, the big ear, grows above);
            // decor by doctrine — never a compared feature, never evidence.
            // Rows sit clear of every compared band: the scar rides the left
            // cheek at rows 50-55 (the narrow band starts at 56), the mole
            // clears the mustache bar's right edge (x68), the wrinkle rows
            // 32/35 sit above the brow row 38 and below the longest hair.
            if (f.mark === 'scar') {
                c.fillStyle = '#8f4a3e'
                c.fillRect(x + P(30), y + P(50), P(2), P(2)); c.fillRect(x + P(32), y + P(52), P(2), P(2)); c.fillRect(x + P(34), y + P(54), P(2), P(2))
            } else if (f.mark === 'mole') {
                c.fillStyle = '#8f4a3e'
                c.fillRect(x + P(70), y + P(58), P(2), P(2))
            } else if (f.mark === 'wrinkle') {
                c.fillStyle = '#8f4a3e'
                c.fillRect(x + P(38), y + P(32), P(34), P(1)); c.fillRect(x + P(38), y + P(35), P(32), P(1))
            }
        }

        const drawPassport = (pp, x, y) => {
            box(x, y, 300, 148, COL.paper, '#6f6a52')
            ctx.fillStyle = '#a33c3c'; ctx.fillRect(x, y, 300, 20)
            text('PASSPORT', x + 8, y + 15, 12, '#f2e8d8')
            text(`NAME ${pp.name}`, x + 10, y + 42)
            text(`NO. ${pp.id}`, x + 10, y + 58)
            text(`DOB ${dfmt(pp.dob)}`, x + 10, y + 74)
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
            drawFace(ctx, pp.photo, x + PHOTO.x + PHOTO.ox, y + PHOTO.y + PHOTO.oy, PHOTO.s)
            ctx.restore()
            text(`EXPIRES ${dfmt(pp.expiry)}`, x + 10, y + 140)
            text(`VALID ${isAdult(pp.dob, gs.week.days[gs.day - 1].date) ? 'ADULT' : 'CHILD'}`, x + 240, y + 140, 10, '#6b5d3a', 'center')
        }

        const drawId = (id, x, y) => {
            box(x, y, 190, 64, '#b8c4d8', '#5a6b8a')
            text('ID CARD', x + 8, y + 15, 11, '#20304e')
            text(`${id.name}`, x + 8, y + 32)
            text(`HT ${id.height}CM  WT ${id.weight}KG`, x + 8, y + 46, 10)
            text(`DOB ${dfmt(id.dob)}`, x + 8, y + 59, 10)
        }

        const paint = () => {
            ctx.fillStyle = COL.wall
            ctx.fillRect(0, 0, CW, CHS)
            ctx.strokeStyle = COL.wallLine
            for (let y = 14; y < CHS; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(250, y); ctx.stroke() }
            const { day, view } = current(gs)
            // the wall: date, rulebook, entry list, wanted sheet, scale
            text(`DAY ${day.n}   ${dfmt(day.date)}`, 12, 24, 15, COL.gold)
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
            let wy = rows.entries
            // every name on the sheet must FIT on the wall — paperscheck
            // pins day.wanted.length <= 5 (the original bulletin's five) and
            // sweeps the fit, so no booth must ever hide one
            for (const w of day.wanted) { text(`  ${w.name} #${w.id}`, WALL.x + 114, wy, WALL.wantedSize, COL.red); wy += WALL.wantedLine }
            box(SCALE.x, SCALE.y, SCALE.w, SCALE.h, '#0f1420', '#4a5578')
            text('SCALE', SCALE.x + 48, SCALE.y + 12, 9, COL.text, 'center')
            text(`${view.scale}KG`, SCALE.x + 48, SCALE.y + 26, 12, COL.gold, 'center')
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
            // the entrant (during a stamp, the papers shown are the ones
            // just judged — the stamp lands on its own document)
            const shown = stamp && stamp.ticks > 0 ? stamp.person : view.person
            drawFace(ctx, shown ? shown.face : view.person.face, PORTRAIT.x, PORTRAIT.y, 1)
            text(`ENTRANT ${gs.idx + (stamp && stamp.ticks > 0 ? 0 : 1)}/${gs.week.days[gs.day - 1].queue.length}`, PORTRAIT.x + PORTRAIT.headCx, 168, 10, COL.text, 'center')
            // the papers
            if (shown && shown.passport) {
                drawPassport(shown.passport, PAPERS.x, PAPERS.y)
                if (shown.idcard) drawId(shown.idcard, ID.x, ID.y)
            } else {
                box(PAPERS.x, 60, PAPERS.w, 120, '#12161f', '#39415c')
                text('"I HAVE NO PAPERS."', STAMP.x, 125, 14, '#6d7a9c', 'center')
            }
            // #1983 THE ARC — the neighborhood remembers. A returning entrant
            // speaks at the counter: a printed paper bubble under the face
            // column, tail up toward the glass. Atmosphere by doctrine —
            // decide never reads `say` (paperscheck pins the purity by
            // verdict-twinning every paper) — but the booth prints the line
            // exactly when it is present, and papersplay proves those pixels.
            if (shown && shown.say) {
                box(BUBBLE.x, BUBBLE.y, BUBBLE.w, BUBBLE.h, COL.paper, COL.paperLine)
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
            // harness grades the same two rectangles.
            if (stamp && stamp.ticks > 0) {
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
                if (!stamp.ok) text(gs.last?.why === 'INNOCENT' ? 'THEY WERE CLEAN' : `WITNESS: ${gs.last?.why}`, STAMP.x, 296, 12, COL.red, 'center')
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
                ctx.beginPath(); ctx.moveTo(SLIP.x + 4, SLIP.y + 18); ctx.lineTo(SLIP.x + SLIP.w - 4, SLIP.y + 18); ctx.stroke()
                ctx.setLineDash([])
                text(`END OF DAY ${s.day} — DEDUCTIONS`, SLIP.x + SLIP.w / 2, SLIP.y + 13, 9, '#6b5d3a', 'center')
                const row = (i, k, v, col) => {
                    text(k, SLIP.x + 10, SLIP.y + 32 + i * 12, 10)
                    text(v, SLIP.x + SLIP.w - 10, SLIP.y + 32 + i * 12, 10, col, 'right')
                }
                row(0, 'PAY', `+${s.pay}`, COL.green)
                let ri = 1
                if (s.rent) row(ri++, 'RENT', `-${s.rent}`, COL.red)
                row(ri++, 'SOUP', s.soup ? `-${s.soup}` : 'NO — HUNGRY', COL.red)
                row(ri++, 'HEAT', s.heat ? `-${s.heat}` : 'NO — COLD', COL.red)
                row(ri, 'BALANCE', `${s.balance}`, s.balance <= 0 ? COL.red : COL.ink)
            }
            // day banner
            if (banner && banner.ticks > 0) {
                const a2 = Math.min(1, banner.ticks / 40)
                ctx.fillStyle = `rgba(8,10,16,${0.82 * a2})`
                ctx.fillRect(0, 150, CW, 96)
                text(banner.text, CW / 2, 196, 26, COL.gold, 'center')
                text(banner.sub, CW / 2, 224, 12, '#9fb0d6', 'center')
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
            act((e.clientX - r.left) / r.width > 0.55 ? 'deny' : 'approve')
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('pointerdown', onPointer)

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
                // #1983 the bubble is pixels: count the bubble's own paper
                // color in its rect on the LIVE canvas (up ≈ full field,
                // down ≈ nothing — papersplay pins both).
                bubblePix: () => {
                    const d = ctx.getImageData(BUBBLE.x, BUBBLE.y, BUBBLE.w, BUBBLE.h).data
                    let paper = 0
                    for (let i = 0; i < d.length; i += 4) if (((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]) === 0xd8d2b8) paper++
                    return paper
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
                        slip: gs.slip && { ...gs.slip },
                        banner: banner && { ...banner }, view, evLog: evLog.slice(-60),
                    }
                },
                ff: (n) => { tick(gs, n || CFG.SEAT_TICKS * 2); drainEvents(); return { clock: gs.clock, day: gs.day, end: gs.end, why: gs.endWhy, credits: gs.credits, slip: gs.slip && { ...gs.slip } } }, // #1960 wind the shift forward
                start: startPlay,
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
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'GLORY TO ARSTOTZKA' : 'DEMOTED'}</h2>
                    <p className="text-lg mb-1">{end.why}</p>
                    <p className="text-sm text-amber-200/80 mb-1">{end.score} correct &middot; {end.caught} turned back &middot; every denial had a witness on the wall</p>
                    <p className={`text-sm mb-4 ${end.win ? 'text-amber-300' : 'text-red-300/90'}`}>{end.win ? `the purse closed at ${end.credits} credits — glory to Arstotzka` : `the apartment left ${end.credits} credits at the end`}</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'PAPERS, PLEASE-MIN')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default PapersPleaseMinGame
