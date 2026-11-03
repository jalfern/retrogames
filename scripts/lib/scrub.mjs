// scrub.mjs — #1536: the ONE shared secret scrub for lane output.
//
// jalfern/forge-telemetry is PUBLIC. A lane's terminal line carrying an
// `Authorization: Bearer …` header (the oMLX key) leaked through the board's
// `act` lines and GitGuardian flagged it (2026-11-03). The fix is a single
// function every writer pipes its payload through BEFORE anything is written
// to the telemetry repo:
//   telemetry.sh   — telemetry.json + board.json gates (shells out to the CLI)
//   dailylog.mjs   — log.json push
//   shiftreport.mjs— report.json push
//   nightlybot.mjs — nightly.json push
//
// Node callers import scrub(); telemetry.sh's inline python gates use the CLI
// (stdin -> stdout), materialised from origin/main like tps.mjs / runway.mjs.
// Pinned by scripts/scrubcheck.mjs (npm run scrubcheck).
//
// What is redacted (value -> `<redacted>`):
//   Authorization: <scheme> <value>   — the header's whole value, scheme word
//   Bearer <token>                     — anywhere
//   sk-… ghp_… gho_… github_pat_… xox…  — token-shaped on their own
//   key= token= secret= password=      — followed by a LONG hex/base64 value
// Short values after those names (password=hunter2, key=42) are not secret-
// shaped and stay readable on the board.

import { pathToFileURL } from 'node:url'
import { realpathSync } from 'node:fs'

export const REDACTED = '<redacted>'

// Token-shaped secrets on their own. Runs under 16 alphanumerics are not
// secret-shaped (the xox family is shorter in the wild, hence its own floor).
const TOKEN = /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{16,}|gho_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|xox[bpars]-[A-Za-z0-9-]{8,})/g

// Authorization: <scheme> <value> — the value (and its scheme word, e.g.
// Bearer/Basic) goes. The value class stops at a quote, so a JSON-serialised
// payload keeps its string boundaries intact.
const AUTHZ = /\bAuthorization:\s*(?:[A-Za-z]+\s+)?[A-Za-z0-9._~+\/=-]+/g

// Bearer <token> anywhere the AUTHZ gate did not already take it.
const BEARER = /\bBearer\s+[A-Za-z0-9._~+\/=-]+/g

// key= token= secret= password= followed by a long hex/base64 value
// (surrounding quotes, if any, go with it).
const ASSIGN = /\b(key|token|secret|password)\s*=\s*["']?[A-Za-z0-9+\/=_-]{16,}["']?/gi

export function scrub(text) {
    let out = String(text == null ? '' : text)
    out = out.replace(AUTHZ, `Authorization: ${REDACTED}`)
    out = out.replace(BEARER, `Bearer ${REDACTED}`)
    out = out.replace(TOKEN, REDACTED)
    out = out.replace(ASSIGN, `$1=${REDACTED}`)
    return out
}

// CLI (stdin -> stdout) for callers that cannot import (telemetry.sh's
// inline python gates). Scrubbing happens on whatever arrives — the gates
// feed it the whole payload right before the Contents-API PUT.
// realpathSync: /tmp is a symlink on macOS (/private/tmp), and
// pathToFileURL alone would never match import.meta.url there, so the CLI
// would sit silent with exit 0 and the gates would ship empty payloads.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
if (isMain) {
    let all = ''
    process.stdin.setEncoding('utf8')
    for await (const chunk of process.stdin) all += chunk
    process.stdout.write(scrub(all))
}
