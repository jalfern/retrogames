import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

// Daily log (#516) — one entry per day, cut at 07:00 Pacific, newest first.
// All text is script-generated (scripts/dailylog.mjs -> forge-telemetry/log.json,
// the same anonymous CDN pipe the Forge board uses). Headlines are PR/issue
// titles; nothing here is model prose.
const LOG_RAW = 'https://raw.githubusercontent.com/jalfern/forge-telemetry/main/log.json'
const REFRESH_MS = 5 * 60 * 1000

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const prettyDay = day => {
    const [y, m, d] = day.split('-').map(Number)
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    return `${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][wd]} ${MONTHS[m - 1]} ${d}`
}

const Section = ({ title, color, items, render }) => items.length > 0 && (
    <div className="mb-3">
        <div className="tracking-widest text-[10px] mb-1" style={{ color }}>{title} ({items.length})</div>
        <div className="grid gap-1">{items.map(render)}</div>
    </div>
)

const Entry = ({ e }) => {
    const trouble = e.stalled.length + e.regressed.filter(r => !r.advisory).length
    const empty = !e.shipped.length && !trouble && !e.waiting.length
    if (empty && !e.live) return null
    return (
        <section className={`border-2 p-4 mb-6 ${e.live ? 'border-[#0ff]/70' : 'border-[#0f0]/30'}`}>
            <div className="flex justify-between items-baseline gap-2 mb-1">
                <h2 className={`text-sm tracking-widest ${e.live ? 'text-[#0ff] animate-pulse' : 'text-[#00ff00]'}`}>
                    {e.live ? `⚡ LIVE — SINCE ${String(e.day).slice(11) || ''}07:00 PT` : prettyDay(e.day)}
                </h2>
                <span className="text-[10px] opacity-50 shrink-0">{e.live ? 'updates every 5 min' : 'final'}</span>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">{e.headline}</p>

            <Section title="✓ SHIPPED" color="#c2e0c2" items={e.shipped} render={s => (
                <div key={s.number} className="text-[11px]">
                    <a className="text-[#8f8] hover:underline" href={s.url} target="_blank" rel="noreferrer">
                        {s.title} <span className="opacity-50">#{s.number}</span>
                    </a>
                    {s.shots.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1 mb-1">
                            {s.shots.map(u => (
                                <a key={u} href={u} target="_blank" rel="noreferrer" className="block border border-[#0f0]/30 hover:border-[#0f0]">
                                    <img src={u} alt={s.title} loading="lazy" className="h-24 w-auto object-contain" />
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            )} />
            <Section title="⚠ STALLED" color="#ffb347" items={e.stalled} render={i => (
                <div key={i.number} className="text-[11px]">
                    <a className="text-[#ffb347] hover:underline" href={i.url} target="_blank" rel="noreferrer">{i.title} #{i.number}</a>
                    <span className="opacity-50"> — {i.note}</span>
                </div>
            )} />
            <Section title="✗ REGRESSED" color="#f66" items={e.regressed} render={r => (
                <div key={r.run} className="text-[11px]">
                    <a className={r.advisory ? 'text-gray-500 hover:underline' : 'text-[#f66] hover:underline'} href={r.url} target="_blank" rel="noreferrer">
                        run {r.run} — {r.title}
                    </a>
                    {r.advisory && <span className="opacity-50"> (advisory only)</span>}
                </div>
            )} />
            <Section title="⏳ WAITING ON JON" color="#ffe14d" items={e.waiting} render={w => (
                <div key={`${w.kind}${w.number}`} className="text-[11px]">
                    <a className="text-[#ffe14d] hover:underline" href={w.url} target="_blank" rel="noreferrer">{w.title} #{w.number}</a>
                    <span className="opacity-50"> — {w.kind === 'pr' ? 'PR in review' : 'parked for you'}</span>
                </div>
            )} />
        </section>
    )
}

const ForgeLog = () => {
    const [log, setLog] = useState(null)
    const [error, setError] = useState('')
    const [age, setAge] = useState(null)
    const timer = useRef(null)

    const load = useCallback(async () => {
        try {
            const r = await fetch(`${LOG_RAW}?t=${Math.floor(Date.now() / REFRESH_MS)}`)
            if (!r.ok) throw new Error(`log feed ${r.status}`)
            const d = await r.json()
            setLog(d)
            setAge(Date.now())
            setError('')
        } catch (err) {
            setError(`${err.message} — the machine regenerates the log with every telemetry tick; a brand-new day appears after the next one`)
        }
        clearTimeout(timer.current)
        timer.current = setTimeout(load, REFRESH_MS)
    }, [])

    useEffect(() => {
        load()
        return () => clearTimeout(timer.current)
    }, [load])

    return (
        <div className="absolute inset-0 overflow-y-auto bg-black text-white font-mono p-8 pb-24">
            <div className="max-w-3xl mx-auto">
                <div className="mt-8 mb-6 text-center">
                    <h1 className="text-2xl tracking-widest text-[#00ff00]">📖 DAILY LOG</h1>
                    <p className="text-[10px] text-gray-500 mt-2 tracking-wider">
                        ONE DAY PER ENTRY · CUT AT 07:00 PACIFIC · SCRIPT-GENERATED, NO MODEL PROSE
                    </p>
                    {log && (
                        <p className="text-[10px] text-gray-600 mt-1">
                            {age ? `log data ${Math.max(0, Math.round((Date.now() - age) / 1000))}s old` : ''} · generated {String(log.generated).slice(0, 16).replace('T', ' ')} UTC
                        </p>
                    )}
                    <div className="w-24 h-1 bg-[#00ff00] mt-4 opacity-50"></div>
                </div>

                <div className="flex justify-center gap-4 mb-8">
                    <Link to="/forge" className="border-2 border-[#ffb347] text-[#ffb347] px-4 py-2 text-xs tracking-wider hover:bg-[#ffb347] hover:text-black transition-colors">
                        ← THE FORGE
                    </Link>
                    <Link to="/games" className="border-2 border-white px-4 py-2 text-xs tracking-wider hover:bg-white hover:text-black transition-colors">
                        ← ARCADE
                    </Link>
                </div>

                {error && <p className="text-red-400 text-xs text-center mb-8">LOG OFFLINE: {error}</p>}
                {!log && !error && <p className="text-gray-500 text-xs text-center mb-8 animate-pulse">READING THE LOG…</p>}

                {log && <Entry e={log.live} />}
                {log && log.entries.map(e => <Entry key={e.day} e={e} />)}
                {log && <p className="text-[10px] text-gray-600 text-center mt-8">— LAST {log.days} DAYS · EVERY GAME CLEARED FOR PUBLIC —</p>}
            </div>
        </div>
    )
}

export default ForgeLog
