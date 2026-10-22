import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

// Shift report (#614) — the factory's last 48 hours in the exact look of
// docs/forge/shift-report-ref.html. Every number comes from report.json
// (scripts/shiftreport.mjs -> forge-telemetry, same CDN pipe as the board);
// the headline/lede/notes may be model-written at a builder session's end.
const REPORT_RAW = 'https://raw.githubusercontent.com/jalfern/forge-telemetry/main/report.json'
const REFRESH_MS = 5 * 60 * 1000

// DEV/harness hook (?647 browser leg): ?report=/retrogames/… forces a same-origin
// fixture instead of the live telemetry feed. Offsite fixtures are ignored.
const FIXTURE = new URLSearchParams(window.location.search).get('report')
const REPORT_URL = FIXTURE && /^\/retrogames\/[a-z0-9._/-]+$/i.test(FIXTURE) ? FIXTURE : REPORT_RAW

const CSS = `
.sr{--bg:#f3f5f2;--panel:#ffffff;--ink:#151b18;--muted:#5d6762;--rule:#dde2de;
  --builder:#2c62d6;--qa:#0f9a73;--ops:#9aa39e;--warn:#c77a06;--hot:#d2462b;
  --display:"Chakra Petch","Avenir Next Condensed","Arial Narrow",sans-serif;
  --body:"IBM Plex Sans",system-ui,-apple-system,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;color-scheme:light}
@media (prefers-color-scheme: dark){.sr{--bg:#0f1412;--panel:#171d1a;--ink:#e7ece9;--muted:#97a29c;--rule:#29312d;
  --builder:#6b95f2;--qa:#38c79c;--ops:#5d6762;--warn:#e6a23c;--hot:#f0735a;color-scheme:dark}}
html[data-theme="dark"] .sr{--bg:#0f1412;--panel:#171d1a;--ink:#e7ece9;--muted:#97a29c;--rule:#29312d;
  --builder:#6b95f2;--qa:#38c79c;--ops:#5d6762;--warn:#e6a23c;--hot:#f0735a;color-scheme:dark}
html[data-theme="light"] .sr{--bg:#f3f5f2;--panel:#ffffff;--ink:#151b18;--muted:#5d6762;--rule:#dde2de;
  --builder:#2c62d6;--qa:#0f9a73;--ops:#9aa39e;--warn:#c77a06;--hot:#d2462b;color-scheme:light}
.sr{background:var(--bg);color:var(--ink);font:15px/1.6 var(--body);
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:28px 48px}
.sr-main{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:34px}
.sr .eyebrow{font:500 12px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.sr h1{font:700 clamp(32px,8vw,52px)/1.02 var(--display);margin:8px 0 10px;text-wrap:balance;letter-spacing:-.01em}
.sr h2{font:600 20px/1.2 var(--display);margin:0 0 4px;letter-spacing:.01em}
.sr .lede{max-width:62ch;color:var(--muted);margin:0}
.sr .lede b,.sr .lede strong{color:var(--ink);font-weight:600}
.sr .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule);border-radius:10px;overflow:hidden}
.sr .stat{background:var(--panel);padding:14px 14px 12px;min-width:0}
.sr .stat .n{font:600 30px/1 var(--display);font-variant-numeric:tabular-nums}
.sr .stat .l{font-size:12.5px;color:var(--muted);margin-top:6px;line-height:1.35}
@media (max-width:560px){.sr .stats{grid-template-columns:repeat(2,1fr)}}
.sr .sub{color:var(--muted);font-size:13.5px;margin:0 0 14px}
.sr .legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-bottom:8px}
.sr .legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.sr .chart{overflow-x:auto}
.sr .chart svg{display:block;width:100%;min-width:520px;height:auto}
.sr .chart text{font-family:var(--mono);font-size:10px;fill:var(--muted)}
.sr .machines{display:flex;flex-direction:column;gap:14px}
.sr .mrow{display:grid;grid-template-columns:132px 1fr 52px;gap:12px;align-items:center}
.sr .mname{font-weight:600;font-size:14px;line-height:1.25}
.sr .mname small{display:block;font-weight:400;color:var(--muted);font-size:12px}
.sr .strip{display:grid;grid-template-columns:repeat(48,1fr);gap:1.5px;height:26px}
.sr .strip span{border-radius:2px;background:var(--rule)}
.sr .mpct{font:500 15px var(--mono);text-align:right;font-variant-numeric:tabular-nums}
.sr .axis{display:grid;grid-template-columns:132px 1fr 52px;gap:12px;font:10px var(--mono);color:var(--muted)}
.sr .axis div:nth-child(2){display:flex;justify-content:space-between}
@media (max-width:520px){.sr .mrow,.sr .axis{grid-template-columns:96px 1fr 44px;gap:8px}}
.sr .themes{display:flex;flex-direction:column;gap:16px}
.sr .theme .top{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.sr .theme .name{font-weight:600}
.sr .theme .cnt{font:500 14px var(--mono);font-variant-numeric:tabular-nums}
.sr .bar{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--rule);margin:6px 0 6px}
.sr .bar span{height:100%}
.sr .theme p{margin:0;color:var(--muted);font-size:13.5px;line-height:1.5}
.sr .ci{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.sr .ci div{background:var(--panel);border:1px solid var(--rule);border-radius:10px;padding:12px 14px;min-width:0}
.sr .ci .n{font:600 24px/1 var(--display);font-variant-numeric:tabular-nums}
.sr .ci .l{font-size:12.5px;color:var(--muted);margin-top:6px;line-height:1.35}
@media (max-width:520px){.sr .ci{grid-template-columns:1fr 1fr}}
.sr .notes{display:flex;flex-direction:column;gap:12px}
.sr .golook{border:1px solid var(--builder);border-radius:12px;padding:16px 18px;background:color-mix(in srgb, var(--builder) 6%, var(--panel))}
.sr .golook h2{margin-bottom:2px}
.sr .lookline{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:10px 0;border-top:1px dashed var(--rule);text-decoration:none;color:var(--ink);font-size:14.5px;line-height:1.45}
.sr .lookline:first-of-type{border-top:none}
.sr .lookline .try{font:500 12.5px var(--mono);color:var(--builder);white-space:nowrap}
.sr .lookline:hover .try{text-decoration:underline}
.sr .lookline:hover .ln{color:var(--builder)}
.sr .note{background:var(--panel);border:1px solid var(--rule);border-radius:10px;padding:14px 16px;display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start}
.sr .note .tag{font:600 11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:5px 7px;border-radius:5px;border:1px solid currentColor;white-space:nowrap}
.sr .note .tag.w{color:var(--warn)} .sr .note .tag.h{color:var(--hot)} .sr .note .tag.k{color:var(--qa)}
.sr .note p{margin:0;font-size:14.5px} .sr .note p b{font-weight:600}
.sr a{color:var(--builder)} .sr a:focus-visible{outline:2px solid var(--builder);outline-offset:2px}
.sr footer{color:var(--muted);font-size:12.5px;border-top:1px solid var(--rule);padding-top:14px}
.sr .navlink{display:inline-block;border:1px solid var(--rule);border-radius:8px;padding:6px 12px;font:500 12.5px var(--mono);text-decoration:none;color:var(--muted)}
.sr .navlink:hover{color:var(--ink);border-color:var(--muted)}
`

const WDof = (key, year) => WD[new Date(Date.UTC(year, +key.slice(0, 2) - 1, +key.slice(3, 5))).getUTCDay()]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const hrLabel = hr => (hr === 0 ? '12a' : hr === 12 ? '12p' : hr < 12 ? `${hr}a` : `${hr - 12}p`)
const parts = key => ({ d: +key.slice(3, 5), hr: +key.slice(6, 8), mo: +key.slice(0, 2) })

function MergesChart({ rows, idle, year }) {
    const ref = useRef(null)
    useEffect(() => {
        const box = ref.current
        if (!box) return
        box.innerHTML = ''
        const css = n => getComputedStyle(box.parentElement).getPropertyValue(n).trim()
        const NS = 'http://www.w3.org/2000/svg'
        const el = (t, a, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); (p || box).appendChild(e); return e }
        const W = 720, Ht = 200, L = 26, R = 8, T = 12, B = 34, cw = (W - L - R) / rows.length
        const max = Math.max(6, ...rows.map(r => r[1] + r[2] + r[3]))
        const s = el('svg', { viewBox: `0 0 ${W} ${Ht}`, role: 'img', 'aria-label': 'Merged PRs per hour by lane' })
        const y = v => T + (Ht - T - B) * (1 - v / max)
        if (idle) {
            el('rect', { x: L + idle.start * cw, y: T, width: (idle.end - idle.start + 1) * cw, height: Ht - T - B, fill: css('--warn'), opacity: .12 }, s)
            const tx = el('text', { x: L + idle.start * cw + 4, y: T + 10 }, s)
            tx.textContent = 'builder idle'
            tx.setAttribute('style', 'fill:' + css('--warn'))
        }
        const step = Math.max(1, Math.ceil(max / 3))
        for (let v = 0; v <= max; v += step) {
            el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: css('--rule'), 'stroke-width': 1 }, s)
            const t = el('text', { x: L - 6, y: y(v) + 3, 'text-anchor': 'end' }, s)
            t.textContent = v
        }
        rows.forEach((r, i) => {
            let acc = 0
            ;[[1, '--builder'], [2, '--qa'], [3, '--ops']].forEach(([k, c]) => {
                const v = r[k]
                if (!v) return
                el('rect', { x: L + i * cw + 1, y: y(acc + v), width: cw - 2, height: y(acc) - y(acc + v) - .5, fill: css(c), rx: 1.5 }, s)
                acc += v
            })
            const { hr } = parts(r[0])
            if (hr === 0) {
                el('line', { x1: L + i * cw, x2: L + i * cw, y1: T, y2: Ht - B + 4, stroke: css('--muted'), 'stroke-width': 1, 'stroke-dasharray': '2 3' }, s)
                const t = el('text', { x: L + i * cw + 3, y: Ht - B + 26 }, s)
                t.textContent = WDof(r[0], year)
                t.setAttribute('style', 'fill:' + css('--ink') + ';font-weight:500')
            }
            if (hr % 6 === 0) {
                const t = el('text', { x: L + i * cw + cw / 2, y: Ht - B + 13, 'text-anchor': 'middle' }, s)
                t.textContent = hrLabel(hr)
            }
        })
    }, [rows, idle, year])
    return <div className="chart" ref={ref} />
}

const Machine = ({ name, sub, series, pct, color }) => (
    <div className="mrow">
        <div className="mname">{name}<small>{sub}</small></div>
        <div className="strip">
            {series.map((v, i) => v == null
                ? <span key={i} style={{ background: 'transparent', outline: '1px dashed var(--rule)', outlineOffset: '-1px' }} />
                : <span key={i} style={{ background: `color-mix(in srgb, var(${color}) ${Math.round(12 + v * 88)}%, var(--rule))` }} />)}
        </div>
        <div className="mpct">{pct}</div>
    </div>
)

const pctOf = xs => {
    const v = xs.filter(x => x != null)
    if (!v.length) return '—'
    return `${Math.round(v.reduce((a, b) => a + b, 0) / v.length * 100)}%`
}

export default function ShiftReport() {
    const [report, setReport] = useState(null)
    const [error, setError] = useState('')
    const timer = useRef(null)

    useEffect(() => {
        for (const href of ['https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap']) {
            if (!document.querySelector(`link[href="${href}"]`)) {
                const l = document.createElement('link')
                l.rel = 'stylesheet'
                l.href = href
                document.head.appendChild(l)
            }
        }
    }, [])

    const load = useCallback(async () => {
        try {
            const r = await fetch(`${REPORT_URL}${REPORT_URL.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / REFRESH_MS)}`)
            if (!r.ok) throw new Error(`report feed ${r.status}`)
            setReport(await r.json())
            setError('')
        } catch (err) {
            setError(`${err.message} — the telemetry job regenerates the report every 4 hours`)
        }
        clearTimeout(timer.current)
        timer.current = setTimeout(load, REFRESH_MS)
    }, [])

    useEffect(() => {
        load()
        return () => clearTimeout(timer.current)
    }, [load])

    if (error && !report) {
        return (
            <div className="sr absolute inset-0 overflow-y-auto">
                <style>{CSS}</style>
                <main className="sr-main">
                    <div className="eyebrow">jalfern.com/retrogames/forge · shift report</div>
                    <h1>Report offline</h1>
                    <p className="lede">{error}. <Link className="navlink" to="/forge">← the board</Link></p>
                </main>
            </div>
        )
    }
    if (!report) {
        return (
            <div className="sr absolute inset-0 overflow-y-auto">
                <style>{CSS}</style>
                <main className="sr-main">
                    <div className="eyebrow">jalfern.com/retrogames/forge · shift report</div>
                    <h1>Reading the shift…</h1>
                </main>
            </div>
        )
    }

    const st = report.stats
    const ci = report.ci
    const first = report.rows[0]
    const last = report.rows[report.rows.length - 1]
    const year = new Date(report.generated).getUTCFullYear()
    const axisLabel = k => `${WDof(k, year)} ${+k.slice(3, 5)}, ${hrLabel(parts(k).hr)}`

    return (
        <div className="sr absolute inset-0 overflow-y-auto bg-transparent">
            <style>{CSS}</style>
            <main className="sr-main">
                <header>
                    <div className="eyebrow">
                        jalfern.com/retrogames/forge · shift report ·{' '}
                        <Link to="/forge" className="navlink" style={{ border: 'none', padding: 0 }}>← board</Link>
                    </div>
                    <h1>{report.headline}</h1>
                    {report.lede && <p className="lede" dangerouslySetInnerHTML={{ __html: report.lede }} />}
                </header>

                {report.look && report.look.length > 0 && (
                    <section className="golook" aria-label="Go look">
                        <div className="eyebrow">go look</div>
                        <h2>Two things to try</h2>
                        <p className="sub" style={{ marginBottom: 6 }}>The changes from this shift you most want to see — tap through and play them.</p>
                        {report.look.map((g, i) => (
                            <a className="lookline" href={g.href} key={`${g.href}-${i}`}>
                                <span className="ln">{g.text}</span>
                                <span className="try">try it →</span>
                            </a>
                        ))}
                    </section>
                )}

                <section className="stats" aria-label="Totals">
                    <div className="stat"><div className="n">{st.merged.total}</div>
                        <div className="l">PRs merged<br />{st.merged.qa} QA · {st.merged.builder} builder · {st.merged.ops} ops</div></div>
                    <div className="stat"><div className="n">{st.issues.closed}</div>
                        <div className="l">issues closed<br />{st.issues.opened} opened</div></div>
                    <div className="stat"><div className="n">{st.overnight}</div>
                        <div className="l">merged between 11pm and 7am</div></div>
                    <div className="stat"><div className="n">{st.medianMergeMin ?? '—'} min</div>
                        <div className="l">median PR open → merged</div></div>
                </section>

                <section>
                    <h2>Merges by hour</h2>
                    <p className="sub">Each bar is one hour. The shaded band is the builder sitting idle.</p>
                    <div className="legend">
                        <span><i style={{ background: 'var(--builder)' }} />Builder</span>
                        <span><i style={{ background: 'var(--qa)' }} />QA lanes</span>
                        <span><i style={{ background: 'var(--ops)' }} />Ops, docs, fixes</span>
                    </div>
                    <MergesChart rows={report.rows} idle={report.idle} year={year} />
                </section>

                <section>
                    <h2>Machines</h2>
                    <p className="sub">Five-minute telemetry samples, rolled up by hour. Darker means busier.</p>
                    <div className="machines">
                        <Machine name="Mac mini" sub="QA lane" series={report.machines.mini} pct={pctOf(report.machines.mini)} color="--qa" />
                        <Machine name="MacBook Pro" sub="QA lane" series={report.machines.mbp} pct={pctOf(report.machines.mbp)} color="--qa" />
                        <Machine name="Mac Studio" sub="builder + QA · load avg" series={report.machines.studio}
                            pct={(() => { const v = report.machines.studioLoad.filter(x => x != null); return v.length ? `${Math.round(v[0])}→${Math.round(v[v.length - 1])}` : '—' })()} color="--builder" />
                        <div className="axis"><div /><div><span>{axisLabel(first[0])}</span><span>{axisLabel(report.rows[24] ? report.rows[24][0] : first[0])}</span><span>{axisLabel(last[0])}</span></div><div /></div>
                    </div>
                </section>

                <section>
                    <h2>What shipped</h2>
                    <p className="sub">The {st.merged.total} merged PRs, grouped by what they touched. Bar color shows which lane did the work.</p>
                    <div className="themes">
                        {report.themes.map(t => (
                            <div className="theme" key={t.name}>
                                <div className="top"><span className="name">{t.name}</span><span className="cnt">{t.count}</span></div>
                                <div className="bar">
                                    {['builder', 'qa', 'ops'].map(k => t.split[k]
                                        ? <span key={k} style={{ width: `${t.split[k] / t.count * 100}%`, background: `var(--${k})` }} /> : null)}
                                </div>
                                <p>{t.text}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section>
                    <h2>CI</h2>
                    <p className="sub">CI sets my pace. A PR waits about as long as its CI run takes.</p>
                    <div className="ci">
                        <div><div className="n">{ci.finished}</div><div className="l">CI runs finished<br />{ci.medianMin} min median, {ci.p90Min} min p90</div></div>
                        <div><div className="n">{Math.round(ci.totalMin / 60)} h</div><div className="l">of runner wall-clock<br />{ci.totalMin.toLocaleString()} minutes</div></div>
                        <div><div className="n">{ci.cancelled}</div><div className="l">runs cancelled<br />{ci.cancelledMain} on main, each superseded by the next merge</div></div>
                        <div><div className="n">{ci.mainFails}×</div><div className="l">main went red</div></div>
                        <div><div className="n">{ci.nightlyTotal}</div><div className="l">nightly runs<br />{ci.nightlyGreen} green</div></div>
                        <div><div className="n">{ci.closedUnmerged}</div><div className="l">PR closed unmerged</div></div>
                    </div>
                </section>

                {report.notes && report.notes.length > 0 && (
                    <section>
                        <h2>Notes from the forge</h2>
                        <div className="notes">
                            {report.notes.map((n, i) => (
                                <div className="note" key={i}>
                                    <span className={`tag ${n.tag || 'k'}`}>{n.tag === 'h' ? 'Idle' : n.tag === 'w' ? 'Detail' : n.tag === 'k' ? 'Fleet' : n.tag}</span>
                                    <p dangerouslySetInnerHTML={{ __html: n.text }} />
                                </div>
                            ))}
                        </div>
                        {report.notesCarried && (
                            <p className="sub" style={{ marginTop: 10 }}>
                                Notes carried from the last builder session ({String(report.notesFrom).slice(0, 16).replace('T', ' ')}) — numbers below are live.
                            </p>
                        )}
                    </section>
                )}

                <footer>
                    Sources: GitHub PRs, issues and Actions runs for jalfern/retrogames, plus forge-telemetry samples,
                    generated {String(report.generated).slice(0, 16).replace('T', ' ')} UTC. Lanes are inferred from branch names
                    (forge/… = builder, qa/… = QA, everything else = ops). Only the headline, lede, notes and go-look picks are model-written.
                </footer>
            </main>
        </div>
    )
}
