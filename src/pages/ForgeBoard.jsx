import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const REPO = 'jalfern/retrogames'
const API = `https://api.github.com/repos/${REPO}/issues?labels=game-queue,building,shipped&state=all&per_page=100`

const labelOf = (issue, name) => issue.labels.some(l => l.name === name)

const ForgeBoard = () => {
    const [issues, setIssues] = useState(null)
    const [error, setError] = useState('')

    useEffect(() => {
        let alive = true
        const load = async () => {
            try {
                const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
                if (!r.ok) throw new Error(`GitHub answered ${r.status}`)
                const data = await r.json()
                if (alive) { setIssues(data); setError('') }
            } catch (e) {
                if (alive) setError(e.message)
            }
        }
        load()
        const t = setInterval(load, 60000)
        return () => { alive = false; clearInterval(t) }
    }, [])

    const building = issues?.filter(i => labelOf(i, 'building')) ?? []
    const queued = issues?.filter(i => !labelOf(i, 'building') && !labelOf(i, 'shipped') && !i.pull_request) ?? []
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
