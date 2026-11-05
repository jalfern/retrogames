// #1614 — the oMLX key lives once; the Studio taps copy it.
//
// Jon rotates the key in provider.omlx.options.apiKey of
// ~/.config/opencode/opencode.json. The three Studio tap providers
// (omlxtap, omlxtapstudio, omlxtapb) keep their OWN copies of it, and a
// stale copy kills every builder/QA session at the first request
// ("Error: Invalid API key", launchd exit 1 — Nov 5, 10:12–13:03, every
// slot-a and QA·Studio launch died and the warden called it `stalled`).
// syncKeys() re-copies the source into the taps at every lane launch. The
// Mini/MBP trio (omlxmini, omlxtapmini, omlxmbp) has its own key and is
// NEVER touched here.
//
// scanKeyDeath() answers the warden's other half of #1614: a lane whose
// launchd job keeps exiting non-zero is checked for the key-death
// signatures — then the pulse says `keydead` and a waiting-jon note opens,
// instead of the wrong `stalled` label.
//
// Secrets law (the issue's own): nothing in this file ever prints a key
// value. Sync summaries name PROVIDERS; scan answers name CATEGORIES.
//
// CLI (what forge.sh / forge-qa.sh / warden.sh materialise and run):
//   node keysync.mjs sync [configPath]   # re-copy source -> taps, atomically
//   node keysync.mjs check-log <file>   # KEYDEAD <kind> | ok  (never the line)
// Both exit 0 whatever happens: a lane must never fail to start because
// the key plumbing hiccuped (fail-open — the route check downstream still
// falls back to talking to oMLX direct).

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const KEY_SOURCE = 'omlx'
export const TAP_TARGETS = ['omlxtap', 'omlxtapstudio', 'omlxtapb']
export const PROTECTED = ['omlxmini', 'omlxtapmini', 'omlxmbp']

// Copy the source key into every EXISTING tap provider that lags behind.
// Mutates and returns the config; `updated` names the providers written.
// Never invents providers (clone-on-demand stays where it is), never
// touches PROTECTED or the source itself.
export function syncKeys(config) {
    const src = config?.provider?.[KEY_SOURCE]?.options?.apiKey
    if (typeof src !== 'string' || src === '') return { config, updated: [], reason: 'no-source-key' }
    const updated = []
    for (const name of TAP_TARGETS) {
        const p = config.provider?.[name]
        if (!p || typeof p !== 'object') continue
        if (!p.options || typeof p.options !== 'object') p.options = {}
        if (p.options.apiKey !== src) { p.options.apiKey = src; updated.push(name) }
    }
    return { config, updated, reason: 'ok' }
}

// Key-death signatures, in priority order. Each answers a category token —
// never the matched line (a log line could carry the key itself).
export const KEYDEAD_SIGNATURES = [
    ['invalid-key', /invalid api key/i],
    ['unauthorized-401', /\b401\b[^\n]{0,40}unauthorized|unauthorized[^\n]{0,40}\b401\b/i],
    ['status-401', /\b(?:status|http|response|code)[\s=:]+401\b/i],
]

// Return the first matching signature category, or null.
export function scanKeyDeath(text) {
    if (typeof text !== 'string') return null
    for (const [kind, re] of KEYDEAD_SIGNATURES) if (re.test(text)) return kind
    return null
}

// Atomic write beside the config (same dir => same volume => rename is
// atomic; a crash can only leave the OLD config or the NEW one).
function writeAtomic(path, text) {
    const tmp = join(dirname(path), `.keysync-${process.pid}.tmp`)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(tmp, text)
    renameSync(tmp, path)
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const [cmd, arg] = process.argv.slice(2)
    if (cmd === 'sync') {
        const cfgPath = arg || join(homedir(), '.config/opencode/opencode.json')
        let raw
        try {
            raw = readFileSync(cfgPath, 'utf8')
        } catch {
            console.log('keysync: skipped no-config')
            process.exit(0)
        }
        let config
        try {
            config = JSON.parse(raw)
        } catch {
            console.log('keysync: skipped bad-json')
            process.exit(0)
        }
        const { updated } = syncKeys(config)
        if (updated.length === 0) {
            console.log(`keysync: nothing to do (${config?.provider?.[KEY_SOURCE]?.options?.apiKey ? 'current' : 'no-source-key'})`)
            process.exit(0)
        }
        try {
            writeAtomic(cfgPath, JSON.stringify(config, null, 2) + '\n')
            console.log(`keysync: refreshed ${updated.join(',')} from ${KEY_SOURCE}`)
        } catch {
            console.log('keysync: skipped write-failed')
        }
        process.exit(0)
    }
    if (cmd === 'check-log') {
        let text = ''
        try { text = readFileSync(arg, 'utf8') } catch { console.log('ok'); process.exit(0) }
        const kind = scanKeyDeath(text)
        console.log(kind ? `KEYDEAD ${kind}` : 'ok')
        process.exit(0)
    }
    console.log('usage: keysync.mjs sync [configPath] | check-log <file>')
    process.exit(2)
}
