// MAGIC CARPET — Bullfrog's 1994 DOS god-game, rebuilt whole in code. The rules
// live in ./sim.js (pure, seeded, harness-provable). #1083 moved the world to
// the GPU: ./renderer.js is a fresh WebGL2 pass (heightmap-sampled terrain,
// real water, sky, fire/smoke particles, lightning, bloom) and this file is the
// shell: the loop, the blue-stone HUD (2D overlay canvas), input and hooks.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import {
    W, H, HUD_H, HORIZON, MAP,
    LEVELS,
    SPILLS, spellById,
    makeGame, step, autopilot, stateHash, setHand, cycleR, cycleL, crater, settleGround, INVIS_T,
    hudTap, TAP, TRAY, muffleOf, OPEN_CUTOFF, crumbleFeel, castBearing,
    SEL, selectTap, cursorStep,
} from './sim.js'
import { createCarpetGL } from './renderer.js'

const FIXED_DT = 1000 / 60

const SPELL_COLORS = {
    fireball: '#ff7a28', lightning: '#ffe24a', heal: '#ff5060',
    protect: '#58b8ff', slow: '#b070ff', telekinesis: '#58e8d8',
    invisibility: '#c8ecff', volcano: '#ff5a20',
    shatter: '#d8f0ff', raise: '#c89a58',
    dissolve: '#3ec8e8',
    clone: '#58f0a0',
}

function drawSpellIcon(ctx, id, x, y, s) {
    const c = SPELL_COLORS[id] || '#ccc'
    if (id === 'fireball') {
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y + s * 0.6); ctx.lineTo(x - s * 0.7, y + s * 0.6); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#ffe0a0'; ctx.fillRect(x - s * 0.25, y - s * 0.1, s * 0.5, s * 0.5)
    } else if (id === 'lightning') {
        ctx.fillStyle = c
        ctx.fillRect(x - s * 0.2, y - s, s * 0.8, s * 0.55)
        ctx.fillRect(x - s * 0.5, y - s * 0.2, s * 0.9, s * 0.5)
        ctx.fillRect(x - s * 0.1, y + s * 0.2, s * 0.7, s * 0.8)
    } else if (id === 'heal') {
        ctx.fillStyle = c; ctx.fillRect(x - s * 0.25, y - s, s * 0.5, s * 2); ctx.fillRect(x - s, y - s * 0.25, s * 2, s * 0.5)
    } else if (id === 'protect') {
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, s * 0.35)
        ctx.beginPath(); ctx.arc(x, y, s * 0.85, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke()
    } else if (id === 'slow') {
        ctx.fillStyle = c
        ctx.fillRect(x - s * 0.7, y - s, s * 1.4, s * 0.4)
        ctx.fillRect(x - s * 0.7, y + s * 0.6, s * 1.4, s * 0.4)
        ctx.beginPath(); ctx.moveTo(x - s * 0.45, y - s * 0.5); ctx.lineTo(x + s * 0.45, y - s * 0.5); ctx.lineTo(x, y + s * 0.4); ctx.closePath(); ctx.fill()
    } else if (id === 'invisibility') {
        // A vanishing eye: outline and pupil, upper lid fading away.
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, s * 0.3)
        ctx.beginPath(); ctx.ellipse(x, y + s * 0.1, s, s * 0.68, 0, 0, Math.PI * 2); ctx.stroke()
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y + s * 0.1, s * 0.32, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 0.4
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, s * 0.28)
        ctx.beginPath(); ctx.moveTo(x - s, y - s * 0.5); ctx.lineTo(x + s, y - s * 0.5); ctx.stroke()
        ctx.globalAlpha = 1
    } else if (id === 'volcano') {
        // A smoking cone: brown mountain, lava at the crater, one rising puff.
        ctx.fillStyle = '#7a4a30'
        ctx.beginPath(); ctx.moveTo(x - s, y + s); ctx.lineTo(x - s * 0.35, y - s * 0.5); ctx.lineTo(x + s * 0.35, y - s * 0.5); ctx.lineTo(x + s, y + s); ctx.closePath(); ctx.fill()
        ctx.fillStyle = c; ctx.fillRect(x - s * 0.35, y - s * 0.62, s * 0.7, s * 0.35)
        ctx.fillStyle = '#ffe0a0'; ctx.fillRect(x - s * 0.15, y - s * 0.55, s * 0.3, s * 0.2)
        ctx.fillStyle = 'rgba(220, 200, 190, 0.75)'
        ctx.beginPath(); ctx.arc(x, y - s * 1.05, s * 0.4, 0, Math.PI * 2); ctx.fill()
    } else if (id === 'shatter') {
        // A crack splintering outward from a bright centre.
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, s * 0.3)
        for (let k = 0; k < 6; k++) {
            const a = k * Math.PI / 3 + 0.26
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); ctx.stroke()
        }
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - s * 0.22, y - s * 0.22, s * 0.44, s * 0.44)
    } else if (id === 'raise') {
        // A mound lifting under two rising chevrons.
        ctx.fillStyle = c
        ctx.beginPath(); ctx.arc(x, y + s * 1.05, s * 0.95, Math.PI, 0); ctx.closePath(); ctx.fill()
        ctx.strokeStyle = '#ffe0a0'; ctx.lineWidth = Math.max(1, s * 0.32)
        ctx.beginPath(); ctx.moveTo(x - s * 0.7, y + s * 0.15); ctx.lineTo(x, y - s * 0.45); ctx.lineTo(x + s * 0.7, y + s * 0.15); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(x - s * 0.5, y - s * 0.45); ctx.lineTo(x, y - s * 1.0); ctx.lineTo(x + s * 0.5, y - s * 0.45); ctx.stroke()
    } else if (id === 'dissolve') {
        // A land slab tilting down under two cyan waves, droplet falling off.
        ctx.fillStyle = '#8a6a48'
        ctx.beginPath(); ctx.moveTo(x - s, y - s * 0.45); ctx.lineTo(x + s * 0.45, y - s * 0.9); ctx.lineTo(x + s, y + s * 0.1); ctx.lineTo(x - s * 0.25, y + s * 0.55); ctx.closePath(); ctx.fill()
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, s * 0.32)
        ctx.beginPath(); ctx.moveTo(x - s * 1.05, y + s * 0.1); ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.4, x, y + s * 0.15); ctx.stroke()
        ctx.strokeStyle = 'rgba(150, 230, 255, 0.65)'
        ctx.beginPath(); ctx.moveTo(x - s * 0.6, y + s * 0.55); ctx.quadraticCurveTo(x, y + s * 0.05, x + s * 0.6, y + s * 0.6); ctx.stroke()
        ctx.fillStyle = c
        ctx.fillRect(x + s * 0.55, y - s * 0.55, Math.max(1, s * 0.28), Math.max(1, s * 0.5))
    } else if (id === 'clone') {
        // The mirror ring: a solid creature dot and its twin, hollow, standing
        // opposite across the ring centre — the spell in one glyph.
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, s * 0.28)
        ctx.beginPath(); ctx.arc(x, y, s * 0.95, 0, Math.PI * 2); ctx.stroke()
        ctx.fillStyle = c
        ctx.beginPath(); ctx.arc(x - s * 0.45, y, s * 0.32, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = c
        ctx.beginPath(); ctx.arc(x + s * 0.45, y, s * 0.32, 0, Math.PI * 2); ctx.stroke()
    } else {
        ctx.fillStyle = c
        ctx.fillRect(x - s * 0.8, y + s * 0.2, s * 0.5, s * 0.8)
        ctx.fillRect(x - s * 0.2, y - s * 0.4, s * 0.5, s * 1.4)
        ctx.fillRect(x + s * 0.4, y, s * 0.5, s * 1)
    }
}

const MagicCarpetGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const [watching, setWatching] = useState(false) // #1637 WATCH: sim.js's autopilot flies the worlds
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const watchingRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const lite = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lite')
        const glCanvas = document.createElement('canvas')
        glCanvas.dataset.mcStage = '1'
        glCanvas.className = 'absolute block'
        glCanvas.style.touchAction = 'none'
        glCanvas.style.width = '100%'
        glCanvas.style.height = '100%'
        wrap.appendChild(glCanvas)
        const canvas = document.createElement('canvas')
        canvas.dataset.mcHud = '1'
        canvas.width = W; canvas.height = H
        canvas.className = 'absolute block'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        // #1612: the HUD is the pointer surface now — taps below the horizon
        // equip spells (hudTap in sim.js), taps on the world still cast.
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let renderer = null
        try {
            renderer = createCarpetGL(glCanvas, { lite })
        } catch {
            renderer = null
        }
        // #1790 ANAGLYPH STEREO: `?stereo=1` wins (a phone's only hand — there
        // is no keyboard in a URL bar's reach the other way), then the last
        // choice; V flips it live. The sim never hears about stereo.
        let stereo = (() => {
            try {
                const q = new URLSearchParams(window.location.search).get('stereo')
                if (q === '1' || q === '0') return q === '1'
                return localStorage.getItem('mc-stereo') === '1'
            } catch { return false }
        })()
        if (renderer) renderer.setStereo(stereo)

        let gs = makeGame(7)
        let demoSeed = 7, demoT = 0
        let raf = 0, last = 0, acc = 0
        let toast = 0, toastMsg = '', shake = 0
        let flashL = 0, flashR = 0, hurtFlash = 0
        let vaultFlash = 0, prevSeg = -1
        let bankS = 0, sinkS = 0, prevAlt = gs.alt
        let bankHum = 0
        const keys = { l: false, r: false, u: false, d: false }
        // #1637 WATCH: the EFFECTIVE controls — the player's keys, or the flown
        // autopilot pad while seated, so bank/pitch/boost visuals match the route.
        const eff = { l: false, r: false, u: false, d: false }
        let throwL = false, throwR = false
        let boostKey = false, upHold = 0, boostOn = false, boostPrev = false
        let castsSeen = 0 // prover-only signal: an idle player never casts
        let selCur = 0 // #1740 title WORLD SELECT cursor (0-cycled via cursorStep)

        const say = (m) => { toastMsg = m; toast = 150 }

        const finish = (win) => {
            watchingRef.current = false; setWatching(false) // #1637 the run ends in your hands
            setEnd({ win, score: gs.score, deaths: gs.deaths, worlds: gs.levelClears + (win ? 1 : 0) })
            overAtRef.current = performance.now()
            setMode('over')
        }

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'pickup') {
                    audioController.playTone(760 + (e.m || 3) * 30, 0.05, 'triangle', 0.05)
                } else if (e.type === 'bankIn') {
                    bankHum = 30
                    if (e.m >= 3) {
                        audioController.playTone(560, 0.035, 'sine', 0.045)
                        audioController.playTone(660, 0.035, 'sine', 0.045, 0.07)
                        audioController.playTone(784, 0.05, 'sine', 0.045, 0.14)
                    } else {
                        audioController.playTone(520 + Math.min(6, e.m) * 40, 0.04, 'sine', 0.04)
                    }
                } else if (e.type === 'spill') {
                    audioController.playSweep(600, 120, 0.5, 'triangle', 0.08)
                    say('YOUR LOAD OF MANA IS LOST')
                } else if (e.type === 'ignite') {
                    audioController.playNoise(0.12, 0.05)
                } else if (e.type === 'hutDown') {
                    audioController.playNoise(0.2, 0.08)
                    audioController.playTone(85, 0.12, 'square', 0.06)
                    shake = Math.max(shake, 3)
                } else if (e.type === 'level') {
                    audioController.playTone(523, 0.12, 'square', 0.07)
                    audioController.playTone(659, 0.12, 'square', 0.07, 0.12)
                    audioController.playTone(784, 0.12, 'square', 0.07, 0.24)
                    audioController.playTone(1046, 0.3, 'square', 0.07, 0.36)
                    say(`WORLD RESTORED — ENTER ${e.name}`)
                } else if (e.type === 'cast') {
                    castsSeen++
                    if (e.hand === 'L') flashL = 14; else flashR = 14
                    const id = e.id
                    if (id === 'fireball') audioController.playSweep(640, 180, 0.16, 'sawtooth', 0.07)
                    else if (id === 'telekinesis') audioController.playSweep(260, 520, 0.12, 'sine', 0.06)
                    else if (id === 'invisibility') {
                        audioController.playSweep(300, 980, 0.22, 'sine', 0.05)
                        audioController.playSweep(1400, 360, 0.3, 'triangle', 0.024, 0.1)
                        say('YOU ARE VEILED')
                    }
                    else if (id === 'shatter') {
                        // An icy splintering: bright up-then-down crackle.
                        audioController.playSweep(1200, 2100, 0.1, 'triangle', 0.05)
                        audioController.playSweep(2100, 700, 0.22, 'triangle', 0.04, 0.08)
                    }
                    else if (id === 'raise') {
                        // The earth taking a breath upward: low rising rumble.
                        audioController.playSweep(70, 190, 0.32, 'sawtooth', 0.08)
                        audioController.playTone(98, 0.24, 'triangle', 0.04, 0.12)
                    }
                    else if (id === 'dissolve') {
                        // The sea pouring into a new wound: a bright glide down
                        // into a thick low glug.
                        audioController.playSweep(760, 160, 0.34, 'sine', 0.06)
                        audioController.playSweep(220, 70, 0.5, 'triangle', 0.07, 0.16)
                    }
                    else if (id === 'clone') {
                        // The mirror taking hold: one note, then its twin a
                        // heartbeat behind — the spell IS the echo.
                        audioController.playTone(740, 0.09, 'sine', 0.05)
                        audioController.playTone(740, 0.12, 'sine', 0.04, 0.11)
                    }
                    else if (id !== 'heal' && id !== 'protect' && id !== 'slow') audioController.playTone(500, 0.05, 'square', 0.05)
                } else if (e.type === 'invisEnd') {
                    audioController.playSweep(980, 300, 0.26, 'sine', 0.035)
                    say('THE VEIL FADES')
                } else if (e.type === 'lost') {
                    // #1612 item 1: whoever had you in their sights just blinked.
                    const f = e.kind === 'giant' ? 340 : e.kind === 'wolf' ? 880 : 720
                    audioController.playSweep(f, f * 0.78, 0.14, 'triangle', 0.035)
                    audioController.playSweep(f * 0.78, f * 1.1, 0.16, 'triangle', 0.022, 0.13)
                    if (e.kind === 'wizard') say('THE WIZARD LOSES YOU')
                } else if (e.type === 'zap') {
                    audioController.playNoise(0.16, 0.09)
                    audioController.playSweep(1500, 260, 0.2, 'square', 0.06)
                    audioController.playTone(210, 0.26, 'triangle', 0.028, 0.14)
                    audioController.playTone(140, 0.4, 'triangle', 0.016, 0.3)
                } else if (e.type === 'heal') {
                    audioController.playTone(660, 0.09, 'sine', 0.06)
                    audioController.playTone(880, 0.14, 'sine', 0.06, 0.09)
                }
                else if (e.type === 'learn') {
                    audioController.playTone(523, 0.09, 'square', 0.06)
                    audioController.playTone(659, 0.09, 'square', 0.06, 0.09)
                    audioController.playTone(784, 0.14, 'square', 0.06, 0.18)
                    say(`${spellById(e.id).name} LEARNED!`)
                } else if (e.type === 'equip') {
                    // Any equip (keys, pad or the touch spellbook) names its spell.
                    audioController.playTone(540, 0.04, 'triangle', 0.045)
                    audioController.playTone(760, 0.06, 'triangle', 0.04, 0.05)
                    say(spellById(e.id)?.name ?? 'SPELL READY')
                } else if (e.type === 'fizzle') {
                    audioController.playSweep(420, 130, 0.24, 'triangle', 0.06)
                    say('THE SPELL ELUDES YOU')
                } else if (e.type === 'boom') {
                    audioController.playNoise(0.28, 0.11)
                    audioController.playTone(70, 0.18, 'square', 0.07)
                    audioController.playTone(58, 0.28, 'square', 0.032, 0.15)
                    audioController.playTone(46, 0.42, 'square', 0.018, 0.32)
                    shake = Math.max(shake, 4)
                } else if (e.type === 'volcano') {
                    // The ground tears open: a long sub-bass rumble under the
                    // boom chorus, the longest shake the carpet ever feels.
                    audioController.playNoise(0.9, 0.12)
                    audioController.playSweep(90, 34, 1.1, 'sawtooth', 0.1)
                    audioController.playTone(41, 0.9, 'square', 0.05, 0.25)
                    shake = 10
                    say('THE EARTH OPENS — A VOLCANO RISES')
                } else if (e.type === 'shatter') {
                    // The payoff: everything alive in the ring went at once — a
                    // glass bell cascade, no dirt, no fire. Clean death rings.
                    audioController.playNoise(0.08, 0.05)
                    audioController.playTone(1560, 0.1, 'sine', 0.05)
                    audioController.playTone(1170, 0.14, 'sine', 0.045, 0.07)
                    audioController.playTone(880, 0.22, 'sine', 0.04, 0.15)
                    say('SHATTER — THE CREATURES FALL')
                } else if (e.type === 'raise') {
                    // The ground answers: a deep upward swell and a dust shake.
                    audioController.playSweep(55, 150, 0.5, 'sawtooth', 0.09)
                    audioController.playNoise(0.3, 0.05)
                    shake = Math.max(shake, 4)
                    say('THE GROUND RISES')
                } else if (e.type === 'dissolve') {
                    // The land giving way: a long drown-undertow under the
                    // splash, and the sea claims the map from here on.
                    audioController.playNoise(0.5, 0.1)
                    audioController.playSweep(180, 44, 0.8, 'sine', 0.08)
                    shake = Math.max(shake, 5)
                    say('THE LAND DISSOLVES — THE SEA FLOODS IN')
                } else if (e.type === 'crumble') {
                    // #1697: the ground finishes dropping and says so. Routed on
                    // the muffle bus (#1612) — one-shot SFX bypass that bus, so
                    // an unmuffled thud would cut the veil's hush; these are
                    // heard *through* the carpet while veiled. Size scales the
                    // note, proximity scales everything: distant casts land silent.
                    const f = crumbleFeel(gs, e)
                    if (f.shake > 0.3) shake = Math.max(shake, f.shake)
                    if (f.vol > 0.03) {
                        const size = Math.min(1, e.mag / 12)
                        if (e.kind === 'dissolve') {
                            // the sea pouring into a new wound: a glide down into
                            // a thick low glug
                            audioController.ambSweep(300, 70, 0.42, 'sine', 0.1 * f.vol)
                            audioController.ambTone(88, 0.12, 'triangle', 0.07 * f.vol, 0.18)
                        } else {
                            // sub-bass thud: bigger craters sit lower and longer
                            audioController.ambTone(66 - size * 24, 0.14 + size * 0.24, 'square', 0.11 * f.vol)
                            audioController.ambTone(41 - size * 8, 0.3 + size * 0.3, 'square', 0.05 * f.vol, 0.08)
                        }
                    }
                } else if (e.type === 'dissolveHut') {
                    // A hut swallowed whole: one muffled gulp of water.
                    audioController.playSweep(300, 90, 0.22, 'triangle', 0.05)
                    audioController.playNoise(0.1, 0.04)
                } else if (e.type === 'clone') {
                    // The payoff: every ring it caught stands twice. One rising
                    // jade pair per copy (capped so a full ring stays musical,
                    // not noisy), then the world's verdict in words.
                    const n = Math.min(e.count, 4)
                    for (let k = 0; k < n; k++) {
                        audioController.playSweep(520 + k * 110, 1040 + k * 130, 0.14, 'triangle', 0.045, k * 0.07)
                    }
                    if (e.count > 0) {
                        say(e.count === 1 ? 'A CREATURE STANDS TWICE' : `CLONE — ${e.count} CREATURES DOUBLED`)
                        shake = Math.max(shake, 2)
                    } else {
                        say('THE MIRROR FINDS NOTHING HERE')
                    }
                } else if (e.type === 'wizHit') {
                    audioController.playTone(240, 0.07, 'square', 0.06)
                } else if (e.type === 'wizardDown') {
                    audioController.playNoise(0.5, 0.12)
                    audioController.playSweep(300, 50, 0.7, 'sawtooth', 0.09)
                    shake = 8
                    say('THE RIVAL WIZARD FALLS — HIS TREASURE SCATTERS')
                } else if (e.type === 'towerDown') {
                    audioController.playNoise(0.55, 0.12)
                    audioController.playTone(60, 0.3, 'square', 0.08)
                    shake = Math.max(shake, 6)
                    say('THE WIZARD\'S TOWER TOPPLES')
                } else if (e.type === 'wizfire') {
                    // #1746 item 7: the bolt lights up the sky WHERE the wizard
                    // stands — the crack tilts to his side, and a cast from outside
                    // the nose reads longer and softer, heard over the shoulder.
                    const br = castBearing(gs, e.x, e.y)
                    audioController.playSweep(920, 380, br.behind ? 0.18 : 0.14, 'sawtooth',
                        br.behind ? 0.04 : 0.05, br.pan)
                }
                else if (e.type === 'rocksling') audioController.playNoise(0.07, 0.05)
                else if (e.type === 'bite') audioController.playTone(170, 0.06, 'square', 0.05)
                else if (e.type === 'hurt') {
                    audioController.playNoise(0.1, 0.07)
                    audioController.playTone(120, 0.09, 'square', 0.06)
                    hurtFlash = 8
                    shake = Math.max(shake, 3)
                } else if (e.type === 'shieldHit') audioController.playTone(980, 0.05, 'sine', 0.05)
                else if (e.type === 'respawn') {
                    audioController.playSweep(220, 540, 0.3, 'sine', 0.07)
                    say('THE CASTLE RESTORES YOU')
                } else if (e.type === 'stage') {
                    audioController.playTone(392, 0.1, 'square', 0.06)
                    audioController.playTone(523, 0.1, 'square', 0.06, 0.1)
                    audioController.playTone(659, 0.16, 'square', 0.06, 0.2)
                    say(`THE CASTLE GROWS — STAGE ${e.n}`)
                } else if (e.type === 'spawn') audioController.playTone(140, 0.1, 'triangle', 0.05)
                else if (e.type === 'win') {
                    audioController.playTone(523, 0.12, 'square', 0.07)
                    audioController.playTone(659, 0.12, 'square', 0.07, 0.12)
                    audioController.playTone(784, 0.12, 'square', 0.07, 0.24)
                    audioController.playTone(1046, 0.34, 'square', 0.07, 0.36)
                    say('EQUILIBRIUM RESTORED')
                    finish(true)
                } else if (e.type === 'dead') {
                    audioController.playSweep(320, 40, 1, 'sawtooth', 0.1)
                    say('THE CARPET FALLS…')
                    finish(false)
                } else if (e.type === 'deny' || e.type === 'nomana') {
                    audioController.playTone(90, 0.06, 'square', 0.05)
                    if (e.type === 'nomana') say('NOT ENOUGH MANA')
                }
            }
        }

        const doSim = (inp) => {
            step(gs, inp)
            const evts = gs.events.splice(0)
            if (renderer) renderer.handleEvents(evts, gs)
            handleEvents(evts)
        }

        const tickDemo = () => {
            upHold = 0; boostOn = false; boostPrev = false
            if (gs.end || demoT > 2600) { demoSeed = (demoSeed * 31 + 17) % 9973; gs = makeGame(demoSeed); demoT = 0 }
            demoT++
            const ap = autopilot(gs)
            eff.l = !!ap.left; eff.r = !!ap.right; eff.u = !!ap.up; eff.d = !!ap.down
            doSim(ap)
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            upHold = keys.u ? upHold + 1 : 0
            boostOn = boostKey || upHold >= 24
            let castL = throwL, castR = throwR
            if (watchingRef.current && !gs.end) {
                // #1637 WATCH: sim.js's autopilot takes the carpet — the same
                // closed-loop brain the attract demo flies and carpetcheck wins
                // all three worlds with, 60 seeds deep. It re-decides from LIVE
                // state every tick, so a watched run is a real run, not a replay.
                const ap = autopilot(gs)
                eff.l = !!ap.left; eff.r = !!ap.right; eff.u = !!ap.up; eff.d = !!ap.down
                boostOn = !!ap.boost
                castL = !!ap.a; castR = !!ap.b
            } else {
                eff.l = keys.l; eff.r = keys.r; eff.u = keys.u; eff.d = keys.d
            }
            // #1612 item 4: while veiled the world bed is heard through the carpet.
            audioController.setMuffle(muffleOf(gs))
            if (boostOn && !boostPrev) audioController.ambSweep(220, 520, 0.22, 'sine', 0.05)
            if (boostOn && gs.tick % 12 === 0) audioController.ambNoise(0.06, 0.02)
            if (gs.tick % 46 === 0) audioController.ambSweep(74, 58, 0.5, 'sine', boostOn ? 0.028 : 0.015)
            if (bankHum > 0) {
                if (gs.tick % 9 === 0) audioController.ambTone(98 + (gs.tick % 3) * 7, 0.2, 'sine', 0.022)
                bankHum--
            }
            if (gs.tick % 170 === 0) {
                const near = gs.monsters.find((m) => m.kind !== 'cow' &&
                    Math.hypot(((m.x - gs.x + MAP / 2) % MAP + MAP) % MAP - MAP / 2, ((m.y - gs.y + MAP / 2) % MAP + MAP) % MAP - MAP / 2) < 95)
                if (near) {
                    audioController.ambTone(near.kind === 'giant' ? 44 : 62, 0.34, 'sawtooth', 0.026)
                    audioController.ambTone(near.kind === 'giant' ? 33 : 47, 0.5, 'sawtooth', 0.016, 0.2)
                }
            }
            boostPrev = boostOn
            doSim({
                left: eff.l, right: eff.r, up: eff.u, down: eff.d,
                castL, castR, boost: boostOn,
            })
            throwL = throwR = false
        }

        const paintCarpetAndHands = (bk = 0) => {
            const sway = (eff.r ? 3 : 0) + (eff.l ? -3 : 0) + bk * 26 // #1637: follows the FLOWN pad
            const squash = Math.abs(bk) * 4
            const bob = Math.sin(gs.tick * 0.09) * 1.5
            // The veil (#1610): while invisible the carpet and hands shimmer
            // at ghost alpha; VA is 1 whenever the veil is down.
            const VA = gs.invis > 0 ? 0.35 + Math.sin(gs.tick * 0.25) * 0.08 : 1
            ctx.globalAlpha = VA
            if (boostOn) {
                ctx.globalAlpha = 0.3 * VA
                ctx.fillStyle = '#dfe8f5'
                for (let i = 0; i < 4; i++) {
                    const yy = 40 + ((gs.tick * 3 + i * 37) % (H - HUD_H - 52))
                    ctx.fillRect(6 + i * 5, yy, 1, 7)
                    ctx.fillRect(W - 7 - i * 5, yy + 11, 1, 7)
                }
                ctx.globalAlpha = VA
            }
            const stretch = boostOn ? 4 : 0
            const flut = boostOn ? 2.3 : 1.1
            const flapL = Math.sin(gs.tick * 0.26) * flut
            const flapR = Math.sin(gs.tick * 0.26 + Math.PI) * flut
            const baseY = H - HUD_H
            const yL = baseY - bk * 5
            const yR = baseY + bk * 5
            const yC = baseY - bk * 2.5
            ctx.fillStyle = '#8a1f28'
            ctx.beginPath()
            ctx.moveTo(96 + sway, yL); ctx.lineTo(150 + sway, yC); ctx.lineTo(128 + sway + bk * 6, baseY - 16 + bob - stretch + flapL + squash); ctx.closePath(); ctx.fill()
            ctx.beginPath()
            ctx.moveTo(170 + sway, yC); ctx.lineTo(224 + sway, yR); ctx.lineTo(192 + sway + bk * 6, baseY - 16 + bob - stretch + flapR + squash); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#b8303c'
            ctx.beginPath()
            ctx.moveTo(104 + sway, yL + bk); ctx.lineTo(144 + sway, yC); ctx.lineTo(128 + sway + bk * 4, baseY - 11 + bob - stretch + flapL * 0.6 + squash); ctx.closePath(); ctx.fill()
            ctx.beginPath()
            ctx.moveTo(176 + sway, yC); ctx.lineTo(216 + sway, yR - bk); ctx.lineTo(192 + sway + bk * 4, baseY - 11 + bob - stretch + flapR * 0.6 + squash); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#d8a840'
            for (let i = 0; i < 4; i++) {
                ctx.fillRect(100 + i * 12 + sway, H - HUD_H - 2, 2, 2)
                ctx.fillRect(178 + i * 12 + sway, H - HUD_H - 2, 2, 2)
            }
            const handY = (fl) => H - HUD_H - 2 + (fl > 0 ? -10 - fl : 0)
            ctx.fillStyle = '#caa888'
            ctx.fillRect(118 + sway, handY(flashL), 7, 8)
            ctx.fillRect(196 + sway, handY(flashR), 7, 8)
            const orbL = gs.hands.L ? SPELL_COLORS[gs.hands.L] : null
            const orbR = gs.hands.R ? SPELL_COLORS[gs.hands.R] : null
            if (flashL > 0 && orbL) { ctx.fillStyle = orbL; ctx.beginPath(); ctx.arc(121 + sway, handY(flashL) - 3, 3.4, 0, Math.PI * 2); ctx.fill() }
            if (flashR > 0 && orbR) { ctx.fillStyle = orbR; ctx.beginPath(); ctx.arc(199 + sway, handY(flashR) - 3, 3.4, 0, Math.PI * 2); ctx.fill() }
            const orbReady = (id, cool) => id && cool <= 0 && gs.mana >= (spellById(id)?.cost ?? 99)
            if (!(flashL > 0) && orbReady(gs.hands.L, gs.coolL)) {
                ctx.globalAlpha = (0.4 + Math.sin(gs.tick * 0.15) * 0.12) * VA
                ctx.fillStyle = orbL; ctx.beginPath(); ctx.arc(121 + sway, handY(0) - 3, 2.4, 0, Math.PI * 2); ctx.fill()
                ctx.globalAlpha = VA
            }
            if (!(flashR > 0) && orbReady(gs.hands.R, gs.coolR)) {
                ctx.globalAlpha = (0.4 + Math.sin(gs.tick * 0.15 + 2) * 0.12) * VA
                ctx.fillStyle = orbR; ctx.beginPath(); ctx.arc(199 + sway, handY(0) - 3, 2.4, 0, Math.PI * 2); ctx.fill()
                ctx.globalAlpha = VA
            }
            if (gs.heldEnt) {
                ctx.fillStyle = '#58e8d8'
                ctx.beginPath(); ctx.arc(W / 2, H - HUD_H - 30 + Math.sin(gs.tick * 0.2), 4, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#9a6a3a'
                ctx.beginPath(); ctx.arc(W / 2, H - HUD_H - 30 + Math.sin(gs.tick * 0.2), 2.4, 0, Math.PI * 2); ctx.fill()
            }
            ctx.fillStyle = '#e8e8f0'
            ctx.fillRect(W / 2 - 5, HORIZON + 16, 2, 1)
            ctx.fillRect(W / 2 + 3, HORIZON + 16, 2, 1)
            ctx.fillRect(W / 2, HORIZON + 13, 1, 2)
            if (gs.shield > 0) {
                ctx.globalAlpha = (0.25 + Math.sin(gs.tick * 0.2) * 0.1) * VA
                ctx.strokeStyle = '#58c8ff'
                ctx.lineWidth = 1
                ctx.beginPath(); ctx.ellipse(W / 2, H - HUD_H - 24, 46, 26, 0, 0, Math.PI * 2); ctx.stroke()
            }
            ctx.globalAlpha = 1
        }

        const paintHud = () => {
            const y0 = H - HUD_H
            const g = ctx.createLinearGradient(0, y0, 0, H)
            g.addColorStop(0, '#2c3678')
            g.addColorStop(1, '#161c48')
            ctx.fillStyle = g
            ctx.fillRect(0, y0, W, HUD_H)
            ctx.fillStyle = '#46529a'
            ctx.fillRect(0, y0, W, 1)
            ctx.fillStyle = '#0e1230'
            ctx.fillRect(0, H - 1, W, 1)
            for (let i = 6; i < W; i += 24) {
                ctx.fillStyle = '#5a66aa'
                ctx.fillRect(i, y0 + 2, 1, 1)
            }
            // radar
            ctx.fillStyle = '#0e1a38'
            ctx.beginPath(); ctx.arc(17, y0 + 14, 11, 0, Math.PI * 2); ctx.fill()
            ctx.strokeStyle = '#5a66aa'
            ctx.stroke()
            if (gs.invis > 0) {
                // Veil cue (#1612): the radar reads cyan behind the veil — tinted
                // glass plus a sweeping arc, so "they cannot see you" shows at a glance.
                ctx.fillStyle = 'rgba(168, 236, 255, 0.10)'
                ctx.beginPath(); ctx.arc(17, y0 + 14, 10, 0, Math.PI * 2); ctx.fill()
                const sweep = gs.tick * 0.07
                ctx.strokeStyle = '#a8ecff'
                ctx.lineWidth = 1
                for (let k = 0; k < 3; k++) {
                    ctx.globalAlpha = 0.5 - k * 0.15
                    ctx.beginPath()
                    ctx.moveTo(17, y0 + 14)
                    ctx.arc(17, y0 + 14, 10, sweep - k * 0.55, sweep - k * 0.55 + 0.16)
                    ctx.closePath(); ctx.stroke()
                }
                ctx.globalAlpha = 1
            }
            const sc = 11 / 240
            const dot = (wx, wy, col, sz = 1) => {
                const dx = ((wx - gs.x + MAP / 2) % MAP + MAP) % MAP - MAP / 2
                const dy = ((wy - gs.y + MAP / 2) % MAP + MAP) % MAP - MAP / 2
                const fwd = dx * Math.cos(gs.yaw) + dy * Math.sin(gs.yaw)
                const side = -dx * Math.sin(gs.yaw) + dy * Math.cos(gs.yaw)
                const rx = 17 + side * sc, ry = y0 + 14 - fwd * sc
                if ((rx - 17) ** 2 + (ry - y0 - 14) ** 2 > 100) return
                ctx.fillStyle = col
                ctx.fillRect(rx - sz / 2, ry - sz / 2, sz, sz)
            }
            for (const p of gs.pearls) if (p.alive) dot(p.x, p.y, '#e8e0c0')
            for (const m of gs.monsters) dot(m.x, m.y, m.kind === 'cow' ? '#d8d0c0' : '#e05040', 1.6)
            for (const b of gs.books) if (!b.taken) dot(b.x, b.y, '#40e0d0')
            for (const hs of gs.huts) dot(hs.x, hs.y, hs.dead ? '#5a5262' : '#c89040', 1.2)
            for (const fm of gs.fireMarks) dot(fm.x, fm.y, '#ff5030', 1.6)
            dot(gs.castle.x, gs.castle.y, '#ffd84a', 2.4)
            if (gs.wizard.alive) dot(gs.wizard.x, gs.wizard.y, '#c060ff', 2.4)

            // vault bar (banked mana = the score) + carried pouch
            ctx.fillStyle = '#0e1a38'
            ctx.fillRect(34, y0 + 6, 130, 7)
            const fill = Math.min(1, gs.bank / gs.quota)
            ctx.fillStyle = '#e8b830'
            ctx.fillRect(35, y0 + 7, 128 * fill, 5)
            ctx.fillStyle = '#0e1a38'
            for (let q = 1; q < 5; q++) ctx.fillRect(34 + (130 * q) / 5, y0 + 6, 1, 7)
            const seg = Math.min(5, Math.floor(fill * 5))
            if (seg > prevSeg) { if (prevSeg >= 0) vaultFlash = 8; prevSeg = seg }
            else if (seg < prevSeg) prevSeg = seg
            if (vaultFlash > 0) {
                ctx.globalAlpha = (vaultFlash / 8) * 0.8
                ctx.fillStyle = '#fff'
                ctx.fillRect(35, y0 + 7, 128 * fill, 5)
                ctx.globalAlpha = 1
                vaultFlash--
            }
            ctx.fillStyle = '#ffd860'
            ctx.font = '6px monospace'
            ctx.fillText(`VAULT ${Math.floor(gs.bank)}/${gs.quota}`, 34, y0 + 21)
            ctx.fillStyle = '#0e1a38'
            ctx.fillRect(170, y0 + 6, 34, 7)
            ctx.fillStyle = '#f0d060'
            ctx.fillRect(171, y0 + 7, 32 * Math.min(1, gs.mana / 40), 5)
            ctx.fillStyle = '#ffe9a0'
            ctx.fillText(`CARRY ${Math.floor(gs.mana)}`, 168, y0 + 21)
            ctx.fillStyle = 'rgba(232, 200, 96, 0.85)'
            ctx.font = '7px monospace'
            ctx.fillText(`WORLD ${gs.level + 1}/${LEVELS.length}`, 6, 12)
            // #1790 glasses reminder: two colored pips, red-over-cyan, when the
            // anaglyph is live. Small, top-left, out of the radar's way.
            if (stereo) {
                ctx.fillStyle = 'rgba(14, 26, 56, 0.8)'
                ctx.fillRect(5, 15, 30, 8)
                ctx.fillStyle = '#ff4848'
                ctx.fillRect(8, 17, 4, 4)
                ctx.fillStyle = '#48e0e0'
                ctx.fillRect(14, 17, 4, 4)
                ctx.fillStyle = '#ffd860'
                ctx.font = '5px monospace'
                ctx.fillText('3D', 21, 21)
                ctx.font = '7px monospace'
            }
            // hearts
            for (let i = 0; i < 5; i++) {
                const full = gs.hp >= (i + 1) * 20
                const half = !full && gs.hp > i * 20
                ctx.fillStyle = '#401018'
                ctx.fillRect(210 + i * 9, y0 + 5, 7, 6)
                ctx.fillStyle = full ? '#e83848' : half ? '#e83848' : 'transparent'
                if (full) ctx.fillRect(211 + i * 9, y0 + 6, 5, 4)
                else if (half) ctx.fillRect(211 + i * 9, y0 + 6, 2, 4)
            }
            ctx.fillStyle = '#ffd860'
            ctx.fillText('LIFE', 212, y0 + 21)
            // hands
            const slot = (x, id, cool, label) => {
                ctx.fillStyle = '#0e1a38'
                ctx.fillRect(x, y0 + 3, 14, 14)
                const ready = id && cool <= 0 && gs.mana >= (spellById(id)?.cost ?? 0)
                ctx.strokeStyle = ready ? '#ffd84a' : '#3a4478'
                ctx.strokeRect(x + 0.5, y0 + 3.5, 13, 13)
                if (id) drawSpellIcon(ctx, id, x + 7, y0 + 10, 4)
                ctx.fillStyle = '#8890c0'
                ctx.fillText(label, x + 5, y0 + 24)
            }
            slot(262, gs.hands.L, gs.coolL, 'A')
            slot(284, gs.hands.R, gs.coolR, 'X')
            // Spellbook tab (#1612): the original equipped hands by CLICKING the
            // HUD — this gold tab is that door for touch. Tapping it (or the two
            // hand slots) works on a phone; keys 1–8/Q stay as they were.
            {
                const [bx, by, bw, bh] = TAP.book
                ctx.fillStyle = '#0e1a38'
                ctx.fillRect(bx, by, bw, bh)
                ctx.strokeStyle = gs.book ? '#ffe9a0' : '#5a66aa'
                ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1)
                ctx.fillStyle = gs.learned.length > 1 ? '#ffd860' : '#6a6fa0'
                ctx.fillRect(bx + 4, by + 3, 6, 10)
                ctx.fillRect(bx + 11, by + 3, 6, 10)
                ctx.fillStyle = '#0e1a38'
                ctx.fillRect(bx + 9, by + 3, 3, 10)
                ctx.fillStyle = gs.book ? '#ffe9a0' : '#8890c0'
                ctx.font = '5px monospace'
                ctx.fillText('SPELLS', bx + 20, by + 11)
                if (gs.learned.length > 1 && !gs.book) {
                    ctx.globalAlpha = 0.25 + Math.sin(gs.tick * 0.12) * 0.15
                    ctx.strokeStyle = '#ffd860'
                    ctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, bh + 1)
                    ctx.globalAlpha = 1
                }
            }
            if (gs.book) {
                // The tray: all twelve spells, unlearned dimmed, left-hand pick
                // boxed gold; mana cost under each icon (green-gold when payable).
                const [tx, ty, tw, th] = TRAY
                ctx.fillStyle = 'rgba(14, 20, 60, 0.92)'
                ctx.fillRect(tx - 4, ty - 4, tw + 8, th + 8)
                ctx.strokeStyle = '#5a66aa'
                ctx.strokeRect(tx - 3.5, ty - 3.5, tw + 7, th + 7)
                ctx.fillStyle = '#8890c0'
                ctx.font = 'bold 6px monospace'
                ctx.fillText('LEFT HAND', tx, ty - 6)
                SPILLS.forEach((sp, i) => {
                    const known = gs.learned.includes(sp.id)
                    const cx = tx + i * 14 + 7
                    ctx.globalAlpha = known ? 1 : 0.3
                    if (known && gs.hands.L === sp.id) {
                        ctx.strokeStyle = '#ffd84a'
                        ctx.strokeRect(tx + i * 14 + 0.5, ty + 0.5, 13, th - 1)
                    }
                    drawSpellIcon(ctx, sp.id, cx, ty + 7, 4)
                    // #1646: costs at 7px bold (the 5px digits vanished at phone
                    // scale) plus a keycap row — 1–9,0 — so RAISE-on-0 is seen,
                    // not memorized.
                    ctx.fillStyle = known && gs.mana >= sp.cost ? '#ffe9a0' : '#6a6fa0'
                    ctx.font = 'bold 7px monospace'
                    ctx.textAlign = 'center'
                    ctx.fillText(String(sp.cost), cx, ty + 15)
                    ctx.fillStyle = '#9aa2cf'
                    ctx.font = 'bold 6px monospace'
                    ctx.fillText('1234567890-='[i], cx, ty + 21)
                    ctx.textAlign = 'left'
                    ctx.globalAlpha = 1
                })
            }
            // score — right-aligned inside the canvas (#1681): at x=302 the six
            // 7px digits ran to ~327px and clipped past W in every orientation.
            // 6px keeps all six digits in the free [298, W] window right of the
            // hand slots.
            ctx.fillStyle = '#fff'
            ctx.font = '6px monospace'
            ctx.textAlign = 'right'
            ctx.fillText(String(gs.score).padStart(6, '0'), W - 2, y0 + 11)
            ctx.textAlign = 'left'
            if (toast > 0) {
                const a = toast > 120 ? 1 : toast / 120
                ctx.globalAlpha = a
                ctx.fillStyle = '#ffe9a0'
                ctx.font = 'bold 9px monospace'
                ctx.textAlign = 'center'
                ctx.fillText(toastMsg, W / 2, 24)
                ctx.textAlign = 'left'
                ctx.globalAlpha = 1
                if (!pausedRef.current) toast--
            }
            if (gs.wizSlow > 0) {
                ctx.globalAlpha = 0.08
                ctx.fillStyle = '#8040ff'
                ctx.fillRect(0, 0, W, H - HUD_H)
                ctx.globalAlpha = 1
            }
            if (gs.invis > 0) {
                // a cold cyan ripple over the view + a veil-timer bar under the vault
                ctx.globalAlpha = 0.05 + Math.sin(gs.tick * 0.18) * 0.02
                ctx.fillStyle = '#a8ecff'
                ctx.fillRect(0, 0, W, H - HUD_H)
                ctx.globalAlpha = 1
                ctx.fillStyle = '#0e1a38'
                ctx.fillRect(34, y0 + 2, 130, 2)
                ctx.fillStyle = '#a8ecff'
                ctx.fillRect(35, y0 + 2, 128 * Math.min(1, gs.invis / INVIS_T), 1)
            }
            if (hurtFlash > 0) {
                ctx.globalAlpha = hurtFlash / 24
                ctx.fillStyle = '#e02030'
                ctx.fillRect(0, 0, W, H - HUD_H)
                ctx.globalAlpha = 1
                hurtFlash--
            }
        }

        let prevYaw = gs.yaw
        let lastVisTick = -1
        const paint = () => {
            const sx = shake > 0 ? ((performance.now() % 7) - 3) * shake * 0.35 : 0
            const sy = shake > 0 ? ((performance.now() % 5) - 2) * shake * 0.35 : 0
            if (shake > 0) { shake *= 0.85; if (shake < 0.35) shake = 0 }
            const visual = gs.tick !== lastVisTick
            lastVisTick = gs.tick
            if (visual) {
                if (flashL > 0) flashL--
                if (flashR > 0) flashR--
                const steer = (eff.r ? 1 : 0) - (eff.l ? 1 : 0) // #1637: bank follows the pilot too
                const yawDelta = gs.yaw - prevYaw
                prevYaw = gs.yaw
                const bankTarget = screenRef.current === 'play' ? steer : Math.max(-1, Math.min(1, yawDelta * 14))
                bankS += (bankTarget - bankS) * 0.12
                sinkS += (Math.max(-1.2, Math.min(1.2, (gs.alt - prevAlt) * 0.6)) - sinkS) * 0.15
                prevAlt = gs.alt
            }
            if (renderer) {
                renderer.frame(gs, {
                    bank: bankS,
                    boost: boostOn || screenRef.current === 'attract',
                    pitch: 0.06 + (eff.d ? 0.05 : 0) - (eff.u ? 0.04 : 0),
                    sink: sinkS * 0.08,
                    shakeX: sx, shakeY: sy,
                })
            }
            ctx.clearRect(0, 0, W, H)
            ctx.save()
            ctx.translate(sx, sy)
            paintCarpetAndHands(screenRef.current === 'play' ? bankS : bankS * 0.5)
            ctx.restore()
            ctx.globalAlpha = 1
            paintHud()
            if (screenRef.current === 'attract') paintSelect()
        }

        // #1740 WORLD SELECT attract chrome: carved chevron plaques in the two
        // bottom corners (zones = sim.SEL, thumb-sized) with a gold pulse and
        // the picked world's name floating between them.
        const paintSelect = () => {
            const pulse = 0.55 + 0.45 * Math.sin(gs.tick * 0.1)
            const plaque = (x, dir) => {
                ctx.fillStyle = '#0e1a38'
                ctx.fillRect(x, SEL.y, SEL.zw, SEL.h)
                ctx.strokeStyle = `rgba(255, 216, 96, ${(0.35 + 0.4 * pulse).toFixed(3)})`
                ctx.lineWidth = 1
                ctx.strokeRect(x + 0.5, SEL.y + 0.5, SEL.zw - 1, SEL.h - 1)
                const cx = x + SEL.zw / 2, cy = SEL.y + SEL.h / 2
                ctx.fillStyle = '#ffd860'
                ctx.beginPath()
                if (dir === 'prev') { ctx.moveTo(cx + 5, cy - 7); ctx.lineTo(cx - 4, cy); ctx.lineTo(cx + 5, cy + 7) }
                else { ctx.moveTo(cx - 5, cy - 7); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx - 5, cy + 7) }
                ctx.closePath(); ctx.fill()
            }
            plaque(0, 'prev')
            plaque(W - SEL.zw, 'next')
            ctx.textAlign = 'center'
            ctx.font = 'bold 8px monospace'
            ctx.fillStyle = '#0e1a38'
            ctx.fillText(`WORLD ${selCur + 1} OF ${LEVELS.length} — ${LEVELS[selCur].name}`, W / 2 + 1, 141)
            ctx.fillStyle = '#ffd860'
            ctx.fillText(`WORLD ${selCur + 1} OF ${LEVELS.length} — ${LEVELS[selCur].name}`, W / 2, 140)
            ctx.font = '5px monospace'
            ctx.fillStyle = 'rgba(232, 200, 96, 0.8)'
            ctx.fillText('ARROWS OR TAP THE ARROWS PICK A WORLD · ANY KEY GOES', W / 2, 150)
            ctx.textAlign = 'left'
        }

        const startPlay = (level = 0) => {
            // #1740: launch at the world picked with ◀ ▶ (or a chevron tap).
            // The pin from ?seed=N keeps meaning with any level: makeGame
            // starts the rng stream identically and genWorld runs the same
            // deterministic order.
            const lv = Math.max(0, Math.min(LEVELS.length - 1, level >>> 0))
            const pin = seedFromQuery()
            gs = makeGame(pin != null ? pin >>> 0 : (performance.now() * 977) >>> 0, lv)
            demoT = 0
            if (renderer) renderer.resetWorld()
            keys.l = keys.r = keys.u = keys.d = false
            eff.l = eff.r = eff.u = eff.d = false
            throwL = throwR = false
            boostKey = boostOn = boostPrev = false; upHold = 0
            vaultFlash = 0; prevSeg = -1
            watchingRef.current = false; setWatching(false) // #1637 a new run starts in your hands
            setMode('play')
            say(`WORLD ${lv + 1} — ${LEVELS[lv].name} · FILL THE VAULT`)
            audioController.playSweep(330, 660, 0.25, 'square', 0.07)
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            // #1790: V is the glasses switch — it works on any screen, paused
            // included (nothing else claims KeyV, and a chart never needs 3D).
            if (e.code === 'KeyV' && !e.repeat) {
                stereo = !stereo
                if (renderer) renderer.setStereo(stereo)
                try { localStorage.setItem('mc-stereo', stereo ? '1' : '0') } catch { /* private mode */ }
                audioController.playTone(stereo ? 880 : 620, 0.05, 'square', 0.05)
                say(stereo ? 'ANAGLYPH ON — WEAR THE GLASSES' : 'STEREO OFF')
                return
            }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                // #1740 WORLD SELECT: ◀ ▶ pick the starting world (the pad sends
                // the same arrows); any other key/tap launches from the cursor.
                if (e.code === 'ArrowLeft' && !e.repeat) { selCur = cursorStep(selCur, -1); audioController.playTone(520, 0.06, 'square', 0.05); return }
                if (e.code === 'ArrowRight' && !e.repeat) { selCur = cursorStep(selCur, 1); audioController.playTone(660, 0.06, 'square', 0.05); return }
                startPlay(selCur); return
            }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current || e.repeat) return
            // #1637 WATCH: Y seats sim.js's autopilot (carpetcheck's 60-seed
            // winner) at any live position; any driving key takes the carpet
            // back — and that key still steers, so takeover is lossless.
            if (isWatchKey(e)) {
                if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
                else if (!gs.end) { watchingRef.current = true; setWatching(true); playWatchStart() }
                return
            }
            if (watchingRef.current && isTakeoverKey(e)) { watchingRef.current = false; setWatching(false); playWatchStop() }
            if (e.code === 'ArrowLeft') keys.l = true
            if (e.code === 'ArrowRight') keys.r = true
            if (e.code === 'ArrowUp') keys.u = true
            if (e.code === 'ArrowDown') keys.d = true
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') boostKey = true
            if (e.code === 'Space') throwL = true
            if (e.code === 'KeyX' || e.code === 'KeyZ') throwR = true
            if (e.code === 'KeyQ') cycleR(gs)
            const digit = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'].indexOf(e.code)
            if (digit >= 0 && SPILLS[digit]) setHand(gs, 'L', SPILLS[digit].id)
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
            if (e.code === 'ArrowUp') keys.u = false
            if (e.code === 'ArrowDown') keys.d = false
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') boostKey = false
        }
        const onBlur = () => { keys.l = keys.r = keys.u = keys.d = false; boostKey = false; upHold = 0; boostOn = false; boostPrev = false }
        const onPointer = (e) => {
            if (e.target instanceof Element && e.target.closest('[data-vc], button')) return
            const sc = screenRef.current
            if (sc === 'attract') {
                // #1740 WORLD SELECT: taps on the corner chevrons pick the world;
                // any other tap launches from the cursor (thumb-sized zones, sim).
                const rect = canvas.getBoundingClientRect()
                const hit = selectTap(
                    ((e.clientX - rect.left) / rect.width) * W,
                    ((e.clientY - rect.top) / rect.height) * H)
                if (hit === 'prev') { selCur = cursorStep(selCur, -1); audioController.playTone(520, 0.06, 'square', 0.05); return }
                if (hit === 'next') { selCur = cursorStep(selCur, 1); audioController.playTone(660, 0.06, 'square', 0.05); return }
                startPlay(selCur); return
            }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (sc === 'play' && !pausedRef.current) {
                // #1637 WATCH: a tap on the world means you want the carpet —
                // hand back; that tap does NOT also cast (lode-runner rule: the
                // wheel is the prize, the spell comes with the next tap).
                if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop(); return }
                // Map the tap into HUD space (the canvas is letterboxed in the
                // stage) and let sim.js route it: world taps cast, strip taps
                // cycle the hands, the book tab opens the tray (#1612).
                const rect = canvas.getBoundingClientRect()
                const hit = hudTap(gs,
                    ((e.clientX - rect.left) / rect.width) * W,
                    ((e.clientY - rect.top) / rect.height) * H)
                if (hit === 'world') {
                    if (e.button === 2) throwR = true
                    else throwL = true
                }
            }
        }
        const onCtx = (e) => e.preventDefault()
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        glCanvas.addEventListener('pointerdown', onPointer)
        canvas.addEventListener('pointerdown', onPointer)
        glCanvas.addEventListener('contextmenu', onCtx)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const dprCap = lite ? 1 : 1.5
            const dpr = Math.min(window.devicePixelRatio || 1, dprCap)
            if (renderer) renderer.resize(Math.round(r.width * dpr), Math.round(r.height * dpr))
            const sc = Math.min(r.width / W, r.height / H)
            const hw = Math.round(W * sc), hh = Math.round(H * sc)
            canvas.style.width = `${hw}px`
            canvas.style.height = `${hh}px`
            canvas.style.left = `${Math.round((r.width - hw) / 2)}px`
            canvas.style.top = `${Math.round((r.height - hh) / 2)}px`
        }
        window.addEventListener('resize', resize)
        resize()

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                if (contractHoldsLoop()) { acc = 0 }
                else {
                    acc += ft
                    while (acc >= FIXED_DT) { doFrameSim(); acc -= FIXED_DT }
                }
            }
            paint()
        }
        raf = requestAnimationFrame(frame)

        // #1473 seedpin: the world is a seeded LCG heightmap (sim.js) and the
        // human start used wall-clock entropy — ?seed=N now outranks it, and
        // every build reports the seed so filed notes replay the exact world.
        exposeFeedbackState(() => ({
            tick: gs.tick, score: gs.score, done: gs.end !== null,
            seed: gs.seed, level: gs.level, bank: Math.floor(gs.bank),
        }))

        if (import.meta.env.DEV) {
            window.__carpetTest = {
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, end: gs.end, score: gs.score,
                    mana: gs.mana, hp: gs.hp, deaths: gs.deaths, kills: gs.kills,
                    bank: Math.floor(gs.bank), level: gs.level, quota: gs.quota,
                    wizAlive: gs.wizard.alive, wizHp: gs.wizard.hp,
                    learned: [...gs.learned], hands: { ...gs.hands },
                    x: +gs.x.toFixed(2), y: +gs.y.toFixed(2), alt: +gs.alt.toFixed(2), yaw: +gs.yaw.toFixed(4),
                    pearlsAlive: gs.pearls.filter((p) => p.alive).length,
                    projs: gs.projs.length, keys: { ...keys }, boost: boostOn,
                    towerDown: gs.towerDown, craters: gs.craters.length,
                    invis: gs.invis, book: gs.book,
                    casts: castsSeen, seed: gs.seed,
                    sel: selCur, // #1740 WORLD SELECT cursor
                }),
                selectTap: (x, y) => selectTap(x, y),
                cursor: (d) => { selCur = cursorStep(selCur, d | 0); return selCur },
                watching: () => watchingRef.current,
                watchSfx: watchSfxLog,
                start: startPlay,
                tap: (x, y) => hudTap(gs, x, y),
                hash: () => stateHash(gs),
                gl2: () => !!renderer,
                muffle: () => audioController.ambTarget,
                digHot: () => {
                    gs.quota = 999999
                    crater(gs, gs.x + Math.cos(gs.yaw) * 70, gs.y + Math.sin(gs.yaw) * 70, 16, 10, 1)
                    settleGround(gs) // #1694: the dig gates read the LANDED crater, not the window
                    return gs.craters.length
                },
                // #1703 (phone proof): queue the same crater digHot lands — but
                // leave the crumble window OPEN so a pass can capture mid-window
                // (rim peak) vs settled. deforms() reports each deform's age so
                // the caller can step to a=CRUMBLE_T/2 and no further.
                craterAt: (x, y, r, depth, hot = 0) => { crater(gs, x, y, r, depth, hot); return gs.deforms.length },
                deforms: () => gs.deforms.map((d) => ({ a: d.a, kind: d.kind, x: d.x, y: d.y, mag: d.mag, rimAmp: d.rimAmp })),
                // #1703: pin the carpet (pos/alt) after a step so the loop-hold
                // world renders from ONE fixed viewpoint — the phone-proof gates
                // compare rim-peak vs settled frames at the same camera.
                holdCarpet: (x, y, alt) => {
                    const wmap = (v) => ((v % MAP) + MAP) % MAP
                    gs.x = wmap(x); gs.y = wmap(y)
                    if (Number.isFinite(alt)) gs.alt = alt
                    return { x: gs.x, y: gs.y, alt: gs.alt }
                },
                fx: (e) => { handleEvents([e]); if (renderer) renderer.handleEvents([e], gs) },
                sfx: () => audioController.sfx,
                carpet: () => ({ x: gs.x, y: gs.y, seed: gs.seed }),
                veil: () => { gs.invis = 400; return gs.invis },
                killHut: () => { const hs = gs.huts[0]; hs.burn = 0; hs.dead = true; return 1 },
                // #1673 (phone pass): the browser-side tray/tap gates need a spell
                // learned without chasing grimoire RNG, and HUD->CSS px mapping for
                // real touchscreen taps at 390x844.
                arm: (id) => { if (!gs.learned.includes(id)) gs.learned.push(id); gs.mana = 100; gs.coolL = 0; gs.coolR = 0; return [...gs.learned] },
                // learn ≠ equip (sim #1612): gates that cast after reset must equip
                // explicitly, exactly as the tray tap or Minus key would.
                equipL: (id) => { if (gs.learned.includes(id)) gs.hands.L = id; return gs.hands.L },
                hudRect: () => { const r = canvas.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height } },
                smokePuffs: () => (renderer ? renderer.smokeCount() : -1),
                crumbles: () => (renderer ? renderer.ashCount() : -1),
                trailMotes: () => (renderer ? renderer.particleCount() : -1),
                glowCells: () => (renderer ? renderer.glowCells() : -1),
                scorchCells: () => (renderer ? renderer.scorchCells() : -1),
                // #1790: the harness drives glasses the way a player does.
                // setStereo here flips the mode WITHOUT touching localStorage —
                // persistence gates press the real V key instead.
                stereo: () => stereo,
                setStereo: (on) => { stereo = !!on; if (renderer) renderer.setStereo(stereo); return stereo },
                ipd: () => (renderer ? renderer.stereoIPD() : 0),
                pixels: (x, y, w, h) => {
                    if (!renderer) return null
                    const g = renderer.gl
                    const cw = renderer.renderer.domElement.width, ch = renderer.renderer.domElement.height
                    const px0 = Math.min(Math.max(0, Math.floor(x * cw)), cw - 1)
                    const py0 = Math.min(Math.max(0, Math.floor(ch - y * ch)), ch - 1)
                    const pw = Math.min(Math.max(1, w), cw - px0)
                    const ph = Math.min(Math.max(1, h), ch - py0)
                    const buf = new Uint8Array(pw * ph * 4)
                    g.readPixels(px0, py0, pw, ph, g.RGBA, g.UNSIGNED_BYTE, buf)
                    return Array.from(buf)
                },
                forceDeath: () => {
                    gs.shield = 0; gs.bank = 0; gs.mana = 0; gs.hp = 0; gs.end = 'dead'
                    gs.events.push({ type: 'dead' })
                },
            }
            mountDbg({
                title: 'MAGIC CARPET',
                getState: () => [
                    `VAULT ${Math.floor(gs.bank)}/${gs.quota} CARRY ${Math.floor(gs.mana)} WORLD ${gs.level + 1}/${LEVELS.length} stage ${gs.castleStage} hp ${Math.round(gs.hp)} shield ${gs.shield} deaths ${gs.deaths}`,
                    `wizard ${gs.wizard.alive ? `hp ${gs.wizard.hp} hoard ${gs.wizard.mana}` : 'SLAIN'} learned ${gs.learned.join(',')} hands ${gs.hands.L}/${gs.hands.R}`,
                    `veil ${gs.invis} ticks remaining`,
                    `pos ${gs.x.toFixed(0)},${gs.y.toFixed(0)} alt ${gs.alt.toFixed(0)} yaw ${gs.yaw.toFixed(2)} pearls ${gs.pearls.filter((p) => p.alive).length} monsters ${gs.monsters.length}`,
                    `screen ${screenRef.current} paused ${pausedRef.current} end ${gs.end} score ${gs.score}`,
                ],
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const clone = JSON.parse(JSON.stringify(gs))
                            clone.events = []
                            let t = 0
                            while (!clone.end && t < 60000) { step(clone, autopilot(clone)); t++ }
                            return clone.end === 'win'
                                ? `WINNABLE from here: vault quota banked at tick ${clone.tick} (${clone.score} pts)`
                                : `NOT winnable by the autopilot from here: end=${clone.end || 'timeout'} vault ${Math.floor(clone.bank)}/${clone.quota}`
                        },
                    },
                    { label: '+30 CARRY', run: () => { gs.mana += 30; return `carry ${Math.floor(gs.mana)}` } },
                    { label: 'LEARN ALL SPELLS', run: () => { for (const sp of SPILLS) if (!gs.learned.includes(sp.id)) gs.learned.push(sp.id); if (!gs.hands.R) gs.hands.R = 'lightning'; return 'spellbook full' } },
                    { label: 'WIZARD -20', run: () => { gs.wizard.hp -= 20; return `wizard hp ${gs.wizard.hp}` } },
                ],
            })
            let contractSeed = 0
            exposeGame({
                id: 'magic-carpet',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b', 'boost', 'cycleL', 'cycleR', 'book'],
                reset: (seed) => {
                    contractSeed = seed >>> 0
                    gs = makeGame(contractSeed)
                    demoT = 0
                    if (renderer) renderer.resetWorld()
                    keys.l = keys.r = keys.u = keys.d = false
                    eff.l = eff.r = eff.u = eff.d = false
                    throwL = throwR = false
                    boostKey = boostOn = boostPrev = false; upHold = 0
                    vaultFlash = 0; prevSeg = -1
                    watchingRef.current = false; setWatching(false) // #1637 a harness reset starts in your hands
                    setMode('play')
                },
                tick: (pad) => {
                    if (gs.end) { gs.tick += 1; handleEvents(gs.events.splice(0)); return }
                    boostOn = !!pad.boost
                    audioController.setMuffle(muffleOf(gs))
                    if (boostOn && !boostPrev) audioController.ambSweep(220, 520, 0.22, 'sine', 0.05)
                    boostPrev = boostOn
                    if (pad.cycleL) cycleL(gs)
                    if (pad.cycleR) cycleR(gs)
                    if (pad.book) gs.book = !gs.book
                    doSim({ left: pad.left, right: pad.right, up: pad.up, down: pad.down, castL: pad.a, castR: pad.b, boost: boostOn })
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: gs.end !== null,
                    seed: contractSeed, mana: Math.floor(gs.mana), hp: Math.round(gs.hp),
                    bank: Math.floor(gs.bank), level: gs.level,
                    deaths: gs.deaths, kills: gs.kills, wizAlive: gs.wizard.alive,
                    stage: gs.castleStage, hash: stateHash(gs), book: gs.book,
                }),
                canvas: () => glCanvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = s },
            })
        }

        return () => {
            unexposeFeedbackState()
            audioController.setMuffle(OPEN_CUTOFF) // leave the shared ambience bus open
            if (import.meta.env.DEV) { if (window.__carpetTest) delete window.__carpetTest; unexposeGame(); unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('resize', resize)
            glCanvas.removeEventListener('pointerdown', onPointer)
            canvas.removeEventListener('pointerdown', onPointer)
            glCanvas.removeEventListener('contextmenu', onCtx)
            cancelAnimationFrame(raf)
            if (renderer) renderer.dispose()
            canvas.remove()
            glCanvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])
    const play = screen === 'play'

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-4 text-center pointer-events-none">
                    <h1 className="text-4xl font-black" style={{ color: '#e8c860', textShadow: '0 0 18px #6a4ad0, 3px 3px 0 #3a1a5a' }}>MAGIC CARPET</h1>
                    <p className="text-purple-200/90 font-mono mt-1 text-sm">fly . gather mana . fly it home . restore nine worlds</p>
                    <p className="text-white font-mono font-bold mt-2 animate-pulse">TAP / PRESS ANY KEY TO START</p>
                    <AttractMessage
                        className="text-purple-100/80 font-mono text-[11px] mt-2 px-8 leading-4"
                        messages={[
                            'ARROWS STEER THE CARPET · IT BANKS AND CANNOT CRASH',
                            'A CASTS YOUR LEFT HAND · X YOUR RIGHT',
                            'TAP THE BOOK OR HAND SLOTS TO CHANGE SPELLS',
                            'GATHER MANA PEARLS · HOVER YOUR CASTLE TO FILL THE VAULT',
                            'DIE AND THE LOAD IS LOST',
                            'FIREBALLS CRATER THE LAND · BURNING VILLAGES BREED WOLVES',
                            'CAST INVISIBILITY AND WIZARD AND WOLVES LOOK RIGHT THROUGH YOU',
                            'NINE WORLDS · THREE ARCS OF THREE ATMOSPHERES · EACH GUARDED',
                        ]}
                    />
                    <span className="block mt-2 text-purple-200/70 font-mono font-bold tracking-wider">{WATCH_ATTRACT_HINT}</span>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-purple-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'EQUILIBRIUM RESTORED' : 'THE WORLDS KEEP THEIR MANA'}</h2>
                    <p className="text-lg mb-2">{end.score} pts · {end.deaths} fall{end.deaths === 1 ? '' : 's'} · {end.worlds}/{LEVELS.length} worlds</p>
                    <p className="text-purple-200/80 mb-4 text-sm">{end.win ? 'every vault holds its quota — the worlds are whole' : 'dying with an empty vault unravels the flight'}</p>
                    <p className="mt-2 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {/* #1637 WATCH — the prover flies the proven worlds; any input takes over. */}
            {screen === 'play' && watching && <WatchToast className="absolute z-50" />}
            {/* #1656 — the forgotten-how-to-play tap: start AND watch, one button. */}
            {screen === 'attract' && (
                <div className="absolute inset-x-0 z-[70] flex justify-center pointer-events-none" style={{ bottom: '24%' }}>
                    <AttractWatchButton />
                </div>
            )}
            {screen === 'play' && !paused && (
                <div className="absolute z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}
            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'MAGIC CARPET')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} secondAction={{ label: '✦', code: 'KeyX' }} />
        </div>
    )
}

export default MagicCarpetGame
