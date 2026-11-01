import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { GAMES } from '../config/games'
import FactoryFloor from './FactoryFloor'
import Telemetry from './Telemetry'
import { applyOrder, deriveFloor, labelOf, runwayBadge, runwayMath, runwayTrend, sleepBanner, sparkline, slotsLine, throughputLine } from './floor'

const REPO = 'jalfern/retrogames'
// ONE anonymous CDN fetch. The board used to fire ~6 api.github.com queries
// per reload; shared-IP rate limits took it OFFLINE while the machine
// underneath was healthy. telemetry.sh bakes everything the board renders
// (issues, PRs, pulses, build feed, vitals) into this one file.
const RAW = 'https://raw.githubusercontent.com/jalfern/forge-telemetry/main/board.json'
const LOG_RAW = 'https://raw.githubusercontent.com/jalfern/forge-telemetry/main/log.json'
const NIGHTLY_RAW = 'https://raw.githubusercontent.com/jalfern/forge-telemetry/main/nightly.json'
// #1130 — the juice audit lives in THIS repo (it measures this repo's games):
// regenerate with `npm run juiceaudit` against the dev server.
const JUICE_URL = `${import.meta.env.BASE_URL}forge/juice.json`
// #1131 — the boredom map: where bot runs go flat, dead or spiky.
const BOREDOM_URL = `${import.meta.env.BASE_URL}forge/boredom.json`

const Lamp = ({ label, ok, children }) => (
    <div className={`border p-3 text-xs ${ok ? 'border-[#0f0]/60' : 'border-[#f80]/60'}`}>
        <div className="tracking-widest text-[10px] opacity-70 mb-1">{label}</div>
        <div className="text-[11px] leading-snug">{children}</div>
    </div>
)

// Persists a user's drag order for one column. `derived` is the live list the
// feed hands us (a fresh array each fetch); the stored order is an array of
// issue numbers kept in localStorage. Display = the stored order applied to the
// live list, so issues that leave the queue drop out on their own and new ones
// slot in after the custom-ordered ones. Reads/writes are guarded so the board
// still renders in Node (forgecheck) and in private-mode browsers.
const useLocalOrder = (storageKey, derived) => {
    const [order, setOrder] = useState(() => {
        try { const raw = localStorage.getItem(storageKey); return raw ? JSON.parse(raw) : [] } catch { return [] }
    })
    const display = useMemo(() => applyOrder(derived, order, i => i.number), [derived, order])
    const commit = useCallback((nums) => {
        setOrder(nums)
        try { localStorage.setItem(storageKey, JSON.stringify(nums)) } catch { /* private mode / quota */ }
    }, [storageKey])
    const move = useCallback((dragNum, targetNum) => {
        const cur = display.map(i => i.number)
        if (dragNum === targetNum || !cur.includes(dragNum)) return
        const without = cur.filter(n => n !== dragNum)
        // targetNum == null -> the drop landed in the section's padding, not on a
        // card, so the item goes to the very end (the one spot "before a card"
        // cannot reach).
        if (targetNum == null) { commit([...without, dragNum]); return }
        const idx = without.indexOf(targetNum)
        commit(idx < 0 ? [...without, dragNum] : [...without.slice(0, idx), dragNum, ...without.slice(idx)])
    }, [display, commit])
    const reset = useCallback(() => {
        try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
        setOrder([])
    }, [storageKey])
    return { display, move, reset, hasCustom: order.length > 0 }
}

const ForgeBoard = () => {
    const [issues, setIssues] = useState(null)
    const [pulses, setPulses] = useState([])
    const [feed, setFeed] = useState([])
    const [prs, setPrs] = useState([])
    const [error, setError] = useState('')
    // Freshness is stamped when the data ARRIVES, not per render — render must
    // stay pure, and "fresh" means "fresh when we fetched it" anyway.
    const [now, setNow] = useState(0)
    const lastFetch = useRef(0)
    const [lastFetched, setLastFetched] = useState(0)
    const [samples, setSamples] = useState(null)
    const [generated, setGenerated] = useState(null)
    const [daily, setDaily] = useState(null)
    const [nightly, setNightly] = useState(null)
    const [juice, setJuice] = useState(null)
    const [boredom, setBoredom] = useState(null)
    const [runway, setRunway] = useState(null)
    const [runwayOpen, setRunwayOpen] = useState(false)
    const [slots, setSlots] = useState(null)   // #1258 live slots
    const reload = useRef(() => {})

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
    }, [])

    // Background tabs are throttled to ~1 timer wake per HOUR by Chrome —
    // a board left open in a tab lies about the machine by hours unless it
    // refetches the moment you actually look at it.
    useEffect(() => {
        const wake = () => { if (Date.now() - lastFetch.current > 20000) reload.current() }
        const onVis = () => { if (!document.hidden) wake() }
        window.addEventListener('focus', wake)
        document.addEventListener('visibilitychange', onVis)
        return () => { window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', onVis) }
    }, [])

    useEffect(() => {
        let alive = true
        let timer = null
        const load = async () => {
            try {
                const r = await fetch(`${RAW}?t=${Math.floor(Date.now() / 60000)}`)
                if (!r.ok) throw new Error(`board feed ${r.status}`)
                const d = await r.json()
                if (!alive) return
                setIssues(d.issues ?? [])
                setPrs(d.prs ?? [])
                setPulses(d.pulses ?? [])
                setFeed(d.feed ?? [])
                setSamples(d.samples ?? [])
                setGenerated(d.generated ?? null)
                setRunway(d.runway ?? null)
                setSlots(d.slots ?? null)
                try {
                    const lr = await fetch(`${LOG_RAW}?t=${Math.floor(Date.now() / 60000)}`)
                    if (lr.ok) setDaily(await lr.json())
                } catch { /* the daily log is decoration; the board works without it */ }
                try {
                    const nr = await fetch(`${NIGHTLY_RAW}?t=${Math.floor(Date.now() / 60000)}`)
                    if (nr.ok) setNightly(await nr.json())
                } catch { /* no nightly run yet — the section just stays hidden */ }
                try {
                    const jr = await fetch(`${JUICE_URL}?t=${Math.floor(Date.now() / 3600000)}`)
                    if (jr.ok) setJuice(await jr.json())
                } catch { /* no audit committed yet — the section stays hidden */ }
                try {
                    const br = await fetch(`${BOREDOM_URL}?t=${Math.floor(Date.now() / 3600000)}`)
                    if (br.ok) setBoredom(await br.json())
                } catch { /* no map committed yet — the section stays hidden */ }
                setNow(Date.now()); lastFetch.current = Date.now(); setLastFetched(Date.now())
                setError('')
            } catch (e) {
                if (!alive) return
                setError(`${e.message} — the machine pushes this file every 5 min; if it is down, check launchctl list com.jalfern.telemetry`)
            }
            // ONE pending refresh at a time. This used to be setInterval inside
            // load(), so every tick added another interval: the refresh count
            // doubled each minute (257 fetches by minute 8) and an open board
            // took a Safari tab to ~12 GB at 100% CPU.
            clearTimeout(timer)
            if (alive) timer = setTimeout(load, 60000)
        }
        load()
        reload.current = load
        return () => { alive = false; clearTimeout(timer) }
    }, [])

    // One derivation for lamps, floor and cards alike — forgecheck.mjs asserts
    // the counts against the fetched labels through THIS function.
    const floor = deriveFloor({ issues, prs, pulses, now })
    const { queued, shipped, pulse, building } = floor
    // #1354 — when the warden's ticks show the Studio itself was asleep, say
    // it at the TOP of the board: 11 h of "nothing shipped" reads very
    // differently once you see the Mac was down. #1406: the LIVE strips answer
    // to the pulse's age — a wire older than the 24 h horizon no longer gets
    // to claim what is true RIGHT NOW.
    const sleep = sleepBanner(pulse, floor.pulseAge)
    // #1377 — live aggregate throughput from the same samples pipe: tokens/hr
    // per box over the trailing hour, from the servers' own usage counters.
    const throughput = throughputLine(samples, now)
    const qaShape = i => (/^(qa|bug)\b/i.test(i.title) || (i.body || '').startsWith('**where:**'))
        && !labelOf(i, 'game-queue') && !labelOf(i, 'building') && !labelOf(i, 'shipped')
    const qa = (issues ?? []).filter(i => i.state === 'open' && !i.pull_request
        && (labelOf(i, 'feedback') || labelOf(i, 'building-qa') || qaShape(i)))
        .sort((a, b) => (b.reactions?.total_count ?? 0) - (a.reactions?.total_count ?? 0) || a.number - b.number)
    const qaBusy = qa.some(i => labelOf(i, 'building-qa'))

    // What needs Jon on GitHub: the lanes merge their own green PRs within
    // minutes, so an open PR older than 30 min is waiting on him (WIP for
    // review, a decision); plus issues parked on him (`waiting-jon`) and
    // outside requests (`needs-approval`). PRs without created_at (older
    // board.json) all count.
    const waitingPrs = prs.filter(p => !p.created_at || now - Date.parse(p.created_at) > 30 * 60 * 1000)
    const waitingIssues = (issues ?? []).filter(i => i.state === 'open' && !i.pull_request
        && (labelOf(i, 'waiting-jon') || labelOf(i, 'needs-approval')))
    const waitingCount = waitingPrs.length + waitingIssues.length

    // Drag re-order per column: the user's order is applied on top of the live
    // list (see useLocalOrder) and remembered in localStorage. A shared ref names
    // the issue being dragged; the click-suppress ref swallows the one spurious
    // click some browsers fire when a drag onto a link ends, so a reorder never
    // navigates away.
    const queueOrder = useLocalOrder('forge.order.queue', queued)
    const qaOrder = useLocalOrder('forge.order.qa', qa)
    const dragRef = useRef(null)
    const suppressRef = useRef(false)
    const dragProps = (num, move) => ({
        draggable: true,
        onDragStart: e => { dragRef.current = num; suppressRef.current = true; e.dataTransfer.effectAllowed = 'move' },
        onDragEnd: () => { dragRef.current = null },
        onDragOver: e => e.preventDefault(),
        onDrop: e => { e.preventDefault(); e.stopPropagation(); const d = dragRef.current; dragRef.current = null; if (d != null) move(d, num) },
        onMouseDown: () => { suppressRef.current = false },
        onClick: e => { if (suppressRef.current) { suppressRef.current = false; e.preventDefault() } },
    })

    const card = (i, cls, extra) => (
        <a key={i.number} href={i.html_url} target="_blank" rel="noreferrer"
            {...extra}
            className={`border-2 p-4 block hover:opacity-80 transition-opacity ${cls}`}>
            <div className="flex justify-between items-start gap-2">
                <span className="tracking-wider font-bold text-sm">{i.title}</span>
                <span className="text-[10px] opacity-60 shrink-0">#{i.number}</span>
            </div>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">{(i.body || '').split('\n')[0]}</p>
        </a>
    )

    return (
        <div className="absolute inset-0 overflow-y-auto bg-black text-white font-mono p-8 pb-24">
            <div className="max-w-3xl mx-auto">
                <div className="mt-8 mb-6 flex flex-col items-center text-center">
                    <h1 className="text-3xl tracking-widest text-[#00ff00] animate-pulse">THE FORGE</h1>
                    <p className="text-xs text-gray-400 mt-3 tracking-wider">
                        GAMES BUILT BY THE MACHINE, SHIPPED TO THIS SITE — ONE PR AT A TIME
                    </p>
                    <div className="w-24 h-1 bg-[#00ff00] mt-4 opacity-50"></div>
                    <div className={`text-[10px] mt-2 tracking-wider ${lastFetched && now - lastFetched > 900000 ? 'text-[#f55] animate-pulse' : 'text-gray-500'}`}>
                        {lastFetched
                            ? `board data ${Math.max(0, Math.round((now - lastFetched) / 1000))}s old${now - lastFetched > 900000 ? ' — STALE, focus this tab to refresh' : ''}`
                            : 'never fetched'}
                    </div>
                </div>

                {sleep && (
                    <div data-sleep={sleep.minutes == null ? 'live' : sleep.minutes}
                        data-live={sleep.live ? 'true' : undefined}
                        className={`border-2 px-3 py-2 mb-4 text-center text-[11px] tracking-wider ${sleep.severe ? 'border-[#f55] text-[#f88] animate-pulse' : 'border-[#ffb347] text-[#ffb347]'}`}>
                        ⚠ {sleep.text} — {sleep.hint || 'nothing can ship while the Mac sleeps'}
                    </div>
                )}

                {slots && (() => {
                    // #1258 — the fleet at a glance: 2 builder slots + the QA
                    // lanes, up/idle straight from board.json (telemetry.sh).
                    const s = slotsLine(slots)
                    if (!s) return null
                    return (
                        <div data-slots={s.busy} className="text-[10px] tracking-wider text-gray-500 mb-2 text-center">
                            ⚙ SLOTS — {s.text}
                        </div>
                    )
                })()}

                {throughput && (
                    <div data-throughput={throughput.boxes.length}
                        className="text-[10px] tracking-wider text-gray-500 mb-2 text-center">
                        ⚡ {throughput.text} — server counters, last hour
                    </div>
                )}

                {runway && (() => {
                    const b = runwayBadge(runway, now)
                    if (!b) return null
                    const tone = {
                        amber: 'border-[#f80]/70 text-[#f80]',
                        green: 'border-[#0f0]/40 text-[#8f8]',
                        violet: 'border-[#d4c5f9]/50 text-[#d4c5f9]',
                        dim: 'border-gray-700 text-gray-500',
                    }[b.tone]
                    // #1233 — the strip never shows the math. Reveal on hover
                    // (desktop) or tap (touch): per-lane S/M/L mix, total size,
                    // rate/day and the days it yields. runwayMath degrades to
                    // the item count when old board.json has no `mix`.
                    const math = runwayMath(runway)
                    const trend = runwayTrend(runway)
                    const win = Number.isFinite(runway.windowDays) ? runway.windowDays : 14
                    const laneLine = (m) => {
                        const mix = m.mix ? `${m.mix.S} S · ${m.mix.M} M · ${m.mix.L} L`
                            : m.items != null ? `${m.items} item${m.items === 1 ? '' : 's'}` : '? items'
                        const size = m.size != null ? `${m.size} build-days` : '? size'
                        const rate = m.rate != null ? `${m.rate}/day` : 'no recent ships'
                        const days = m.days != null ? `~${m.days} days` : '~?'
                        return `${mix} = ${size} ÷ ${rate} ≈ ${days}`
                    }
                    // #1233 — the Builder lane is one worker shared by two
                    // sub-queues, so the split shows where the days sit: each
                    // bucket's size priced at the lane's full rate. Null on the
                    // QA lane and on old board.json (the sub-line just omits).
                    const splitLine = (m) => {
                        if (!m.lanes) return null
                        const b = (label, x) => x && x.items != null
                            ? `${label} ${x.items} item${x.items === 1 ? '' : 's'}${x.days != null && x.items > 0 ? ` ≈ ${x.days} d` : ''}`
                            : null
                        const parts = [b('platform', m.lanes.platform), b('games', m.lanes.games)].filter(Boolean)
                        return parts.length ? `→ ${parts.join(' · ')}` : null
                    }
                    return (
                        <div className="mb-5">
                            <div data-runway={b.tone}
                                onMouseEnter={() => setRunwayOpen(true)}
                                onMouseLeave={() => setRunwayOpen(false)}
                                onClick={() => setRunwayOpen(o => !o)}
                                className={`border px-4 py-2 mx-auto w-fit text-xs tracking-wider cursor-help select-none ${tone}`}>
                                ⏱ RUNWAY — {b.text}
                                {b.stale && <span className="opacity-60"> · stale</span>}
                                <span className="opacity-40"> ⌄</span>
                            </div>
                            {runwayOpen && math.length > 0 && (
                                <div data-runway-reveal
                                    className={`border-t-0 border -mt-px px-4 py-2 mx-auto w-fit text-[10px] leading-relaxed ${tone}`}>
                                    <div className="tracking-widest opacity-60 mb-1">THE MATH — how the "~N days" counts (last {win} d window)</div>
                                    {math.map((m) => (
                                        <div key={m.name}>
                                            <div className="flex justify-between gap-4">
                                                <span className="shrink-0">{m.name}{m.amber ? ' ⚠ under 1d' : m.polish ? ' · polish' : ''}</span>
                                                <span className="opacity-80 text-right">{laneLine(m)}</span>
                                            </div>
                                            {splitLine(m) && (
                                                <div data-runway-split className="pl-4 opacity-70">{splitLine(m)}</div>
                                            )}
                                        </div>
                                    ))}
                                    {trend.length > 0 && (
                                        <div data-runway-trend className="mt-1 pt-1 border-t border-current/20">
                                            <div className="tracking-widest opacity-60 mb-1">TREND — {trend.length} d (one sample per day, tail = now)</div>
                                            <div className="flex justify-between gap-4"><span className="shrink-0">Builder</span><span className="opacity-80 text-right">{sparkline(trend.map(p => p.builder))}</span></div>
                                            <div className="flex justify-between gap-4"><span className="shrink-0">QA</span><span className="opacity-80 text-right">{sparkline(trend.map(p => p.qa))}</span></div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })()}

                <div className="flex justify-center gap-4 mb-6">
                    <a className="border-2 border-[#ffe14d] text-[#ffe14d] px-4 py-2 text-xs tracking-wider hover:bg-[#ffe14d] hover:text-black transition-colors"
                        href={`https://github.com/${REPO}/issues/new?labels=game-queue&title=GAME%20—%20%3Cname%3E&body=%3Cwhat%20it%20is%20and%20the%20engine%20muscle%20it%20should%20stretch%3E`}>
                        ＋ PROPOSE A GAME
                    </a>
                    <a className="border-2 border-[#ffb347] text-[#ffb347] px-4 py-2 text-xs tracking-wider hover:bg-[#ffb347] hover:text-black transition-colors"
                        href={`https://github.com/${REPO}/issues/new?labels=feedback&title=QA%20%E2%80%94%20%3Cgame%2Fscreen%3E%3A%20%3Cwhat%20is%20wrong%3E&body=%2A%2Awhere%3A%2A%2A%20https%3A%2F%2Fjalfern.com%2Fretrogames%2F%0A%2A%2Awhat%20happened%3A%2A%2A%20%0A%2A%2Awhat%20I%20expected%3A%2A%2A%20%0A%2A%2Adevice%2Fbrowser%3A%2A%2A%20%0A%0Apriority%20%3D%20%F0%9F%91%8D%20on%20this%20issue%2C%20or%20comment%20%60%2Fpriority%20now%60`}>
                        ＋ REPORT A BUG
                    </a>
                    <Link to="/games" className="border-2 border-white px-4 py-2 text-xs tracking-wider hover:bg-white hover:text-black transition-colors">
                        ← ARCADE
                    </Link>
                </div>

                {issues && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-6">
                        <Lamp label="BUILDER" ok={building.length > 0}>
                            {building[0] ? building[0].title.replace(/^GAME.*?—\s*/, '') : 'idle — next warden tick kicks'}
                        </Lamp>
                        <Lamp label="WARDEN" ok={!!pulse}>
                            {pulse ? `${pulses[0].body.slice(0, 5)} · ${Math.max(0, Math.round((now - new Date(pulses[0].created_at).getTime()) / 1000))}s ago` : 'no pulse yet'}
                        </Lamp>
                        <Lamp label="QA LANE" ok={qaBusy || qa.length === 0}>
                            {qaBusy ? `fixing: ${qa.find(i => labelOf(i, 'building-qa')).title.replace(/^QA —?\s*/, '')}`
                                : qa.length ? `${qa.length} awaiting a fix` : 'board empty'}
                        </Lamp>
                        <Lamp label="CI GATE" ok>
                            {prs.length ? (
                                <a className="text-[#0ff] hover:underline" href={prs[0].html_url} target="_blank" rel="noreferrer">
                                    #{prs[0].number} {prs[0].title}
                                </a>
                            ) : pulse?.gate && pulse.gate !== 'none' ? pulse.gate : 'gate clear'}
                        </Lamp>
                        <Lamp label="WAITING ON YOU" ok={waitingCount === 0}>
                            {waitingCount === 0 ? 'nothing — all clear' : (<>
                                <span className="text-[#f80]">{waitingCount} need you</span><br />
                                {waitingPrs.length > 0 && <a className="text-[#0ff] hover:underline" target="_blank" rel="noreferrer"
                                    href={`https://github.com/${REPO}/pulls`}>{waitingPrs.length} PR{waitingPrs.length > 1 ? 's' : ''}: {waitingPrs.map(p => `#${p.number}`).join(' ')}</a>}
                                {waitingPrs.length > 0 && waitingIssues.length > 0 && <br />}
                                {waitingIssues.length > 0 && <a className="text-[#0ff] hover:underline" target="_blank" rel="noreferrer"
                                    href={`https://github.com/${REPO}/issues?q=is%3Aopen+label%3Awaiting-jon%2Cneeds-approval`}>{waitingIssues.length} issue{waitingIssues.length > 1 ? 's' : ''}: {waitingIssues.map(i => `#${i.number}`).join(' ')}</a>}
                            </>)}
                        </Lamp>
                        <Lamp label="MAIN" ok>
                            {pulse?.main || '…'}<br />{GAMES.length} in arcade<br />{shipped.length} forge-built · {queued.length} queued
                        </Lamp>
                    </div>)}

                {issues && <FactoryFloor floor={{ ...floor, queued: queueOrder.display }} />}
                <Telemetry now={now} samples={samples} generated={generated} />

                {pulses.length > 0 && (
                    <div className="border border-[#ffb347]/40 p-3 mb-8 text-[10px] leading-relaxed text-[#ffb347]">
                        <div className="tracking-widest opacity-70 mb-1">FACTORY FLOOR — warden log</div>
                        {pulses.map((p, i) => (
                            <div key={p.id} className={i === 0 ? '' : 'opacity-50'}>
                                ⚡ {p.body.split('\n')[0]} <span className="opacity-60">· {p.updated_at.replace('T', ' ').slice(5, 16)} UTC</span>
                            </div>
                        ))}
                    </div>
                )}

                {feed.length > 0 && (
                    <div className="border border-[#0f0]/30 p-3 mb-8 text-[10px] leading-relaxed text-[#8f8]">
                        <div className="tracking-widest opacity-70 mb-1">BUILD FLOOR — latest checkpoints</div>
                        {feed.map(c => (
                            <div key={c.id}>🔨 {c.body.split('\n')[0].slice(0, 140)}</div>
                        ))}
                    </div>
                )}

                {error && <p className="text-red-400 text-xs text-center mb-8">BOARD OFFLINE: {error}</p>}
                {!issues && !error && <p className="text-gray-500 text-xs text-center mb-8 animate-pulse">QUERYING THE QUEUE…</p>}

                {building.length > 0 && (
                    <section className="mb-10">
                        <h2 className="text-[#ffb347] text-sm tracking-widest mb-3">⚒ BUILDING NOW</h2>
                        <div className="grid gap-4">{building.map(i => card(i, 'border-[#ffb347] animate-pulse'))}</div>
                    </section>
                )}

                {qa.length > 0 && (
                    <section className="mb-10">
                        <h2 className="text-[#ff9d4d] text-sm tracking-widest mb-2">🔧 QA BOARD — fixed beside the forge ({qa.length})</h2>
                        <p className="text-[10px] text-gray-500 mb-3 leading-relaxed">
                            ADDED FROM THIS PAGE (REPORT A BUG). TO JUMP THE QUEUE: 👍 the issue — or comment
                            <span className="text-[#ff9d4d]"> /priority </span> and the QA lane takes it next session (15–45 min).
                            <span className="text-gray-600"> DRAG a card to re-order this board.</span>
                            {qaOrder.hasCustom && (
                                <button type="button" onClick={qaOrder.reset} className="ml-1 underline hover:text-[#ff9d4d]">↺ reset</button>
                            )}
                        </p>
                        <div className="grid md:grid-cols-2 gap-4"
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); const d = dragRef.current; dragRef.current = null; if (d != null) qaOrder.move(d, null) }}>
                            {qaOrder.display.map(i => (
                                <a key={i.number} href={i.html_url} target="_blank" rel="noreferrer"
                                    {...dragProps(i.number, qaOrder.move)}
                                    className={`border-2 p-4 block hover:opacity-80 transition-opacity cursor-grab active:cursor-grabbing ${labelOf(i, 'building-qa') ? 'border-[#ff6600] animate-pulse' : 'border-[#ff9d4d]/60'}`}>
                                    <div className="flex justify-between items-start gap-2">
                                        <span className="tracking-wider font-bold text-sm">{labelOf(i, 'building-qa') ? '🔨 ' : ''}{i.title}</span>
                                        <span className="text-[10px] opacity-60 shrink-0">👍{i.reactions?.total_count ?? 0} #{i.number}</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2 leading-relaxed">{(i.body || '').split('\n')[0]}</p>
                                </a>
                            ))}
                        </div>
                    </section>
                )}

                <section className="mb-10">
                    <h2 className="text-[#d4c5f9] text-sm tracking-widest mb-3">🗂 IN THE QUEUE ({queued.length})</h2>
                    <p className="text-[10px] text-gray-600 mb-3">
                        DRAG a card to set the build order (remembered on this browser).
                        {queueOrder.hasCustom && (
                            <button type="button" onClick={queueOrder.reset} className="ml-1 underline hover:text-[#d4c5f9]">↺ reset</button>
                        )}
                    </p>
                    <div className="grid md:grid-cols-2 gap-4"
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); const d = dragRef.current; dragRef.current = null; if (d != null) queueOrder.move(d, null) }}>
                        {queueOrder.display.map(i => card(i, 'border-[#d4c5f9] cursor-grab active:cursor-grabbing', dragProps(i.number, queueOrder.move)))}
                    </div>
                </section>

                <section className="mb-10">
                    <h2 className="text-[#c2e0c2] text-sm tracking-widest mb-3">✓ SHIPPED ({shipped.length})</h2>
                    <div className="grid md:grid-cols-2 gap-4">{shipped.map(i => card(i, 'border-[#c2e0c2] text-gray-300'))}</div>
                </section>

                {nightly?.games?.length > 0 && (
                    <section className="mb-10">
                        <h2 className="text-[#57e6ff] text-sm tracking-widest mb-2">🤖 NIGHTLY BOT RUN ({nightly.games.filter(g => g.pass).length}/{nightly.games.length} green)</h2>
                        <p className="text-[10px] text-gray-600 mb-3">
                            One seeded bot plays every contract game to completion each night; a run that cannot finish is a softlock report.
                            run {nightly.generated?.slice(0, 10)} · seed {nightly.seed}
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-[10px]">
                            {nightly.games.map(g => (
                                <div key={g.id} title={[...(g.flags || []), ...(g.warnings || [])].join('\n') || 'clean run'}
                                    className={`flex justify-between border px-2 py-1 ${g.pass ? 'border-[#0f0]/30 text-[#8f8]' : 'border-[#f55]/60 text-[#f88] animate-pulse'}`}>
                                    <span className="truncate">{g.pass ? '✓' : '✗'} {g.id}</span>
                                    <span className="opacity-60 shrink-0 ml-1">{g.pass ? `${g.ticks}t` : g.failStreak > 1 ? `×${g.failStreak}` : 'RED'}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {juice?.games?.length > 0 && (() => {
                    const ranked = [...juice.games].sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
                    const scored = juice.games.filter((g) => g.score != null)
                    const avg = scored.length ? Math.round(100 * scored.reduce((s, g) => s + g.score, 0) / scored.length) : 0
                    const gaps = (g) => Object.entries(g.actions || {}).filter(([, a]) => !a.juice).map(([k]) => k)
                    const band = (x) => (x >= 0.9 ? 'border-[#0f0]/30 text-[#8f8]' : x >= 0.6 ? 'border-[#fb0]/50 text-[#fc9]' : 'border-[#f55]/60 text-[#f88]')
                    return (
                        <section className="mb-10">
                            <h2 className="text-[#ff7ad9] text-sm tracking-widest mb-2">🧃 JUICE AUDIT — every action gets a reaction ({avg}% average)</h2>
                            <p className="text-[10px] text-gray-600 mb-3 leading-relaxed">
                                Each contract game is played through <span className="text-[#ff7ad9]">window.__game</span>: every declared button held ~
                                {Math.round(juice.windowTicks / 60 * 1000)} ms with the sim watched frame by frame against an equal idle window.
                                Channels: <span className="text-[#8f8]">sound</span> (synth SFX), <span className="text-[#8f8]">motion</span> (state the idle window never moved),
                                score pop, loud pixel burst. A silent action is a polish bug.
                                audit @{juice.commit} · {String(juice.generated).slice(0, 10)} · regenerate: npm run juiceaudit
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-[10px]">
                                {ranked.map((g) => {
                                    const silent = gaps(g)
                                    const x = g.score ?? 1
                                    return (
                                        <div key={g.id} title={Object.entries(g.actions || {}).map(([k, a]) => `${k}: ${a.juice ? 'ok' : 'SILENT'}${a.sound ? ' sound' : ''}${a.moved ? ' motion' : ''}${a.pop ? ' pop' : ''}${a.fx ? ' fx' : ''}`).join('\n')}
                                            className={`flex items-center gap-2 border px-2 py-1 ${band(x)}`}>
                                            <span className="w-32 truncate shrink-0">{g.id}</span>
                                            <span className="flex-1 h-1 bg-white/10"><span className="block h-1 bg-current" style={{ width: `${Math.round(x * 100)}%` }} /></span>
                                            <span className="w-9 text-right shrink-0">{g.score == null ? '—' : `${Math.round(x * 100)}%`}</span>
                                            <span className="w-40 truncate shrink-0 opacity-70">{silent.length ? `silent: ${silent.join(', ')}` : ''}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </section>
                    )
                })()}

                {boredom?.games?.length > 0 && (() => {
                    const ranked = [...boredom.games].sort((a, b) => (b.boredom ?? -1) - (a.boredom ?? -1))
                    const scored = boredom.games.filter((g) => g.boredom != null)
                    const avg = scored.length ? Math.round(100 * scored.reduce((s, g) => s + g.boredom, 0) / scored.length) : 0
                    const band = (x) => (x <= 0.05 ? 'border-[#0f0]/30 text-[#8f8]' : x <= 0.25 ? 'border-[#fb0]/50 text-[#fc9]' : 'border-[#f55]/60 text-[#f88]')
                    const cell = { dead: 'bg-[#7a0000]', flat: 'bg-[#3a3a3a]', live: 'bg-[#19b34c]', spike: 'bg-[#ffd23f]' }
                    return (
                        <section className="mb-10">
                            <h2 className="text-[#57d0ff] text-sm tracking-widest mb-2">🥶 BOREDOM MAP — where runs go flat ({avg}% average)</h2>
                            <p className="text-[10px] text-gray-600 mb-3 leading-relaxed">
                                The nightly bot policy replays every contract game over seeds {String(boredom.seeds || []).replace(/,/g, ', ')};
                                each strip is one second of world activity — <span className="text-[#7a0000]">■</span> dead (nothing moves),
                                <span className="text-[#777]"> ■</span> flat (well under the run median),
                                <span className="text-[#19b34c]"> ■</span> live, <span className="text-[#ffd23f]">■</span> spike.
                                A long dark stretch is a course that stopped playing the player.
                                BLIND = its contract state hides positions, so flat reads are suspect (#1184).
                                map @{boredom.commit} · {String(boredom.generated).slice(0, 10)} · regenerate: npm run boredomaudit
                            </p>
                            <div className="grid grid-cols-1 gap-1 text-[10px]">
                                {ranked.map((g) => (
                                    <div key={g.id} title={(g.classes || []).map((c, i) => `${i}s: ${c}`).join('\n')}
                                        className={`flex items-center gap-2 border px-2 py-1 ${band(g.boredom ?? 0)}`}>
                                        <span className="w-32 truncate shrink-0">{g.id}{g.blind ? ' ∅' : ''}</span>
                                        <span className="flex-1 flex gap-px h-2 overflow-hidden">
                                            {(g.classes || []).map((c, i) => <span key={i} className={`flex-1 ${cell[c] || 'bg-[#3a3a3a]'}`} />)}
                                        </span>
                                        <span className="w-9 text-right shrink-0">{g.boredom == null ? '—' : `${Math.round(g.boredom * 100)}%`}</span>
                                        <span className="w-40 truncate shrink-0 opacity-70">{g.worst ? `worst ${g.worst.type} ${g.worst.len}s @${g.worst.startSec}s` : g.blind ? 'blind state — readings suspect' : ''}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )
                })()}

                {daily && (
                    <Link to="/forge/log" className="block border border-[#0ff]/40 hover:border-[#0ff] p-3 mb-8 text-[10px] leading-relaxed">
                        <span className="tracking-widest text-[#0ff]">📖 DAILY LOG</span>
                        <span className="text-gray-400"> — {daily.live.headline}</span>
                        {daily.live.shipped.length > 0 && (
                            <div className="text-gray-500 mt-1">latest: {daily.live.shipped[0].title}</div>
                        )}
                        <div className="text-gray-600 mt-1">full history at /forge/log →</div>
                    </Link>
                )}

                <Link to="/forge/report" className="block border border-[#ffb347]/40 hover:border-[#ffb347] p-3 mb-8 text-[10px] leading-relaxed">
                    <span className="tracking-widest text-[#ffb347]">🌅 SHIFT REPORT</span>
                    <span className="text-gray-400"> — the last 48 hours, computed: merges by hour, machines, themes, CI</span>
                    <div className="text-gray-600 mt-1">full report at /forge/report →</div>
                </Link>

                <p className="text-[10px] text-gray-600 text-center mt-16">
                    BUILDER: ONE GAME PER SESSION · WARDEN: EVERY 10 MIN · GATE: CI ONLY · YOU: PROPOSE ABOVE
                </p>
            </div>
        </div>
    )
}

export default ForgeBoard
