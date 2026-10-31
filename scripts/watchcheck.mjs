// watchcheck — proves scripts/watch.sh keeps every lane pane alive (#1259).
//   npm run watchcheck              # the gates
//   npm run watchcheck -- --mutate # proof the gates can fail (neuter the respawn)
//
// It builds the real layout into a sandbox tmux session (FORGE_WATCH_SESSION,
// per-session /tmp/forge/watch/<session>/ dir, so the live `forge` dashboard
// is never touched), then proves three things:
//   A. boot    — 9 panes land (6 left-column lanes incl. BUILDER·B (#1258),
//                2 LIVE, RETRO), remain-on-exit is on, the supervisor runs,
//                and no pane command line contains a lane pattern (the 2026-10-12
//                self-match rule).
//   B. rules   — SIGKILL a lane pane: it is back within one refresh (8 s) and
//                pane.log says why; a pane squeezed to 2 rows survives a kill
//                too; garbage from an oMLX-shaped feed cannot kill a pane loop.
//   C. can fail — --mutate copies watch.sh, comments out the respawn line,
//                rebuilds the sandbox and asserts the killed pane STAYS dead.
// Headless: `tmux attach` failing is the expected way watch.sh ends here.

import { spawnSync, spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import http from 'node:http'

const SESSION = 'watchcheck'
const W = `/tmp/forge/watch/${SESSION}`
let SRC = 'scripts/watch.sh'
const MUTATE = process.argv.includes('--mutate')
// The dashboard lives on the Studio (zsh + jq + tunnels). GitHub runners have
// no zsh — there the gates are meaningless, so skip honest instead of red.
if (spawnSync('zsh', ['--version'], { encoding: 'utf8' }).status !== 0) {
    console.log('watchcheck: SKIP — no zsh here (the watch dashboard runs on the Studio)')
    process.exit(0)
}
if (MUTATE) {
    // neuter the supervisor's respawn call in a copy: the killed pane must
    // then stay dead — proof the gates above actually depend on that line.
    const src = readFileSync(SRC, 'utf8')
    const mut = src.replace('tmux respawn-pane -k -t "$id" "zsh \'$script\'" 2>>"$log"', '# MUTANT: no respawn')
    if (mut === src) { console.error('MUTANT ANCHOR NOT FOUND — watch.sh changed shape'); process.exit(2) }
    SRC = '/tmp/forge/watch/mutated-watch.sh'
    writeFileSync(SRC, mut)
}
let pass = 0, fail = 0
const ok = (cond, what) => { if (cond) { pass++; console.log(`  ok   ${what}`) } else { fail++; console.log(`  FAIL ${what}`) } }
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

const tmux = (...args) => { try { return execFileSync('tmux', args, { encoding: 'utf8' }).trim() } catch { return '' } }
const runWatch = (script = SRC, extra = []) =>
    spawnSync('zsh', [script, '--live', ...extra], { env: { ...process.env, FORGE_WATCH_SESSION: SESSION }, encoding: 'utf8' })
const cleanup = () => {
    try { execFileSync('tmux', ['kill-session', '-t', SESSION], { stdio: 'ignore' }) } catch { /* already gone */ }
    spawnSync('pkill', ['-f', `${W}/supervise.zsh`])
    rmSync(W, { recursive: true, force: true })
}
const tsv = () => readFileSync(join(W, 'panes.tsv'), 'utf8').trim().split('\n')
    .map(l => l.split('\t')).filter(r => r.length >= 3).map(([id, name, script]) => ({ id, name, script }))
const panePid = id => Number(tmux('display', '-p', '-t', id, '#{pane_pid}'))
const paneDead = id => tmux('display', '-p', '-t', id, '#{pane_dead}')

// wait until the pane at `id` is alive again with a fresh pid; true if that
// happened within `budget` ms
function waitRespawn(id, oldPid, budget = 8000) {
    const t0 = Date.now()
    while (Date.now() - t0 < budget) {
        const pid = panePid(id)
        if (paneDead(id) === '0' && pid && pid !== oldPid) return true
        sleep(500)
    }
    return false
}

cleanup()
sleep(300)

// ── A. boot ────────────────────────────────────────────────────────────────
console.log('watchcheck (#1259) — the watch dashboard never loses a pane')
runWatch()
sleep(1500)
const panes = tmux('list-panes', '-t', `${SESSION}:0`, '-F', '#{pane_id}').split('\n').filter(Boolean)
ok(panes.length === 9, `boot: ${panes.length}/9 panes (${MUTATE ? 'mutant copy' : 'watch.sh'})`)
const names = tsv().map(p => p.name)
ok(names.includes('BUILDER·B'), 'boot: panes follow #1258 — the second builder slot is there')
ok(names.includes('WARDEN') && names.includes('RETRO'), 'boot: WARDEN and RETRO recorded')
ok(tmux('show-options', '-t', SESSION, 'remain-on-exit').includes('on'), 'boot: remain-on-exit is on')
const supOut = spawnSync('pgrep', ['-f', `${W}/supervise.zsh`], { encoding: 'utf8' })
ok(supOut.stdout.trim().length > 0, 'boot: the supervisor process is running')
const cmdLines = tmux('list-panes', '-t', SESSION, '-a', '-F', '#{pane_start_command}')
    + tmux('display', '-p', '-t', `${SESSION}:0.0`, '#{pane_current_command}')
ok(!cmdLines.includes('THE FORGE'), 'boot: no lane pattern in any pane command line (2026-10-12 rule)')

// ── B. rules ───────────────────────────────────────────────────────────────
const B = tsv().find(p => p.name === 'BUILDER·B')
let oldPid = panePid(B.id)
process.kill(oldPid, 'SIGKILL')
const revived = waitRespawn(B.id, oldPid)
if (MUTATE) {
    // the mutant neuters respawn: the pane must STAY dead — that the rules
    // notice is the whole point of the mutant run.
    ok(!revived, 'mutant dies: with the respawn line neutered a killed pane stays dead')
    ok(readFileSync(join(W, 'pane.log'), 'utf8').includes('respawning'), 'mutant dies: the death is still logged (only revival is gone)')
} else {
    ok(revived, 'a SIGKILLed lane pane is back within one refresh (<= 8 s)')
    const log = readFileSync(join(W, 'pane.log'), 'utf8')
    ok(/BUILDER·B .*respawning/.test(log), 'pane.log says which pane ended and that it respawned')

    // squeezed pane: 2 rows, then a kill — the loop must return, not vanish
    tmux('resize-pane', '-t', B.id, '-y', '2')
    oldPid = panePid(B.id)
    process.kill(oldPid, 'SIGTERM')
    ok(waitRespawn(B.id, oldPid), 'a pane squeezed to 2 rows survives a kill and comes back')

    // garbage feed: an oMLX-shaped server answering junk must not kill a loop.
    const srv = http.createServer((req, res) => {
        res.writeHead(req.url === '/v1/models' ? 200 : 200, { 'content-type': 'application/json' })
        res.end(req.url === '/admin/api/activity'
            ? '{"active_models":{"models":[{"generating":[{"tokens_per_second":null,"prompt_tokens":"NaN"},{"prompt_tokens":-9}]}]}} junk'
            : 'not-json{{')
    })
    await new Promise(r => srv.listen(0, '127.0.0.1', r))
    const dir = mkdtempSync(join(tmpdir(), 'watchfeed-'))
    const feed = join(dir, 'feed.zsh')
    writeFileSync(feed, `L='FEEDTEST'\nPORT=${srv.address().port}\nPROV=none\nP1='impossible pattern '\nP2='xyzzy'\n` + readFileSync(join(W, 'body-lane.zsh'), 'utf8'))
    const feedProc = spawn('zsh', [feed], { stdio: 'ignore' }) // stdio ignore: it lives on its own
    sleep(7000)
    let alive = true
    try { process.kill(feedProc.pid, 0) } catch { alive = false }
    try { process.kill(feedProc.pid, 'SIGKILL') } catch { /* already gone */ }
    srv.close(); rmSync(dir, { recursive: true, force: true })
    ok(alive, 'garbage from an oMLX-shaped feed does not kill the redraw loop (7 s soak)')
}

cleanup()
console.log(`\nwatchcheck: ${pass + fail} gates, ${fail} failure${fail === 1 ? '' : 's'}${MUTATE ? ' (mutant run)' : ''}`)
process.exit(fail ? 1 : 0)
