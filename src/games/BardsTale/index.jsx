// THE BARD'S TALE — the arcade shell. Runtime art only: a coloured raycast of
// the same grid the sim walks (256x224), animated procedural monster portraits
// sized by range band, a bright overhead map of Skara Brae, and a fog automap.
// The attract demo is the Node-proven solver driving THIS state machine live —
// bardscheck's witness and the attract walk are the same code.
//
// Layout: 1. fixed-timestep shell 2. input (arrows walk/turn; Space use/attack;
// clickable HUD for spells/songs/menus) 3. DEV hook + DebugKit 4. React HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import {
    makeRun, step, stateHash, cloneState, CFG, SPELLS, SONGS, GEAR, knownSpells, DX, DY, BANDS,
} from './sim.js'
import { TOWN_SPECIALS } from './dungeons.js'
import { nextAction } from './solver.js'
import { playEvents } from './sound.js'
import AttractMessage from '../../components/AttractMessage'
import { MESSAGES, PRESS } from './attract.js'
import { drawDungeon, drawTown, drawMinimap, drawCombatMobs, VW, VH } from './art.js'

const SIM_MS = 1000 / 60
const DEMO_MS = 150
const FACINGS = ['EAST', 'SOUTH', 'WEST', 'NORTH']

const BardsTaleGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const [ui, setUi] = useState({})
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const gsRef = useRef(null)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const actRef = useRef(null)
    const startRef = useRef(null)
    const optsRef = useRef({})

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.bardsView = '1'
        canvas.width = VW; canvas.height = VH
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeRun(); gsRef.current = gs
        let raf = 0, last = 0, acc = 0, demoAcc = 0, anim = 0
        let toast = 0, toastMsg = ''
        let shake = 0, flashHit = 0
        const evLog = []

        const say = (m) => { toastMsg = m; toast = 150 }

        const handleEvents = (evts) => {
            playEvents(evts)
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 280) evLog.splice(0, evLog.length - 280)
            for (const e of evts) {
                if (e.type === 'descend') say(e.name)
                else if (e.type === 'ascend') say('BACK IN SKARA BRAE')
                else if (e.type === 'ambush') { shake = 5; say(e.boss ? 'MANGAR THE DARK!' : `AMBUSH: ${e.group.join(', ')}`) }
                else if (e.type === 'hit') { shake = 4; flashHit = 0.3 }
                else if (e.type === 'slay') say(`${e.name} SLAIN`)
                else if (e.type === 'fall') { say(`${e.who} HAS FALLEN`); shake = 6 }
                else if (e.type === 'levelup') say(`${e.who} — LEVEL ${e.lvl}`)
                else if (e.type === 'grantKey') say('THE BOARD GRANTS THE TOWER KEY')
                else if (e.type === 'victory' && !e.boss) say('BATTLE WON')
                else if (e.type === 'treasure') say(`${e.gold} GOLD`)
                else if (e.type === 'gotFloorKey') say('A RUSTY KEY')
                else if (e.type === 'lockedGate') say('THE GATE BITES SHUT — PROVE THE DEEP DARKS')
                else if (e.type === 'atDoor') say(e.open ? `${e.name} — SPACE TO ENTER` : `${e.name} — THE TOWER KEY LOCKS IT`)
                else if (e.type === 'thaw') say('MANGAR FALLS — SKARA BRAE THAWS')
                else if (e.type === 'bump') say('')
            }
        }

        const finish = (win) => {
            setEnd({ win, tick: gs.tick })
            overAtRef.current = performance.now()
            setMode('over')
        }

        const act = (cmd) => {
            if (gs.end) return
            step(gs, cmd)
            handleEvents(gs.events.splice(0))
            if (gs.end && screenRef.current === 'play') finish(gs.end === 'win')
        }
        actRef.current = act

        const startPlay = () => {
            gs = makeRun(); gsRef.current = gs
            evLog.length = 0
            setMode('play')
            say('SKARA BRAE')
            audioController.playSweep(220, 660, 0.3, 'square', 0.07)
        }
        startRef.current = startPlay

        const tickDemo = () => {
            if (gs.end) { gs = makeRun(); gsRef.current = gs; return }
            actRef.current(nextAction(gs))
        }

        const paint = () => {
            anim += SIM_MS
            if (flashHit > 0) flashHit -= 0.02
            const sx = shake > 0 ? ((performance.now() % 7) - 3) * shake * 0.4 : 0
            const sy = shake > 0 ? ((performance.now() % 5) - 2) * shake * 0.4 : 0
            if (shake > 0) { shake *= 0.85; if (shake < 0.4) shake = 0 }
            ctx.save(); ctx.translate(sx, sy)
            if (gs.fi < 0) drawTown(ctx, gs, anim)
            else drawDungeon(ctx, gs, anim)
            if (gs.mode === 'combat') drawCombatMobs(ctx, gs, anim)
            ctx.restore()
            drawMinimap(ctx, gs)
        }

        const syncHud = () => {
            const h = hudRef.current
            if (h.floor) h.floor.textContent = gs.fi < 0 ? 'SKARA BRAE' : gs.map.name
            if (h.gold) h.gold.textContent = String(gs.gold)
            if (h.potions) h.potions.textContent = String(gs.potions)
            if (h.ales) h.ales.textContent = String(gs.ales)
            if (h.dir) h.dir.textContent = FACINGS[gs.dir]
            if (h.song) h.song.textContent = gs.song ? SONGS.find((s) => s.id === gs.song)?.name || '' : '—'
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 && toastMsg ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
            setUi({
                mode: gs.mode, fi: gs.fi, menu: gs.menu ? gs.menu.kind : null,
                menuName: gs.menu ? gs.menu.name : null,
                band: gs.band, sp: gs.sp, towerKey: !!gs.towerKey,
                target: gs.combat && gs.combat.mobs[gs.target]
                    ? { name: gs.combat.mobs[gs.target].name, hp: gs.combat.mobs[gs.target].hp, maxHp: gs.combat.mobs[gs.target].maxHp, band: gs.combat.mobs[gs.target].band }
                    : null,
                known: knownSpells(gs).map(([code]) => code),
                party: gs.party.map((x) => ({ name: x.name, cls: x.cls, hp: x.hp, maxHp: x.maxHp, mp: x.mp, maxMp: x.maxMp, lvl: x.lvl, alive: x.alive })),
            })
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                acc += ft
                if (screenRef.current === 'attract') {
                    demoAcc += ft
                    while (demoAcc >= DEMO_MS) { tickDemo(); demoAcc -= DEMO_MS }
                } else {
                    while (acc >= SIM_MS) { acc -= SIM_MS }
                }
                if (screenRef.current !== 'over' && screenRef.current !== 'attract') acc = 0
            }
            paint()
            syncHud()
        }

        const MENU_OPTS = {
            garth: () => GEAR.map((g) => ({ cmd: g.id, label: `${g.name} — ${g.cost}g`, off: !!gs.gear[g.id] })),
            tavern: () => [
                { cmd: 'm1', label: `ALE — ${CFG.aleCost}g` },
                { cmd: 'm2', label: `ROUND (3 ALES) — ${CFG.roundCost}g` },
                { cmd: 'm3', label: 'ASK ABOUT MANGAR' },
            ],
            temple: () => [
                { cmd: 'm1', label: `HEAL ALL — ${CFG.healCost}g` },
                { cmd: 'm2', label: `RAISE A FALLN HERO — ${CFG.raiseCost}g` },
            ],
            board: () => [
                { cmd: 'm1', label: 'BOOST HP (1 pt)' },
                { cmd: 'm2', label: 'BOOST MP (1 pt)' },
                { cmd: 'm3', label: 'BOOST ATTACK (2 pt)' },
                { cmd: 'm4', label: 'BOOST DEFENSE (2 pt)' },
                { cmd: 'm5', label: 'ADVANCE A MAGE (3 pt)' },
            ],
            guild: () => [{ cmd: 'm1', label: 'LISTEN TO THE GUILD' }],
        }
        optsRef.current = MENU_OPTS

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startRef.current(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current) return
            const fighting = gs.mode === 'combat'
            if (gs.menu) {
                const opts = (optsRef.current[gs.menu.kind] || [] )()
                const n = parseInt(e.key, 10)
                if (n >= 1 && n <= opts.length) actRef.current(opts[n - 1].cmd)
                else if (e.code === 'Space' || e.code === 'Escape' || e.code === 'KeyC') actRef.current('m0')
                else if (e.code === 'ArrowLeft') actRef.current('m0')
                return
            }
            if (fighting) {
                if (e.code === 'ArrowUp') actRef.current('target+')
                else if (e.code === 'ArrowDown') actRef.current('target-')
                else if (e.code === 'ArrowLeft') actRef.current('target-')
                else if (e.code === 'ArrowRight') actRef.current('target+')
                else if (e.code === 'Space') actRef.current('attack')
                else if (e.code === 'KeyA') actRef.current('advance')
                else if (e.code === 'KeyR') actRef.current('retreat')
                else if (e.code === 'KeyF' || e.code === 'KeyL') actRef.current('flee')
                else if (e.code === 'KeyP') actRef.current('potion')
                else if (e.code === 'KeyS') { const k = knownSpells(gs)[0]; if (k) actRef.current('cast:' + k[0]) }
                else return
            } else {
                if (e.code === 'ArrowUp') actRef.current('fwd')
                else if (e.code === 'ArrowDown') actRef.current('back')
                else if (e.code === 'ArrowLeft') actRef.current('left')
                else if (e.code === 'ArrowRight') actRef.current('right')
                else if (e.code === 'Space') actRef.current('use')
                else if (e.code === 'KeyP') actRef.current('potion')
                else if (e.code === 'KeyS') { const s = SONGS.find((x) => x.id !== gs.song); if (s) actRef.current('song:' + s.id) }
                else return
            }
        }
        window.addEventListener('keydown', onDown)
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { startRef.current(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
        }
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const sc = Math.min(r.width / VW, r.height / VH)
            canvas.style.width = `${Math.floor(VW * sc)}px`
            canvas.style.height = `${Math.floor(VH * sc)}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__bardsTest = {
                probe: () => ({
                    screen: screenRef.current, mode: gs.mode, end: gs.end, tick: gs.tick,
                    fi: gs.fi, x: gs.x, y: gs.y, dir: gs.dir, gold: gs.gold,
                    potions: gs.potions, ales: gs.ales, towerKey: gs.towerKey,
                    floorsDone: gs.floorsDone.slice(),
                    menu: gs.menu ? gs.menu.kind : null,
                    combat: gs.combat ? { boss: gs.combat.boss, round: gs.combat.round, band: gs.band, target: gs.target, mobs: gs.combat.mobs.map((m) => ({ ...m })) } : null,
                    party: gs.party.map((h) => ({ ...h })),
                    ledger: { ...gs.ledger },
                    evLog: evLog.slice(-140),
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                cmd: (c) => { actRef.current(c); return true },
                auto: (n = 100000) => { let i = 0; while (!gs.end && i < n) { actRef.current(nextAction(gs)); i++ } return { won: gs.end === 'win', end: gs.end, ticks: i } },
                setup: (opts = {}) => {
                    if (screenRef.current !== 'play') return false
                    if (opts.gold !== undefined) gs.gold = opts.gold
                    if (opts.potions !== undefined) gs.potions = opts.potions
                    if (opts.ales !== undefined) gs.ales = opts.ales
                    if (opts.floor !== undefined) { for (let f = 0; f <= opts.floor; f++) gs.floorsDone[f] = true }
                    if (opts.towerKey) gs.towerKey = true
                    evLog.length = 0
                    return true
                },
            }
            mountDbg({
                title: "THE BARD'S TALE",
                getState: () => [
                    `${gs.fi < 0 ? 'SKARA BRAE' : gs.map.name} (${gs.x},${gs.y}) ${FACINGS[gs.dir]} ${gs.mode}`,
                    `gold ${gs.gold}  potions ${gs.potions}  ales ${gs.ales}  floorsDone ${gs.floorsDone.map((b) => (b ? 'X' : '.')).join('')}${gs.towerKey ? ' KEY' : ''}`,
                    gs.party.map((h) => `${h.name} ${h.hp}/${h.maxHp} mp${h.mp} L${h.lvl}${h.alive ? '' : ' x'}`).join('  '),
                    gs.combat ? `ROUND ${gs.combat.round} band${gs.band}: ${gs.combat.mobs.map((m) => `${m.name} ${m.hp}`).join(' | ')}` : `end ${gs.end}`,
                ],
                actions: [
                    { label: 'PROGNOSIS', run: () => {
                        if (gs.end) return `already ${gs.end}`
                        const r = (() => { const cl = cloneState(gs); let i = 0; while (!cl.end && i < 90000) { step(cl, nextAction(cl)); i++ } return { won: cl.end === 'win', end: cl.end, ticks: i } })()
                        return r.won ? `WINNABLE from HERE: solved in ${r.ticks} more commands (gold ${gs.gold}, ales ${gs.ales})` : `NOT winnable with the autopilot: end=${r.end} after ${r.ticks} ticks`
                    } },
                    { label: '+GOLD', run: () => { gs.gold += 500; return 'purse heavy' } },
                    { label: 'FULL HEAL', run: () => { for (const h of gs.party) { h.alive = true; h.hp = h.maxHp; h.mp = h.maxMp } return 'the party is whole' } },
                    { label: 'GIVE TOWER KEY', run: () => { for (let f = 0; f < 5; f++) gs.floorsDone[f] = true; gs.towerKey = true; return 'Mangar\'s gate will open' } },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__bardsTest) delete window.__bardsTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])
    const play = screen === 'play'
    const doCmd = (c) => { if (!paused && screenRef.current === 'play') actRef.current(c) }
    const gs = gsRef.current
    const menuOpts = play && gs && gs.menu ? (({
        garth: GEAR.map((g) => ({ cmd: g.id, label: `${g.name} — ${g.cost}g`, off: !!gs.gear[g.id] })),
        tavern: [{ cmd: 'm1', label: `ALE ${CFG.aleCost}g` }, { cmd: 'm2', label: `ROUND ${CFG.roundCost}g` }, { cmd: 'm3', label: 'ASK ABOUT MANGAR' }],
        temple: [{ cmd: 'm1', label: `HEAL ALL ${CFG.healCost}g` }, { cmd: 'm2', label: `RAISE ${CFG.raiseCost}g` }],
        board: [{ cmd: 'm1', label: 'BOOST HP' }, { cmd: 'm2', label: 'BOOST MP' }, { cmd: 'm3', label: 'BOOST ATK' }, { cmd: 'm4', label: 'BOOST DEF' }, { cmd: 'm5', label: 'ADVANCE MAGE' }],
        guild: [{ cmd: 'm1', label: 'LISTEN' }],
    })[gs.menu.kind] || []) : null

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-2 right-2 flex items-center gap-2 text-white font-mono text-[11px]">
                    <span ref={setHud('floor')} className="border border-amber-500/50 text-amber-200 px-2 py-0.5 rounded bg-black/50">SKARA BRAE</span>
                    <span className="text-yellow-300">GOLD <b ref={setHud('gold')}>75</b></span>
                    <span className="text-rose-300">POT <b ref={setHud('potions')}>2</b></span>
                    <span className="text-orange-300">ALE <b ref={setHud('ales')}>2</b></span>
                    <span className="text-cyan-200">FACE <b ref={setHud('dir')}>NORTH</b></span>
                    <span className="text-violet-300 truncate">♪ <span ref={setHud('song')}>—</span></span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-[28%] text-center text-amber-100 font-mono font-bold text-lg transition-opacity duration-500 px-4" style={{ opacity: 0, textShadow: '0 0 12px #a04' }} />

                {/* town legend (#423): letters on the map are doorway places */}
                {ui.fi < 0 && (
                    <div className="absolute top-9 left-2 flex flex-wrap gap-x-2 gap-y-0.5 max-w-[60%] font-mono text-[8px] text-amber-100/90 bg-black/45 rounded px-1.5 py-1">
                        {Object.entries(TOWN_SPECIALS).map(([ch, sp]) => (
                            <span key={ch}><b className="text-amber-300">{ch.toUpperCase()}</b> {sp.name}</span>
                        ))}
                    </div>
                )}

                {/* combat readout (#423): who/where/how much */}
                {ui.mode === 'combat' && ui.target && (
                    <div className="absolute inset-x-0 top-[16%] flex flex-col items-center gap-1 pointer-events-none">
                        <div className="font-mono text-[11px] text-red-200 bg-black/55 rounded px-2 py-0.5">
                            <b>{ui.target.name}</b> · {ui.target.band <= 1 ? 'MELEE' : `${BANDS[ui.target.band - 1]} FT`}
                            <span className="text-white/70"> · {ui.target.hp}/{ui.target.maxHp}</span>
                        </div>
                        <div className="w-40 h-1.5 bg-white/15 rounded"><div className="h-1.5 bg-red-500 rounded" style={{ width: `${Math.max(0, (ui.target.hp / ui.target.maxHp) * 100)}%` }} /></div>
                    </div>
                )}

                {/* party bar */}
                <div className="absolute bottom-2 left-2 right-2 grid grid-cols-6 gap-1 font-mono text-[9px] text-white">
                    {(ui.party || []).map((h) => (
                        <div key={h.name} className={`rounded px-1 py-0.5 border ${h.alive ? 'bg-black/50 border-white/15' : 'bg-red-950/50 border-red-500/30 line-through opacity-70'}`}>
                            <div className="flex items-center justify-between gap-1"><span className="truncate">{h.name}</span><span className="text-red-300 tabular-nums">{h.hp}/{h.maxHp}</span></div>
                            <div className="h-1 bg-white/10 rounded mt-0.5"><div className="h-1 bg-red-500 rounded" style={{ width: `${Math.max(0, (h.hp / h.maxHp) * 100)}%` }} /></div>
                            {h.maxMp > 0 && <div className="h-1 bg-white/10 rounded mt-0.5"><div className="h-1 bg-blue-400 rounded" style={{ width: `${(h.mp / h.maxMp) * 100}%` }} /></div>}
                        </div>
                    ))}
                </div>

                {/* action bar: menus, else combat, else explore */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 pointer-events-auto max-w-[10rem]">
                    {menuOpts && (
                        <>
                            <div className="text-[9px] font-mono text-amber-300 text-center leading-tight px-1">
                                <div className="font-bold tracking-wide">{ui.menuName}</div>
                                {ui.menu === 'board' && <div className="text-violet-200">{ui.sp} SKILL POINTS</div>}
                                {ui.menu === 'guild' && <div className="text-white/60">HEAR THE CALL</div>}
                            </div>
                            {menuOpts.map((o) => (
                                <button key={o.cmd} onClick={() => doCmd(o.cmd)} disabled={o.off}
                                    className={`text-[10px] font-mono px-2 py-1 rounded border text-left ${o.off ? 'opacity-40 border-white/10 text-white/50' : 'border-amber-400/50 bg-amber-900/40 text-amber-100 active:bg-amber-700/60'}`}>{o.label}</button>
                            ))}
                            <button onClick={() => doCmd('m0')} className="text-[10px] font-mono px-2 py-1 rounded border border-white/30 bg-black/50 text-white/80">LEAVE</button>
                        </>
                    )}
                    {!menuOpts && ui.mode === 'combat' && (
                        <>
                            <button onClick={() => doCmd('attack')} className="text-[10px] font-mono px-2 py-1 rounded border border-red-400/50 bg-red-900/40 text-red-100">ATTACK</button>
                            <button onClick={() => doCmd('advance')} className="text-[10px] font-mono px-2 py-1 rounded border border-white/30 bg-black/50 text-white">ADVANCE</button>
                            <button onClick={() => doCmd('retreat')} className="text-[10px] font-mono px-2 py-1 rounded border border-white/30 bg-black/50 text-white">RETREAT</button>
                            {(ui.known || []).map((c) => (
                                <button key={c} onClick={() => doCmd('cast:' + c)} className="text-[10px] font-mono px-2 py-1 rounded border border-violet-400/50 bg-violet-900/40 text-violet-100">{SPELLS[c]?.name || c}</button>
                            ))}
                            <button onClick={() => doCmd('song:canto')} className="text-[10px] font-mono px-2 py-1 rounded border border-sky-400/50 bg-sky-900/40 text-sky-100">♪ CANTO</button>
                            <button onClick={() => doCmd('potion')} className="text-[10px] font-mono px-2 py-1 rounded border border-rose-400/50 bg-rose-900/40 text-rose-100">POTION</button>
                            <button onClick={() => doCmd('flee')} className="text-[10px] font-mono px-2 py-1 rounded border border-white/30 bg-black/50 text-white/80">FLEE</button>
                        </>
                    )}
                    {!menuOpts && ui.mode !== 'combat' && (
                        <>
                            {(ui.known || []).map((c) => (
                                <button key={c} onClick={() => doCmd('cast:' + c)} className="text-[10px] font-mono px-2 py-1 rounded border border-violet-400/40 bg-violet-900/30 text-violet-100">{SPELLS[c]?.code || c} {SPELLS[c]?.name}</button>
                            ))}
                            {SONGS.map((s) => (
                                <button key={s.id} onClick={() => doCmd('song:' + s.id)} className="text-[10px] font-mono px-2 py-1 rounded border border-sky-400/40 bg-sky-900/30 text-sky-100">♪ {s.name.split(' ')[0]}</button>
                            ))}
                            <button onClick={() => doCmd('potion')} className="text-[10px] font-mono px-2 py-1 rounded border border-rose-400/40 bg-rose-900/30 text-rose-100">POTION</button>
                        </>
                    )}
                </div>
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                    <h1 className="text-4xl font-black tracking-widest mb-6" style={{ color: '#ffd54f', textShadow: '3px 3px 0 #6b21a8, 0 10px 28px #000' }}>THE BARD&apos;S TALE</h1>
                    <AttractMessage className="mb-6 text-violet-100/80" messages={MESSAGES} />
                    <p className="text-lg font-mono font-bold animate-pulse text-white">{PRESS}</p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/78 flex flex-col items-center justify-center text-amber-50 font-mono px-6 text-center">
                    <h2 className={`text-4xl font-black mb-2 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'SKARA BRAE THAWS' : 'THE DARK KEEPS YOU'}</h2>
                    <p className="text-lg mb-4">{end.win ? 'Mangar falls. The winter breaks over the town at last.' : 'The deep darks take their toll. Skara Brae waits for the next six.'}</p>
                    <p className="text-sm text-white/70">{(end.win ? 'Victory at tick ' : 'Fallen at tick ') + end.tick}</p>
                    <p className="mt-6 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === "THE BARD'S TALE")} onResume={handleResume} />}
            <VirtualControls secondAction={{ label: gs && gs.mode === 'combat' ? 'A' : 'U', code: 'Space' }} visible={play && !paused} />
        </div>
    )
}

export default BardsTaleGame
