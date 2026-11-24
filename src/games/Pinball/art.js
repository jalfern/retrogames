// PINBALL — CABINET ONE — art layer (MODERN bar, issue #3103).
// A lit, reflective cabinet you want to look at: deep field playfield with a
// procedural sheen, neon lane guides, glowing 7-segment score, lamp bloom on
// every hit. All original and generated in code — nothing borrowed.
// Constants live here so pinballcheck can audit geometry without a DOM; the
// drawing functions take a ctx and are only ever called from index.jsx.

export const PAL = {
    fieldTop: '#141a3d',      // deep midnight-indigo playfield
    fieldBot: '#070a1e',
    lane: '#ffb02e',          // bold amber lane graphics
    laneDim: 'rgba(255,176,46,0.25)',
    neon: '#31e1ff',          // cyan neon guides / targets
    hot: '#ff3d5e',           // bumper caps / alerts
    sling: '#ff8a3d',
    chrome: '#c9d4e8',
    glow: '#7fd8ff',
    score: '#ffb32e',         // 7-seg amber
    wood: '#3b2416',          // cabinet rail
    woodHi: '#5c3a22',
    dmd: '#ffb32e',           // dot-matrix insert (rung 3)
    dmdOff: 'rgba(255,179,46,0.06)',
    mag: '#9d7bff',           // magnet field violet
};

export const SCORE_DIGITS = 6;
export const SEG_W = 14, SEG_H = 24;    // 7-segment glyph size
export const SCORE_X = 96, SCORE_Y = 44; // centred between the reserved corners

// seven-segment bitout: a,b,c,d,e,f,g
export function sevenSegBits(d) {
    const table = [0b1111110, 0b0110000, 0b1011011, 0b1111011, 0b0110011, 0b1101011, 0b1101111, 0b0111000, 0b1111111, 0b1111011];
    return table[d & 15];
}

export function drawSevenSeg(ctx, x, y, digit, color, dim) {
    const bits = sevenSegBits(digit);
    const w = SEG_W, h = SEG_H, t = 3;
    const seg = (x1, y1, x2, y2, on) => {
        ctx.save();
        ctx.fillStyle = on ? color : 'rgba(255,179,46,0.08)';
        if (on && !dim) { ctx.shadowColor = color; ctx.shadowBlur = 9; }
        if (y1 === y2) ctx.fillRect(x1, y1 - t / 2, x2 - x1, t);   // horizontal
        else ctx.fillRect(x1 - t / 2, y1, t, y2 - y1);               // vertical
        ctx.restore();
    };
    const on = (bit) => (bits & bit) !== 0;
    seg(x, y, x + w, y, on(0b1000000));            // a
    seg(x + w, y, x + w, y + h / 2, on(0b0100000)); // b
    seg(x + w, y + h / 2, x + w, y + h, on(0b0010000)); // c
    seg(x, y + h, x + w, y + h, on(0b0001000));    // d
    seg(x, y + h / 2, x, y + h, on(0b0000100));    // e
    seg(x, y, x, y + h / 2, on(0b0000010));        // f
    seg(x, y + h / 2, x + w, y + h / 2, on(0b0000001)); // g
}

// playfield base texture — built once into an offscreen canvas by index.jsx.
// Deterministic (seeded), so the cabinet looks identical every load: indigo
// gradient, faint starfield sparkle, converging lane chevrons, subtle grain.
export function paintField(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PAL.fieldTop); g.addColorStop(1, PAL.fieldBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // procedural sparkle (seeded LCG — deterministic texture)
    let s = 0x51ed270b;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 260; i++) {
        const x = rnd() * W, y = rnd() * H, a = 0.03 + rnd() * 0.08;
        ctx.fillStyle = `rgba(180,205,255,${a.toFixed(3)})`;
        ctx.fillRect(x, y, 1, 1);
    }
    // big stylised chevrons — original "Cabinet One" art: power lanes
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = PAL.lane; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
        const y = 340 + i * 26;
        ctx.beginPath(); ctx.moveTo(120, y); ctx.lineTo(187, y - 26); ctx.lineTo(254, y); ctx.stroke();
    }
    ctx.restore();
    // faint hex-plate ring under the bumper cluster
    ctx.save();
    ctx.globalAlpha = 0.18; ctx.strokeStyle = PAL.glow; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = 180 + Math.cos(a) * 74, y = 178 + Math.sin(a) * 52;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.restore();
    // rung 2: firelane bed — a dim amber strip down the dome's right flank,
    // descending chevrons that read "this lane runs DOWN into the tower".
    ctx.save();
    ctx.globalAlpha = 0.10; ctx.fillStyle = PAL.lane;
    ctx.fillRect(298, 192, 24, 280);
    ctx.globalAlpha = 0.22; ctx.strokeStyle = PAL.lane; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
        const y = 220 + i * 44;
        ctx.beginPath(); ctx.moveTo(302, y); ctx.lineTo(310, y + 12); ctx.lineTo(318, y); ctx.stroke();
    }
    // "LOCK TOWER" nameplate glow above the capture mouth
    ctx.globalAlpha = 0.35; ctx.fillStyle = PAL.hot;
    ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('LOCK', 310, 424);
    ctx.restore();
    // rung 3: orbit channel — amber rails up the left flank with climbing
    // chevrons ("this lane runs UP around the dome") + a vertical nameplate.
    ctx.save();
    ctx.globalAlpha = 0.16; ctx.strokeStyle = PAL.lane; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(12, 250); ctx.lineTo(12, 412); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(38, 258); ctx.lineTo(38, 412); ctx.stroke();
    ctx.globalAlpha = 0.24;
    for (let i = 0; i < 5; i++) {
        const yy = 396 - i * 34;
        ctx.beginPath(); ctx.moveTo(16, yy); ctx.lineTo(25, yy - 11); ctx.lineTo(34, yy); ctx.stroke();
    }
    ctx.globalAlpha = 0.4; ctx.fillStyle = PAL.lane;
    ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('O', 25, 262); ctx.fillText('R', 25, 271); ctx.fillText('B', 25, 280); ctx.fillText('I', 25, 289); ctx.fillText('T', 25, 298);
    ctx.restore();
    // rung 3: magnet plate — a violet halo ring right-mid; the dynamic field
    // pulse draws live in index.jsx.
    ctx.save();
    ctx.globalAlpha = 0.12; ctx.strokeStyle = PAL.mag; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(240, 350, 22, 0, 7); ctx.stroke();
    ctx.globalAlpha = 0.2;
    ctx.beginPath(); ctx.arc(240, 350, 15, 0, 7); ctx.stroke();
    ctx.restore();
}

// ---------------------------------------------------------------- DMD ----
// A 64x8 virtual dot matrix at 2 px dots, mounted flush between the bumper
// cluster and the drop bank — the classic insert-display position. Own 5x7
// font, column-major (bit r = row r). The strip's TEXT is sim state
// (gs.msg); everything here is pure rendering of that state.
export const DMD = { x: 116, y: 250, cols: 64, rows: 8, dot: 2 };

export const FONT = {
    ' ': [0, 0, 0, 0, 0],
    A: [0x7E, 0x09, 0x09, 0x09, 0x7E], B: [0x7F, 0x49, 0x49, 0x49, 0x36],
    C: [0x3E, 0x41, 0x41, 0x41, 0x22], D: [0x7F, 0x41, 0x41, 0x22, 0x1C],
    E: [0x7F, 0x49, 0x49, 0x49, 0x41], F: [0x7F, 0x09, 0x09, 0x01, 0x01],
    G: [0x3E, 0x41, 0x49, 0x49, 0x3A], H: [0x7F, 0x08, 0x08, 0x08, 0x7F],
    K: [0x7F, 0x08, 0x14, 0x22, 0x40],
    I: [0x00, 0x41, 0x7F, 0x41, 0x00], L: [0x7F, 0x40, 0x40, 0x40, 0x40],
    M: [0x7F, 0x38, 0x0C, 0x38, 0x7F], N: [0x7F, 0x06, 0x09, 0x18, 0x7F],
    O: [0x3E, 0x41, 0x41, 0x41, 0x3E], P: [0x7F, 0x09, 0x09, 0x09, 0x06],
    R: [0x7F, 0x09, 0x09, 0x09, 0x76], S: [0x26, 0x49, 0x49, 0x49, 0x32],
    T: [0x01, 0x01, 0x7F, 0x01, 0x01], U: [0x3F, 0x40, 0x40, 0x40, 0x3F],
    V: [0x1F, 0x20, 0x40, 0x20, 0x1F], W: [0x7F, 0x20, 0x18, 0x20, 0x7F],
    X: [0x63, 0x14, 0x08, 0x14, 0x63], Y: [0x07, 0x08, 0x70, 0x08, 0x07],
    0: [0x3E, 0x51, 0x51, 0x51, 0x3E], 1: [0x00, 0x42, 0x7F, 0x40, 0x00],
    2: [0x42, 0x61, 0x51, 0x49, 0x46], 3: [0x21, 0x41, 0x45, 0x4B, 0x31],
    4: [0x18, 0x14, 0x12, 0x7F, 0x10], 5: [0x27, 0x45, 0x45, 0x45, 0x39],
    6: [0x3C, 0x4A, 0x49, 0x49, 0x30], 7: [0x01, 0x71, 0x09, 0x05, 0x03],
    8: [0x36, 0x49, 0x49, 0x49, 0x36], 9: [0x06, 0x49, 0x49, 0x29, 0x1E],
    '!': [0x00, 0x00, 0x5F, 0x00, 0x00], '.': [0x00, 0x60, 0x60, 0x00, 0x00],
    '+': [0x08, 0x08, 0x3E, 0x08, 0x08], '/': [0x20, 0x10, 0x08, 0x04, 0x02],
    '?': [0x02, 0x01, 0x51, 0x09, 0x06], x: [0x63, 0x14, 0x08, 0x14, 0x63],
};

// The exact message inventory the sim can emit — charset completeness is
// pinned by pinballcheck from this export.
export const DMD_MSGS = [
    'MULT x2', 'CAREFUL...', 'TILT!', 'BONUS +1200', 'BALL 2', 'ORBIT! +100',
    'ORBIT SET!', 'ORBIT LOCK!', 'RAMP SET! +500', 'LANE SWEEP!', 'LOCK 1/3',
    'MULTIBALL!', 'BALL SAVE!', 'EXTRA BALL', 'MAGNET!', 'SNAP! +50', 'EXTRA x1',
];

// idle crawl lines for the strip when nothing is announced
export function dmdIdle(score, mult, balls, locks, orbitBank, orbitLit, magCharge) {
    return [
        `SCORE ${Math.min(999999, score)}`,
        `MULT X${mult}  BALL ${balls}`,
        `LOCK ${locks}/3  ORBIT ${orbitBank}/3`,
        orbitLit ? 'ORBIT SET! SHOOT!' : (magCharge ? 'MAGNET ARMED' : 'MAGNET SPENT'),
    ];
}

// Scroll offset in virtual px for the marquee. e = elapsed ticks.
function dmdScroll(text, t, T) {
    const span = text.length * 6;
    const e = T - t;
    if (e < span / 3) return span - 3 * e;      // scroll in from the right
    if (t < 14) return -4 * (14 - t);           // scroll out to the left
    return 0;
}

export function drawDMD(ctx, view) {
    const { x, y, cols, rows, dot } = DMD;
    // bezel + dark glass
    ctx.save();
    ctx.fillStyle = 'rgba(4,6,16,0.92)';
    ctx.fillRect(x - 4, y - 4, cols * dot + 8, rows * dot + 8);
    ctx.strokeStyle = 'rgba(201,212,232,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 4.5, y - 4.5, cols * dot + 9, rows * dot + 9);
    // unlit dot grid — the glass is never fully dark
    ctx.fillStyle = PAL.dmdOff;
    for (let cx = 0; cx < cols; cx++) {
        for (let ry = 0; ry < rows; ry++) ctx.fillRect(x + cx * dot, y + ry * dot, 1, 1);
    }
    // content
    const hot = /TILT|MULTIBALL|ORBIT LOCK|SAVE/.test(view.text);
    const color = hot ? PAL.hot : PAL.dmd;
    let off, text;
    if (view.text) { text = view.text; off = dmdScroll(text, view.t, view.T); }
    else { text = view.idle; off = -(view.tick * 2) % (text.length * 6 + cols + 16) + cols; }
    const up = text.toUpperCase();
    ctx.shadowColor = color; ctx.shadowBlur = 6;
    ctx.fillStyle = color;
    for (let ci = 0; ci < up.length; ci++) {
        const glyph = FONT[up[ci]] || FONT[' '];
        const gx0 = Math.round(off) + ci * 6;
        if (gx0 + 5 < 0 || gx0 >= cols) continue;
        for (let c = 0; c < 5; c++) {
            const colv = glyph[c];
            if (!colv) continue;
            const px = gx0 + c;
            if (px < 0 || px >= cols) continue;
            for (let r = 0; r < rows; r++) {
                if (colv & (1 << r)) ctx.fillRect(x + px * dot, y + r * dot, dot, dot);
            }
        }
    }
    ctx.restore();
}

export const PRESS = 'PRESS ANY KEY · TAP TO PLAY';
export const MESSAGES = [
    'CABINET ONE — 3 BALLS · BONUS LADDER',
    'HOLD SPACE OR DOWN TO PULL THE PLUNGER',
    'LEFT / RIGHT ARROWS FLIP — TIMING IS THE GAME',
    'CLEAR THE DROP BANK TO RAISE THE BONUS MULT',
    'SHOOT THE LANE — RAMP ROLLOVERS PAY',
    'AROUND THE DOME INTO THE FIRELANE — LOCK 3 FOR MULTIBALL',
    'RIDE THE LEFT RAIL — 3 ORBITS LIGHT THE SET',
    'THE MAGNET SNARES STRAY BALLS — WHEN ARMED',
    'THE LEFT OUTLANE SPINS AND KICKS — B NUDGES, CAREFULLY',
];
