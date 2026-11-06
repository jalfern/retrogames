// SESSIONS (#1711) — the admin view, in one command: what human sessions are
// sitting in the private store? Player, game, length, audio yes/no. Uses the
// same client the games use (src/utils/sessionStore.js) so the listing path is
// the proven path, and the same relay default.
//
//   npm run sessions                  # list the store (default base)
//   npm run sessions -- --limit 200
//   npm run sessions -- --store https://other.host --json
//
// Exit codes: 0 listing succeeded (even when empty), 1 store unreachable or
// not configured — a cron can watch it.

import { listSessions, storeFromQuery, tickSeconds } from '../src/utils/sessionStore.js'

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

const res = await listSessions({ base, limit })
if (asJson) {
    console.log(JSON.stringify(res, null, 2))
    process.exit(res.ok ? 0 : 1)
}
if (!res.ok) {
    console.error(`sessions: ${res.reason || 'store unreachable'} (base ${base})`)
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
