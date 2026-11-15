// watchrespawncheck — #2278: a live watch session must never lose the pane
// respawn recipe to macOS /tmp cleanup, and a dead pane must still come back.
//
// The law (macOS 27, measured on the Studio): launchd job com.apple.tmp_cleaner
// runs /usr/libexec/tmp_cleaner daily at 00:00 and deletes /tmp files matching
//   -atime +3 -mtime +3 -ctime +3
// (dirs: -empty -mtime +3). watch.sh bakes its pane scripts, panes.tsv and
// supervise.zsh once and nothing re-reads them — zsh keeps the small loop in
// memory, and the supervisor awk's panes.tsv only when a pane actually dies.
// So a session older than 3 days had all three timestamps stale from day 4 and
// tmp_cleaner wiped the respawn recipe while the supervisor ran on (Oct 30's
// #1259 pane-death class of bug, this time killing the cure itself).
//
// The fix under test: the supervisor sweeps `touch` over its whole WDIR every
// 5 s cycle. touch moves atime+mtime, and any inode change updates ctime — so
// while the session lives no file can match the cleaner's predicate.
//
// Proof shape (ctime cannot be backdated, so the cleaner itself can't be
// simulated same-day — the invariant is measured instead):
//   1. build a sandbox dashboard (FORGE_WATCH_SESSION, never the real one);
//   2. backdate every file in its WDIR 6 days; wait two supervisor cycles;
//   3. every file still exists AND was re-touched after the backdate — the
//      exact condition tmp_cleaner needs (all three timestamps) can no longer
//      ever be met mid-session; then run tmp_cleaner's own find predicate over
//      the sandbox and demand zero matches;
//   4. #1259 end-to-end: kill a sandbox pane's process, watch pane.log log the
//      respawn and the pane come back alive at the same pane id with a new pid
//      (that respawn is only possible because panes.tsv survived step 3);
//   5. source pins + CI wiring, so the guard cannot rot out of view.
//
// Sandboxed per #1259 (own session name + own WDIR); skips green where tmux or
// zsh is missing (GitHub runners), so it rides CORE.checks nightly on the
// Studio, where tmux is real and the real dashboard runs.
import { spawnSync, spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { Report } from './lib/harness.mjs'

const rep = new Report('watch respawn recipe freshness (#2278)')
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (sh('which', ['zsh']).status !== 0 || sh('which', ['tmux']).status !== 0) {
    rep.skip('tmux/zsh present', 'pane law is proven on the Studio nightly')
    rep.exit()
}

const SESSION = 'respawncheck'
const WDIR = `/tmp/forge/watch/${SESSION}`
const SIX_DAYS = 6 * 24 * 60 * 60 * 1000

// A pane script list from panes.tsv, and every file sitting in the WDIR.
const tsvRows = () => readFileSync(join(WDIR, 'panes.tsv'), 'utf8').trim().split('\n').map((l) => l.split('\t'))
const wdirFiles = () => readdirSync(WDIR, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name)

let built = false
// The RETRO pane runs `tmux new-session -A -s retro` — a nested session with
// its own lifecycle. Only remove it if THIS run created it; if it predates us,
// it may be a live chat and stays untouched.
const retroPre = sh('tmux', ['has-session', '-t', 'retro']).status === 0
try {
    // Start clean: a corpse from a crashed check run must not fake a pass.
    sh('zsh', [join('scripts', 'watch.sh'), '--kill'], { env: { ...process.env, FORGE_WATCH_SESSION: SESSION } })
    sh('pkill', ['-f', `${WDIR}/supervise.zsh`])
    rmSync(WDIR, { recursive: true, force: true })

    // 1. Build the sandbox dashboard. watch.sh ends in `exec tmux attach`,
    // which fails without a tty — the panes are built before that, so ignore
    // its exit and watch for the session instead.
    const child = spawn('zsh', ['scripts/watch.sh'], { env: { ...process.env, FORGE_WATCH_SESSION: SESSION }, stdio: 'ignore', detached: true })
    child.unref()
    for (let t = 0; t < 60 && !built; t++) {
        await sleep(500)
        built = sh('tmux', ['has-session', '-t', SESSION]).status === 0 && existsSync(join(WDIR, 'panes.tsv'))
    }
    // No early rep.exit() in here — process.exit skips the finally cleanup and
    // leaks the sandbox session for the next run to trip over.
    if (rep.check('sandbox dashboard builds (session + panes.tsv)', built, SESSION)) {
        await sleep(6000) // let the supervisor complete at least one full cycle

        const rows = tsvRows()
        rep.check('panes.tsv records every pane (6 lanes + RETRO)', rows.length >= 7, `${rows.length} rows`)
        rep.check('every recorded pane script exists on disk', rows.every((r) => existsSync(r[2])),
            rows.map((r) => r[2].split('/').pop()).join(' '))
        rep.check('supervise.zsh is baked and running', existsSync(join(WDIR, 'supervise.zsh')) &&
            sh('pgrep', ['-f', `${WDIR}/supervise.zsh`]).status === 0)
        rep.check('remain-on-exit is on (dead panes stay for the supervisor)',
            /on/.test(sh('tmux', ['show-options', '-t', SESSION, 'remain-on-exit']).stdout))

        // 2. Backdate: pretend the session has been running six days — at least
        // two supervisor cycles so the sweep is caught mid-life, not mid-bake.
        const backdate = Date.now() - SIX_DAYS
        for (const f of readdirSync(WDIR)) utimesSync(join(WDIR, f), backdate / 1000, backdate / 1000)
        utimesSync(WDIR, backdate / 1000, backdate / 1000)
        rep.check('backdate lands (files read as 6 days old)', statSync(join(WDIR, 'panes.tsv')).mtimeMs < Date.now() - SIX_DAYS + 60000)
        await sleep(12000) // >= two 5 s keep-fresh cycles

        // 3. The invariant: nothing in the WDIR may age while the session lives.
        const stale = []
        for (const f of wdirFiles()) {
            const st = statSync(join(WDIR, f))
            if (st.mtimeMs <= backdate || st.atimeMs <= backdate) stale.push(`${f} mtime=${new Date(st.mtimeMs).toISOString().slice(0, 16)} atime=${new Date(st.atimeMs).toISOString().slice(0, 16)}`)
        }
        rep.check('keep-fresh sweep revives EVERY file after the backdate (tmp_cleaner can never see three stale timestamps)',
            stale.length === 0, stale.join(' | '))

        // tmp_cleaner's own predicate, verbatim, over the sandbox: zero matches.
        // (Same-day ctime alone would spare even unfixed files — this is the
        // positive half of the proof; the freshness row above is the half that
        // goes red without the sweep.)
        const found = sh('find', [WDIR, '-mindepth', '1', '-type', 'f', '-atime', '+3', '-mtime', '+3', '-ctime', '+3'])
        rep.check('tmp_cleaner predicate (-atime +3 -mtime +3 -ctime +3) matches nothing in the live WDIR',
            found.stdout.trim() === '', found.stdout.trim() === '' ? '0 files matched' : `${found.stdout.trim().split('\n').length} files matched`)

        // 4. #1259 end-to-end — respawn needs the panes.tsv that step 3 just
        // proved survives: kill the pane's own process and watch it come back.
        const target = rows.find((r) => r[1] === 'QA·MBP') || rows[rows.length - 2]
        const id = target[0]
        const pidBefore = sh('tmux', ['display-message', '-p', '-t', id, '#{pane_pid}']).stdout.trim()
        sh('kill', [pidBefore])
        let revived = false
        for (let t = 0; t < 40 && !revived; t++) {
            await sleep(500)
            revived = sh('tmux', ['display-message', '-p', '-t', id, '#{pane_dead}']).stdout.trim() === '0'
        }
        const pidAfter = sh('tmux', ['display-message', '-p', '-t', id, '#{pane_pid}']).stdout.trim()
        rep.check(`killed pane (${target[1]}) respawns at the same pane id, new pid`,
            revived && pidAfter !== '' && pidAfter !== pidBefore, `pid ${pidBefore} -> ${pidAfter}`)
        const plog = existsSync(join(WDIR, 'pane.log')) ? readFileSync(join(WDIR, 'pane.log'), 'utf8') : ''
        rep.check('pane.log records the respawn with its exit status',
            plog.includes('respawning') && /ended .*rc=/.test(plog), plog.trim().split('\n').at(-1) || 'no pane.log')
    }

    // 5. Wiring — the fix and this check stay visible to the machine.
    const watch = readFileSync('scripts/watch.sh', 'utf8')
    rep.check('watch.sh: supervisor sweeps touch over spec/log/scripts/dir',
        // line-anchored: a commented-out sweep (the exact mutant this lane ran)
        // must not satisfy the pin — only a live command counts.
        /^[ \t]*touch "\$W" "\$0" "\$spec" "\$log" "\$W"\/\*\.zsh/m.test(watch))
    rep.check('watch.sh: bake_supervisor() exists and runs on every invocation (build AND adopt)',
        /bake_supervisor\(\) \{/.test(watch) && /\nbake_supervisor\n/.test(watch) &&
        watch.indexOf('bake_supervisor\n') < watch.indexOf('if tmux has-session'))
    const pkg = readFileSync('package.json', 'utf8')
    const checks = readFileSync('scripts/checks.mjs', 'utf8')
    rep.check('package.json + checks.mjs carry watchrespawncheck (#1575 wiring)',
        /"watchrespawncheck"/.test(pkg) && /watchrespawncheck/.test(checks))
} finally {
    sh('zsh', [join('scripts', 'watch.sh'), '--kill'], { env: { ...process.env, FORGE_WATCH_SESSION: SESSION } })
    if (!retroPre && sh('tmux', ['has-session', '-t', 'retro']).status === 0) sh('tmux', ['kill-session', '-t', 'retro'])
    for (let t = 0; t < 10 && sh('pgrep', ['-f', `${WDIR}/supervise.zsh`]).status === 0; t++) await sleep(500)
    rmSync(WDIR, { recursive: true, force: true })
}

rep.exit()
