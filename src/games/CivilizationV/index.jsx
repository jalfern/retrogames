// CIVILIZATION V — Stage 8 "Later Eras & Victory": the arcade shell.
// The whole world is the pure sim in ./sim.js; the tilted 3D hex map is
// ./art.js; the attract demo (and the harness witness) is the autopilot in
// ./planner.js replayed tick-for-tick through the real step(). One
// fixed-timestep loop owns the clock (the SimCity/heist lesson); React only
// mirrors the HUD. Playable with mouse/touch: tap a tile to select your unit or
// move it, tap END TURN (Space) to advance, E settles your settler, W opens
// the WORK panel for a selected worker, D opens DIPLOMACY (war/peace/trade and
// the city-state courts), Y opens VICTORY (the three races), drag to orbit,
// wheel/pinch to zoom.
// Art rule for 3D titles: render at screen res.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import * as THREE from 'three'
import { CFG, T, newGame, step, stateHash, canFound, CIVS, findPath, hexDist, UNIT, BARB, atWar, tileBlocked, TECH, TECH_IDS, ERAS, hasTech, availableTechs, grantTech, IMP, IMP_IDS, RES, RES_IDS, canImprove, connectedResources, resRevealed, POLICY, POLICY_IDS, BRANCHES, happinessOf, hasPolicy, canAdopt, WONDER, WONDER_IDS, GP, GP_TYPES, canBuildWonder, gpReady, gpThreshold, gpCost, canRecruit, canUseGP, canDeclareWar, canMakePeace, canTrade, canGift, csInfo, CS_IDS, coastalCityOf, canEmbark, canLand, ARK_PARTS, arkPartsOf, arkPartsDone } from './sim.js'
import { decide, RESEARCH_ORDER } from './planner.js'
import { createView, updateView, spawnImpact, spawnArrow } from './art.js'

const SIM_MS = 1000 / 60
const GOAL = CFG.capitalSizeToWin

const CivilizationVGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const [panel, setPanel] = useState(null)
    const [panelOpen, setPanelOpen] = useState(false)
    const panelOpenRef = useRef(false)
    const [wpanel, setWpanel] = useState(null)
    const [wOpen, setWOpen] = useState(false)
    const wOpenRef = useRef(false)
    const [ppanel, setPpanel] = useState(null)
    const [pOpen, setPOpen] = useState(false)
    const pOpenRef = useRef(false)
    const [upanel, setUpanel] = useState(null)
    const [uOpen, setUOpen] = useState(false)
    const uOpenRef = useRef(false)
    const [gpanel, setGpanel] = useState(null)
    const [gOpen, setGOpen] = useState(false)
    const gOpenRef = useRef(false)
    const [dpanel, setDpanel] = useState(null)
    const [dOpen, setDOpen] = useState(false)
    const dOpenRef = useRef(false)
    const [vpanel, setVpanel] = useState(null)
    const [vOpen, setVOpen] = useState(false)
    const vOpenRef = useRef(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hud = useRef({})
    const setHud = (k) => (el) => { hud.current[k] = el }
    const actRef = useRef({})

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!import.meta.env.DEV })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.domElement.style.touchAction = 'none'
        renderer.domElement.style.display = 'block'
        wrap.appendChild(renderer.domElement)
        const canvas = renderer.domElement

        let gs = newGame(1, 0)
        let view = createView(gs)
        const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400)
        const cam = { az: 0.6, el: 0.92, dist: 46, tx: 34, tz: 18 }

        let raf = 0, last = 0, acc = 0, toast = 0, toastMsg = ''
        let lastArkToast = 0
        let pending = {}
        const ray = new THREE.Raycaster()
        const ndc = new THREE.Vector2()

        const say = (m) => { toastMsg = m; toast = 170 }
        const shake = { v: 0 }
        const known = (c, r) => c >= 0 && r >= 0 && c < CFG.W && r < CFG.H && gs.explored[0][r * CFG.W + c]

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'found') { say(`${e.capital ? 'CAPITAL' : 'CITY'} ${gs.cities[e.city].name.toUpperCase()} FOUNDED`); audioController.playSweep(300, 720, 0.35, 'triangle', 0.09) }
                else if (e.type === 'grow') { say(`${gs.cities[e.city].name.toUpperCase()} GROWS TO ${e.size}`); audioController.playTone(520 + e.size * 40, 0.06, 'square', 0.05) }
                else if (e.type === 'deny') {
                    if (e.reason) say(e.reason.toUpperCase())
                    audioController.playTone(90, 0.09, 'square', 0.05)
                }
                else if (e.type === 'turnEnd' && e.civ === 0) { audioController.playTone(240, 0.03, 'sine', 0.03) }
                else if (e.type === 'explored' && e.civ === 0 && (e.c + e.r) % 3 === 0) { audioController.playTone(660, 0.02, 'sine', 0.02) }
                else if (e.type === 'strike') {
                    if (e.ranged && known(e.from[0], e.from[1])) spawnArrow(view, gs, e.from, e.to)
                    else if (known(e.to[0], e.to[1])) spawnImpact(view, gs, e.to[0], e.to[1], false)
                }
                else if (e.type === 'siege' && known(e.at[0], e.at[1])) { spawnImpact(view, gs, e.at[0], e.at[1], true); shake.v = 5; audioController.playNoise(0.08, 0.06) }
                else if (e.type === 'raid' && known(e.at[0], e.at[1])) { spawnImpact(view, gs, e.at[0], e.at[1], true); audioController.playNoise(0.06, 0.05) }
                else if (e.type === 'kill') {
                    if (known(e.at[0], e.at[1])) spawnImpact(view, gs, e.at[0], e.at[1], true)
                    shake.v = Math.max(shake.v, 4)
                    audioController.playNoise(0.12, 0.08)
                    if (e.civ === 0 && e.victim === BARB) say('ENEMY SLAIN')
                    else if (e.victim === 0) say(`${e.victimKind} LOST IN BATTLE`)
                }
                else if (e.type === 'cityStrike' && known(e.at[0], e.at[1])) { spawnImpact(view, gs, e.at[0], e.at[1], true); audioController.playTone(140, 0.07, 'square', 0.06) }
                else if (e.type === 'barbSpawn' && known(e.c, e.r)) { spawnImpact(view, gs, e.c, e.r, false); audioController.playTone(110, 0.05, 'sawtooth', 0.03) }
                else if (e.type === 'campRazed') {
                    spawnImpact(view, gs, e.c, e.r, true); shake.v = 6
                    audioController.playNoise(0.18, 0.09); audioController.playSweep(220, 520, 0.25, 'triangle', 0.07)
                    if (e.civ === 0) say('BARBARIAN CAMP RAZED · +12 GOLD')
                }
                else if (e.type === 'war') {
                    const foe = e.a === 0 ? e.b : e.a
                    say(e.by === 0 ? `WAR DECLARED ON ${CIVS[foe].name}` : `${CIVS[foe].name} DECLARES WAR`)
                    audioController.playSweep(220, 90, 0.5, 'sawtooth', 0.08)
                }
                else if (e.type === 'capture') {
                    spawnImpact(view, gs, gs.cities[e.city].c, gs.cities[e.city].r, true); shake.v = 8
                    audioController.playSweep(e.civ === 0 ? 330 : 330, e.civ === 0 ? 780 : 120, 0.5, 'triangle', 0.1)
                    say(e.civ === 0 ? `${gs.cities[e.city].name.toUpperCase()} CAPTURED!` : `${gs.cities[e.city].name.toUpperCase()} HAS FALLEN!`)
                }
                else if (e.type === 'civDead') { say(`${CIVS[e.civ].name} IS NO MORE`); audioController.playDeath() }
                else if (e.type === 'civFall') { say(`${CIVS[e.civ].name} VASSALIZED — ${CIVS[e.by].name.toUpperCase()} TAKES THE REALM`); audioController.playSweep(190, 70, 0.6, 'sawtooth', 0.12) }
                else if (e.type === 'build') {
                    if (e.civ === 0) {
                        const label = e.unit === 'GALLEY' ? 'A TRIREME TAKES THE WATER' : e.unit === 'GALLEON' ? 'A GALLEON CATCHES THE WIND' : e.unit === 'MUSKET' ? 'MUSKETS IN THE LINE' : `${e.unit} TRAINED AT ${gs.cities[e.city].name.toUpperCase()}`
                        say(label)
                        audioController.playTone(e.unit === 'GALLEY' ? 294 : e.unit === 'GALLEON' ? 262 : 440, 0.05, 'square', 0.05)
                    }
                }
                else if (e.type === 'queued') { audioController.playTone(330, 0.03, 'sine', 0.03) }
                else if (e.type === 'embark') {
                    if (e.civ === 0) { say(`${e.kind} ABOARD — HOLD TAKES THE WEIGHT`); audioController.playSweep(294, 196, 0.22, 'triangle', 0.05) }
                }
                else if (e.type === 'land') {
                    if (e.civ === 0) { say(`${e.kind} LANDS ON THE BEACH`); audioController.playTone(220, 0.06, 'triangle', 0.05) }
                }
                else if (e.type === 'beachhead') {
                    if (e.civ === 0) { say(e.took ? 'BEACHHEAD TAKEN!' : 'THE LANDINGS ARE REPELLED'); shake.v = 5; audioController.playNoise(0.12, 0.07); audioController.playSweep(e.took ? 330 : 260, e.took ? 780 : 130, 0.4, 'triangle', 0.08) }
                }
                else if (e.type === 'drown') {
                    if (e.civ === 0) say(`${e.kind} GOES DOWN WITH THE HULL`)
                    if (known(e.at[0], e.at[1])) spawnImpact(view, gs, e.at[0], e.at[1], true)
                    audioController.playSweep(220, 60, 0.5, 'sawtooth', 0.07)
                }
                else if (e.type === 'research' && e.civ === 0) { audioController.playTone(500, 0.03, 'sine', 0.03) }
                else if (e.type === 'tech') {
                    if (e.civ === 0) {
                        say(`${TECH[e.id].name.toUpperCase()} DISCOVERED — ${TECH[e.id].effect.toUpperCase()}`)
                        audioController.playSweep(392, 784, 0.45, 'triangle', 0.09)
                        audioController.playTone(587, 0.14, 'sine', 0.05)
                    }
                }
                else if (e.type === 'improveStart' && e.civ === 0) { say(`${IMP[e.kind].name.toUpperCase()} IN PROGRESS · ${IMP[e.kind].turns} TURN${IMP[e.kind].turns > 1 ? 'S' : ''}`); audioController.playTone(196, 0.07, 'triangle', 0.05) }
                else if (e.type === 'improved') {
                    if (e.civ === 0) { say(`${IMP[e.kind].name.toUpperCase()} COMPLETE`); audioController.playSweep(330, 660, 0.3, 'triangle', 0.08); audioController.playTone(494, 0.1, 'sine', 0.05) }
                    else if (known(e.c, e.r)) spawnImpact(view, gs, e.c, e.r, false)
                }
                else if (e.type === 'pillage') {
                    if (known(e.c, e.r)) { spawnImpact(view, gs, e.c, e.r, true); shake.v = Math.max(shake.v, 3); audioController.playNoise(0.14, 0.07) }
                    if (gs.tiles[e.r * CFG.W + e.c].owner === 0) say('RAIDERS PILLAGE OUR LAND!')
                }
                else if (e.type === 'luxury' && e.civ === 0) { say(`${RES[e.id].name.toUpperCase()} CONNECTED · +${CFG.luxGold} GOLD +${CFG.luxCult} CULTURE`); audioController.playSweep(523, 784, 0.35, 'sine', 0.08) }
                else if (e.type === 'strategic' && e.civ === 0) { say(`${RES[e.id].name.toUpperCase()} SEAM CONNECTED`); audioController.playSweep(392, 523, 0.3, 'square', 0.06) }
                else if (e.type === 'policy') {
                    if (e.civ === 0) { say(`${POLICY[e.id].name.toUpperCase()} ADOPTED — ${POLICY[e.id].effect.toUpperCase()}`); audioController.playSweep(392, 587, 0.3, 'triangle', 0.08); audioController.playTone(784, 0.16, 'sine', 0.05) }
                }
                else if (e.type === 'borderGrow' && e.civ === 0) { say('CULTURE CLAIMS NEW GROUND'); audioController.playTone(660, 0.05, 'sine', 0.04); audioController.playTone(880, 0.08, 'sine', 0.03) }
                else if (e.type === 'happy' && e.civ === 0) {
                    if (e.state === 'unhappy') { say(`${-e.net} UNHAPPY — THE MOBS GRUMBLE`); audioController.playSweep(220, 110, 0.4, 'sawtooth', 0.06) }
                    else if (e.state === 'happy') { say('THE PEOPLE REJOICE · +25% GROWTH +10% GOLD'); audioController.playSweep(523, 1046, 0.4, 'triangle', 0.07) }
                }
                else if (e.type === 'wonderBuilt') {
                    if (e.civ === 0) {
                        say(`${WONDER[e.id].name.toUpperCase()} RISES — ${WONDER[e.id].effect.toUpperCase()}`)
                        spawnImpact(view, gs, e.c, e.r, true); shake.v = 7
                        audioController.playSweep(392, 784, 0.55, 'triangle', 0.09)
                        audioController.playTone(587, 0.2, 'sine', 0.05); audioController.playTone(784, 0.3, 'sine', 0.04)
                    } else {
                        say(`${CIVS[e.civ].name} RAISES THE ${WONDER[e.id].name.toUpperCase()}`)
                        audioController.playSweep(330, 196, 0.45, 'sawtooth', 0.05)
                    }
                }
                else if (e.type === 'wonderLost' && e.civ === 0) { say(`${WONDER[e.id].name.toUpperCase()} LOST — ${CIVS[e.by].name} FINISHED FIRST`); audioController.playSweep(262, 131, 0.4, 'square', 0.05) }
                else if (e.type === 'gpReady' && e.civ === 0) { say(`A ${GP[e.kind].name.toUpperCase()} STIRS — RECRUIT WITH G`); audioController.playTone(659, 0.08, 'sine', 0.04); audioController.playTone(880, 0.14, 'sine', 0.03) }
                else if (e.type === 'gpAcquired') {
                    if (e.civ === 0) { say(`${GP[e.kind].name.toUpperCase()} HAILS TO ROME · SPEND WITH G`); audioController.playSweep(440, 880, 0.35, 'triangle', 0.08); audioController.playTone(660, 0.18, 'sine', 0.05) }
                }
                else if (e.type === 'gpUsed' && e.civ === 0) {
                    if (e.kind === 'MERCHANT') say(`TRADE MISSION · +${e.gold} GOLD`)
                    else if (e.kind === 'SCIENTIST') say(`${TECH[e.tech].name.toUpperCase()} COMPLETED AT ONCE`)
                    else if (e.kind === 'ENGINEER') say('THE ENGINEER FINISHES THE JOB')
                    audioController.playSweep(523, 1046, 0.3, 'sine', 0.07)
                }
                else if (e.type === 'peace') {
                    const other = e.a === 0 ? e.b : e.a
                    say(`PEACE SIGNED WITH ${CIVS[other].name}`)
                    audioController.playSweep(392, 587, 0.4, 'triangle', 0.07); audioController.playTone(784, 0.16, 'sine', 0.04)
                }
                else if (e.type === 'trade') {
                    const other = e.a === 0 ? e.b : e.a
                    say(`TRADE AGREEMENT WITH ${CIVS[other].name} · +${CFG.tradeGold} GOLD/TURN`)
                    audioController.playSweep(494, 740, 0.35, 'triangle', 0.07)
                }
                else if (e.type === 'csMeet') {
                    if (e.civ === 0) { say(`${CIVS[e.cs].name.toUpperCase()} — A COASTAL COURT RECOGNIZES ROME`); audioController.playSweep(330, 660, 0.3, 'sine', 0.06); audioController.playTone(880, 0.12, 'sine', 0.03) }
                }
                else if (e.type === 'csGift' && e.civ === 0) { say(`${CIVS[e.cs].name.toUpperCase()} · INFLUENCE ${e.influence}/${CFG.csAlly}`); audioController.playTone(587, 0.06, 'triangle', 0.05) }
                else if (e.type === 'csAlly' && e.civ === 0) {
                    say(`${CIVS[e.cs].name.toUpperCase()} ALLIES WITH ROME — ${CIVS[e.cs].allyDesc.toUpperCase()}`)
                    audioController.playSweep(523, 1046, 0.5, 'triangle', 0.08); audioController.playTone(659, 0.2, 'sine', 0.05)
                }
                else if (e.type === 'csTaken') {
                    say(`${CIVS[e.cs].name.toUpperCase()} HAS FALLEN${e.tribute ? ` · +${e.tribute} TRIBUTE` : ''}`)
                    shake.v = 7
                    audioController.playSweep(330, 110, 0.5, 'sawtooth', 0.08)
                }
                else if (e.type === 'era' && e.civ === 0) {
                    say(`THE ${ERAS[e.era]} DAWNS`)
                    audioController.playSweep(392, 523, 0.4, 'triangle', 0.08)
                    audioController.playTone(659, 0.18, 'sine', 0.05); audioController.playTone(784, 0.28, 'sine', 0.04)
                }
                else if (e.type === 'ark' && e.civ === 0 && e.prog >= lastArkToast + 20) {
                    lastArkToast = e.prog
                    say(`THE ARK TAKES SHAPE · ${Math.round((e.prog / e.need) * 100)}% FUNDED`)
                    audioController.playSweep(440, 660, 0.28, 'triangle', 0.06)
                }
                else if (e.type === 'arkPart' && e.civ === 0) {
                    say(`${e.name.toUpperCase()} WELDED · ${e.part + 1}/4 OF THE ARK`)
                    audioController.playTone(523 + e.part * 98, 0.14, 'triangle', 0.06)
                    audioController.playTone(784 + e.part * 98, 0.22, 'sine', 0.04)
                }
                else if (e.type === 'arkLaunch') {
                    if (e.civ === 0) {
                        say('FOUR PARTS, ONE SHIP — THE ARK LEAVES THE GROUND!')
                        shake.v = 9
                        audioController.playSweep(262, 1046, 0.9, 'triangle', 0.1)
                    } else say(`${CIVS[e.civ].name} LAUNCHES THE ARK`)
                }
            }
        }

        const reachSet = () => {
            const sel = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0)
            const ring = new Set()
            if (!sel || sel.moves <= 0) return ring
            ring.add(sel.r * CFG.W + sel.c)
            let ringCur = [[sel.c, sel.r]]
            for (let stepN = 0; stepN < sel.moves; stepN++) {
                const next = []
                for (const [c, r] of ringCur) for (const [nc, nr] of neigh(c, r)) {
                    const i = nr * CFG.W + nc
                    if (ring.has(i)) continue
                    const tl = gs.tiles[i]
                    if (sel.naval ? !(tl.terr === T.OCEAN || tl.terr === T.COAST) : (tl.terr < T.GRASS || tl.terr > T.HILLS)) continue
                    if (gs.units.some((u) => u.alive && !u.loaded && u.c === nc && u.r === nr)) continue
                    if (tileBlocked(gs, nc, nr)) continue
                    ring.add(i); next.push([nc, nr])
                }
                ringCur = next
            }
            ring.delete(sel.r * CFG.W + sel.c)
            return ring
        }
        const inb = (c, r) => c >= 0 && r >= 0 && c < CFG.W && r < CFG.H
        const countArr = (a) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i]) n++; return n }
        const NN_EVEN = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]
        const NN_ODD = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]
        const neigh = (c, r) => (r & 1 ? NN_ODD : NN_EVEN).map(([dc, dr]) => [c + dc, r + dr]).filter(([nc, nr]) => inb(nc, nr))

        const finish = (win) => {
            const why = gs.endWhy || ''
            const type = /Domination/.test(why) ? 'domination' : /Science/.test(why) ? 'science' : /Culture/.test(why) ? 'culture' : win ? 'golden' : 'fall'
            panelOpenRef.current = false; setPanelOpen(false); setEnd({ win, why, turn: gs.turn, size: capSize(), domination: type === 'domination', type }); overAtRef.current = performance.now(); setMode('over'); if (win) audioController.playFanfare(); else audioController.playDeath()
        }
        const capSize = () => { const cap = gs.cities.find((c) => c.civ === 0 && c.capital); return cap ? cap.size : 0 }

        let demoSc = 0, attractN = 0
        const doSim = (inp) => { step(gs, inp); handleEvents(gs.events.splice(0)); if (gs.end && screenRef.current === 'play') finish(gs.end === 'win') }

        const tickAttract = () => {
            if (gs.end) { const s = 1 + (demoSc++) % 4; gs = newGame(s, 0); view = reinitView(gs); attractN = 0 }
            if (++attractN % 5 === 0) doSim(decide(gs))   // paced: a founding you can watch
        }
        const reinitView = (g) => { destroyView(view); view = createView(g); return view }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickAttract(); return }
            if (sc !== 'play') return
            const inp = { ...pending }; pending = {}
            doSim(inp)
        }

        const applyCam = () => {
            const d = cam.dist
            const sk = shake.v > 0 ? shake.v * 0.012 : 0
            if (shake.v > 0) shake.v = Math.max(0, shake.v - 0.5)
            const sx = sk * Math.sin(gs.tick * 1.7), sy = sk * Math.sin(gs.tick * 2.3 + 1)
            camera.position.set(cam.tx + d * Math.sin(cam.el) * Math.sin(cam.az) + sx, cam.dist * Math.cos(cam.el) + sy, cam.tz + d * Math.sin(cam.el) * Math.cos(cam.az) + sx * 0.5)
            camera.lookAt(cam.tx, 2, cam.tz)
        }

        const paint = () => {
            updateView(view, gs, { reach: screenRef.current === 'play' ? reachSet() : null })
            renderer.render(view.scene, camera)
        }

        let lastHud = 0, lastPanel = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 90) return
            lastHud = now
            if (panelOpenRef.current && now - lastPanel > 200) { lastPanel = now; refreshPanel() }
            if (wOpenRef.current && now - lastPanel > 200) { lastPanel = now; refreshWPanel() }
            if (pOpenRef.current && now - lastPanel > 200) { lastPanel = now; refreshPPanel() }
            if (uOpenRef.current && now - lastPanel > 200) { lastPanel = now; refreshUPanel() }
            if (gOpenRef.current && now - lastPanel > 200) { lastPanel = now; refreshGPanel() }
            if (dOpenRef.current && now - lastPanel > 200) { lastPanel = now; refreshDPanel() }
            if (vOpenRef.current && now - lastPanel > 200) { lastPanel = now; refreshVPanel() }
            const C = gs.civs[0]
            const cap = gs.cities.find((c) => c.civ === 0 && c.capital)
            const h = hud.current
            if (h.gold) h.gold.textContent = `${C.gold}`
            if (h.sci) h.sci.textContent = `${C.science}`
            if (h.cult) h.cult.textContent = `${C.culture || 0}`
            if (h.turn) h.turn.textContent = `TURN ${gs.turn}/${CFG.turnLimit}`
            if (h.cap) h.cap.textContent = cap ? `CAPITAL ${cap.name} · size ${cap.size}/${GOAL}` : 'NO CITY — press E to settle'
            if (h.cities) h.cities.textContent = `cities ${gs.cities.filter((c) => c.civ === 0 && c.alive).length}`
            if (h.sel) h.sel.textContent = (() => { const s = gs.units.find((u) => u.id === gs.selected && u.alive && !u.loaded && u.civ === 0); return s ? `${s.kind} · ${s.moves}/${s.maxMoves} moves · hp ${s.hp}${s.cargo ? ` · hold ${s.cargo.length}/${UNIT[s.kind].cargo || 0}` : ''}` : 'tap a unit' })()
            if (h.build) {
                const city = gs.cities.find((c) => c.civ === 0 && c.alive)
                const q = city && city.queue && city.queue[0]
                const qcost = q ? (UNIT[q] ? UNIT[q].cost : WONDER[q].cost) : 0
                h.build.textContent = q ? `BUILDING ${q} ${Math.floor(city.buildP || 0)}/${qcost}${city.queue.length > 1 ? ` +${city.queue.length - 1}` : ''}` : 'BUILD: 1 warrior · 2 archer · 3 settler · 4 worker · C catapult · N trireme · K musket · L galleon · U wonders'
            }
            if (h.worker) {
                const w = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0 && u.kind === 'WORKER')
                if (w && w.busy != null) { const b = gs.tiles[w.busy].build; h.worker.textContent = b ? `WORKER: ${IMP[b.kind].name.toUpperCase()} ${b.left} TURN${b.left > 1 ? 'S' : ''} LEFT` : 'WORKER: idle' }
                else h.worker.textContent = w ? 'WORKER idle — press W to build' : ''
                h.worker.style.display = w ? '' : 'none'
            }
            if (h.lux) {
                const lux = connectedResources(gs, 0).filter((id) => RES[id].lux).map((id) => RES[id].name)
                const strat = connectedResources(gs, 0).filter((id) => !RES[id].lux).map((id) => RES[id].name.toUpperCase())
                h.lux.textContent = (lux.length ? `LUX ${lux.join(' ')}` : '') + (strat.length ? ` · ${strat.join(' ')} CONNECTED` : '')
                h.lux.style.display = lux.length || strat.length ? '' : 'none'
            }
            if (h.happy) {
                const hs = happinessOf(gs, 0)
                const adopted = POLICY_IDS.filter((id) => hasPolicy(gs, 0, id)).length
                h.happy.textContent = `${hs.net >= 1 ? '☺ HAPPY +' : hs.net < 0 ? '☹ UNHAPPY ' : '😐 CONTENT '}${hs.net}${adopted ? ` · ${adopted} polic${adopted === 1 ? 'y' : 'ies'}` : ''}`
                h.happy.style.color = hs.net >= 1 ? '#ffe9a8' : hs.net < 0 ? '#ff9a8a' : '#cfe0c8'
            }
            if (h.marvels) {
                const mine = WONDER_IDS.filter((id) => gs.wonders[id] === 0).length
                const gp = GP_TYPES.reduce((a, t) => a + gs.gp[0].held[t], 0)
                const rdy = GP_TYPES.filter((t) => gpReady(gs, 0, t)).length
                h.marvels.textContent = `🏛${mine}${gs.cities.some((c) => c.alive && c.civ === 0) ? `/${WONDER_IDS.length}` : ''}${gp ? ` · ✨${gp}` : ''}${rdy ? ` · ✨ready ${rdy}` : ''}`
                h.marvels.style.display = mine || gp || rdy ? '' : 'none'
            }
            if (h.research) {
                const R = gs.tech[0]
                h.research.textContent = R.research ? `RESEARCHING ${TECH[R.research].name.toUpperCase()} ${Math.floor(R.prog)}/${TECH[R.research].cost}` : `TECH: ${availableTechs(gs, 0).length} available · press T`
            }
            if (h.war) {
                const w = [1, 2, 3].filter((i) => atWar(gs, 0, i)).map((i) => CIVS[i].name)
                const pacts = Object.keys(gs.trade).filter((k) => gs.trade[k]).length
                const allies = CS_IDS.filter((id) => gs.cs[0][id] && gs.cs[0][id].ally).length
                const metN = CS_IDS.filter((id) => gs.cs[0][id] && gs.cs[0][id].met).length
                h.war.textContent = w.length
                    ? `⚔ AT WAR: ${w.join(' ')}`
                    : `${gs.camps.some((c) => c.alive) ? 'barbarian camps roam' : 'at peace'}${pacts ? ` · 🤝 pacts ${pacts}` : ''}${metN ? ` · ☘ ${metN}/${CS_IDS.length} courts${allies ? ` (${allies} allied)` : ''}` : ''}`
            }
            if (h.victory) {
                const taken = [1, 2, 3].filter((i) => { const oc = gs.capitalOf[i] != null ? gs.cities[gs.capitalOf[i]] : null; return oc && oc.alive && oc.civ !== i }).length
                const tour = Math.floor(gs.civs[0].tourism || 0)
                const tw = Math.min(999, Math.round((tour / CFG.tourismWin) * 100))
                const aw = arkPartsDone(gs, 0)
                h.victory.textContent = `🏆 caps ${taken}/3 · ☼ ${tw}% · ARK ${hasTech(gs, 0, 'SPACEFLIGHT') ? `${aw}/4` : '🔒'}`
            }
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250); last = ts
            if (!pausedRef.current) { acc += ft; let g = 0; while (acc >= SIM_MS && g++ < 8) { doFrameSim(); acc -= SIM_MS } }
            applyCam(); paint(); syncHud()
        }

        // --------------------------------------------------------------- input --
        const pickTile = (clientX, clientY) => {
            const r = canvas.getBoundingClientRect()
            if (!r.width || !r.height) return null
            ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
            ray.setFromCamera(ndc, camera)
            const hit = ray.intersectObject(view.hexes)[0]
            if (!hit || hit.instanceId == null) return null
            const i = hit.instanceId
            return { c: i % CFG.W, r: (i - (i % CFG.W)) / CFG.W }
        }
        const clickTile = (c, r) => {
            if (!inb(c, r)) return
            if (!gs.explored[0][r * CFG.W + c]) { say('UNKNOWN LAND'); return }
            const own = gs.units.find((u) => u.alive && !u.loaded && u.civ === 0 && u.c === c && u.r === r)
            if (own) { gs.selected = own.id; pending = { select: own.id }; audioController.playTone(440, 0.03, 'sine', 0.04); return }
            const sel = gs.units.find((u) => u.id === gs.selected && u.alive && !u.loaded && u.civ === 0)
            const hostile = gs.units.find((u) => u.alive && !u.loaded && u.c === c && u.r === r && atWar(gs, 0, u.civ))
            const tl = gs.tiles[r * CFG.W + c]
            const campHit = tl.camp >= 0 && gs.camps[tl.camp] && gs.camps[tl.camp].alive
            const cityHit = tl.city >= 0 && gs.cities[tl.city].alive && atWar(gs, 0, gs.cities[tl.city].civ)
            if (sel && sel.naval && sel.cargo && sel.cargo.length && tl.terr >= T.GRASS && tl.terr <= T.HILLS) {
                const why = canLand(gs, sel, c, r)
                if (why === true) { pending = { land: [c, r] }; audioController.playTone(260, 0.04, 'triangle', 0.05); return }
                say(String(why).toUpperCase()); audioController.playTone(120, 0.05, 'square', 0.04); return
            }
            if (sel && sel.moves > 0 && sel.str > 0) {
                const d = hexDist([sel.c, sel.r], [c, r])
                if (cityHit && sel.naval) { say('PORTS YIELD TO LAND FORCES — BRING LEGIONS'); audioController.playTone(120, 0.06, 'square', 0.04); return }
                if (hostile && sel.naval && !hostile.naval) { say('THE TRIREME RULES THE SEA — ONLY SHIPS FIGHT SHIPS'); audioController.playTone(120, 0.06, 'square', 0.04); return }
                if ((hostile || campHit || cityHit) && d >= 1 && d <= Math.max(1, UNIT[sel.kind].range)) {
                    pending = { attack: [c, r] }
                    audioController.playTone(hostile || cityHit ? 180 : 260, 0.05, 'square', 0.05)
                    return
                }
            }
            if (hostile) { say(hostile.civ === BARB ? 'BARBARIANS! ATTACK WITH A UNIT IN RANGE' : 'AT WAR — ATTACK WITH A UNIT IN RANGE'); audioController.playTone(120, 0.06, 'square', 0.04); return }
            if (campHit) { say('RANGE THE CAMP (ADJACENT OR ARCHER)'); audioController.playTone(120, 0.05, 'square', 0.04); return }
            if (sel && sel.moves > 0) { const ok = findPath(gs, sel, c, r); if (ok && ok.length) { pending = { move: [c, r] }; audioController.playTone(300, 0.02, 'sine', 0.03) } else audioController.playTone(120, 0.05, 'square', 0.04) }
        }
        const doSettle = () => {
            const any = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0)
            if (!any) { say('SELECT A UNIT'); return }
            if (any.kind === 'SETTLER') {
                const why = canFound(gs, 0, any.c, any.r, any)
                if (why === true) { pending = { found: true }; return }
                if (canEmbark(gs, any) !== true) { say(why === 'too close to a city' ? 'TOO CLOSE TO A CITY' : why === 'water or mountain' ? 'CANNOT SETTLE THERE' : 'CANNOT SETTLE'); audioController.playTone(110, 0.08, 'square', 0.05); return }
            }
            const whyE = canEmbark(gs, any)
            if (whyE === true) { pending = { ...pending, embark: true }; say(`${any.kind} EMBARKS`); audioController.playSweep(294, 196, 0.22, 'triangle', 0.05); return }
            say(String(whyE).toUpperCase()); audioController.playTone(110, 0.08, 'square', 0.05)
        }
        const doLand = () => {
            const sel = gs.units.find((u) => u.id === gs.selected && u.alive && !u.loaded && u.civ === 0)
            if (!sel || !sel.naval || !sel.cargo || !sel.cargo.length) { say('SELECT A GALLEON WITH CARGO'); audioController.playTone(110, 0.07, 'square', 0.05); return }
            const spots = neigh(sel.c, sel.r).filter(([c, r]) => { const tl = gs.tiles[r * CFG.W + c]; return tl.terr >= T.GRASS && tl.terr <= T.HILLS })
            const open = spots.find(([c, r]) => canLand(gs, sel, c, r) === true)
            if (open) { pending = { land: [open[0], open[1]] }; audioController.playTone(260, 0.04, 'triangle', 0.05); return }
            say('NO BEACH IN REACH'); audioController.playTone(120, 0.05, 'square', 0.04)
        }
        const endTurn = () => { pending = { endTurn: true }; audioController.playTone(200, 0.05, 'sine', 0.04) }

        const refreshPanel = () => {
            const R = gs.tech[0]
            setPanel({
                rows: TECH_IDS.map((id) => ({ id, name: TECH[id].name, era: TECH[id].era, cost: TECH[id].cost, effect: TECH[id].effect, prereq: TECH[id].prereq.map((p) => TECH[p].name), known: !!R.known[id], current: R.research === id, can: !R.known[id] && TECH[id].prereq.every((p) => R.known[p]) })),
                research: R.research, prog: Math.floor(R.prog),
                ai: CIVS.filter((c) => !c.barb && c.id !== 0).map((c) => ({ name: c.name, n: Object.keys(gs.tech[c.id].known).length })),
            })
        }
        const closePanel = () => { panelOpenRef.current = false; setPanelOpen(false); audioController.playTone(240, 0.04, 'sine', 0.04) }
        const togglePanel = () => {
            panelOpenRef.current = !panelOpenRef.current
            setPanelOpen(panelOpenRef.current)
            if (panelOpenRef.current) refreshPanel()
            audioController.playTone(panelOpenRef.current ? 560 : 240, 0.04, 'sine', 0.04)
        }
        const pickResearch = (id) => {
            const R = gs.tech[0]
            if (R.known[id]) { audioController.playTone(320, 0.03, 'sine', 0.03); return }
            const missing = TECH[id].prereq.filter((p) => !R.known[p])
            if (missing.length) { say('REQUIRES ' + missing.map((p) => TECH[p].name.toUpperCase()).join(' + ')); audioController.playTone(110, 0.08, 'square', 0.05); return }
            pending = { ...pending, research: id }
            closePanel()
            audioController.playSweep(420, 620, 0.18, 'sine', 0.05)
        }
        const researchNext = () => {
            const av = availableTechs(gs, 0)
            for (const id of RESEARCH_ORDER) if (av.includes(id)) { pickResearch(id); return }
            if (!av.length) say('EVERY KNOWN TECH IS LEARNED')
        }
        const refreshWPanel = () => {
            const w = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0 && u.kind === 'WORKER')
            if (!w) { setWpanel(null); return }
            const tl = gs.tiles[w.r * CFG.W + w.c]
            const terrName = ['Ocean', 'Coast', 'Grassland', 'Plains', 'Desert', 'Hills', 'Mountain'][tl.terr]
            setWpanel({
                at: `${w.c},${w.r}`, terr: terrName + (tl.river ? ' · river' : '') + (tl.forest ? ' · forest' : ''),
                owned: tl.owner === 0, city: tl.city >= 0, imp: tl.imp || (tl.road ? 'ROAD' : null),
                build: tl.build ? { kind: tl.build.kind, left: tl.build.left } : null,
                res: tl.res >= 0 && resRevealed(gs, 0, w.r * CFG.W + w.c) ? RES[RES_IDS[tl.res]].name : null,
                rows: IMP_IDS.map((k) => ({ k, name: IMP[k].name, tech: IMP[k].tech ? TECH[IMP[k].tech].name : null, turns: IMP[k].turns, why: canImprove(gs, 0, w, k) })),
            })
        }
        const closeWPanel = () => { wOpenRef.current = false; setWOpen(false); audioController.playTone(240, 0.04, 'sine', 0.04) }
        const toggleWPanel = () => {
            const w = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0 && u.kind === 'WORKER')
            if (!w && !wOpenRef.current) { say('SELECT A WORKER FIRST'); audioController.playTone(110, 0.07, 'square', 0.05); return }
            wOpenRef.current = !wOpenRef.current
            setWOpen(wOpenRef.current)
            if (wOpenRef.current) refreshWPanel()
            audioController.playTone(wOpenRef.current ? 480 : 240, 0.04, 'sine', 0.04)
        }
        const pickImprove = (kind) => {
            const w = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0 && u.kind === 'WORKER')
            if (!w) { say('SELECT A WORKER'); audioController.playTone(110, 0.07, 'square', 0.05); return }
            const why = canImprove(gs, 0, w, kind)
            if (why !== true) { say(why.toUpperCase()); audioController.playTone(110, 0.08, 'square', 0.05); return }
            pending = { ...pending, improve: kind }
            closeWPanel()
            audioController.playSweep(300, 480, 0.16, 'triangle', 0.05)
        }
        const refreshPPanel = () => {
            setPpanel({
                pool: Math.floor(gs.civs[0].culture || 0),
                mood: happinessOf(gs, 0),
                branches: BRANCHES.map((b) => ({
                    b,
                    rows: POLICY_IDS.filter((id) => POLICY[id].branch === b).map((id) => ({
                        id, name: POLICY[id].name, cost: POLICY[id].cost, effect: POLICY[id].effect,
                        adopted: hasPolicy(gs, 0, id), why: canAdopt(gs, 0, id),
                    })),
                })),
                ai: CIVS.filter((c) => !c.barb && c.id !== 0).map((c) => ({ name: c.name, n: POLICY_IDS.filter((id) => hasPolicy(gs, c.id, id)).length })),
            })
        }
        const closePPanel = () => { pOpenRef.current = false; setPOpen(false); audioController.playTone(240, 0.04, 'sine', 0.04) }
        const togglePPanel = () => {
            pOpenRef.current = !pOpenRef.current
            setPOpen(pOpenRef.current)
            if (pOpenRef.current) refreshPPanel()
            audioController.playTone(pOpenRef.current ? 620 : 240, 0.04, 'sine', 0.04)
        }
        const pickPolicy = (id) => {
            const why = canAdopt(gs, 0, id)
            if (why !== true) { say(why.toUpperCase()); audioController.playTone(110, 0.08, 'square', 0.05); return }
            pending = { ...pending, policy: id }
            closePPanel()
            audioController.playSweep(440, 880, 0.22, 'sine', 0.05)
        }
        const refreshUPanel = () => {
            const cap = gs.cities.find((c) => c.civ === 0 && c.alive)
            setUpanel({
                rows: WONDER_IDS.map((id) => ({
                    id, name: WONDER[id].name, tech: TECH[WONDER[id].tech].name, cost: WONDER[id].cost, effect: WONDER[id].effect,
                    by: gs.wonders[id] != null ? CIVS[gs.wonders[id]].name : null, mine: gs.wonders[id] === 0,
                    why: canBuildWonder(gs, 0, id),
                    queued: !!(cap && cap.queue && cap.queue.includes(id)),
                    prog: cap && cap.queue && cap.queue[0] === id ? Math.floor(cap.buildP || 0) : 0,
                })),
                mineN: WONDER_IDS.filter((id) => gs.wonders[id] === 0).length,
                ai: CIVS.filter((c) => !c.barb && c.id !== 0).map((c) => ({ name: c.name, n: WONDER_IDS.filter((id) => gs.wonders[id] === c.id).length })),
            })
        }
        const closeUPanel = () => { uOpenRef.current = false; setUOpen(false); audioController.playTone(240, 0.04, 'sine', 0.04) }
        const toggleUPanel = () => {
            uOpenRef.current = !uOpenRef.current
            setUOpen(uOpenRef.current)
            if (uOpenRef.current) refreshUPanel()
            audioController.playTone(uOpenRef.current ? 500 : 240, 0.04, 'sine', 0.04)
        }
        const pickWonder = (id) => {
            const why = canBuildWonder(gs, 0, id)
            if (why !== true) { say(why.toUpperCase()); audioController.playTone(110, 0.08, 'square', 0.05); return }
            const cap = gs.cities.find((c) => c.civ === 0 && c.alive)
            if (!cap) { say('FOUND A CITY FIRST'); audioController.playTone(110, 0.07, 'square', 0.05); return }
            if (cap.queue.includes(id)) { say(`${WONDER[id].name.toUpperCase()} IS ALREADY QUEUED`); return }
            pending = { ...pending, queue: id }
            closeUPanel()
            audioController.playSweep(330, 560, 0.2, 'triangle', 0.05)
        }
        const refreshGPanel = () => {
            const G = gs.gp[0]
            setGpanel({
                gold: gs.civs[0].gold,
                rows: GP_TYPES.map((t) => ({
                    t, name: GP[t].name, icon: GP[t].icon, effect: GP[t].effect,
                    pts: Math.floor(G.pts[t]), need: gpThreshold(gs, 0, t), held: G.held[t], ready: gpReady(gs, 0, t),
                    cost: gpCost(gs, 0, t), recruitWhy: canRecruit(gs, 0, t), useWhy: canUseGP(gs, 0, t),
                })),
            })
        }
        const closeGPanel = () => { gOpenRef.current = false; setGOpen(false); audioController.playTone(240, 0.04, 'sine', 0.04) }
        const toggleGPanel = () => {
            gOpenRef.current = !gOpenRef.current
            setGOpen(gOpenRef.current)
            if (gOpenRef.current) refreshGPanel()
            audioController.playTone(gOpenRef.current ? 700 : 240, 0.04, 'sine', 0.04)
        }
        const pickRecruit = (t) => {
            const why = canRecruit(gs, 0, t)
            if (why !== true) { say(why.toUpperCase()); audioController.playTone(110, 0.08, 'square', 0.05); return }
            pending = { ...pending, recruit: t }
            audioController.playSweep(440, 660, 0.18, 'sine', 0.05)
        }
        const pickUseGP = (t) => {
            const why = canUseGP(gs, 0, t)
            if (why !== true) { say(why.toUpperCase()); audioController.playTone(110, 0.08, 'square', 0.05); return }
            pending = { ...pending, useGP: { kind: t } }
            closeGPanel()
            audioController.playSweep(523, 1046, 0.24, 'triangle', 0.06)
        }
        const refreshDPanel = () => {
            setDpanel({
                gold: gs.civs[0].gold,
                rivals: CIVS.filter((c) => !c.barb && !c.cs && c.id !== 0).map((c) => ({
                    id: c.id, name: c.name, hex: c.hex,
                    war: atWar(gs, 0, c.id),
                    trade: !!gs.trade[Math.min(0, c.id) + '-' + Math.max(0, c.id)],
                    declareWhy: canDeclareWar(gs, 0, c.id),
                    peaceWhy: canMakePeace(gs, 0, c.id),
                    tradeWhy: canTrade(gs, 0, c.id),
                })),
                states: CIVS.filter((c) => c.cs).map((c) => {
                    const info = csInfo(gs, 0, c.id)
                    const alive = gs.civs[c.id].alive
                    return {
                        id: c.id, name: c.name, hex: c.hex, desc: c.allyDesc, alive,
                        met: !!(info && info.met), ally: !!(info && info.ally),
                        influence: info ? info.influence : 0,
                        giftWhy: canGift(gs, 0, c.id),
                    }
                }),
                pacts: Object.keys(gs.trade).filter((k) => gs.trade[k]).length,
            })
        }
        const closeDPanel = () => { dOpenRef.current = false; setDOpen(false); audioController.playTone(240, 0.04, 'sine', 0.04) }
        const toggleDPanel = () => {
            dOpenRef.current = !dOpenRef.current
            setDOpen(dOpenRef.current)
            if (dOpenRef.current) refreshDPanel()
            audioController.playTone(dOpenRef.current ? 392 : 240, 0.04, 'sine', 0.04)
        }
        const pickDeclare = (id) => {
            const why = canDeclareWar(gs, 0, id)
            if (why !== true) { say(why.toUpperCase()); audioController.playTone(110, 0.08, 'square', 0.05); return }
            pending = { ...pending, declare: id }
            closeDPanel()
            audioController.playSweep(330, 130, 0.35, 'sawtooth', 0.06)
        }
        const pickPeace = (id) => {
            const why = canMakePeace(gs, 0, id)
            if (why !== true) { say(why.toUpperCase()); audioController.playTone(110, 0.08, 'square', 0.05); return }
            pending = { ...pending, peace: id }
            refreshDPanel()
            audioController.playSweep(392, 587, 0.25, 'triangle', 0.05)
        }
        const pickTrade = (id) => {
            const why = canTrade(gs, 0, id)
            if (why !== true) { say(why.toUpperCase()); audioController.playTone(110, 0.08, 'square', 0.05); return }
            pending = { ...pending, trade: id }
            refreshDPanel()
            audioController.playSweep(494, 740, 0.22, 'triangle', 0.05)
        }
        const pickGift = (id) => {
            const why = canGift(gs, 0, id)
            if (why !== true) { say(why.toUpperCase()); audioController.playTone(110, 0.08, 'square', 0.05); return }
            pending = { ...pending, gift: id }
            refreshDPanel()
            audioController.playTone(587, 0.08, 'triangle', 0.05)
        }
        const refreshVPanel = () => {
            const taken = [1, 2, 3].filter((i) => { const oc = gs.capitalOf[i] != null ? gs.cities[gs.capitalOf[i]] : null; return oc && oc.alive && oc.civ !== i }).length
            const cult = Math.floor(gs.civs[0].cultureEarned || 0)
            const tour = Math.floor(gs.civs[0].tourism || 0)
            setVpanel({
                turn: gs.turn,
                taken,
                ark: Math.floor(gs.ark[0]), needArk: CFG.arkScience, space: hasTech(gs, 0, 'SPACEFLIGHT'),
                parts: arkPartsOf(gs, 0).map((p) => ({ id: p.id, name: p.name, cost: p.cost, funded: p.funded, done: p.done })),
                partsDone: arkPartsDone(gs, 0),
                cult, needCult: CFG.cultureWin,
                tour, needTour: CFG.tourismWin,
                lead: [1, 2, 3].every((i) => !gs.civs[i].alive || (gs.civs[i].tourism || 0) < tour),
                size: capSize(), goal: GOAL,
                rivals: CIVS.filter((c) => !c.barb && !c.cs && c.id !== 0).map((c) => ({
                    id: c.id, name: c.name, hex: c.hex, alive: gs.civs[c.id].alive,
                    vassal: gs.civs[c.id].vassal,
                    caps: gs.cities.some((ct) => ct.alive && ct.civ === c.id && ct.capital),
                    space: hasTech(gs, c.id, 'SPACEFLIGHT'), ark: Math.floor(gs.ark[c.id]), partsDone: arkPartsDone(gs, c.id),
                    tour: Math.floor(gs.civs[c.id].tourism || 0),
                    cult: Math.floor(gs.civs[c.id].cultureEarned || 0),
                })),
            })
        }
        const closeVPanel = () => { vOpenRef.current = false; setVOpen(false); audioController.playTone(240, 0.04, 'sine', 0.04) }
        const toggleVPanel = () => {
            vOpenRef.current = !vOpenRef.current
            setVOpen(vOpenRef.current)
            if (vOpenRef.current) refreshVPanel()
            audioController.playTone(vOpenRef.current ? 330 : 240, 0.05, 'triangle', 0.05)
        }
        actRef.current = { togglePanel, closePanel, pickResearch, toggleWPanel, closeWPanel, pickImprove, togglePPanel, closePPanel, pickPolicy, toggleUPanel, closeUPanel, pickWonder, toggleGPanel, closeGPanel, pickRecruit, pickUseGP, toggleDPanel, closeDPanel, pickDeclare, pickPeace, pickTrade, pickGift, toggleVPanel, closeVPanel }

        let drag = null
        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(1); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current) return
            if (e.code === 'Space' || e.code === 'Enter') { endTurn(); return }
            if (e.code === 'KeyE' || e.code === 'KeyB') { doSettle(); return }
            if (e.code === 'Digit1') { pending = { ...pending, queue: 'WARRIOR' }; audioController.playTone(330, 0.03, 'sine', 0.03); return }
            if (e.code === 'Digit2') { pending = { ...pending, queue: 'ARCHER' }; audioController.playTone(370, 0.03, 'sine', 0.03); return }
            if (e.code === 'Digit3') { pending = { ...pending, queue: 'SETTLER' }; audioController.playTone(290, 0.03, 'sine', 0.03); return }
            if (e.code === 'Digit4') { pending = { ...pending, queue: 'WORKER' }; audioController.playTone(250, 0.03, 'sine', 0.03); return }
            if (e.code === 'KeyC') { pending = { ...pending, queue: 'CATAPULT' }; audioController.playTone(250, 0.03, 'sine', 0.03); return }
            if (e.code === 'KeyV') { pending = { ...pending, queue: 'LEGION' }; audioController.playTone(210, 0.03, 'square', 0.03); return }
            if (e.code === 'KeyH') { pending = { ...pending, queue: 'CHARIOT' }; audioController.playTone(270, 0.03, 'triangle', 0.03); return }
            if (e.code === 'KeyN') { pending = { ...pending, queue: 'GALLEY' }; audioController.playTone(230, 0.03, 'sine', 0.03); return }
            if (e.code === 'KeyK') { pending = { ...pending, queue: 'MUSKET' }; audioController.playTone(190, 0.03, 'square', 0.03); return }
            if (e.code === 'KeyL') { pending = { ...pending, queue: 'GALLEON' }; audioController.playTone(250, 0.03, 'sine', 0.03); return }
            if (e.code === 'KeyJ') { doLand(); return }
            if (e.code === 'KeyT') { if (screenRef.current === 'play') togglePanel(); return }
            if (e.code === 'KeyR') { if (screenRef.current === 'play') researchNext(); return }
            if (e.code === 'KeyW') { if (screenRef.current === 'play') toggleWPanel(); return }
            if (e.code === 'KeyP') { if (screenRef.current === 'play') togglePPanel(); return }
            if (e.code === 'KeyU') { if (screenRef.current === 'play') toggleUPanel(); return }
            if (e.code === 'KeyG') { if (screenRef.current === 'play') toggleGPanel(); return }
            if (e.code === 'KeyD') { if (screenRef.current === 'play') toggleDPanel(); return }
            if (e.code === 'KeyY') { if (screenRef.current === 'play') toggleVPanel(); return }
            if (e.code === 'KeyF') { if (screenRef.current === 'play') pickImprove('FARM'); return }
            if (e.code === 'KeyM') { if (screenRef.current === 'play') pickImprove('MINE'); return }
            if (e.code === 'KeyO') { if (screenRef.current === 'play') pickImprove('ROAD'); return }
            if (e.code === 'Escape') { if (panelOpenRef.current) closePanel(); if (wOpenRef.current) closeWPanel(); if (pOpenRef.current) closePPanel(); if (uOpenRef.current) closeUPanel(); if (gOpenRef.current) closeGPanel(); if (dOpenRef.current) closeDPanel(); if (vOpenRef.current) closeVPanel(); return }
            if (e.code === 'ArrowLeft') { cam.az -= 0.12; return }
            if (e.code === 'ArrowRight') { cam.az += 0.12; return }
            if (e.code === 'ArrowUp') { cam.el = Math.min(1.4, cam.el + 0.06); return }
            if (e.code === 'ArrowDown') { cam.el = Math.max(0.35, cam.el - 0.06); return }
        }
        const onWheel = (e) => { e.preventDefault && e.preventDefault(); cam.dist = Math.max(18, Math.min(90, cam.dist + (e.deltaY > 0 ? 4 : -4))) }

        const onPointerDown = (e) => { const sc = screenRef.current; if (sc === 'attract') { startPlay(1); return } if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return } drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, az: cam.az, el: cam.el } }
        const onPointerMove = (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy)); cam.az = drag.az - dx * 0.006; cam.el = Math.max(0.35, Math.min(1.4, drag.el + dy * 0.004)) }
        const onPointerUp = (e) => { if (!drag) return; if (drag.moved < 8 && screenRef.current === 'play') { const t = pickTile(e.clientX, e.clientY); if (t) clickTile(t.c, t.r) } drag = null }

        const startPlay = (seed = 1) => {
            gs = newGame(seed, 0); view = reinitView(gs)
            const s = gs.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
            if (s) { gs.selected = s.id; const w = view.hexToWorld(s.c, s.r); cam.tx = w.x; cam.tz = w.z }
            pending = {}
            setMode('play')
            say('FIND A SITE — PRESS E TO SETTLE YOUR CAPITAL')
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }

        window.addEventListener('keydown', onDown)
        window.addEventListener('wheel', onWheel, { passive: false })
        canvas.addEventListener('pointerdown', onPointerDown)
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            renderer.setSize(r.width, r.height, false)
            camera.aspect = r.width / r.height
            camera.updateProjectionMatrix()
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__civTest = {
                probe: () => ({ screen: screenRef.current, tick: gs.tick, turn: gs.turn, phase: gs.phase, end: gs.end, why: gs.endWhy,
                    gold: gs.civs[0].gold, science: gs.civs[0].science, culture: gs.civs[0].culture || 0,
                    capitalSize: capSize(), playerCities: gs.cities.filter((c) => c.civ === 0 && c.alive).length, totalCities: gs.cities.filter((c) => c.alive).length,
                    selected: gs.selected, units0: gs.units.filter((u) => u.civ === 0 && u.alive).map((u) => ({ id: u.id, kind: u.kind, c: u.c, r: u.r, moves: u.moves, hp: u.hp })),
                    barbsVisible: gs.units.filter((u) => u.alive && u.civ === BARB && gs.visible[0][u.r * CFG.W + u.c]).length,
                    campsAlive: gs.camps.filter((c) => c.alive).length, wars: Object.keys(gs.wars).length,
                    queue: gs.cities.filter((c) => c.civ === 0 && c.alive).map((c) => ({ name: c.name, queue: [...(c.queue || [])], p: Math.floor(c.buildP || 0) })),
                    tech: { known: TECH_IDS.filter((id) => hasTech(gs, 0, id)), research: gs.tech[0].research, prog: Math.floor(gs.tech[0].prog),
                        ai: CIVS.filter((c) => !c.barb && c.id !== 0).map((c) => ({ civ: c.id, name: c.name, n: Object.keys(gs.tech[c.id].known).length, researching: gs.tech[c.id].research })) },
                    workers: gs.units.filter((u) => u.alive && u.civ === 0 && u.kind === 'WORKER').map((u) => ({ id: u.id, c: u.c, r: u.r, busy: u.busy })),
                    land: { imps: gs.tiles.filter((t) => t.imp).length, roads: gs.tiles.filter((t) => t.road).length, connected: connectedResources(gs, 0), revealed: gs.tiles.filter((t, i) => resRevealed(gs, 0, i)).length },
                    happy: happinessOf(gs, 0), policies: POLICY_IDS.filter((id) => hasPolicy(gs, 0, id)), culturePool: Math.floor(gs.civs[0].culture || 0),
                    wonders: WONDER_IDS.filter((id) => gs.wonders[id] != null).map((id) => ({ id, by: gs.wonders[id] })),
                    world: { cities: CIVS.filter((c) => c.cs).map((c) => ({ id: c.id, name: c.name, alive: gs.civs[c.id].alive, c: gs.cities.find((ct) => ct.civ === c.id && ct.alive)?.c ?? -1, r: gs.cities.find((ct) => ct.civ === c.id && ct.alive)?.r ?? -1 })), rome: CS_IDS.map((id) => ({ cs: id, ...(csInfo(gs, 0, id) || { met: false, influence: 0, ally: false }) })), pacts: Object.keys(gs.trade).filter((k) => gs.trade[k]), wars: Object.keys(gs.wars), truce: Object.keys(gs.peaceTurn), naval: gs.units.filter((u) => u.alive && u.civ === 0 && u.naval).map((u) => ({ id: u.id, c: u.c, r: u.r, kind: u.kind, cargo: u.cargo ? u.cargo.length : 0 })), onboard: gs.units.filter((u) => u.alive && u.loaded).map((u) => ({ id: u.id, kind: u.kind, ship: u.loaded })), coastal: !!coastalCityOf(gs, 0) },
                    gp: GP_TYPES.map((t) => ({ t, pts: Math.floor(gs.gp[0].pts[t]), need: gpThreshold(gs, 0, t), held: gs.gp[0].held[t], ready: gpReady(gs, 0, t), cost: gpCost(gs, 0, t) })),
                    victory: { capsTaken: [1, 2, 3].filter((i) => { const oc = gs.capitalOf[i] != null ? gs.cities[gs.capitalOf[i]] : null; return oc && oc.alive && oc.civ !== i }).length, ark: Math.floor(gs.ark[0]), needArk: CFG.arkScience, spaceflight: hasTech(gs, 0, 'SPACEFLIGHT'), parts: arkPartsOf(gs, 0).map((p) => ({ id: p.id, name: p.name, cost: p.cost, funded: p.funded, done: p.done })), partsDone: arkPartsDone(gs, 0), cultEarned: Math.floor(gs.civs[0].cultureEarned || 0), needCult: CFG.cultureWin, tourism: Math.floor(gs.civs[0].tourism || 0), needTourism: CFG.tourismWin, tourismLead: [1, 2, 3].every((i) => !gs.civs[i].alive || (gs.civs[i].tourism || 0) < (gs.civs[0].tourism || 0)), rivalArk: [1, 2, 3].map((i) => Math.floor(gs.ark[i])), rivalPartsDone: [1, 2, 3].map((i) => arkPartsDone(gs, i)), rivalTourism: [1, 2, 3].map((i) => Math.floor(gs.civs[i].tourism || 0)) },
                    late: { knownLate: ['EDUCATION', 'BANKING', 'GUNPOWDER', 'ASTRONOMY', 'STEAM_POWER', 'RAILROAD', 'INDUSTRIALIZATION', 'ELECTRICITY', 'SPACEFLIGHT'].filter((id) => hasTech(gs, 0, id)), muskets: gs.units.filter((u) => u.alive && u.civ === 0 && u.kind === 'MUSKET').length, galleons: gs.units.filter((u) => u.alive && u.civ === 0 && u.kind === 'GALLEON').length },
                    owned: gs.tiles.filter((t) => t.owner === 0).length,
                    explored0: countArr(gs.explored[0]) }),
                start: startPlay, hash: () => stateHash(gs), select: (id) => { pending = { select: id } },
                move: (c, r) => { pending = { move: [c, r] } }, settle: () => { pending = { found: true } }, endTurn: () => { pending = { endTurn: true } },
                attack: (c, r) => { pending = { ...pending, attack: [c, r] } }, queue: (k) => { pending = { ...pending, queue: k } },
                research: (id) => { pending = { ...pending, research: id } }, learn: (id) => { grantTech(gs, 0, id) },
                improve: (kind) => { pending = { ...pending, improve: kind } },
                policy: (id) => { pending = { ...pending, policy: id } },
                recruit: (t) => { pending = { ...pending, recruit: t } },
                useGP: (kind) => { pending = { ...pending, useGP: { kind } } },
                declare: (civ) => { pending = { ...pending, declare: civ } },
                peace: (civ) => { pending = { ...pending, peace: civ } },
                trade: (civ) => { pending = { ...pending, trade: civ } },
                gift: (cs) => { pending = { ...pending, gift: cs } },
                embark: () => { pending = { ...pending, embark: true } },
                land: (c, r) => { pending = { ...pending, land: [c, r] } },
                auto: (turns = 100) => { let n = 0; while (!gs.end && n < turns * 400 && screenRef.current === 'play') { doSim(decide(gs)); n++ } return { end: gs.end, turns: gs.turn, size: capSize() } },
                turn: () => { const t0 = gs.turn; let n = 0; while (gs.turn === t0 && !gs.end && screenRef.current === 'play' && n++ < 800) doSim(decide(gs)); return { turn: gs.turn, end: gs.end, size: capSize() } },
            }
            mountDbg({
                title: 'CIVILIZATION V',
                getState: () => [
                    `TURN ${gs.turn}/${CFG.turnLimit}  phase ${gs.phase}  end ${gs.end || '-'} ${gs.endWhy || ''}`,
                    `ROME gold ${gs.civs[0].gold}  sci ${gs.civs[0].science}  culture ${gs.civs[0].culture || 0}  goal capital size ${capSize()}/${GOAL}`,
                    `player cities ${gs.cities.filter((c) => c.civ === 0 && c.alive).length}  total ${gs.cities.filter((c) => c.alive).length}  units0 ${gs.units.filter((u) => u.civ === 0 && u.alive).length}  explored ${countArr(gs.explored[0])}`,
                    `camps alive ${gs.camps.filter((c) => c.alive).length}/${gs.camps.length}  wars ${Object.keys(gs.wars).length}  barbs alive ${gs.units.filter((u) => u.alive && u.civ === BARB).length}  queue ${JSON.stringify((gs.cities.find((c) => c.civ === 0 && c.alive) || { queue: [] }).queue)}`,
                    `research ${gs.tech[0].research ? TECH[gs.tech[0].research].name + ' ' + Math.floor(gs.tech[0].prog) + '/' + TECH[gs.tech[0].research].cost : 'idle'}  known ${TECH_IDS.filter((id) => hasTech(gs, 0, id)).length}/${TECH_IDS.length}  ai ${CIVS.filter((c) => !c.barb && c.id !== 0).map((c) => c.name + ':' + Object.keys(gs.tech[c.id].known).length).join(' ')}`,
                    `victory: caps ${[1, 2, 3].filter((i) => { const oc = gs.capitalOf[i] != null ? gs.cities[gs.capitalOf[i]] : null; return oc && oc.alive && oc.civ !== i }).length}/3  ark ${arkPartsDone(gs, 0)}/4 parts ${Math.floor(gs.ark[0])}/${CFG.arkScience}${hasTech(gs, 0, 'SPACEFLIGHT') ? '' : ' (needs Spaceflight)'}  tourism ${Math.floor(gs.civs[0].tourism || 0)}/${CFG.tourismWin}${[1, 2, 3].every((i) => !gs.civs[i].alive || (gs.civs[i].tourism || 0) < (gs.civs[0].tourism || 0)) ? ' LEAD' : ''}  record ❦ ${Math.floor(gs.civs[0].cultureEarned || 0)}/${CFG.cultureWin}`,
                    `land: workers ${gs.units.filter((u) => u.alive && u.civ === 0 && u.kind === 'WORKER').length}  improvements ${gs.tiles.filter((t) => t.imp).length}  roads ${gs.tiles.filter((t) => t.road).length}  connected ${connectedResources(gs, 0).join(',') || 'none'}`,
                    `happiness ${(() => { const hs = happinessOf(gs, 0); return `${hs.net} (${hs.net >= 1 ? 'happy' : hs.net < 0 ? 'UNHAPPY' : 'content'}) lux ${hs.lux} cities ${hs.cities} wars ${hs.wars}` })()}  policies ${POLICY_IDS.filter((id) => hasPolicy(gs, 0, id)).join(',') || 'none'}  culture pool ${Math.floor(gs.civs[0].culture || 0)}  owned ${gs.tiles.filter((t) => t.owner === 0).length}`,
                    `wonders ${WONDER_IDS.filter((id) => gs.wonders[id] != null).map((id) => id + '→' + CIVS[gs.wonders[id]].name).join(',') || 'none'}  gp ${GP_TYPES.map((t) => `${t[0]}:${Math.floor(gs.gp[0].pts[t])}/${gpThreshold(gs, 0, t)}${gs.gp[0].held[t] ? `(${gs.gp[0].held[t]} held)` : ''}`).join(' ')}`,
                    `world: courts ${CS_IDS.map((id) => { const i = csInfo(gs, 0, id); return CIVS[id].name[0] + ':' + (i ? (i.ally ? 'ally' : i.met ? String(i.influence) : '?') : '-') }).join(' ')}  pacts ${Object.keys(gs.trade).filter((k) => gs.trade[k]).join(',') || 'none'}  wars ${Object.keys(gs.wars).join(',') || 'none'}  galleys ${gs.units.filter((u) => u.alive && u.civ === 0 && u.naval).length}  coastal ${coastalCityOf(gs, 0) ? 'yes' : 'no'}`,
                    `selected ${gs.selected}  tick ${gs.tick}`,
                ],
                actions: [
                    { label: 'PROGNOSIS', run: () => { if (gs.end) return `already ${gs.end}`; const clone = structuredClone(gs); clone.events = []; let n = 0; while (!clone.end && n < 40000) step(clone, decide(clone)); return `$ planner replays THIS map from here to ${clone.end} at turn ${clone.turn} (capital ${capSizeOf(clone)})` } },
                    { label: 'NEXT TECH', run: () => { const av = availableTechs(gs, 0); const id = av.length ? RESEARCH_ORDER.find((x) => av.includes(x)) || av[0] : null; if (!id) return 'every tech is already known'; grantTech(gs, 0, id); return `instant-discovered ${TECH[id].name} (${TECH[id].effect})` } },
                    { label: 'SETTLE HERE', run: () => { doSettle(); return 'issued settle' } },
                    { label: '+300 GOLD', run: () => { gs.civs[0].gold += 300; return '+300 gold (the ledger is real: gold only buys AI settlers)' } },
                    { label: 'QUEUE WARRIOR', run: () => { pending = { ...pending, queue: 'WARRIOR' }; return 'warrior queued at your first city' } },
                    { label: 'QUEUE WORKER', run: () => { pending = { ...pending, queue: 'WORKER' }; return 'worker queued at your first city' } },
                    { label: 'IMPROVE HERE', run: () => { const w = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0 && u.kind === 'WORKER'); if (!w) return 'select a worker first'; for (const k of IMP_IDS) { const why = canImprove(gs, 0, w, k); if (why === true) { pending = { ...pending, improve: k }; return `worker starts ${IMP[k].name} at ${w.c},${w.r}` } else if (/requires/.test(why)) return why } return 'this tile cannot be improved' } },
                    { label: '+200 CULTURE', run: () => { gs.civs[0].culture = (gs.civs[0].culture || 0) + 200; return '+200 culture — the policy pool is real, spend it with P' } },
                    { label: 'ADOPT POLICY', run: () => { for (const id of POLICY_IDS) { const why = canAdopt(gs, 0, id); if (why === true) { pending = { ...pending, policy: id }; return `will adopt ${POLICY[id].name} (${POLICY[id].effect})` } } return 'nothing adoptable: need the branch opener and the culture' } },
                    { label: '+10 GP POINTS', run: () => { for (const t of GP_TYPES) gs.gp[0].pts[t] += 10; return '+10 engineer/scientist/merchant points — the pools are real, watch G' } },
                    { label: 'RECRUIT GP', run: () => { for (const t of GP_TYPES) { const why = canRecruit(gs, 0, t); if (why === true) { pending = { ...pending, recruit: t }; return `will recruit ${GP[t].name} for ${gpCost(gs, 0, t)} gold (${GP[t].effect})` } } return 'nothing recruitable: fill a point bar (G) and pay the gold' } },
                    { label: 'EXPULSE GP', run: () => { for (const t of GP_TYPES) { const why = canUseGP(gs, 0, t); if (why === true) { pending = { ...pending, useGP: { kind: t } }; return `will spend the ${GP[t].name} (${GP[t].effect})` } } return 'no great person in hand — recruit one on G' } },
                    { label: 'QUEUE WONDER', run: () => { const cap = gs.cities.find((c) => c.civ === 0 && c.alive); if (!cap) return 'found a city first'; for (const id of WONDER_IDS) { const why = canBuildWonder(gs, 0, id); if (why === true && !cap.queue.includes(id)) { pending = { ...pending, queue: id }; return `will queue ${WONDER[id].name} (${WONDER[id].cost} shields, ${WONDER[id].effect})` } else if (why === true) return `${WONDER[id].name} is already queued` } return 'no wonder is unlocked yet: research its tech (T)' } },
                    { label: 'GIFT CITY-STATE', run: () => { for (const id of CS_IDS) { const why = canGift(gs, 0, id); if (why === true) { pending = { ...pending, gift: id }; return `will gift ${CIVS[id].name} ${CFG.csGift} gold (+${CFG.csInfl} influence, ally at ${CFG.csAlly})` } else if (csInfo(gs, 0, id) && csInfo(gs, 0, id).met) return why } return 'no court is open yet: walk a unit beside a city-state capital' } },
                    { label: 'TRADE PACT', run: () => { for (const c of [1, 2, 3]) { if (!gs.civs[c].alive) continue; const why = canTrade(gs, 0, c); if (why === true) { pending = { ...pending, trade: c }; return `will sign a trade pact with ${CIVS[c].name} (+${CFG.tradeGold}g/turn)` } else if (!atWar(gs, 0, c)) return `${CIVS[c].name}: ${why}` } return 'every neighbour is at war: make peace on D first' } },
                    { label: 'MAKE PEACE', run: () => { for (const c of [1, 2, 3]) if (atWar(gs, 0, c)) { pending = { ...pending, peace: c }; return `will sue for peace with ${CIVS[c].name}` } return 'Rome is not at war with any empire' } },
                    { label: 'QUEUE TRIREME', run: () => { const c = coastalCityOf(gs, 0); if (!c) return 'no coastal city yet: settle beside the sea'; pending = { ...pending, queue: 'GALLEY' }; return `will launch a Trireme from ${c.name} (needs Bronze Working)` } },
                    { label: 'NEXT AGE TECH', run: () => { const line = ['EDUCATION', 'ASTRONOMY', 'STEAM_POWER', 'INDUSTRIALIZATION', 'ELECTRICITY', 'SPACEFLIGHT']; const id = line.find((x) => !hasTech(gs, 0, x)); if (!id) return 'the modern age is complete — weld the Ark and launch'; grantTech(gs, 0, id); return `instant-discovered ${TECH[id].name} (${TECH[id].effect})` } },
                    { label: 'PUSH THE ARK', run: () => { if (!hasTech(gs, 0, 'SPACEFLIGHT')) return 'Spaceflight comes first (NEXT AGE TECH ×n)'; gs.ark[0] = Math.min(CFG.arkScience, gs.ark[0] + 15); const ps = arkPartsOf(gs, 0); const nextWeld = ps.find((p) => !p.done); return `Ark funded ${Math.floor(gs.ark[0])}/${CFG.arkScience} · ${arkPartsDone(gs, 0)}/4 welded${nextWeld ? ` · next weld ${nextWeld.name} ${nextWeld.funded}/${nextWeld.cost}` : ' · the hull is complete'}` } },
                    { label: '+200 TOURISM', run: () => { gs.civs[0].tourism = (gs.civs[0].tourism || 0) + 200; return `tourism now ${Math.floor(gs.civs[0].tourism)} — the CULTURE crown needs ${CFG.tourismWin} and the lead over every living rival (wonders pay 3, luxuries 1, half of culture)` } },
                    { label: 'QUEUE MUSKET', run: () => { pending = { ...pending, queue: 'MUSKET' }; return 'will train a Musket (needs Gunpowder)' } },
                    { label: 'QUEUE GALLEON', run: () => { const c = coastalCityOf(gs, 0); if (!c) return 'no coastal city yet: settle beside the sea'; pending = { ...pending, queue: 'GALLEON' }; return `will launch a Galleon from ${c.name} (needs Astronomy — it storms ports, carries 2)` } },
                    { label: 'EMBARK HERE', run: () => { const s = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0); if (!s) return 'select a land unit first'; const why = canEmbark(gs, s); if (why !== true) return String(why); pending = { ...pending, embark: true }; return `${s.kind} will board the galleon alongside` } },
                    { label: 'LAND AT BEACH', run: () => { const s = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0); if (!s || !s.naval) return 'select a galleon first'; if (!s.cargo || !s.cargo.length) return 'the hold is empty — embark a land unit beside the ship'; doLand(); return 'will drop the hold at the nearest reachable beach (defended sand means an amphibious assault)' } },
                    { label: 'HEAL ALL', run: () => { gs.units.filter((u) => u.alive && u.civ === 0).forEach((u) => { u.hp = 100 }); return 'legions made whole' } },
                ],
            })
        }
        const capSizeOf = (g) => { const c = g.cities.find((x) => x.civ === 0 && x.capital); return c ? c.size : 0 }

        return () => {
            if (import.meta.env.DEV) { if (window.__civTest) delete window.__civTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('wheel', onWheel)
            canvas.removeEventListener('pointerdown', onPointerDown)
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            destroyView(view)
            renderer.dispose()
            canvas.remove()
        }
    }, [setMode])

    function destroyView(v) {
        if (!v || !v.scene) return
        v.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { for (const k of ['map', 'alphaMap']) if (m[k]) m[k].dispose(); m.dispose() }) })
    }

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])
    const play = screen === 'play'
    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0" />

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-3 right-3 flex flex-wrap items-center gap-2 text-white font-mono text-xs">
                    <span className="px-2 py-0.5 rounded bg-red-700/70 border border-red-300/50 text-red-50 font-bold">ROME</span>
                    <span ref={setHud('turn')} className="text-cyan-200">TURN 1/40</span>
                    <span ref={setHud('cap')} className="text-amber-200">NO CITY — press E to settle</span>
                    <span ref={setHud('gold')} className="text-yellow-300" title="Gold">◈0</span>
                    <span ref={setHud('sci')} className="text-sky-300" title="Science">✦0</span>
                    <span ref={setHud('cult')} className="text-fuchsia-300" title="Culture">❦0</span>
                    <span ref={setHud('cities')} className="text-emerald-200/80">cities 0</span>
                    <span ref={setHud('war')} className="text-red-300/90">at peace</span>
                    <span ref={setHud('victory')} className="text-yellow-200/90">🏆 caps 0/3 · ☼ 0% · ARC 🔒</span>
                    <span ref={setHud('build')} className="text-white/50">BUILD: 1 warrior · 2 archer · 3 settler · 4 worker · C catapult · K musket · L galleon · U wonders</span>
                    <span ref={setHud('research')} className="text-sky-200/90">TECH: press T</span>
                    <span ref={setHud('worker')} className="text-lime-200/90" style={{ display: 'none' }} />
                    <span ref={setHud('lux')} className="text-fuchsia-200/90" style={{ display: 'none' }} />
                    <span ref={setHud('happy')} className="font-bold">😐 CONTENT 0</span>
                    <span ref={setHud('marvels')} className="text-amber-200/90" style={{ display: 'none' }}>🏛0</span>
                    <button onClick={() => actRef.current.togglePanel && actRef.current.togglePanel()} className="pointer-events-auto border border-sky-300/50 rounded px-2 py-0.5 bg-black/40 text-sky-100 text-[11px]">T · RESEARCH</button>
                    <button onClick={() => actRef.current.toggleWPanel && actRef.current.toggleWPanel()} className="pointer-events-auto border border-lime-300/50 rounded px-2 py-0.5 bg-black/40 text-lime-100 text-[11px]">W · WORK</button>
                    <button onClick={() => actRef.current.togglePPanel && actRef.current.togglePPanel()} className="pointer-events-auto border border-violet-300/50 rounded px-2 py-0.5 bg-black/40 text-violet-100 text-[11px]">P · POLICY</button>
                    <button onClick={() => actRef.current.toggleUPanel && actRef.current.toggleUPanel()} className="pointer-events-auto border border-amber-300/50 rounded px-2 py-0.5 bg-black/40 text-amber-100 text-[11px]">U · WONDERS</button>
                    <button onClick={() => actRef.current.toggleGPanel && actRef.current.toggleGPanel()} className="pointer-events-auto border border-rose-300/50 rounded px-2 py-0.5 bg-black/40 text-rose-100 text-[11px]">G · LEGENDS</button>
                    <button onClick={() => actRef.current.toggleDPanel && actRef.current.toggleDPanel()} className="pointer-events-auto border border-teal-300/50 rounded px-2 py-0.5 bg-black/40 text-teal-100 text-[11px]">D · DIPLOMACY</button>
                    <button onClick={() => actRef.current.toggleVPanel && actRef.current.toggleVPanel()} className="pointer-events-auto border border-yellow-300/60 rounded px-2 py-0.5 bg-black/40 text-yellow-100 text-[11px]">Y · VICTORY</button>
                    <span ref={setHud('sel')} className="text-white/70 ml-auto">tap a unit</span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/4 text-center font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, color: '#ffe9a8', textShadow: '0 0 12px #c80' }} />
                <div className="absolute bottom-3 right-3 pointer-events-none">
                    <div className="border border-amber-300/50 rounded px-3 py-1 bg-black/50 text-amber-100 font-mono text-[11px]">END TURN · Space</div>
                </div>
            </div>

            {screen === 'play' && panelOpen && panel && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="pointer-events-auto max-h-[88vh] overflow-y-auto w-[min(94vw,820px)] rounded-lg border border-amber-300/40 bg-[#141008]/95 shadow-[0_18px_60px_#000] px-4 py-3 font-mono text-amber-100">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <h3 className="text-lg font-black tracking-[0.25em] text-amber-300">RESEARCH</h3>
                            <div className="text-[10px] text-amber-200/70">{panel.ai.map((a) => `${a.name} · ${a.n} tech${a.n === 1 ? '' : 's'}`).join('   ')}</div>
                            <button onClick={() => actRef.current.closePanel && actRef.current.closePanel()} className="text-[11px] border border-amber-300/40 rounded px-2 py-0.5 hover:bg-amber-300/10">CLOSE ✕</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {ERAS.map((era, ei) => (
                                <div key={era}>
                                    <div className="text-[10px] tracking-[0.3em] text-amber-400/80 border-b border-amber-300/20 pb-1 mb-2">{era}</div>
                                    {panel.rows.filter((r) => r.era === ei).map((r) => (
                                        <button key={r.id} onClick={() => actRef.current.pickResearch && actRef.current.pickResearch(r.id)}
                                            className={`w-full text-left mb-1.5 rounded border px-2 py-1 transition-colors ${r.known ? 'border-emerald-400/50 bg-emerald-900/30 text-emerald-200' : r.current ? 'border-amber-300 bg-amber-700/40' : r.can ? 'border-white/30 bg-white/5 hover:bg-white/10' : 'border-white/10 bg-black/30 text-white/30'}`}>
                                            <div className="flex justify-between text-[11px] font-bold">
                                                <span>{r.known ? '✓ ' : ''}{r.name}</span>
                                                <span className={r.current ? 'text-amber-200' : 'opacity-60'}>{r.known ? 'DONE' : `${panel.research === r.id ? panel.prog : 0}/${r.cost}`}</span>
                                            </div>
                                            {r.current && <div className="h-1 rounded bg-black/60 mt-1"><div className="h-full bg-amber-300" style={{ width: `${Math.min(100, Math.round((panel.prog / r.cost) * 100))}%` }} /></div>}
                                            <div className="text-[10px] opacity-70 mt-0.5">{r.effect}</div>
                                            {r.prereq.length > 0 && !r.known && <div className="text-[9px] opacity-50">needs {r.prereq.join(' + ')}</div>}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div className="text-[10px] text-amber-200/60 mt-2">tap a lit tech to research it · R picks next · T closes · science comes from every city, overflow carries</div>
                    </div>
                </div>
            )}

            {screen === 'play' && wOpen && wpanel && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="pointer-events-auto w-[min(94vw,460px)] rounded-lg border border-lime-300/40 bg-[#0a1408]/95 shadow-[0_18px_60px_#000] px-4 py-3 font-mono text-lime-100">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <h3 className="text-lg font-black tracking-[0.25em] text-lime-300">WORK</h3>
                            <button onClick={() => actRef.current.closeWPanel && actRef.current.closeWPanel()} className="text-[11px] border border-lime-300/40 rounded px-2 py-0.5 hover:bg-lime-300/10">CLOSE ✕</button>
                        </div>
                        <div className="text-[11px] text-lime-200/80 mb-2">
                            worker at {wpanel.at} · {wpanel.terr}{wpanel.res ? ` · ${wpanel.res.toUpperCase()} here` : ''} · {wpanel.owned ? 'inside your borders' : 'foreign land'}
                            {wpanel.build ? <span className="text-amber-200"> · {IMP[wpanel.build.kind].name.toUpperCase()} {wpanel.build.left} turn{wpanel.build.left > 1 ? 's' : ''} left</span> : null}
                            {wpanel.imp ? <span className="text-emerald-300"> · already {wpanel.imp}</span> : null}
                            {wpanel.city ? <span className="text-red-300"> · city centre (never worked)</span> : null}
                        </div>
                        {wpanel.rows.map((r) => (
                            <button key={r.k} onClick={() => actRef.current.pickImprove && actRef.current.pickImprove(r.k)}
                                className={`w-full text-left mb-1.5 rounded border px-2 py-1 transition-colors ${r.why === true ? 'border-lime-300/60 bg-lime-900/30 hover:bg-lime-800/40' : 'border-white/10 bg-black/30 text-white/35'}`}>
                                <div className="flex justify-between text-[12px] font-bold">
                                    <span>{r.k === 'FARM' ? 'F' : r.k === 'MINE' ? 'M' : 'O'} · {r.name}</span>
                                    <span className="opacity-70">{r.turns} turn{r.turns > 1 ? 's' : ''}</span>
                                </div>
                                <div className="text-[10px] opacity-70 mt-0.5">
                                    {r.k === 'FARM' ? '+2 food on grassland, +1 on plains' : r.k === 'MINE' ? '+1 production on hills (+1 more with Engineering)' : 'half movement on the hex · links resources to your cities'}
                                    {r.tech ? ` · needs ${r.tech}` : ''}
                                </div>
                                {r.why !== true && <div className="text-[10px] text-red-300/80 mt-0.5">{r.why}</div>}
                            </button>
                        ))}
                        <div className="text-[10px] text-lime-200/60 mt-2">stand the worker on the tile, then pick the job · barbarians pillage what they cross</div>
                    </div>
                </div>
            )}

            {screen === 'play' && pOpen && ppanel && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="pointer-events-auto w-[min(94vw,760px)] rounded-lg border border-violet-300/40 bg-[#0d0a18]/95 shadow-[0_18px_60px_#000] px-4 py-3 font-mono text-violet-100">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <h3 className="text-lg font-black tracking-[0.25em] text-violet-300">POLICY</h3>
                            <div className="text-[11px] text-violet-200/80">❦ {ppanel.pool} culture · {ppanel.mood.net >= 1 ? `☺ HAPPY +${ppanel.mood.net}` : ppanel.mood.net < 0 ? `☹ UNHAPPY ${ppanel.mood.net}` : `😐 CONTENT ${ppanel.mood.net}`}</div>
                            <div className="text-[10px] text-violet-200/60 hidden sm:block">{ppanel.ai.map((a) => `${a.name} · ${a.n} polic${a.n === 1 ? 'y' : 'ies'}`).join('   ')}</div>
                            <button onClick={() => actRef.current.closePPanel && actRef.current.closePPanel()} className="text-[11px] border border-violet-300/40 rounded px-2 py-0.5 hover:bg-violet-300/10">CLOSE ✕</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {ppanel.branches.map((br) => (
                                <div key={br.b}>
                                    <div className="text-[10px] tracking-[0.3em] text-violet-400/80 border-b border-violet-300/20 pb-1 mb-2">{br.b}</div>
                                    {br.rows.map((r) => (
                                        <button key={r.id} onClick={() => actRef.current.pickPolicy && actRef.current.pickPolicy(r.id)}
                                            className={`w-full text-left mb-1.5 rounded border px-2 py-1 transition-colors ${r.adopted ? 'border-emerald-400/50 bg-emerald-900/30 text-emerald-200' : r.why === true ? 'border-violet-300/60 bg-violet-700/30 hover:bg-violet-600/30' : 'border-white/10 bg-black/30 text-white/30'}`}>
                                            <div className="flex justify-between text-[11px] font-bold">
                                                <span>{r.adopted ? '✓ ' : ''}{r.name}</span>
                                                <span className="opacity-70">{r.adopted ? 'LAW' : `❦${r.cost}`}</span>
                                            </div>
                                            <div className="text-[10px] opacity-70 mt-0.5">{r.effect}</div>
                                            {r.why !== true && !r.adopted && <div className="text-[10px] text-red-300/80 mt-0.5">{r.why}</div>}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div className="text-[10px] text-violet-200/60 mt-2">culture buys government · branches open at their first policy · happiness: palace +2, luxury +1, city −1, war −2 · happy +25% growth +10% gold, unhappy no growth</div>
                    </div>
                </div>
            )}

            {screen === 'play' && uOpen && upanel && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="pointer-events-auto w-[min(94vw,800px)] rounded-lg border border-amber-300/40 bg-[#120e04]/95 shadow-[0_18px_60px_#000] px-4 py-3 font-mono text-amber-100">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <h3 className="text-lg font-black tracking-[0.25em] text-amber-300">WONDERS</h3>
                            <div className="text-[11px] text-amber-200/80">🏛 {upanel.mineN}/{WONDER_IDS.length} yours</div>
                            <div className="text-[10px] text-amber-200/60 hidden sm:block">{upanel.ai.map((a) => `${a.name} · ${a.n} wonder${a.n === 1 ? '' : 's'}`).join('   ')}</div>
                            <button onClick={() => actRef.current.closeUPanel && actRef.current.closeUPanel()} className="text-[11px] border border-amber-300/40 rounded px-2 py-0.5 hover:bg-amber-300/10">CLOSE ✕</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {upanel.rows.map((r) => (
                                <button key={r.id} onClick={() => actRef.current.pickWonder && actRef.current.pickWonder(r.id)}
                                    className={`w-full text-left rounded border px-2 py-1 transition-colors ${r.mine ? 'border-emerald-400/50 bg-emerald-900/30 text-emerald-200' : r.by ? 'border-red-400/40 bg-red-950/40 text-red-200/70' : r.why === true ? (r.queued ? 'border-amber-300 bg-amber-700/40' : 'border-white/30 bg-white/5 hover:bg-white/10') : 'border-white/10 bg-black/30 text-white/30'}`}>
                                    <div className="flex justify-between text-[12px] font-bold">
                                        <span>{r.mine ? '✓ ' : ''}{r.name}</span>
                                        <span className={r.by && !r.mine ? 'text-red-300' : 'opacity-70'}>{r.by ? (r.mine ? 'YOURS' : `RAISED BY ${r.by}`) : r.queued ? `QUEUED ${r.prog}/${r.cost}` : `⚒ ${r.cost}`}</span>
                                    </div>
                                    {r.queued && !r.by && <div className="h-1 rounded bg-black/60 mt-1"><div className="h-full bg-amber-300" style={{ width: `${Math.min(100, Math.round((r.prog / r.cost) * 100))}%` }} /></div>}
                                    <div className="text-[10px] opacity-70 mt-0.5">{r.effect} · needs {r.tech}</div>
                                    {r.why !== true && !r.mine && !r.by && <div className="text-[10px] text-red-300/80 mt-0.5">{r.why}</div>}
                                </button>
                            ))}
                        </div>
                        <div className="text-[10px] text-amber-200/60 mt-2">the first builder takes it forever · wonders queue in your capital beside units · U closes</div>
                    </div>
                </div>
            )}

            {screen === 'play' && gOpen && gpanel && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="pointer-events-auto w-[min(94vw,640px)] rounded-lg border border-rose-300/40 bg-[#150a0e]/95 shadow-[0_18px_60px_#000] px-4 py-3 font-mono text-rose-100">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <h3 className="text-lg font-black tracking-[0.25em] text-rose-300">LEGENDS</h3>
                            <div className="text-[11px] text-rose-200/80">◈ {gpanel.gold} gold</div>
                            <button onClick={() => actRef.current.closeGPanel && actRef.current.closeGPanel()} className="text-[11px] border border-rose-300/40 rounded px-2 py-0.5 hover:bg-rose-300/10">CLOSE ✕</button>
                        </div>
                        {gpanel.rows.map((r) => (
                            <div key={r.t} className={`mb-2 rounded border px-2 py-1.5 ${r.held > 0 ? 'border-yellow-300/60 bg-yellow-900/30' : r.ready ? 'border-rose-300/60 bg-rose-800/25' : 'border-white/10 bg-black/30'}`}>
                                <div className="flex justify-between items-center text-[12px] font-bold">
                                    <span>{r.icon} {r.name}{r.held > 0 ? <span className="text-yellow-300"> ×{r.held}</span> : null}</span>
                                    <span className="flex gap-1 items-center">
                                        {r.ready && r.held === 0 && <button onClick={() => actRef.current.pickRecruit && actRef.current.pickRecruit(r.t)} className={`text-[10px] border rounded px-2 py-0.5 ${r.recruitWhy === true ? 'border-yellow-300 bg-yellow-700/50 hover:bg-yellow-600/50 text-yellow-100' : 'border-white/15 text-white/30'}`}>RECRUIT ◈{r.cost}</button>}
                                        {r.held > 0 && <button onClick={() => actRef.current.pickUseGP && actRef.current.pickUseGP(r.t)} className={`text-[10px] border rounded px-2 py-0.5 ${r.useWhy === true ? 'border-emerald-300 bg-emerald-800/50 hover:bg-emerald-700/50 text-emerald-100' : 'border-white/15 text-white/30'}`}>EXPULSE</button>}
                                    </span>
                                </div>
                                <div className="text-[10px] opacity-70 mt-0.5">{r.effect}</div>
                                <div className="h-1 rounded bg-black/60 mt-1"><div className={`h-full ${r.ready ? 'bg-yellow-300' : 'bg-rose-400/70'}`} style={{ width: `${Math.min(100, Math.round((r.pts / r.need) * 100))}%` }} /></div>
                                <div className="text-[9px] opacity-60 mt-0.5">{r.ready ? `ready · ${r.held > 0 ? 'in hand' : `recruit for ◈${r.cost}`}` : `${r.pts}/${r.need} points`}{r.recruitWhy !== true && r.ready && r.held === 0 ? ` · ${r.recruitWhy}` : ''}</div>
                            </div>
                        ))}
                        <div className="text-[10px] text-rose-200/60 mt-2">every city banks engineer, scientist &amp; merchant points · the palace seats an engineer, luxuries send merchants · costs climb with every legend · G closes</div>
                    </div>
                </div>
            )}

            {screen === 'play' && dOpen && dpanel && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="pointer-events-auto max-h-[88vh] overflow-y-auto w-[min(94vw,760px)] rounded-lg border border-teal-300/40 bg-[#071210]/95 shadow-[0_18px_60px_#000] px-4 py-3 font-mono text-teal-100">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <h3 className="text-lg font-black tracking-[0.25em] text-teal-300">DIPLOMACY</h3>
                            <div className="text-[11px] text-teal-200/80">◈ {dpanel.gold} gold · 🤝 {dpanel.pacts} pact{dpanel.pacts === 1 ? '' : 's'}</div>
                            <button onClick={() => actRef.current.closeDPanel && actRef.current.closeDPanel()} className="text-[11px] border border-teal-300/40 rounded px-2 py-0.5 hover:bg-teal-300/10">CLOSE ✕</button>
                        </div>
                        <div className="text-[10px] tracking-[0.3em] text-teal-400/80 border-b border-teal-300/20 pb-1 mb-2">EMPIRES</div>
                        {dpanel.rivals.map((r) => (
                            <div key={r.id} className={`mb-1.5 rounded border px-2 py-1.5 ${r.war ? 'border-red-400/50 bg-red-950/40' : r.trade ? 'border-emerald-400/50 bg-emerald-950/40' : 'border-white/15 bg-black/30'}`}>
                                <div className="flex justify-between items-center text-[12px] font-bold">
                                    <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: r.hex }} />{r.name}
                                        <span className={`ml-2 text-[10px] ${r.war ? 'text-red-300' : r.trade ? 'text-emerald-300' : 'text-white/50'}`}>{r.war ? '⚔ AT WAR' : r.trade ? `🤝 TRADE +${CFG.tradeGold}g/turn` : 'at peace'}</span>
                                    </span>
                                    <span className="flex gap-1">
                                        {!r.war && <button onClick={() => actRef.current.pickDeclare && actRef.current.pickDeclare(r.id)} className={`text-[10px] border rounded px-2 py-0.5 ${r.declareWhy === true ? 'border-red-300 bg-red-900/50 hover:bg-red-800/50 text-red-100' : 'border-white/15 text-white/30'}`}>DECLARE WAR</button>}
                                        {r.war && <button onClick={() => actRef.current.pickPeace && actRef.current.pickPeace(r.id)} className={`text-[10px] border rounded px-2 py-0.5 ${r.peaceWhy === true ? 'border-teal-300 bg-teal-900/50 hover:bg-teal-800/50 text-teal-100' : 'border-white/15 text-white/30'}`}>MAKE PEACE</button>}
                                        {!r.war && !r.trade && <button onClick={() => actRef.current.pickTrade && actRef.current.pickTrade(r.id)} className={`text-[10px] border rounded px-2 py-0.5 ${r.tradeWhy === true ? 'border-emerald-300 bg-emerald-900/50 hover:bg-emerald-800/50 text-emerald-100' : 'border-white/15 text-white/30'}`}>TRADE +{CFG.tradeGold}g</button>}
                                    </span>
                                </div>
                                {r.war && r.peaceWhy !== true && <div className="text-[10px] text-red-300/70 mt-0.5">{r.peaceWhy}</div>}
                                {!r.war && !r.trade && r.tradeWhy !== true && <div className="text-[10px] text-teal-200/50 mt-0.5">{r.tradeWhy}</div>}
                            </div>
                        ))}
                        <div className="text-[10px] tracking-[0.3em] text-teal-400/80 border-b border-teal-300/20 pb-1 mb-2 mt-3">CITY-STATES · gifts {CFG.csGift}g → +{CFG.csInfl} influence · alliance at {CFG.csAlly}</div>
                        {dpanel.states.map((s) => (
                            <div key={s.id} className={`mb-1.5 rounded border px-2 py-1.5 ${s.ally ? 'border-yellow-300/60 bg-yellow-900/25' : s.met ? 'border-teal-300/50 bg-teal-900/25' : 'border-white/10 bg-black/30 text-white/35'}`}>
                                <div className="flex justify-between items-center text-[12px] font-bold">
                                    <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: s.hex }} />{s.name}
                                        {!s.alive ? <span className="ml-2 text-[10px] text-red-400">FALLEN</span> : s.ally ? <span className="ml-2 text-[10px] text-yellow-300">☘ ALLY — {s.desc}</span> : s.met ? <span className="ml-2 text-[10px] text-teal-300">court open</span> : <span className="ml-2 text-[10px] opacity-60">unexplored coast</span>}
                                    </span>
                                    {s.met && !s.ally && s.alive && <button onClick={() => actRef.current.pickGift && actRef.current.pickGift(s.id)} className={`text-[10px] border rounded px-2 py-0.5 ${s.giftWhy === true ? 'border-yellow-300 bg-yellow-800/50 hover:bg-yellow-700/50 text-yellow-100' : 'border-white/15 text-white/30'}`}>GIFT ◈{CFG.csGift}</button>}
                                </div>
                                {s.met && s.alive && <div className="h-1 rounded bg-black/60 mt-1"><div className={`h-full ${s.ally ? 'bg-yellow-300' : 'bg-teal-300'}`} style={{ width: `${Math.min(100, Math.round((s.influence / CFG.csAlly) * 100))}%` }} /></div>}
                                {s.met && !s.ally && s.alive && <div className="text-[9px] opacity-60 mt-0.5">influence {s.influence}/{CFG.csAlly}{s.giftWhy !== true ? ` · ${s.giftWhy}` : ''}</div>}
                            </div>
                        ))}
                        <div className="text-[10px] text-teal-200/60 mt-2">send a unit beside a city-state to open its court · peace must hold {CFG.peaceCool} turns before trade · galleys need a coastal city (N) · D closes</div>
                    </div>
                </div>
            )}

            {screen === 'play' && vOpen && vpanel && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="pointer-events-auto max-h-[88vh] overflow-y-auto w-[min(94vw,720px)] rounded-lg border border-yellow-300/40 bg-[#120f04]/95 shadow-[0_18px_60px_#000] px-4 py-3 font-mono text-yellow-100">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <h3 className="text-lg font-black tracking-[0.25em] text-yellow-300">VICTORY</h3>
                            <div className="text-[10px] text-yellow-200/70">turn {vpanel.turn}/{CFG.turnLimit}</div>
                            <button onClick={() => actRef.current.closeVPanel && actRef.current.closeVPanel()} className="text-[11px] border border-yellow-300/40 rounded px-2 py-0.5 hover:bg-yellow-300/10">CLOSE ✕</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                            <div className="rounded border border-red-300/40 bg-red-950/30 px-2 py-1.5">
                                <div className="text-[11px] font-bold">⚔ DOMINATION</div>
                                <div className="h-1.5 rounded bg-black/60 mt-1"><div className="h-full bg-red-400" style={{ width: `${Math.round((vpanel.taken / 3) * 100)}%` }} /></div>
                                <div className="text-[9px] opacity-70 mt-1">{vpanel.taken}/3 rival capitals taken — take a capital and that realm submits</div>
                            </div>
                            <div className="rounded border border-sky-300/40 bg-sky-950/30 px-2 py-1.5">
                                <div className="text-[11px] font-bold">🚀 SCIENCE {vpanel.partsDone === 4 ? <span className="text-emerald-300">· READY</span> : null}</div>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-1">
                                    {(vpanel.parts || ARK_PARTS.map((p) => ({ ...p, funded: 0, done: false }))).map((p) => (
                                        <div key={p.id} className="text-[9px] leading-3">
                                            <div className="flex justify-between opacity-90"><span>{p.name}</span><span>{p.done ? '✓' : `${p.funded}/${p.cost}`}</span></div>
                                            <div className="h-1 rounded bg-black/60"><div className={`h-full ${p.done ? 'bg-emerald-300' : 'bg-sky-300'}`} style={{ width: `${vpanel.space ? Math.round((p.funded / p.cost) * 100) : 0}%` }} /></div>
                                        </div>
                                    ))}
                                </div>
                                <div className="text-[9px] opacity-70 mt-1">{vpanel.space ? `THE ARK · ${vpanel.partsDone}/4 parts welded · ${vpanel.ark}/${vpanel.needArk} beakers — overflow spills into the next weld` : 'reach Spaceflight, then weld Cockpit, Booster, Stasis & Launch'}</div>
                            </div>
                            <div className={`rounded border px-2 py-1.5 ${vpanel.lead && vpanel.tour >= vpanel.needTour ? 'border-amber-300/50 bg-amber-950/30' : 'border-white/15 bg-black/30'}`}>
                                <div className="text-[11px] font-bold">☼ TOURISM {vpanel.lead && vpanel.tour >= vpanel.needTour ? <span className="text-emerald-300">· LEADING</span> : null}</div>
                                <div className="h-1.5 rounded bg-black/60 mt-1"><div className="h-full bg-amber-300" style={{ width: `${Math.min(100, Math.round((vpanel.tour / vpanel.needTour) * 100))}%` }} /></div>
                                <div className="text-[9px] opacity-70 mt-1">{vpanel.tour}/{vpanel.needTour} tourists — wonders pay 3, luxuries 1, half of every turn&apos;s culture — lead every living rival to be crowned</div>
                                <div className="text-[9px] opacity-50 mt-0.5">❦ {vpanel.cult} lifetime culture — the world&apos;s memory, not the crown</div>
                            </div>
                        </div>
                        <div className="text-[10px] tracking-[0.3em] text-yellow-400/80 border-b border-yellow-300/20 pb-1 mb-2">THE RIVAL TRACKS</div>
                        {vpanel.rivals.map((r) => (
                            <div key={r.id} className={`mb-1 rounded border px-2 py-1 text-[11px] ${!r.alive ? 'border-white/10 bg-black/30 text-white/30' : 'border-white/15 bg-black/20'}`}>
                                <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: r.hex }} />{r.name}
                                {!r.alive ? (r.vassal != null ? <span className="ml-2 text-red-300">— vassal of {CIVS[r.vassal]?.name || 'a rival'}</span> : ' — destroyed') : (
                                    <>
                                        <span className="ml-2 opacity-80">☼ {r.tour}</span>
                                        {r.ark > 0 && <span className="ml-2 text-sky-300">ARK {r.partsDone}/4</span>}
                                        {r.space && r.ark === 0 && <span className="ml-2 text-sky-300">SPACEFLIGHT!</span>}
                                        {!r.caps && <span className="ml-2 text-red-300">capital lost</span>}
                                    </>
                                )}
                            </div>
                        ))}
                        <div className="text-[10px] text-yellow-200/60 mt-2">the arcade golden age still shines: grow the capital to size {vpanel.goal} · first crown across any line wins · Y closes</div>
                    </div>
                </div>
            )}

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-4 text-center pointer-events-none">
                    <h1 className="text-5xl font-black tracking-wide" style={{ color: '#e8c56a', textShadow: '0 2px 0 #6b4a12, 0 10px 26px #000' }}>CIVILIZATION</h1>
                    <p className="text-amber-200/90 font-mono mt-1 text-sm tracking-[0.3em]">STAGE 8 · LATER ERAS &amp; VICTORY</p>
                    <p className="text-white font-mono font-bold mt-3 animate-pulse">TAP / PRESS ANY KEY</p>
                    <p className="text-amber-100/80 font-mono text-[11px] mt-3 px-8 leading-4">
                        the final ages arrive: Education to Spaceflight, gunpowder to the electric grid<br />
                        three crowns, three races — DOMINATION takes every capital, SCIENCE welds THE ARK part by part (Cockpit, Booster, Stasis, Launch), CULTURE counts the tourists: wonders, luxuries and fame must out-shine every rival<br />
                        K lines up the Musket · L launches the port-storming Galleon — the age of sail makes the Trireme&apos;s rules obsolete<br />
                        the Galleon is a convoy too: E embarks a land unit beside it (hold for two), tap a beach (or J) to land — enemy sand means an amphibious assault<br />
                        Y opens VICTORY and shows every track, yours and theirs · era dawns are announced across the realm<br />
                        tap a tile to move · E settles · T researches · Space ends the turn · drag to orbit · wheel to zoom<br />
                        grow your capital to size {GOAL} for the golden age, or win the hard way before turn {CFG.turnLimit}<br />
                        the demo is the autopilot&apos;s own proven campaign — every stage of the arcade, live
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/72 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>
                        {end.type === 'domination' ? 'DOMINATION' : end.type === 'science' ? 'SCIENCE VICTORY' : end.type === 'culture' ? 'CULTURE VICTORY' : end.win ? 'AN AGE OF GOLD' : 'HISTORY PASSED YOU BY'}
                    </h2>
                    <p className="text-lg mb-1">{end.win
                        ? (end.type === 'domination' ? 'Every rival capital flies your colours.'
                            : end.type === 'science' ? 'Cockpit, Booster, Stasis, Launch — the Ark leaves the ground, and the future remembers Rome.'
                                : end.type === 'culture' ? 'Travelers cross every sea for your wonders — the world sings in Latin.'
                                    : `Your capital reached size ${end.size} by turn ${end.turn}`)
                        : `${end.why}`}</p>
                    <p className="text-sm text-amber-200/80 mb-4">Eight stages of the arcade campaign, all live: the world of Civilization V, from the first settler to the last rocket.</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'CIVILIZATION V')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused && !panelOpen && !wOpen && !pOpen && !uOpen && !gOpen && !dOpen && !vOpen} secondAction={{ label: 'E', code: 'KeyE' }} />
        </div>
    )
}

export default CivilizationVGame
