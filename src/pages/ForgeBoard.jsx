import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { GAMES } from '../config/games'
import FactoryFloor from './FactoryFloor'
import Telemetry from './Telemetry'
import { ago, deriveFloor, labelOf } from './floor'

const REPO = 'jalfern/retrogames'
const API = p => `https://api.github.com/repos/${REPO}/${p}`
// GitHub's ?labels= filter is an AND (issue must carry EVERY listed label),
// so one query per lane — merged by issue number below. Only shipped needs
// state=all: those issues are CLOSED on ship. Open lanes arrive anyway via
// the catch-all open query; per-label copies are the belt-and-braces record.
const QUERIES = [
    'issues?labels=shipped&state=all&per_page=100',
    'issues?labels=game-queue&per_page=100',
    'issues?labels=feedback&per_page=100',
    'issues?state=open&per_page=100',
    'pulls?state=open&per_page=10',
]

const Lamp = ({ label, ok, children }) => (
    <div className={`border p-3 text-xs ${ok ? 'border-[#0f0]/60' : 'border-[#f80]/60'}`}>
        <div className="tracking-widest text-[10px] opacity-70 mb-1">{label}</div>
        <div className="text-[11px] leading-snug">{children}</div>
    </div>
)

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
        window.addEventListener('focus', wake)
        document.addEventListener('visibilitychange', () => { if (!document.hidden) wake() })
        return () => { window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake) }
    }, [])

    useEffect(() => {
        let alive = true
        let timer = null
        const fetchJson = async (url, label) => {
            const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
            if (!r.ok) throw new Error(r.status === 403 || r.status === 429 ? 'GitHub rate limit (retrying in 10 min)' : `${label} GitHub ${r.status}`)
            return r.json()
        }
        const get = p => fetchJson(API(p), 'query')
        const load = async () => {
            const results = await Promise.allSettled([
                ...QUERIES.map(get),
            ])
            const ok = results.filter(r => r.status === 'fulfilled')
            if (!alive) return
            if (ok.length === 0) { setError(results[0].reason.message); clearInterval(timer); timer = setInterval(load, 600000); return }
            const all = ok.flatMap(r => r.value)
            const byNum = new Map()
            all.filter(i => !i.pull_request).forEach(i => byNum.set(i.number, i))
            setIssues([...byNum.values()].sort((a, b) => a.number - b.number))
            setPrs(results[4].status === 'fulfilled' ? results[4].value : [])
            setNow(Date.now()); lastFetch.current = Date.now(); setLastFetched(Date.now())
            setError('')
            const pulse = all.find(i => i.title === 'FORGE PULSE')
            if (pulse) {
                try {
                    // comments_url is ABSOLUTE — it used to be host-stripped and
                    // re-prefixed by API(), doubling /repos/... → a 404 that the
                    // "decorative" catch swallowed. The warden log never rendered.
                    const cs = await fetchJson(pulse.comments_url, 'pulse')
                    if (alive) setPulses(cs.slice(-6).reverse())
                } catch { /* decorative */ }
            }
            const nowBuilding = all.filter(i => labelOf(i, 'building') && !i.pull_request)
            if (nowBuilding[0]) {
                try {
                    const cs = await fetchJson(nowBuilding[0].comments_url, 'feed')
                    if (alive) setFeed(cs.slice(-4).reverse())
                } catch { /* decorative */ }
            } else if (alive) setFeed([])
        }
        load()
        reload.current = load
        timer = setInterval(load, 600000)
        return () => { alive = false; clearInterval(timer) }
    }, [])

    // One derivation for lamps, floor and cards alike — forgecheck.mjs asserts
    // the counts against the fetched labels through THIS function.
    const floor = deriveFloor({ issues, prs, pulses, now })
    const { queued, shipped, pulse, building } = floor
    const qaShape = i => (/^(qa|bug)\b/i.test(i.title) || (i.body || '').startsWith('**where:**'))
        && !labelOf(i, 'game-queue') && !labelOf(i, 'building') && !labelOf(i, 'shipped')
    const qa = (issues ?? []).filter(i => i.state === 'open' && !i.pull_request
        && (labelOf(i, 'feedback') || labelOf(i, 'building-qa') || qaShape(i)))
        .sort((a, b) => (b.reactions?.total_count ?? 0) - (a.reactions?.total_count ?? 0) || a.number - b.number)
    const qaBusy = qa.some(i => labelOf(i, 'building-qa'))

    const card = (i, cls) => (
        <a key={i.number} href={i.html_url} target="_blank" rel="noreferrer"
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
                    <div className={`text-[10px] mt-2 tracking-wider ${now - lastFetched > 900000 ? 'text-[#f55] animate-pulse' : 'text-gray-500'}`}>
                        board data {Math.max(0, Math.round((now - lastFetched) / 1000))}s old
                        {now - lastFetched > 900000 ? ' — STALE, focus this tab to refresh' : ''}
                    </div>
                </div>

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
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
                        <Lamp label="BUILDER" ok={building.length > 0}>
                            {building[0] ? building[0].title.replace(/^GAME.*?—\s*/, '') : 'idle — next warden tick kicks'}
                        </Lamp>
                        <Lamp label="WARDEN" ok={!!pulse}>
                            {pulse ? `${pulses[0].body.slice(0, 5)} · ${ago(pulses[0].body.slice(0, 5) + ':00', now)}s ago` : 'no pulse yet'}
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
                        <Lamp label="MAIN" ok>
                            {pulse?.main || '…'}<br />{GAMES.length} in arcade<br />{shipped.length} forge-built · {queued.length} queued
                        </Lamp>
                    </div>)}

                {issues && <FactoryFloor floor={floor} />}
                <Telemetry now={now} />

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
                        </p>
                        <div className="grid md:grid-cols-2 gap-4">
                            {qa.map(i => (
                                <a key={i.number} href={i.html_url} target="_blank" rel="noreferrer"
                                    className={`border-2 p-4 block hover:opacity-80 transition-opacity ${labelOf(i, 'building-qa') ? 'border-[#ff6600] animate-pulse' : 'border-[#ff9d4d]/60'}`}>
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
                    <div className="grid md:grid-cols-2 gap-4">{queued.map(i => card(i, 'border-[#d4c5f9]'))}</div>
                </section>

                <section className="mb-10">
                    <h2 className="text-[#c2e0c2] text-sm tracking-widest mb-3">✓ SHIPPED ({shipped.length})</h2>
                    <div className="grid md:grid-cols-2 gap-4">{shipped.map(i => card(i, 'border-[#c2e0c2] text-gray-300'))}</div>
                </section>

                <p className="text-[10px] text-gray-600 text-center mt-16">
                    BUILDER: ONE GAME PER SESSION · WARDEN: EVERY 10 MIN · GATE: CI ONLY · YOU: PROPOSE ABOVE
                </p>
            </div>
        </div>
    )
}

export default ForgeBoard
