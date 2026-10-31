#!/usr/bin/env node
// tps.mjs — one-line JSON snapshot of generation across ALL streams per machine
// (#1266; #1299 widens it from one stream to every stream on the box).
//
// watch.sh has shown gen t/s live from oMLX's own dashboard feed for a while,
// but nothing RECORDED it: the #1258 trial report could only use items/day.
// This samples the same feed telemetry can store: one line, printed once:
//   {"omlx":{"state":"gen","tps":62.7,"ctx":152647,"gen":596,"p":232494,"n":2,"tot":300427950},
//    "omlxmini":{"state":"idle","tps":0,"ctx":0,"gen":0,"p":0,"n":0,"tot":...},"omlxmbp":{...}}
// Keys are the provider names in ~/.config/opencode/opencode.json; ports are
// the same ones watch.sh reads (:8000 Studio, :18000/:18001 tunnels).
// #1299 (Jon): a box runs several streams at once — often 4, his own RETRO
// chat included — so one stream's t/s under-reads the machine. Every stream
// counts now, and the server's own cumulative counter (tot) makes exact
// tokens-per-hour differences possible over any interval.
// Contract (scripts/tpscheck.mjs pins it):
// - exits 0 and prints exactly one JSON object even when every machine is down;
// - state ∈ gen|prefill|idle|down; tps is a number, 0 unless state=gen;
// - tps = SUM of tokens_per_second over every generating stream (all streams);
// - ctx = prompt tokens of the first generating slot (0 when not generating);
// - gen = generated tokens in flight summed; p = prompt tokens summed over
//   every generating + prefilling stream; n = active stream count;
// - tot = total_tokens_served (cumulative since server boot), null when the
//   stats endpoint is unreachable — null must never break the line.
// Callers (telemetry.sh) embed it verbatim, so output must stay one line.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

// Ports are overridable for the tpscheck mutant (unreachable ports exercise
// the down-fallback on machines where the real servers are up).
let BOXES = [
  ['omlx', 8000],       // the Studio (builder + studio QA share it)
  ['omlxmini', 18000],  // Mac mini via the tunnel
  ['omlxmbp', 18001],   // MacBook via the tunnel
]
try {
  const o = JSON.parse(process.env.TPS_BOXES || 'null')
  if (o && typeof o === 'object') BOXES = Object.entries(o).map(([k, v]) => [k, Number(v)])
} catch { /* default ports */ }

let cfg = {}
try {
  cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'opencode', 'opencode.json'), 'utf8'))
} catch { /* no config: no keys, feeds answer 401 -> state unknown below */ }

// Pure parsers — exported for tpscheck (feed fixtures, no server needed).
export function parseActivity(body) {
  const models = JSON.parse(body).active_models.models || []
  let firstGen = null, firstPre = null
  let tps = 0, gen = 0, prompt = 0, n = 0
  for (const m of models) {
    for (const s of m.generating || []) {
      tps += s.tokens_per_second || 0
      gen += s.generated_tokens || 0
      prompt += s.prompt_tokens || 0
      n++
    }
    for (const s of m.prefilling || []) {
      prompt += s.total || 0
      n++
    }
    if (!firstGen && m.generating?.length) firstGen = m.generating[0]
    if (!firstPre && m.prefilling?.length) firstPre = m.prefilling[0]
  }
  if (firstGen) return { state: 'gen', tps: Math.round(tps * 10) / 10, ctx: firstGen.prompt_tokens || 0, gen, p: prompt, n }
  if (firstPre) return { state: 'prefill', tps: 0, ctx: firstPre.total || 0, gen: 0, p: prompt, n }
  return { state: 'idle', tps: 0, ctx: 0, gen: 0, p: 0, n: 0 }
}

export function parseStats(body) {
  try {
    const t = JSON.parse(body).total_tokens_served
    return Number.isFinite(t) ? t : null
  } catch { return null }
}

function get(port, key, apiPath) {
  return new Promise((resolve) => {
    const req = http.get({
      host: '127.0.0.1', port, path: apiPath, timeout: 2000,
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve(body))
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

const DOWN = { state: 'down', tps: 0, ctx: 0, gen: 0, p: 0, n: 0, tot: null }

async function sample(port, key) {
  const [actBody, statsBody] = await Promise.all([
    get(port, key, '/admin/api/activity'),
    get(port, key, '/admin/api/stats'),
  ])
  let tot = null
  try { tot = parseStats(statsBody) } catch { /* up but stats unreadable */ }
  if (actBody === null && statsBody === null) return { ...DOWN } // unreachable
  let snap
  try { snap = parseActivity(actBody) } catch { snap = { state: 'idle', tps: 0, ctx: 0, gen: 0, p: 0, n: 0 } } // up, feed unreadable
  return { ...snap, tot }
}

const out = {}
await Promise.all(BOXES.map(async ([name, port]) => {
  out[name] = await sample(port, cfg.provider?.[name]?.options?.apiKey || '')
}))
console.log(JSON.stringify(out))
