// #3419 — quiet ≠ dead: a live session mid-silence must not be re-kicked.
//
// The idle detector has two witnesses: pgrep (blind to serve-hosted sessions,
// #2121) and the pinned DEV port (blind once the dev server outlives its age
// cap or a run stops it). On 2026-11-25 slot b sat ~3 h on one issue and its
// `skywardcheck --mutate` leg ran 30+ min in silence — both witnesses went
// dark at once and the warden spawned a SECOND slot-b session onto the same
// issue/worktree/port. The newcomer's devstop killed the live session's dev
// server; its own --mutate collided with the first session's merge mid-plant
// (mutateguard's #2049 abort is the only reason the sweep stayed honest).
//
// Three more witnesses before any spawn, each self-terminating:
//   pid   — the slot's own pgrep pattern (the planner counted minutes ago;
//           a session started since then closes the race);
//   sweep — a `.mutant-running` stamp (#2049) on the worktree the slot's
//           session log last named: the tree is frozen for a 30–60 min sweep.
//           Past the stamp cap it is SIGKILL residue (mutateguard removes it
//           on every caught signal) and must not wedge the lane;
//   stream — the slot's session log written within the stream cap: a live
//           session keeps streaming output; a crashed one stops. The cap
//           bounds recovery — same philosophy as the 90-min dead-holder path
//           (#1234): silence expires, the factory moves. A log whose tail
//           carries the launcher's `session exit=` line is a session that is
//           DONE, not one mid-silence — a finished lane is kickable immediately
//           (this witness must never tax normal turnaround).
//
// Pure decision (slotVerdict): pinned by lanecheck section G. The collector
// (slotLive) only translates pgrep/stat into that shape and prints
// `LIVE <why>` / `QUIET`. A broken collector answers QUIET — this witness
// holds back duplicates, never the factory (E7's fail-open, reversed).

export const DEFAULT_STAMP_CAP_MIN = 120 // a 30–60 min sweep + slack; KILL-residue expires
export const DEFAULT_LOG_CAP_MIN = 45    // the documented ≈30-min silent sweep + slack

// sig: { pidAlive: bool, stampAgeMin: number|null, logAgeMin: number|null,
//        logExited: bool }
// null age = that signal is absent (no log file, no worktree named, no stamp).
export function slotVerdict(sig, caps = {}) {
    const stampCap = caps.stampCapMin ?? DEFAULT_STAMP_CAP_MIN
    const logCap = caps.logCapMin ?? DEFAULT_LOG_CAP_MIN
    if (sig && sig.pidAlive) return { busy: true, why: 'pid' }
    const s = sig && sig.stampAgeMin
    if (s != null && s >= 0 && s <= stampCap) return { busy: true, why: 'mutant-sweep' }
    const l = sig && sig.logAgeMin
    if (l != null && l >= 0 && l <= logCap && !(sig && sig.logExited)) return { busy: true, why: 'stream' }
    return { busy: false, why: '' }
}

// --- collector (thin, OS-shaped; the logic above is what gets pinned) ------
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'

// The lane worktrees a session named in its own log (`git worktree add` echoes
// the path): forge and qa slugs only — never the main checkout. Capture the
// WHOLE absolute path — starting the match at /Dev/ would hand back a rooted
// `/Dev/…` and the stamp stat could never resolve.
const WT_RE = /(\/[^\s"'`)]*retrogames-(?:forge|qa)-[A-Za-z0-9][A-Za-z0-9_-]*)/g

export function slotLive({ pat, log, stampCapMin, logCapMin }) {
    const now = Date.now()
    let pidAlive = false
    if (pat) {
        // pgrep -f also sees THIS process: the pattern travels in our own argv.
        // pgrep excludes itself but not us — drop self + parent by pid.
        try {
            const out = execFileSync('pgrep', ['-f', pat], { encoding: 'utf8', timeout: 5000 })
            pidAlive = out.split('\n').map((s) => Number(s.trim()))
                .some((pid) => Number.isFinite(pid) && pid > 1 && pid !== process.pid && pid !== process.ppid)
        } catch { /* exit 1 = no match; missing pgrep must never claim a driver */ }
    }
    let logAgeMin = null
    let logExited = false
    let stampAgeMin = null
    let text = ''
    try { text = readFileSync(log, 'utf8') } catch { /* no log = no witness */ }
    if (text) {
        // APFS mtimes carry sub-ms precision and can stamp slightly AHEAD of
        // Date.now() — a file written this instant can age negative, which the
        // verdict (rightly) rejects as nonsense. Without the clamp the freshest
        // signals die in exactly the race this witness exists for (observed:
        // G12 flaked on ±0.00001 min). Skew beyond a minute stays nonsense.
        const clampNeg = (ageMin) => (ageMin < 0 && ageMin >= -1 ? 0 : ageMin)
        try { logAgeMin = clampNeg((now - statSync(log).mtimeMs) / 60000) } catch { /* ignore */ }
        // The launcher's final line (`… session exit=0`). Only the tail of the
        // log counts — a session that *read* forge.sh has the source, with the
        // unevaluated `$STATUS`, somewhere in the middle.
        logExited = /session exit=\d/.test(text.slice(-200))
        // tail only — the LAST worktree the session named is the one it is in.
        const hits = text.slice(-65536).match(WT_RE)
        const wt = hits && hits[hits.length - 1]
        if (wt) {
            try { stampAgeMin = clampNeg((now - statSync(`${wt}/.mutant-running`).mtimeMs) / 60000) }
            catch { /* no stamp = the tree is not frozen */ }
        }
    }
    return slotVerdict(
        { pidAlive, stampAgeMin, logAgeMin, logExited },
        { stampCapMin, logCapMin },
    )
}

if (process.argv[1] && process.argv[1].endsWith('slotlive.mjs')) {
    const a = process.argv.slice(2)
    const arg = (k) => a[a.indexOf(k) + 1]
    const v = slotLive({
        pat: arg('--pat') || '',
        log: arg('--log') || '',
        stampCapMin: Number(arg('--stamp-cap')) || DEFAULT_STAMP_CAP_MIN,
        logCapMin: Number(arg('--log-cap')) || DEFAULT_LOG_CAP_MIN,
    })
    console.log(v.busy ? `LIVE ${v.why}` : 'QUIET')
}
