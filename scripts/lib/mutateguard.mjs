// #1359: the mutant graveyard ends here. A *check.mjs that plants source
// mutants on disk and spawnSyncs a child is a kill target — shell timeouts,
// ctrl-C, warden sweeps. The default SIGTERM disposition ends the process
// INSIDE spawnSync, before the restore line runs, and the mutant stays in
// the tree: a corpse that reports itself as a real rules failure on every
// later run (Sonar's attract.js, 2026-10-31). plant() remembers what it
// overwrote and arms signal + exit handlers once per process, so a kill
// rewinds every still-planted file before the process stops.
//
// Usage in a mutate loop (same position the two writeFileSync calls had):
//   import { plant, pull } from './lib/mutateguard.mjs'
//   plant(file, orig.replace(from, to))   // mutate
//   ...spawnSync the child...
//   pull(file)                          // restore
//
// SIGKILL stays uncapturable (nothing is), but `timeout` and the warden
// send TERM, and the exit hook also covers process.exit paths.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const originals = new Map() // resolved path -> pre-mutation contents (ABSENT for planted new files)
const ABSENT = Symbol('absent')
let armed = false

// Arm once. plant() calls this; scripts that mutate without plant() (none
// should after #1359) can call it directly.
export function guardExit() {
    if (armed) return
    armed = true
    for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
        process.on(sig, () => { restoreAll(); process.exit(1) })
    }
    process.on('exit', restoreAll)
}

// Write `mutated` to `file`, remembering the bytes underneath it.
export function plant(file, mutated) {
    guardExit()
    const p = resolve(file)
    if (!originals.has(p)) originals.set(p, existsSync(p) ? readFileSync(p, 'utf8') : ABSENT)
    writeFileSync(p, mutated)
}

// The dotfile mutators (ironring, viperpit) plant a NEW mutant beside the
// real module instead of editing it — same corpse risk (a stale mutant sits
// in src/), so the same guard covers it: restore means unlink.
export function plantNew(file, mutated) {
    return plant(file, mutated)
}

// Put the remembered bytes back — or unlink when the file did not exist
// before the plant (no-op if nothing was planted here).
export function pull(file) {
    const p = resolve(file)
    if (!originals.has(p)) return
    if (originals.get(p) === ABSENT) rmSync(p, { force: true })
    else writeFileSync(p, originals.get(p))
    originals.delete(p)
}

// Rewind everything still planted. Runs on every exit path the process can see.
export function restoreAll() {
    for (const [p, orig] of originals) {
        if (orig === ABSENT) rmSync(p, { force: true })
        else writeFileSync(p, orig)
    }
    originals.clear()
}
