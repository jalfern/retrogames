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

// Samples arrive via props now: telemetry.sh bakes them into the SAME
// board.json the board's one fetch reads — two CDN files meant two caches
// disagreeing about how old "now" is. Age is board.json's UTC stamp.
const Telemetry = ({ now, samples, generated }) => {
    if (!samples || samples.length === 0) return null
    const last = samples[samples.length - 1]
    const age = generated ? Math.max(0, Math.round((now - Date.parse(generated)) / 1000)) : 0

    return (
        <div className="border border-[#66b3ff]/40 p-3 mb-8 text-[10px]">
            <div className="flex justify-between tracking-widest opacity-70 mb-2">
                <span>PULSE-O-METER — machine vitals, 5-min samples, last 4 h</span>
                <span className={generated && age > 900 ? 'text-[#f55]' : 'text-[#4dffb8]'}>
                    {generated ? `${age}s ago` : 'never fetched'}
                </span>
            </div>
            {TASKS.filter(([k]) => samples.some(s => s.tasks?.[k])).map(([k, c]) => (
                <Spark key={k} label={k} color={c} unit="%"
                    values={samples.filter(s => s.tasks?.[k]).map(s => s.tasks[k].cpu)} />
            ))}
            <div className="flex justify-between mt-2 pt-2 border-t border-[#66b3ff]/20 text-gray-400">
                <span>free: {last.free}% · load: {last.load}</span>
                <span className="opacity-90">
                    {last.commit && <span className="text-[#ffb347]">⚒ {last.commit}<br /></span>}
                    {last.act?.qa && last.act.qa.split('\n').map((l, i) => <div key={`q${i}`}>🔨 {l}</div>)}
                    {last.act?.forge && last.act.forge.split('\n').map((l, i) => <div key={`f${i}`}>⚒ {l}</div>)}
                    {!last.act?.forge && !last.act?.qa && !last.commit && 'lanes quiet'}
                </span>
            </div>
        </div>
    )
}

export default Telemetry
