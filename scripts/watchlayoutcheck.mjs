// watchlayoutcheck — #2286: Jon's dashboard layout is baked, not hand-tended.
//
// The law (Jon, 2026-11-14): left 2/3 = the lanes BUILDER·A, BUILDER·B,
// QA·MINI, QA·MINI·2 (#2280), QA·STUDIO sharing the column EVENLY with the
// WARDEN strip at the bottom, each lane row split half work / half LIVE
// output; right 1/3 = Jon's Qwen chat as nested tmux session `qwen`; every
// pane carries a title drawn in its top border, and nothing inside a pane may
// overwrite it.
//
// Proof shape (live, sandboxed per #1259: own session name + own WDIR):
//   1. build a sandbox dashboard with --live; wait for a warden cycle;
//   2. geometry: exactly 4 lane panes + WARDEN at x=0, lane heights agree to
//      ±1 row, the warden strip is ~6 rows, each lane row splits 50/50, and
//      the QWEN pane is 1/3 of the window width (±2 cells);
//   3. labels: every pane's title matches its expected label (tmux renders
//      '·' as '_' — both spellings accepted), the window draws titles in the
//      top border, and the server refuses in-pane title writes;
//   4. the layout is HELD, not just built: nudge a lane row 3 rows off the
//      even split and demand the warden re-even it within two cycles — this is
//      the half that dies when someone removes the resize loop;
//   5. pins: MBP retired, the qwen session name, and the mini lane's pattern
//      fixed for the post-#1422 model string (that pane said "no session"
//      while Mini worked).
// Skips green where tmux/zsh are missing (GitHub runners); the Studio nightly
// is where the real dashboard law gets enforced.
import { spawnSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Report } from './lib/harness.mjs'

const rep = new Report('watch dashboard layout law (#2286)')
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (sh('which', ['zsh']).status !== 0 || sh('which', ['tmux']).status !== 0) {
    rep.skip('tmux/zsh present', 'the layout law is proven on the Studio nightly')
    rep.exit()
}

const SESSION = 'layoutcheck'
const WDIR = `/tmp/forge/watch/${SESSION}`
// tmux sanitises '·' in titles on some locales — compare with that mapping.
const norm = (s) => s.replace(/·/g, '_').trim()

const panes = () => sh('tmux', ['list-panes', '-t', `${SESSION}:0`,
    '-F', '#{pane_id}|#{pane_left}|#{pane_top}|#{pane_width}|#{pane_height}|#{pane_title}'])
    .stdout.trim().split('\n').filter(Boolean).map((l) => {
        const [id, left, top, width, height, title] = l.split('|')
        return { id, left: +left, top: +top, width: +width, height: +height, title }
    })

// The QWEN pane attaches Jon's nested chat if it exists; only remove it when
// THIS run created it (the retro-era rule, kept for qwen).
const qwenPre = sh('tmux', ['has-session', '-t', 'qwen']).status === 0
let built = false
try {
    sh('zsh', [join('scripts', 'watch.sh'), '--kill'], { env: { ...process.env, FORGE_WATCH_SESSION: SESSION } })
    sh('pkill', ['-f', `${WDIR}/supervise.zsh`])

    const child = spawn('zsh', [join('scripts', 'watch.sh'), '--live'],
        { env: { ...process.env, FORGE_WATCH_SESSION: SESSION }, stdio: 'ignore', detached: true })
    child.unref()
    for (let t = 0; t < 60 && !built; t++) {
        await sleep(500)
        built = sh('tmux', ['has-session', '-t', SESSION]).status === 0 && existsSync(join(WDIR, 'panes.tsv'))
    }
    // No early rep.exit() — process.exit skips finally and leaks the sandbox.
    if (rep.check('sandbox dashboard builds with the live panes', built, SESSION)) {
        await sleep(7000) // one full warden layout cycle after the last split

        // 2. Geometry — the four lane rows even, warden strip, half splits.
        const P = panes()
        const col = P.filter((p) => p.left === 0).sort((a, b) => a.top - b.top)
        const lanes = col.slice(0, 5)
        const warden = col[5]
        rep.check('left column holds exactly 5 lane panes + WARDEN (no MBP)',
            col.length === 6 && warden && norm(warden.title) === 'WARDEN',
            col.map((p) => norm(p.title)).join(' '))
        const hs = lanes.map((p) => p.height)
        const spread = hs.length ? Math.max(...hs) - Math.min(...hs) : 99
        rep.check('the five lane rows share the column evenly (±1 row)', spread <= 1, hs.join(','))
        rep.check('WARDEN is a ~6-row strip at the bottom', warden && Math.abs(warden.height - 6) <= 1,
            `h=${warden?.height}`)
        const win = parseInt(sh('tmux', ['display-message', '-p', '-t', `${SESSION}:0`, '#{window_width}']).stdout, 10)
        const qwen = P.find((p) => norm(p.title) === 'QWEN')
        const third = Math.round(win / 3)
        rep.check('QWEN pane is the right 1/3 (±2 cells)',
            qwen && Math.abs(qwen.width - third) <= 2, `win=${win} qwen=${qwen?.width}`)
        const outs = P.filter((p) => norm(p.title).includes('output'))
        rep.check('every lane row splits half work / half output', outs.length === 5 &&
            outs.every((o) => {
                const lane = lanes.find((l) => l.top === o.top || Math.abs(l.top - o.top) <= 1)
                return lane && Math.abs(lane.width - o.width) <= 1
            }),
            outs.map((o) => `${norm(o.title)}=${o.width}`).join(' '))

        // 3. Labels — titles exist and draw in the border; nothing inside wins.
        const want = ['BUILDER·A', 'BUILDER·A · output', 'BUILDER·B', 'BUILDER·B · output',
            'QA·MINI', 'QA·MINI · output', 'QA·MINI·2', 'QA·MINI·2 · output',
            'QA·STUDIO', 'QA·STUDIO · output', 'WARDEN', 'QWEN']
        const have = P.map((p) => norm(p.title))
        rep.check('every pane carries its title', want.every((t) => have.includes(norm(t))),
            `missing: ${want.filter((t) => !have.includes(norm(t))).join(', ') || 'none'}`)
        rep.check('titles draw in the pane top border',
            /pane-border-status top/.test(sh('tmux', ['show-options', '-w', '-t', SESSION, 'pane-border-status']).stdout))
        rep.check('in-pane title writes are refused (allow-set-title off)',
            /allow-set-title off/.test(sh('tmux', ['show-options', '-s', 'allow-set-title']).stdout))

        // 4. The layout is HELD: nudge lane 1 three rows off and demand re-even.
        const before = panes().filter((p) => p.left === 0).sort((a, b) => a.top - b.top)
        sh('tmux', ['resize-pane', '-t', before[0].id, '-y', String(before[0].height + 3)])
        let ree = false
        for (let t = 0; t < 8 && !ree; t++) {
            await sleep(1500)
            const h2 = panes().filter((p) => p.left === 0).sort((a, b) => a.top - b.top)
                .slice(0, 5).map((p) => p.height)
            ree = Math.max(...h2) - Math.min(...h2) <= 1
        }
        rep.check('warden re-evens the rows after a nudge (layout held, not just built)', ree)

        // 5. Pins — the fixes this PR shipped cannot rot out silently.
        const watch = readFileSync('scripts/watch.sh', 'utf8')
        rep.check('watch.sh: MBP pane retired, qwen session, warden holds even rows',
            !watch.includes('pane qa-mbp') && watch.includes('-s qwen') &&
            watch.includes('n=5') && watch.includes('wrow=6'))
        rep.check('watch.sh: QA·MINI matches the launcher text (post-#1422 pattern)',
            watch.includes("P1='opencode run.*QA MASTER on node '") && watch.includes("P2='mini\\.'"))
        rep.check('watch.sh: live-stream panes run the cell-width filter (header cannot scroll away)',
            watch.includes('--stream') && watch.includes('$FIT') && existsSync(join(WDIR, 'fit.mjs')))
    }
} finally {
    sh('zsh', [join('scripts', 'watch.sh'), '--kill'], { env: { ...process.env, FORGE_WATCH_SESSION: SESSION } })
    sh('pkill', ['-f', `${WDIR}/supervise.zsh`])
    if (!qwenPre && sh('tmux', ['has-session', '-t', 'qwen']).status === 0) sh('tmux', ['kill-session', '-t', 'qwen'])
}

rep.exit()
