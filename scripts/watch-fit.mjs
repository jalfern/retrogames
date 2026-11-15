#!/usr/bin/env node
// watch-fit — trim streamed log lines to the pane's real display width (#2286).
//
// Why: watch panes piped logs through `cut -c1-$(tput cols)`, but cut counts
// CHARACTERS and terminals advance by CELLS. A line with emoji (✅ = 2 cells,
// or any symbol carrying U+FE0F) printed wider than the pane, wrapped, and in
// a short pane the extra rows pushed the lane header off the top — Jon's
// "header missing at 14 rows, present at 30" repro. This filter strips ANSI
// escapes and control characters, then truncates at the pane width in cells,
// so every emitted line occupies exactly one row and the header can never be
// scrolled away.
//
// Modes:
//   node watch-fit.mjs --width N        one-shot: trim stdin lines to N cells
//   node watch-fit.mjs --stream [--tty PATH]
//                                   never-exit filter for `tail -F`; the width
//                                   is asked from tmux by matching this pane's
//                                   tty (from `tty`, or --tty PATH) against
//                                   pane_tty (cached 1 s: one tmux call/s, not
//                                   per token) and falls back to 80.
//
// #2286, root cause, measured live: the Studio tmux server started with no
// locale at all (show-environment LANG -> unset), so it is ASCII-mode: every
// multibyte char takes one CELL PER BYTE ('·'=2, '▃'=3, emoji=4), titles
// sanitize to '_', and half-width panes drown in wrapped rows — the header
// disappears behind the overflow. A running server's mode cannot be changed
// without killing every session (Jon's chat lives in it too), so this filter
// makes pane content locale-agnostic: strip ANSI, keep printable ASCII only
// (non-ASCII — which an ASCII server shows as mojibake anyway — becomes '?'),
// then truncate to the width. Chars == bytes == cells in BOTH server modes,
// so a line here can never wrap. watch.sh additionally exports UTF-8 for the
// next cold start of the server.
//
// Width model after the ASCII pass is trivially 1 cell per char; the cell
// maths below is kept for --keep-utf8 (a UTF-8 server, e.g. after a reboot
// with the locale exported) so wide chars are still counted correctly.

const argv = process.argv.slice(2);
const opt = { width: null, stream: false, tty: '', keepUtf8: false };
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--width') opt.width = parseInt(argv[++i], 10);
    else if (argv[i] === '--stream') opt.stream = true;
    else if (argv[i] === '--tty') opt.tty = argv[++i];
    else if (argv[i] === '--keep-utf8') opt.keepUtf8 = true;
}

const ANSI = [
    [/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, ''], // OSC …BEL|ST
    [/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ''],        // CSI
    [/\x1b[@-Z\\-_]/g, ''],                     // Fe escapes
];

function cells(cp, next) {
    const c = cp.codePointAt(0);
    if (c === 0x200d || (c >= 0xfe00 && c <= 0xfe0f)) return 0; // ZWJ, VS
    if ((c >= 0x0300 && c <= 0x036f) || (c >= 0x1ab0 && c <= 0x1aff)) return 0; // combining
    if (c >= 0x1100 && (
        c <= 0x115f || (c >= 0x2e80 && c <= 0x303e) || (c >= 0x3041 && c <= 0x33ff) ||
        (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff) ||
        (c >= 0xa000 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
        (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe10 && c <= 0xfe19) ||
        (c >= 0xfe30 && c <= 0xfe6f) || (c >= 0xff01 && c <= 0xff60) ||
        (c >= 0xffe0 && c <= 0xffe6) || c >= 0x1f000)) return 2;
    if ((c >= 0x2600 && c <= 0x27bf) || (c >= 0x2b00 && c <= 0x2bff)) {
        return next !== undefined && next.codePointAt(0) === 0xfe0f ? 2 : 1;
    }
    return 1;
}

function fit(line, width, keepUtf8) {
    for (const [re, to] of ANSI) line = line.replace(re, to);
    line = line.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ');
    if (!keepUtf8) {
        // one '?' per non-ASCII codepoint: chars == bytes == cells on an
        // ASCII-mode server, and still correct (if lossier than needed) on a
        // UTF-8 one. This is the never-wraps guarantee.
        line = [...line].map((c) => (c.codePointAt(0) >= 0x20 && c.codePointAt(0) <= 0x7e ? c : '?')).join('');
        return width > 0 ? line.slice(0, width) : line;
    }
    if (width <= 0) return line;
    const cps = [...line];
    let w = 0, out = '';
    for (let i = 0; i < cps.length; i++) {
        const n = cells(cps[i], cps[i + 1]);
        if (w + n > width) break;
        w += n; out += cps[i];
    }
    return out;
}

import { execFileSync } from 'node:child_process';
import readline from 'node:readline';

if (opt.stream) {
    // width source: tmux, re-asked at most once per second (tokens arrive fast).
    // Our pane id comes from matching OUR stdout tty against pane_tty — the
    // pane id is not knowable when the script is baked, and this survives
    // pane moves and respawns (identical recipe to the sleepwatch tty trick).
    let width = Number.isFinite(opt.width) ? opt.width : 80;
    let asked = 0;
    let mytty = opt.tty || '';
    if (!mytty && process.stdout.isTTY) {
        try { mytty = execFileSync('tty', { encoding: 'utf8' }).trim(); } catch { /* not a tty (test) */ }
    }
    const refresh = () => {
        const now = Date.now();
        if (now - asked < 1000) return;
        asked = now;
        try {
            const all = execFileSync('tmux', ['list-panes', '-aF', '#{pane_tty}\t#{pane_width}'],
                { encoding: 'utf8' });
            for (const row of all.split('\n')) {
                const [t, w] = row.split('\t');
                if (mytty && t === mytty) {
                    const v = parseInt(w, 10);
                    if (Number.isFinite(v) && v > 0) { width = v; break; }
                }
            }
        } catch { /* tmux gone: keep last width */ }
    };
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on('line', (l) => { refresh(); process.stdout.write(fit(l, width, opt.keepUtf8) + '\n'); });
    rl.on('close', () => process.exit(0));
    // keep processing even after EOF on the pipe: tail -F keeps the fd open,
    // and if the pipe truly dies, close above ends us (the pane respawns).
} else {
    const width = Number.isFinite(opt.width) ? opt.width : 80;
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { buf += d; });
    process.stdin.on('end', () => {
        const lines = buf.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();
        process.stdout.write(lines.map((l) => fit(l, width, opt.keepUtf8) + '\n').join(''));
    });
}
