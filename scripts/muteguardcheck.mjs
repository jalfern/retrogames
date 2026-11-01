// #1359 — a killed --mutate run must not leave mutants in the tree.
// The 2026-10-31 incident: `timeout 120 npm run attractcheck -- --mutate`
// was killed mid-mutation; SIGTERM landed inside spawnSync, the restore line
// never ran, and the SONAR mutant sat in src/games/Sonar/attract.js looking
// like a real rules failure on every later run. This gate proves three things:
//
//   1. KILL CANARY   — a fixture that plants WITHOUT the guard stays dirty
//                      after SIGTERM (the test can actually see a corpse, so
//                      a green below is not vacuous).
//   2. GUARD         — the same fixture through plant() comes back clean.
//   3. WIRING AUDIT  — every scripts/*.mjs that takes --mutate and writes
//                      with writeFileSync is either proven tmp-only (SAFE,
//                      with a reason) or imports lib/mutateguard.mjs and
//                      plants through it. A new disk mutator added without
//                      the guard goes red here.
//
//   npm run muteguardcheck          # gates
//   npm run muteguardcheck -- --mutate   # + one guard-disable mutant of the
//                                        lib itself; it MUST make test 2 die

import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HERE = import.meta.dirname
const ROOT = join(HERE, '..')
const WORK = join(ROOT, '.muteguard-tmp')
const GUARD = join(HERE, 'lib', 'mutateguard.mjs')
const SENTINEL = 'the bytes before the mutant\n'
const MUTANT = 'THE MUTANT IS STILL HERE\n'
const MUTATE = process.argv.includes('--mutate')

let passes = 0, fails = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// A tiny node spawn doubles as a poll delay: no timers needed around it.
const nap = (ms) => spawnSync(process.execPath, ['-e', '0'], { timeout: ms })

// The fixture: write a sentinel, plant a mutant, then block in a child the
// way real checks do — and NEVER reach its own restore. Only a signal can
// rewind it. With `raw` it writes without the guard, reproducing the
// incident exactly. The guarded path imports the guard FRESH (cache-busted)
// so the --mutate mutant of the lib reaches the child, not a cached module.
const FIXTURE = `
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const [file, sentinel, mutant, guarded, guardPath] = process.argv.slice(2)
writeFileSync(file, sentinel)
if (guarded === 'guard') {
    const { plant } = await import(guardPath + '?v=' + Date.now())
    plant(file, mutant)
} else {
    writeFileSync(file, mutant)
}
spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'])
process.exit(3)
`

// Run the fixture, SIGTERM its process group once the mutant is on disk,
// then check the bytes left behind. expect: 'clean' (guard works) or
// 'dirty' (corpse must survive — the canary).
function killRun(label, guarded, expect, guardPath = GUARD, quietFail = false) {
    return new Promise((resolvePromise) => {
        const file = join(WORK, `${label}.txt`)
        writeFileSync(join(WORK, 'fixture.mjs'), FIXTURE)
        const child = spawn(process.execPath,
            [join(WORK, 'fixture.mjs'), file, SENTINEL, MUTANT, guarded, guardPath],
            { detached: true, stdio: 'ignore' })
        let killed = false, planted = false, settled = false
        const finish = (cond, name, detail, obs) => {
            if (settled) return
            settled = true
            clearInterval(poll)
            // resolves false = the file did NOT come back clean (corpse found).
            if (!cond && quietFail) console.log(`  note ${label}: ${detail || 'corpse'} — expected under the mutant`)
            else ok(cond, name, detail)
            rmSync(file, { force: true })
            resolvePromise(obs === undefined ? cond : obs)
        }
        const poll = setInterval(() => {
            if (settled) return
            if (!planted) {
                let cur = ''
                try { cur = readFileSync(file, 'utf8') } catch { /* not written yet */ }
                if (cur === MUTANT) planted = true
            }
            if (planted && !killed) {
                killed = true
                try { process.kill(-child.pid, 'SIGTERM') } catch { /* already gone */ }
            }
        }, 20)
        child.on('exit', () => {
            if (!planted) { finish(false, `${label}: mutant observed before the kill`,
                'fixture finished before the mutant was ever seen — test would be vacuous', 'vacuous'); return }
            if (!killed) { try { process.kill(-child.pid, 'SIGTERM') } catch { /* gone */ } }
            nap(50)
            let cur = null
            try { cur = readFileSync(file, 'utf8') } catch { /* gone */ }
            if (expect === 'dirty') {
                finish(cur === MUTANT, `${label}: guardless mutant survives SIGTERM (corpse visible)`,
                    cur === MUTANT ? '' : `expected a corpse, found ${JSON.stringify(cur)}`)
            } else {
                finish(cur === SENTINEL, `${label}: file restored after SIGTERM`,
                    cur === null ? 'file missing' : `left on disk: ${JSON.stringify(cur.trim())}`)
            }
        })
        setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch { /* gone */ } }, 15000).unref()
    })
}

// ---- wiring audit ----------------------------------------------------------
// Scripts whose writeFileSync calls were read and confirmed tmp-only /
// report-only (no tracked file is ever rewritten — read before adding here):
const SAFE = {
    'run-checks.mjs': 'spawns child checks; the children guard themselves',
    'kartcheck.mjs': 'mutates copies under /tmp (mut-sim.mjs)',
    'outpostcheck.mjs': 'writes mutant copies into a mkdtemp dir',
    'paperscheck.mjs': 'writes mutant copies into a mkdtemp dir',
    'sweepcheck.mjs': 'mutant copy under /tmp (ms-mut-*.mjs)',
    'watchcheck.mjs': 'mutates a copy at /tmp/forge/watch/, never scripts/watch.sh',
    'recmethods.mjs': 'writes JSON replay stamps, not source mutants',
    'replaycheck.mjs': 'writes JSON replay stamps, not source mutants',
}

function audit() {
    console.log('wiring audit (--mutate scripts that write on disk must use the guard)')
    const files = readdirSync(join(HERE)).filter((f) => f.endsWith('.mjs') && f !== 'muteguardcheck.mjs')
    let checked = 0
    for (const f of files) {
        const src = readFileSync(join(HERE, f), 'utf8')
        if (!src.includes('--mutate')) continue
        // A converted script plants through the guard instead of writeFileSync —
        // the audit must see BOTH states, or a retrofit would delete its own candidates.
        if (!src.includes('writeFileSync(') && !src.includes('mutateguard')) continue
        if (SAFE[f]) { checked++; ok(true, `${f}: SAFE — ${SAFE[f]}`); continue }
        const wired = src.includes('lib/mutateguard.mjs') && /\b(plant\w*|pull|guardExit)\(/.test(src)
        ok(wired, `${f}: disk mutator is wired to the guard`,
            wired ? '' : 'no lib/mutateguard.mjs import — a SIGTERM here leaves a corpse (#1359)')
        checked++
    }
    ok(checked >= 20, `audit checked ${checked} mutator scripts (floor 20 — a silently shrinking audit is its own bug)`)
}

// --mutate: a COPY of the lib with its signal list gutted. The GUARD test
// MUST go red against it; the pristine lib MUST stay green. The mutant
// lives in tmp so even a SIGKILL can't leave a broken guard in the tree —
// a corpse gate that produces corpses would be a joke.
const SIGS = "for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {"
async function mutantKill() {
    console.log('mutant (must die): a guard copy that stops catching SIGTERM')
    const copy = join(WORK, 'guard-mutant.mjs')
    writeFileSync(copy, readFileSync(GUARD, 'utf8').replace(SIGS, "for (const sig of ['SIGHUP']) {"))
    const obs = await killRun('guard-under-mutant', 'guard', 'clean', copy, true)
    ok(obs === false, 'mutant dies: guardless copy left a corpse the gate saw', `observed ${JSON.stringify(obs)}`)
    await killRun('guard-pristine', 'guard', 'clean')
    ok(readFileSync(GUARD, 'utf8').includes(SIGS), 'the real mutateguard.mjs was never touched')
    rmSync(copy, { force: true })
}

async function run() {
    rmSync(WORK, { recursive: true, force: true })
    mkdirSync(WORK, { recursive: true })
    console.log('kill canary — no guard (must stay dirty: this gate can see corpses)')
    await killRun('canary', 'raw', 'dirty')
    console.log('guard — same fixture through plant() (must come back clean)')
    await killRun('guard', 'guard', 'clean')
    audit()
    if (MUTATE) await mutantKill()
    console.log(`\n${fails === 0 ? 'PASS' : 'FAIL'} — ${passes} passed, ${fails} failed`)
    process.exit(fails ? 1 : 0)
}

run()
