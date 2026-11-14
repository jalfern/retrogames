// #2121 — is a lane's box already driven by a session the warden cannot see?
//
// The warden's idle detector is `pgrep -f "opencode run.*..."`. A session
// hosted by `opencode serve` never appears in that signature: its prompt
// lives inside the serve process, and only its CHILDREN (the lane's pinned
// `vite --port <DEV> --strictPort`, its check scripts) touch the box. The
// warden then kicks a duplicate session onto the same worktree and port
// (#2036 slot a, 2026-11-14 studio QA: the duplicate's own vite died on
// strictPort while the ghost committed minutes later).
//
// The pinned port is the witness: a dev server listening on a lane's fixed
// DEV port, spawned by a live opencode process and YOUNG, means that lane
// has a driver this tick — regardless of what pgrep can name.
//
// Pure decision (laneVerdict): injected listeners, deterministic, pinned by
// lanecheck. The collector (laneBusy) only translates lsof/ps into that
// shape and prints `BUSY <pid>` / `FREE`.

const OPENCODE = /(opencode|opencode\.exe)/

// listeners: [{ pid, startedSec, chain: [cmdAncestorOldest...cmdSelf] }]
// capSec: max age of the dev server that still counts as live work
//         (session cap 75 min + tick slack; pass it explicitly).
// Returns { driven, pid, age } — driven=true only when some listener on the
// lane's port descends from a live opencode process and started within capSec.
// Orphans reparented to launchd (chain without opencode) are FREE: that is
// the normal dead-lane state the kick must recover from, and a server that
// outlives the cap is treated as one whatever its ancestry claims.
export function laneVerdict(listeners, capSec, nowSec) {
    let best = null
    for (const l of listeners || []) {
        const age = nowSec - l.startedSec
        if (age < 0 || age > capSec) continue
        if (!(l.chain || []).some((cmd) => OPENCODE.test(cmd))) continue
        if (!best || l.startedSec > best.startedSec) best = l
    }
    return best
        ? { driven: true, pid: best.pid, age: Math.round(nowSec - best.startedSec) }
        : { driven: false, pid: 0, age: -1 }
}

// --- collector (thin, OS-shaped; the logic above is what gets pinned) ------
import { execFileSync } from 'node:child_process'

export function laneBusy(port, capSec) {
    const nowSec = Math.floor(Date.now() / 1000)
    let pids = []
    try {
        const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
            { encoding: 'utf8', timeout: 5000 })
        pids = out.split('\n').map((s) => s.trim()).filter(Boolean).map(Number)
    } catch { /* nothing listening = FREE, and a missing lsof must never block a kick */ }
    const listeners = []
    for (const pid of pids) {
        const chain = []
        let startedSec = 0
        try {
            let p = pid
            for (let hops = 0; p > 1 && hops < 12; hops++) {
                const cmd = execFileSync('ps', ['-o', 'command=', '-p', String(p)],
                    { encoding: 'utf8', timeout: 5000 }).trim()
                if (!cmd) break
                chain.unshift(cmd)
                if (p === pid) {
                    // lstart is locale-shaped; hand the whole string to Date.
                    const st = execFileSync('ps', ['-o', 'lstart=', '-p', String(p)],
                        { encoding: 'utf8', timeout: 5000 }).trim()
                    const t = Date.parse(st)
                    if (Number.isFinite(t)) startedSec = Math.floor(t / 1000)
                }
                const pp = Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(p)],
                    { encoding: 'utf8', timeout: 5000 }).trim())
                if (!Number.isFinite(pp) || pp <= 1) break
                p = pp
            }
        } catch { continue }
        listeners.push({ pid, startedSec, chain })
    }
    return laneVerdict(listeners, capSec, nowSec)
}

if (process.argv[1] && process.argv[1].endsWith('lanebusy.mjs')) {
    const a = process.argv.slice(2)
    const port = Number(a[a.indexOf('--port') + 1] || 0)
    const cap = Number(a[a.indexOf('--cap') + 1] || 5400)
    if (!port) { console.log('usage: lanebusy.mjs --port <n> [--cap <sec>]'); process.exit(2) }
    const v = laneBusy(port, cap)
    console.log(v.driven ? `BUSY ${v.pid} age=${v.age}s` : 'FREE')
}
