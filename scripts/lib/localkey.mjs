// LOCALKEY (#2157) — the store secrets a lane needs, resolved from gitignored
// local config instead of forcing Jon (or the lane) to prefix every command.
//
// Resolution order, per name (JON_KEY, SESSION_WRITE_KEY):
//   1. process.env[name]                      — explicit inline always wins;
//   2. `.env.local` at the CURRENT worktree root;
//   3. `.env.local` at the SHARED repo root — the parent of
//      `git rev-parse --git-common-dir`, i.e. ~/Dev/retrogames for every
//      lane worktree. Jon drops the key ONCE there; all worktrees read it.
//
// The VALUE never leaves this module except to its caller: nothing here logs
// it, keySource() names the source (env / file path / null) for diagnostics,
// and #2157's acceptance line — no key in git grep or posted comments — holds
// because the only consumers pass it straight into request headers.
//
// File format: plain KEY=value lines. Blank lines and #-comments ignored,
// values trimmed, one layer of matching quotes stripped. First file/first
// occurrence wins (cwd beats repo root).

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

let candidatesCache = null
let filesCache = null

export function envFileCandidates() {
    if (candidatesCache) return candidatesCache
    const dirs = [process.cwd()]
    try {
        const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
        if (common) dirs.push(path.resolve(process.cwd(), common, '..'))
    } catch { /* not a git checkout — cwd only */ }
    candidatesCache = [...new Set(dirs.map((d) => path.join(d, '.env.local')))]
    return candidatesCache
}

function parseEnvFile(text) {
    const out = {}
    for (const line of text.split(/\r?\n/)) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        const i = t.indexOf('=')
        if (i < 1) continue
        let v = t.slice(i + 1).trim()
        if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1)
        const k = t.slice(0, i).trim()
        if (k && !(k in out)) out[k] = v
    }
    return out
}

function localEnv() {
    if (filesCache) return filesCache
    const merged = {}
    for (const f of envFileCandidates()) {
        let text = null
        try { text = fs.readFileSync(f, 'utf8') } catch { /* absent is normal */ }
        if (text === null) continue
        const map = parseEnvFile(text)
        for (const [k, v] of Object.entries(map)) if (!(k in merged)) merged[k] = v
    }
    filesCache = merged
    return merged
}

/** Secret value for `name`, or null. Never log the return value. */
export function readKey(name) {
    if (process.env[name]) return process.env[name]
    return localEnv()[name] || null
}

/** Where a resolved secret came from — safe to print (never the value). */
export function keySource(name) {
    if (process.env[name]) return 'env'
    if (localEnv()[name]) return localEnvFileFor(name) || '.env.local'
    return null
}

function localEnvFileFor(name) {
    for (const f of envFileCandidates()) {
        let text = null
        try { text = fs.readFileSync(f, 'utf8') } catch { continue }
        if (name in parseEnvFile(text)) return f
    }
    return null
}

/** Test hook: forget cached files/cwd between self-test phases. */
export function resetLocalKeyCache() {
    candidatesCache = null
    filesCache = null
}
