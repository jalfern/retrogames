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
    // rgb triples + alpha-baked variants so every glow follows the cabinet
    hotRgb: '255,61,94',
    magRgb: '157,123,255',
    trailRgb: '190,210,255',
    spark: '180,205,255',
    capHi: '#ff8095',
    hotOff: 'rgba(255,61,94,0.18)',
    magOff: 'rgba(157,123,255,0.25)',
    hotSoft: 'rgba(255,61,94,0.85)',
    hotGlass: 'rgba(255,61,94,0.20)',
    glowOff: 'rgba(127,216,255,0.15)',
    hotDim: 'rgba(255,61,94,0.25)',
    kickerRgb: '255,176,46',
};

// CABINET TWO "EMBER RIDER" (#3232) — the hot build: oxblood field, gold
// lanes, ember-red alerts, and a teal magnet as its one cool accent.
export const PAL_EMBER = {
    fieldTop: '#2b0f10',
    fieldBot: '#120405',
    lane: '#ffd166',
    laneDim: 'rgba(255,209,102,0.25)',
    neon: '#ff9d2e',
    hot: '#ff4d3a',
    sling: '#ffb05c',
    chrome: '#e8d9c4',
    glow: '#ffcf8a',
    score: '#ffdf9e',
    wood: '#2e1410',
    woodHi: '#55291d',
    dmd: '#ffdf9e',
    dmdOff: 'rgba(255,223,158,0.06)',
    mag: '#3ddad7',
    hotRgb: '255,77,58',
    magRgb: '61,218,215',
    trailRgb: '255,190,140',
    spark: '255,205,170',
    capHi: '#ff9a80',
    hotOff: 'rgba(255,77,58,0.18)',
    magOff: 'rgba(61,218,215,0.25)',
    hotSoft: 'rgba(255,77,58,0.85)',
    hotGlass: 'rgba(255,77,58,0.20)',
    glowOff: 'rgba(255,207,138,0.15)',
    hotDim: 'rgba(255,77,58,0.25)',
    kickerRgb: '255,158,74',
};

// ---- SKINS (#3259) — alternate art kits, one rung of the #3103 ladder ----
// The arcades sold ART KITS (Bally/Williams, late '70s): the same machine in a
// new dress. Same contract here: a kit is PALETTE ONLY — field, lamps, score,
// wood — every element paintField already colours from `pal`. No table data, no
// physics (#3103: a new look must never mean new physics). The check script
// audits key-parity across kits: a kit missing one key would silently paint a
// hole, so PAL's key set is the contract.

// CABINET ONE kit "TIDAL RUN" — the ocean dress: deep teal field, coral lane
// graphics, mint neon, sun-yellow alerts, ocean-blue magnet.
export const PAL_TIDE = {
    fieldTop: '#083038',
    fieldBot: '#02141a',
    lane: '#ff7a59',
    laneDim: 'rgba(255,122,89,0.25)',
    neon: '#52f0b8',
    hot: '#ffd23d',
    sling: '#8ae0c0',
    chrome: '#d7f2ea',
    glow: '#7af0d8',
    score: '#5ee0b0',
    wood: '#123033',
    woodHi: '#1e4a4e',
    dmd: '#66e8c2',
    dmdOff: 'rgba(102,232,194,0.06)',
    mag: '#4fa8ff',
    hotRgb: '255,210,61',
    magRgb: '79,168,255',
    trailRgb: '150,240,210',
    spark: '170,235,220',
    capHi: '#ffe08a',
    hotOff: 'rgba(255,210,61,0.18)',
    magOff: 'rgba(79,168,255,0.25)',
    hotSoft: 'rgba(255,210,61,0.85)',
    hotGlass: 'rgba(255,210,61,0.20)',
    glowOff: 'rgba(122,240,216,0.15)',
    hotDim: 'rgba(255,210,61,0.25)',
    kickerRgb: '255,122,89',
};

// EMBER RIDER kit "TOXIC" — the acid dress: moss field, lime lanes, magenta
// neon, keep-the-fire alerts (legibility), electric-cyan magnet.
export const PAL_TOXIC = {
    fieldTop: '#10280f',
    fieldBot: '#050f04',
    lane: '#b6ff3d',
    laneDim: 'rgba(182,255,61,0.25)',
    neon: '#ff5ce1',
    hot: '#ff9f1c',
    sling: '#d8ff7a',
    chrome: '#e3f0c8',
    glow: '#c8ff8a',
    score: '#b6ff3d',
    wood: '#1c2a10',
    woodHi: '#33491d',
    dmd: '#c6ff6e',
    dmdOff: 'rgba(198,255,110,0.06)',
    mag: '#45c9ff',
    hotRgb: '255,159,28',
    magRgb: '69,201,255',
    trailRgb: '200,255,138',
    spark: '210,245,160',
    capHi: '#ffcf70',
    hotOff: 'rgba(255,159,28,0.18)',
    magOff: 'rgba(69,201,255,0.25)',
    hotSoft: 'rgba(255,159,28,0.85)',
    hotGlass: 'rgba(255,159,28,0.20)',
    glowOff: 'rgba(200,255,138,0.15)',
    hotDim: 'rgba(255,159,28,0.25)',
    kickerRgb: '182,255,61',
};

// CABINET ONE kit "NOIR" (#3237 tail) — the after-hours dress: black-glass
// field, magenta lane graphics, violet neon, rose alerts, ice-blue magnet.
export const PAL_NOIR = {
    fieldTop: '#0a0a14',
    fieldBot: '#020208',
    lane: '#ff2ea6',
    laneDim: 'rgba(255,46,166,0.25)',
    neon: '#8d7bff',
    hot: '#ff5c7a',
    sling: '#ff8ac4',
    chrome: '#e6e6f2',
    glow: '#c0a8ff',
    score: '#ff7ad1',
    wood: '#1a1024',
    woodHi: '#2e1c3e',
    dmd: '#ff9ad6',
    dmdOff: 'rgba(255,154,214,0.06)',
    mag: '#57b6ff',
    hotRgb: '255,92,122',
    magRgb: '87,182,255',
    trailRgb: '255,150,220',
    spark: '230,220,255',
    capHi: '#ff9ab8',
    hotOff: 'rgba(255,92,122,0.18)',
    magOff: 'rgba(87,182,255,0.25)',
    hotSoft: 'rgba(255,92,122,0.85)',
    hotGlass: 'rgba(255,92,122,0.20)',
    glowOff: 'rgba(192,168,255,0.15)',
    hotDim: 'rgba(255,92,122,0.25)',
    kickerRgb: '255,46,166',
};

// EMBER RIDER kit "GLACIER" (#3237 tail) — the cold run on the hot cab: ice
// blue field, silver lanes, cyan neon, keep-the-fire alerts, violet magnet.
export const PAL_GLACIER = {
    fieldTop: '#0b1e33',
    fieldBot: '#04101c',
    lane: '#e8f4ff',
    laneDim: 'rgba(232,244,255,0.25)',
    neon: '#37c8ff',
    hot: '#ff6a2e',
    sling: '#9fdcff',
    chrome: '#f2f8ff',
    glow: '#a8e4ff',
    score: '#cfeeff',
    wood: '#12222e',
    woodHi: '#244052',
    dmd: '#bfe8ff',
    dmdOff: 'rgba(191,232,255,0.06)',
    mag: '#9f7bff',
    hotRgb: '255,106,46',
    magRgb: '159,123,255',
    trailRgb: '190,230,255',
    spark: '210,235,255',
    capHi: '#ff9a6b',
    hotOff: 'rgba(255,106,46,0.18)',
    magOff: 'rgba(159,123,255,0.25)',
    hotSoft: 'rgba(255,106,46,0.85)',
    hotGlass: 'rgba(255,106,46,0.20)',
    glowOff: 'rgba(168,228,255,0.15)',
    hotDim: 'rgba(255,106,46,0.25)',
    kickerRgb: '232,244,255',
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

// playfield base texture — built once per cabinet into an offscreen canvas by
// index.jsx. Deterministic (seeded), so a cabinet looks identical every load.
// #3232: gradient/sparkle follow the cabinet's palette, and every lane-anchored
// element (firelane bed, orbit channel, lock nameplate, chevrons) is drawn from
// the table's own view geometry — one renderer, both cabinets.
export function paintField(ctx, W, H, pal = PAL, tb = null) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal.fieldTop); g.addColorStop(1, pal.fieldBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // procedural sparkle (seeded LCG — deterministic texture)
    let s = 0x51ed270b;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 260; i++) {
        const x = rnd() * W, y = rnd() * H, a = 0.03 + rnd() * 0.08;
        ctx.fillStyle = `rgba(${pal.spark},${a.toFixed(3)})`;
        ctx.fillRect(x, y, 1, 1);
    }
    // big stylised chevrons — original art: power lanes, centred on the bank
    const bcx = tb ? tb.view.bankCx : 187;
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = pal.lane; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
        const y = 340 + i * 26;
        ctx.beginPath(); ctx.moveTo(bcx - 67, y); ctx.lineTo(bcx, y - 26); ctx.lineTo(bcx + 67, y); ctx.stroke();
    }
    ctx.restore();
    // faint hex-plate ring under the bumper cluster
    ctx.save();
    ctx.globalAlpha = 0.18; ctx.strokeStyle = pal.glow; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = 180 + Math.cos(a) * 74, y = 178 + Math.sin(a) * 52;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.restore();
    if (!tb) return;
    const v = tb.view;
    // firelane bed — a dim strip down the dome's flank holding the lane,
    // descending chevrons that read "this lane runs DOWN into the tower".
    ctx.save();
    ctx.globalAlpha = 0.10; ctx.fillStyle = pal.lane;
    ctx.fillRect(v.laneBedX, 192, v.laneBedW, 280);
    ctx.globalAlpha = 0.22; ctx.strokeStyle = pal.lane; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
        const y = 220 + i * 44;
        ctx.beginPath(); ctx.moveTo(v.laneCx - 8, y); ctx.lineTo(v.laneCx, y + 12); ctx.lineTo(v.laneCx + 8, y); ctx.stroke();
    }
    // "LOCK TOWER" nameplate glow above the capture mouth
    ctx.globalAlpha = 0.35; ctx.fillStyle = pal.hot;
    ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('LOCK', v.laneCx, 424);
    ctx.restore();
    // orbit channel — rails up the flank with climbing chevrons ("this lane
    // runs UP around the dome"), a bed wash so it reads as a lane, and a
    // vertical nameplate. Kept clear of the magnet halo — the orbit run is
    // unmistakably its own lane.
    ctx.save();
    ctx.globalAlpha = 0.09; ctx.fillStyle = pal.lane;
    ctx.fillRect(v.railBedX, v.chTop, v.railBedW, v.chBot - v.chTop + 15);
    ctx.globalAlpha = 0.34; ctx.strokeStyle = pal.lane; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(v.railX1, v.chTop); ctx.lineTo(v.railX1, v.chBot - 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(v.railX2, v.chTop); ctx.lineTo(v.railX2, v.chBot - 3); ctx.stroke();
    ctx.globalAlpha = 0.30; ctx.lineWidth = 2.5;
    for (const yy of [156, 192, 318, 352, 386]) {
        ctx.beginPath(); ctx.moveTo(v.railCx - 9, yy); ctx.lineTo(v.railCx, yy - 11); ctx.lineTo(v.railCx + 9, yy); ctx.stroke();
    }
    // vertical nameplate — "O R B I T" down the middle of the channel
    ctx.globalAlpha = 0.6; ctx.fillStyle = pal.lane;
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
    const lbl = 'ORBIT';
    for (let i = 0; i < lbl.length; i++) ctx.fillText(lbl[i], v.railCx, 250 + i * 13);
    ctx.restore();
    // magnet plate — a halo ring mid-field; the dynamic field pulse lives in index.jsx.
    ctx.save();
    ctx.globalAlpha = 0.12; ctx.strokeStyle = pal.mag; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tb.magnet.x, tb.magnet.y, 22, 0, 7); ctx.stroke();
    ctx.globalAlpha = 0.2;
    ctx.beginPath(); ctx.arc(tb.magnet.x, tb.magnet.y, 15, 0, 7); ctx.stroke();
    ctx.restore();
}

// ---------------------------------------------------------------- DMD ----
// A 64x8 virtual dot matrix at 2 px dots, mounted flush between the bumper
// cluster and the drop bank — the classic insert-display position. Own 5x7
// font, column-major (bit r = row r). The strip's TEXT is sim state
// (gs.msg); everything here is pure rendering of that state.
export const DMD = { x: 100, y: 249, cols: 64, rows: 8, dot: 2.5 };  // wide, legible on phone

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
    // #3232 EMBER RIDER variants (same charset, new literals — pinned anyway)
    'RAMP SET! +600', 'ORBIT! +150', 'SNAP! +75', 'MULT x4', 'BALL SAVE!',
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
// Hot announcements run backwards: crawl in from the LEFT, hold, sweep out to the RIGHT
// (a marquee is departing, not arriving — that reads as an event, not a status line).
function hotScroll(text, t, T) {
    const span = text.length * 6;
    if (t < 14) return -4 * (14 - t);                  // in from the left
    const e = T - t;
    if (e < span / 3) return span - 3 * e;            // out to the right
    return 0;
}

export function drawDMD(ctx, view, pal = PAL) {
    const { x, y, cols, rows, dot } = DMD;
    // bezel + dark glass
    const hot = /TILT|MULTIBALL|MULT x[0-9]|ORBIT SET|ORBIT LOCK|RAMP SET|SAVE/.test(view.text);
    const multi = view.text.startsWith('MULTIBALL');
    const bezelGlow = hot ? (multi ? 22 : 12) : 6;
    ctx.save();
    ctx.shadowColor = hot ? pal.hot : 'rgba(201,212,232,0.4)';
    ctx.shadowBlur = bezelGlow;
    ctx.fillStyle = 'rgba(4,6,16,0.94)';
    ctx.fillRect(x - 4, y - 4, cols * dot + 8, rows * dot + 8);
    ctx.strokeStyle = hot ? pal.hotSoft : 'rgba(201,212,232,0.35)';
    ctx.lineWidth = hot ? 2 : 1.5;
    ctx.strokeRect(x - 4.5, y - 4.5, cols * dot + 9, rows * dot + 9);
    ctx.shadowBlur = 0;
    // unlit dot grid — the glass is never fully dark; chunkier lit dots vs hairline unlit
    ctx.fillStyle = hot ? pal.hotGlass : pal.dmdOff;
    const uDot = dot * 0.34;
    for (let cx = 0; cx < cols; cx++) {
        for (let ry = 0; ry < rows; ry++) {
            ctx.fillRect(x + cx * dot + (dot - uDot) / 2, y + ry * dot + (dot - uDot) / 2, uDot, uDot);
        }
    }
    // content
    const color = hot ? pal.hot : pal.dmd;
    let off, text;
    if (view.text) {
        text = view.text;
        off = hot ? hotScroll(text, view.t, view.T) : -(view.tick * 1.5) % (text.length * 6 + cols + 16) + cols;
    } else {
        text = view.idle;
        off = -(view.tick * 1.5) % (text.length * 6 + cols + 16) + cols;
    }
    const up = text.toUpperCase();
    // hot messages pulse while they hold — alive, not a static banner
    if (hot) ctx.globalAlpha = 0.72 + 0.28 * Math.sin(view.t / 3);
    ctx.shadowColor = color; ctx.shadowBlur = hot ? 10 : 6;
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
                if (colv & (1 << r)) ctx.fillRect(x + px * dot, y + r * dot, dot * 0.92, dot * 0.92);
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
// EMBER RIDER (CABINET TWO, #3232) — same idiom, mirrored side, hotter rules.
export const MESSAGES_EMBER = [
    'EMBER RIDER — LEFT LANE · HOTTER ECONOMY',
    'THE WHOLE TABLE RUNS MIRRORED — LAUNCH UP THE LEFT',
    'THE RIGHT OUTLANE SPINS AT 15 — FEED IT',
    'AROUND THE DOME INTO THE LEFT FIRELANE — LOCK 3',
    'RIDE THE RIGHT RAIL — 3 ORBITS LIGHT THE SET',
    'MULTIBALL PAYS 1200 ON THE RIDER',
    'TILT DECAYS FASTER HERE — NUDGE WITH CARE',
    'BALL SAVE IS ONLY 4 SECONDS — FIRST DRAIN',
    'BANK CLEAR PAYS 300 — MULT CLIMBS TO x4',
];

// ---- the skin registry (#3259) — keyed by table id, index 0 = house dress.
// The shell resolves a cabinet's live palette through skinFor(); the attract
// row cycles it with B, `?style=<kit>` pre-selects it, and pinballcheck pins
// the registry structure, key-parity and the cycle/parse laws in Node.
export const SKINS = {
    'cabinet-one': [
        { id: 'midnight', label: 'MIDNIGHT', pal: PAL },
        { id: 'tidal', label: 'TIDAL RUN', pal: PAL_TIDE },
        { id: 'noir', label: 'NOIR', pal: PAL_NOIR },
    ],
    'ember-rider': [
        { id: 'ember', label: 'EMBER', pal: PAL_EMBER },
        { id: 'toxic', label: 'TOXIC', pal: PAL_TOXIC },
        { id: 'glacier', label: 'GLACIER', pal: PAL_GLACIER },
    ],
};
export const skinsFor = (tableId) => SKINS[tableId] || SKINS['cabinet-one'];
export const skinAt = (tableId, i) => {
    const s = skinsFor(tableId);
    return s[((i % s.length) + s.length) % s.length];
};
// ?style override: a kit id (or its label, squashed) any cabinet may carry
// (unknown name = null → the cabinet's own default). Case-insensitive, like
// the TidyBot/QBert override.
export const parseStyle = (name) => {
    const n = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!n) return null;
    for (const list of Object.values(SKINS)) {
        const hit = list.find((k) => k.id === n || k.label.toLowerCase().replace(/[^a-z0-9]/g, '') === n);
        if (hit) return hit.id;
    }
    return null;
};
// A style name applies to a cabinet only if THAT cabinet ships the kit —
// otherwise the cabinet keeps its current pick (unknown style = default).
export const styleIndex = (tableId, styleId, cur = 0) => {
    if (!styleId) return cur;
    const i = skinsFor(tableId).findIndex((k) => k.id === styleId);
    return i < 0 ? cur : i;
};
// #3237 tail: resolve a remembered kit id (localStorage) to a cabinet index —
// a stale id from an older registry silently falls back to the house dress.
export const kitIndex = (tableId, kitId) => {
    const i = skinsFor(tableId).findIndex((k) => k.id === kitId);
    return i < 0 ? 0 : i;
};
// A named style the picked cabinet does not ship → the cabinet must SAY so
// instead of painting silently ("NO SUCH KIT", #3237 addendum).
export const styleWarn = (tableId, styleId) =>
    Boolean(styleId) && skinsFor(tableId).every((k) => k.id !== styleId);
// localStorage key for the per-cabinet kit memory (pinned shape).
export const KIT_STORE = 'retrogames.pinball.kits';

// Attract-mode DMD ad lines (#3237 show-off) — one per demo run, crawled by
// the strip while the demo plays. Kept off the HOT word list (drawDMD treats
// MULTIBALL/TILT/… as shouty holds) so these crawl fully, ≤ 23 chars so the
// crawl completes inside the 200-tick window they're given.
export const ATTRACT_DMD = {
    'cabinet-one': ['LOCK 3 FOR THE TOWER', 'ORBIT ROUND THE DOME', 'KICKBACK FREES BALLS', 'MULT LADDER UP TO X5'],
    'ember-rider': ['EMBER RIDER RUNS MIRRORED', 'LEFT LANE LOCKS AT 400', 'PACK PAYS DOUBLE HERE', 'NUDGE CAREFULLY HERE'],
};
