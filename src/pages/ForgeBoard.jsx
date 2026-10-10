import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GAMES } from '../config/games'

const REPO = 'jalfern/retrogames'
const API = p => `https://api.github.com/repos/${REPO}/${p}`
// GitHub's ?labels= filter is an AND (issue must carry EVERY listed label),
// so one query per label — merged by issue number below.
const LABELS = ['game-queue', 'building', 'shipped']

const labelOf = (issue, name) => issue.labels.some(l => l.name === name)
const kv = line => Object.fromEntries(line.split(/\s+/).slice(1).map(t => t.split('=')))

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

    useEffect(() => {
        let alive = true
        let timer = null
        const get = async p => {
            const r = await fetch(API(p), { headers: { Accept: 'application/vnd.github+json' } })
            if (!r.ok) throw new Error(r.status === 403 || r.status === 429 ? 'GitHub rate limit (retrying in 10 min)' : `GitHub ${r.status}`)
            return r.json()
        }
        const load = async () => {
            const results = await Promise.allSettled([
                ...LABELS.map(l => get(`issues?labels=${l}&state=all&per_page=100`)),
                get('issues?state=open&per_page=100'),
                get('pulls?state=open&per_page=10'),
            ])
            const ok = results.filter(r => r.status === 'fulfilled')
            if (!alive) return
            if (ok.length === 0) { setError(results[0].reason.message); clearInterval(timer); timer = setInterval(load, 600000); return }
            const all = ok.flatMap(r => r.value)
            const byNum = new Map()
            all.filter(i => !i.pull_request).forEach(i => byNum.set(i.number, i))
            setIssues([...byNum.values()].sort((a, b) => a.number - b.number))
            setPrs(ok[4] ? ok[4].value : [])
            setError('')
            const pulse = all.find(i => i.title === 'FORGE PULSE')
            if (pulse) {
                try {
                    const cs = await get(pulse.comments_url.replace('https://api.github.com/', ''))
                    if (alive) setPulses(cs.slice(-6).reverse())
                } catch { /* decorative */ }
            }
            const nowBuilding = all.filter(i => labelOf(i, 'building') && !i.pull_request)
            if (nowBuilding[0]) {
                try {
                    const cs = await get(nowBuilding[0].comments_url.replace('https://api.github.com/', ''))
                    if (alive) setFeed(cs.slice(-4).reverse())
                } catch { /* decorative */ }
            } else if (alive) setFeed([])
        }
        load()
        timer = setInterval(load, 600000)
        return () => { alive = false; clearInterval(timer) }
    }, [])

    const building = issues?.filter(i => labelOf(i, 'building')) ?? []
    const queued = issues?.filter(i => !labelOf(i, 'building') && !labelOf(i, 'shipped') && !i.pull_request
        && (labelOf(i, 'game-queue') || /^game\b/i.test(i.title))) ?? []
    const shipped = issues?.filter(i => labelOf(i, 'shipped')) ?? []
    const pulse = pulses[0] ? kv(pulses[0].body.split('\n')[0]) : null

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
                </div>

                <div className="flex justify-center gap-4 mb-6">
                    <a className="border-2 border-[#ffe14d] text-[#ffe14d] px-4 py-2 text-xs tracking-wider hover:bg-[#ffe14d] hover:text-black transition-colors"
                        href={`https://github.com/${REPO}/issues/new?labels=game-queue&title=GAME%20—%20%3Cname%3E&body=%3Cwhat%20it%20is%20and%20the%20engine%20muscle%20it%20should%20stretch%3E`}>
                        ＋ PROPOSE A GAME
                    </a>
                    <Link to="/games" className="border-2 border-white px-4 py-2 text-xs tracking-wider hover:bg-white hover:text-black transition-colors">
                        ← ARCADE
                    </Link>
                </div>

                {issues && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
                        <Lamp label="BUILDER" ok={building.length > 0}>
                            {building[0] ? building[0].title.replace(/^GAME.*?—\s*/, '') : 'idle — next warden tick kicks'}
                        </Lamp>
                        <Lamp label="WARDEN" ok={!!pulse}>
                            {pulse ? `heartbeat ${pulse['0'] || pulses[0].body.slice(0, 5)}` : 'no pulse yet'}
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
                    </div>
                )}

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
