// SESSIONS (#1711) — the admin view, in one command: what human sessions are
// sitting in the private store? Player, game, length, audio yes/no. Uses the
// same client the games use (src/utils/sessionStore.js) so the listing path is
// the proven path, and the same relay default.
//
//   npm run sessions                  # list the store (default base)
//   npm run sessions -- --limit 200
//   npm run sessions -- --store https://other.host --json
//   npm run sessions -- relabel <key> [<key>…] [--seat N]
//       # repair seat provenance on stored takes (#2093 item 1): the store's
//       # ONE allowed write, model→human on one seat (fixed operation — see
//       # relay/core.js applySessionRelabel). The #2093 one-off:
//       # JON_KEY=<secret> npm run sessions -- relabel \
//       #   gauntlet/2026-11-11-seed15-8fdbfeef08.json \
//       #   gauntlet/2026-11-11-seed59-182a1f4459.json \
//       #   gauntlet/2026-11-11-seed59-5a9737e569.json
//
// The read lockdown (#1711 S8): the store refuses reads AND relabel writes
// without the key, so run as `JON_KEY=<secret> npm run sessions` (the same
// secret the worker deploys with; uploads from phones do not need it).
//
// Exit codes: 0 listing succeeded (even when empty) / every relabel applied,
// 1 store unreachable, not configured, or any relabel refused — a cron can
// watch it.

import { listSessions, relabelSession, storeFromQuery, tickSeconds } from '../src/utils/sessionStore.js'

const argv = process.argv.slice(2)
const flagVal = (name, dflt) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`))
    if (hit) return hit.split('=').slice(1).join('=')
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
}
const base = flagVal('store', process.env.SESSION_STORE || storeFromQuery(''))
const limit = Number(flagVal('limit', 50)) || 50
const asJson = argv.includes('--json')
const key = process.env.JON_KEY || null
const command = argv.find((a) => !a.startsWith('--'))

if (command === 'relabel') {
    const targets = argv.filter((a) => !a.startsWith('--') && a !== 'relabel')
    const seat = Number(flagVal('seat', 0)) || 0
    if (!targets.length) {
        console.error('relabel: give at least one stored key (see `npm run sessions -- --help` shape above)')
        process.exit(1)
    }
    if (!key) {
        console.error('relabel: set JON_KEY (the write rides the read lockdown, #1711 S8)')
        process.exit(1)
    }
    let bad = 0
    for (const target of targets) {
        const res = await relabelSession(target, { seat, base, key })
        if (res.ok) console.log(`relabeled  ${target}  seat ${seat}: model -> human`)
        else { bad++; console.error(`REFUSED    ${target}  — ${res.reason}`) }
    }
    process.exit(bad ? 1 : 0)
}

const res = await listSessions({ base, limit, key })
if (asJson) {
    console.log(JSON.stringify(res, null, 2))
    process.exit(res.ok ? 0 : 1)
}
if (!res.ok) {
    const hint = res.reason === 'unauthorized' ? ' — set JON_KEY (the read lockdown, #1711 S8)' : ''
    console.error(`sessions: ${res.reason || 'store unreachable'}${hint} (base ${base})`)
    process.exit(1)
}
if (!res.sessions.length) {
    console.log(`store empty (base ${base})`)
    process.exit(0)
}
const pad = (s, n) => String(s).padEnd(n)
console.log(`${pad('PLAYER', 16)}${pad('GAME', 20)}${pad('SEED', 7)}${pad('LEN', 8)}AUDIO  KEY`)
for (const s of res.sessions) {
    console.log(`${pad(s.player || '?', 16)}${pad(s.game || '?', 20)}${pad(s.seed, 7)}${pad(tickSeconds(s.ticks) + 's', 8)}${pad(s.audio ? 'yes' : 'no', 6)}${s.key}`)
}
console.log(`${res.sessions.length} session(s) (base ${base})`)
