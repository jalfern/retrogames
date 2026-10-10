import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const REPO = 'jalfern/retrogames'
// GitHub's ?labels= filter is an AND (issue must carry EVERY listed label),
// so one query per label — merged by issue number below.
const API = l => `https://api.github.com/repos/${REPO}/issues?labels=${l}&state=all&per_page=100`
const LABELS = ['game-queue', 'building', 'shipped']

const labelOf = (issue, name) => issue.labels.some(l => l.name === name)

const ForgeBoard = () => {
    const [issues, setIssues] = useState(null)
    const [pulse, setPulse] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        let alive = true
        let timer = null
        const load = async () => {
            const results = await Promise.allSettled([
                ...LABELS.map(async l => {
                    const r = await fetch(API(l), { headers: { Accept: 'application/vnd.github+json' } })
                    if (!r.ok) throw new Error(r.status === 403 || r.status === 429 ? 'GitHub rate limit (retries in 5 min)' : `GitHub answered ${r.status}`)
                    return r.json()
                }),
                // External submitters lack triage rights, so GitHub drops the
                // prefilled label — an open unlabelled "GAME —" issue is queued.
                fetch('https://api.github.com/repos/jalfern/retrogames/issues?state=open&per_page=100', { headers: { Accept: 'application/vnd.github+json' } })
                    .then(r => { if (!r.ok) throw new Error('unlabeled scan unavailable'); return r.json() })
            ])
            const ok = results.filter(r => r.status === 'fulfilled')
            if (!alive) return
            if (ok.length === 0) { setError(results[0].reason.message); clearInterval(timer); timer = setInterval(load, 300000); return }
            const byNum = new Map()
            ok.forEach(r => r.value.forEach(i => { if (!i.pull_request) byNum.set(i.number, i) }))
            setIssues([...byNum.values()].sort((a, b) => a.number - b.number))
            setError('')
            try {
                const pulseIssue = ok.flatMap(r => r.value).find(i => i.title === 'FORGE PULSE')
                if (pulseIssue) {
                    const cs = await (await fetch(pulseIssue.comments_url)).json()
                    if (cs.length && alive) setPulse(`${cs[cs.length - 1].user.login}: ${cs[cs.length - 1].body}\n(${cs[cs.length - 1].updated_at.replace('T', ' ').slice(0, 16)} UTC)`)
                }
            } catch { /* pulse is decorative */ }
        }
        load()
        timer = setInterval(load, 60000)
        return () => { alive = false; clearInterval(timer) }
    }, [])

    const building = issues?.filter(i => labelOf(i, 'building')) ?? []
    const queued = issues?.filter(i => !labelOf(i, 'building') && !labelOf(i, 'shipped') && !i.pull_request
        && (labelOf(i, 'game-queue') || /^game\b/i.test(i.title))) ?? []
    const shipped = issues?.filter(i => labelOf(i, 'shipped')) ?? []

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
                <div className="mt-8 mb-10 flex flex-col items-center text-center">
                    <h1 className="text-3xl tracking-widest text-[#00ff00] animate-pulse">THE FORGE</h1>
                    <p className="text-xs text-gray-400 mt-3 tracking-wider">
                        GAMES BUILT BY THE MACHINE, SHIPPED TO THIS SITE — ONE PR AT A TIME
                    </p>
                    <div className="w-24 h-1 bg-[#00ff00] mt-4 opacity-50"></div>
                    {pulse && (
                        <pre className="mt-4 text-[10px] text-[#ffb347] whitespace-pre-wrap max-w-xl text-center leading-relaxed">
                            ⚡ WARDEN PULSE — {pulse}
                        </pre>
                    )}
                </div>

                <div className="flex justify-center gap-4 mb-10">
                    <a className="border-2 border-[#ffe14d] text-[#ffe14d] px-4 py-2 text-xs tracking-wider hover:bg-[#ffe14d] hover:text-black transition-colors"
                        href={`https://github.com/${REPO}/issues/new?labels=game-queue&title=GAME%20—%20%3Cname%3E&body=%3Cwhat%20it%20is%20and%20the%20engine%20muscle%20it%20should%20stretch%3E`}>
                        ＋ PROPOSE A GAME
                    </a>
                    <Link to="/games" className="border-2 border-white px-4 py-2 text-xs tracking-wider hover:bg-white hover:text-black transition-colors">
                        ← ARCADE
                    </Link>
                </div>

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
                    THE FORGE RUNS ON SCHEDULE · ONE GAME PER SESSION · MERGED ONLY THROUGH THE CI GATE · PROPOSE ANY GAME, IT JOINS THE QUEUE
                </p>
            </div>
        </div>
    )
}

export default ForgeBoard
