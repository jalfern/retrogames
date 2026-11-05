// NEVERDRY — which builder slots may take a never-dry kick right now (#1615).
//
// The warden's step 4b used to kick only slot a (`ALIVE == no` + one
// launchd job), so with the queue empty and slot b free nobody started
// (Nov 5: builders=0/2 queue=0). This helper answers, for BOTH slots, the
// eligibility half of the kick: free + loaded + no step-4 target this tick +
// past the 30-minute per-slot throttle (/tmp/forge/neverdry-<slot>.last).
// Whether the empty board actually HAS a stage stays idle-kick.mjs's answer;
// the warden asks this first (cheap: local files only) and idle-kick second.
//
// Output one line: `KICK a b` (eligible slots, slot order) or `NONE`.
// Any failure answers NONE — a broken helper must never fabricate a kick,
// same law as idle-kick.mjs.
//
// The decision itself is pure and pinned by jonqcheck: lib/idle.mjs
// neverDrySlots. This file is only argv + timestamp files + that call.

import { readFileSync } from 'node:fs'
import { neverDrySlots } from './lib/idle.mjs'

const arg = (name, dflt = '0') => {
    const i = process.argv.indexOf('--' + name)
    return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : dflt
}
const flag = (name) => arg(name) === '1'

try {
    const dir = arg('dir', '/tmp/forge')
    const now = Math.floor(Number(arg('now', String(Math.floor(Date.now() / 1000)))))
    const throttleSec = Number(arg('throttle', '1800'))
    const lastOf = (id) => {
        try { return Number(readFileSync(`${dir}/neverdry-${id}.last`, 'utf8').trim()) || null } catch { return null }
    }
    const slots = ['a', 'b'].map((id) => ({
        id,
        free: flag(`free-${id}`),
        // slot a's job is unconditional; slot b only exists while its trial holds.
        loaded: id === 'a' ? true : flag('b-loaded'),
        target: flag(`target-${id}`),
        lastKick: lastOf(id),
    }))
    const hits = neverDrySlots({ halted: flag('halted'), slots, now, throttleSec })
    console.log(hits.length ? `KICK ${hits.map((s) => s.id).join(' ')}` : 'NONE')
} catch {
    console.log('NONE')
}
