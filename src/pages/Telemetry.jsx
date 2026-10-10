import { useEffect, useState } from 'react'
import { ago } from './floor'

const RAW = 'https://raw.githubusercontent.com/jalfern/retrogames/telemetry/telemetry.json'
const TASKS = [['forge', '#ffb347'], ['qa', '#ff6600'], ['warden', '#4dffb8'], ['omlx', '#66b3ff'], ['mini', '#c58aff']]
export const Spark = ({ values, color, label, unit }) => {
    const w = 220, h = 34
    const max = Math.max(1, ...values)
    const pts = values.map((v, i) =>
        `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(' ')
    return (
        <div className="flex items-center gap-2">
            <span className="w-14 text-[9px] tracking-wider opacity-80">{label}</span>
            <svg width={w} height={h} className="shrink-0">
                <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" opacity="0.9" />
            </svg>
            <span className="w-16 text-[10px] text-right" style={{ color }}>
                {values.length ? `${values[values.length - 1]}${unit}` : '—'}
            </span>
        </div>
    )
}

const Telemetry = ({ now }) => {
    const [samples, setSamples] = useState(null)

    useEffect(() => {
        let alive = true
        const load = () => fetch(`${RAW}?t=${Math.floor(Date.now() / 60000)}`)
            .then(r => (r.ok ? r.text() : Promise.reject()))
            .then(txt => {
                if (!alive) return
                setSamples(txt.trim().split('\n').slice(-48).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean))
            })
            .catch(() => alive && setSamples([]))
        load()
        const id = setInterval(load, 600000)
        return () => { alive = false; clearInterval(id) }
    }, [])

    if (!samples || samples.length === 0) return null
    const last = samples[samples.length - 1]

    return (
        <div className="border border-[#66b3ff]/40 p-3 mb-8 text-[10px]">
            <div className="flex justify-between tracking-widest opacity-70 mb-2">
                <span>PULSE-O-METER — machine vitals, 5-min samples, last 4 h</span>
                <span className={ago(last.t, now) > 900 ? 'text-[#f55]' : 'text-[#4dffb8]'}>
                    {ago(last.t, now)}s ago
                </span>
            </div>
            {TASKS.filter(([k]) => samples.some(s => s.tasks?.[k])).map(([k, c]) => (
                <Spark key={k} label={k} color={c} unit="%"
                    values={samples.filter(s => s.tasks?.[k]).map(s => s.tasks[k].cpu)} />
            ))}
            <div className="flex justify-between mt-2 pt-2 border-t border-[#66b3ff]/20 text-gray-400">
                <span>free: {last.free}% · load: {last.load}</span>
                <span className="opacity-90">
                    {last.act?.qa && <>🔨 {last.act.qa}<br /></>}
                    {last.act?.forge && <>⚒ {last.act.forge}</>}
                    {!last.act?.forge && !last.act?.qa && 'lanes quiet'}
                </span>
            </div>
        </div>
    )
}

export default Telemetry
