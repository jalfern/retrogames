// PLAICRAFT (#1625) — the studio's recorded-play -> dataset -> model -> seat
// pipeline, written up honestly. Numbers here are the single held-out scoring
// committed to public/research/results.json by scripts/plaicraft-train.mjs
// (npm run plaicraft:train); the page never trains anything — it reports.
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const BASE = import.meta.env.BASE_URL || '/retrogames/'

const th = { padding: '6px 10px', textAlign: 'left', color: '#ffd23f', fontWeight: 700, borderBottom: '1px solid #2c3a52' }
const td = { padding: '6px 10px', borderBottom: '1px solid #1c2636' }
const h2 = { color: '#5dc8ff', fontSize: 15, margin: '22px 0 8px', letterSpacing: 1 }

export default function Research() {
    const [r, setR] = useState(null)
    const [err, setErr] = useState('')
    useEffect(() => {
        fetch(`${BASE}research/results.json`).then((x) => { if (!x.ok) throw new Error(String(x.status)); return x.json() }).then(setR).catch((e) => setErr(String(e.message || e)))
    }, [])
    const h = r && r.rollout && r.rollout.heldout
    const tf = r && r.teacherForcing
    return (
        <div className="w-full h-full relative overflow-y-auto" style={{ background: '#0a0f18', color: '#c9d6ee', fontFamily: 'ui-monospace, Menlo, monospace' }}>
            <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 20px 60px' }}>
                <div style={{ color: '#ffd23f', fontSize: 22, letterSpacing: 2 }}>PLAICRAFT</div>
                <div style={{ color: '#8fa3d8', fontSize: 13, marginTop: 4 }}>recorded play → dataset → model → seat · research notes · issue #1625</div>

                <p style={{ fontSize: 13, lineHeight: 1.7, marginTop: 18 }}>
                    Plaicraft turns what the arcade <em>already records</em> into a model that plays.
                    The pilot is <Link to="/gauntlet" style={{ color: '#5dc8ff' }}>GAUNTLET</Link>: the studio records real
                    games — the proven planner route in seat 1, the game&apos;s own CPU partner in seat 2 — exports them as
                    clean training rows, behaviour-clones a tiny network from those rows, and seats the trained net back in
                    the same slot. It plays the real game at real speed, on the same rules: THE one pad out, the sim can&apos;t
                    tell it apart from a thumb.
                </p>

                <h2 style={h2}>THE PIPELINE</h2>
                <ol style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 20 }}>
                    <li><b style={{ color: '#5dff8f' }}>Export</b> — <code>npm run plaicraft:export</code>: 20 recorded runs (12 practice
                        seeds 0–11, 8 held-out seeds 100–107) as <code>retrogames-rec/v1</code> files, each replay-verified against
                        the sim (state-hash match every 30 ticks), then a JSONL dataset: per tick, the seat&apos;s own 32 senses
                        (range-finder rays, hero bearing + headings + look-ahead prediction, nearest monster and food, last
                        action) and the expert&apos;s pad. <code>data/plaicraft/README.md</code> documents the format.</li>
                    <li><b style={{ color: '#5dff8f' }}>Train</b> — <code>npm run plaicraft:train</code>: one 32-24-24-5 MLP, deterministic
                        (zero dependencies, fixed seed, fixed hyperparameters — no sweeps). Choose on practice, score once on
                        held-out — the discipline from weight surgery.</li>
                    <li><b style={{ color: '#5dff8f' }}>Seat</b> — the quantized weights ship with the game (<code>src/games/Gauntlet/policy.js</code>,
                        1517 numbers). On the hero-select screen, <b>M</b> seats the BRAIN in slot 2; C and P still work; any
                        input takes the seat back like any partner source.</li>
                    <li><b style={{ color: '#5dff8f' }}>Gate</b> — <code>npm run plaicraftcheck</code>: recordings replay exact, the seat
                        predicts the expert &gt;90% of movement ticks, the seated brain follows the hero and survives, and a
                        mutant (dead weights) collapses the same gate — proof it can fail.</li>
                </ol>

                <h2 style={h2}>SCORED ONCE — HELD-OUT SEEDS 100–107</h2>
                {err && <div style={{ color: '#ff5d5d', fontSize: 12 }}>results.json unavailable: {err}</div>}
                {h && (
                    <table style={{ fontSize: 13, borderCollapse: 'collapse', marginTop: 4 }}>
                        <thead><tr><th style={th}>same maze, same route</th><th style={th}>CPU partner</th><th style={th}>trained net</th></tr></thead>
                        <tbody>
                            <tr><td style={td}>mazes won</td><td style={td}>{h.wins.cpu} / {h.wins.of}</td><td style={td}>{h.wins.model} / {h.wins.of}</td></tr>
                            <tr><td style={td}>avg mazes cleared</td><td style={td}>{h.avgLevels.cpu}</td><td style={td}>{h.avgLevels.model}</td></tr>
                            <tr><td style={td}>avg score</td><td style={td}>{Math.round(h.avgScore.cpu).toLocaleString()}</td><td style={td}>{Math.round(h.avgScore.model).toLocaleString()}</td></tr>
                            <tr><td style={td}>avg kills (party)</td><td style={td}>{h.avgKills.cpu}</td><td style={td}>{h.avgKills.model}</td></tr>
                            <tr><td style={td}>partner downed</td><td style={td}>{h.partnerDeaths.cpu}</td><td style={td}>{h.partnerDeaths.model}</td></tr>
                            {tf && <tr><td style={td}>tick-level agreement</td><td style={td}>—</td><td style={td}>{(tf.heldout.moveAcc * 100).toFixed(1)}% moves · {(tf.heldout.intentAcc * 100).toFixed(0)}% swing intent</td></tr>}
                        </tbody>
                    </table>
                )}
                {tf && (
                    <p style={{ fontSize: 12, color: '#8fa3d8', marginTop: 10 }}>
                        Teacher-forcing agreement on practice ({(tf.practice.moveAcc * 100).toFixed(1)}%) matches held-out
                        ({(tf.heldout.moveAcc * 100).toFixed(1)}%) — it generalised across unseen mazes, it didn&apos;t memorise routes.
                    </p>
                )}

                <h2 style={h2}>HONEST NOTES</h2>
                <ul style={{ fontSize: 12.5, lineHeight: 1.8, paddingLeft: 18, color: '#aab8d8' }}>
                    <li>The teacher is the studio&apos;s own CPU partner — the clone learns the CPU&apos;s doctrine, not a human&apos;s.
                        That was deliberate for the pilot: the comparison &quot;model vs CPU on the same seeds&quot; is then exact.</li>
                    <li>Score lands above the CPU partly because the net&apos;s swing trigger is a touch more eager — it clears more
                        roamers but took one hit its teacher didn&apos;t. Cost/benefit is reported, not curated.</li>
                    <li>Early cuts of this pipeline trained to a constant: a bug indexing biases by the weight-block offset poisoned
                        every gradient to NaN and the net predicted &quot;always idle&quot; with a suspiciously stable 73% accuracy.
                        The mutant gate exists so that class of lie goes red, not green.</li>
                    <li>Reproducibility: export, train, and score are deterministic — same commit + same seeds → same weights and
                        the same numbers on this page.</li>
                </ul>

                <div style={{ marginTop: 26, fontSize: 12, color: '#5d7094' }}>
                    Built on the studio&apos;s rails — one pad (#420), player slots (#494), rec/v1 recordings (#495).
                    <br />Bylined: THE FORGE, slot A — Nov 2026. Board: <a href="https://github.com/jalfern/retrogames/issues/1625" style={{ color: '#5d7094' }}>issue #1625</a>.
                </div>
                <div style={{ marginTop: 18 }}>
                    <Link to="/gauntlet" style={{ color: '#ffd23f', fontSize: 13 }}>▶ PLAY GAUNTLET — press M on the hero select to seat the brain</Link>
                </div>
            </div>
        </div>
    )
}
