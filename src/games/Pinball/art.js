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
}

export const PRESS = 'PRESS ANY KEY · TAP TO PLAY';
export const MESSAGES = [
    'CABINET ONE — 3 BALLS · BONUS LADDER',
    'HOLD SPACE OR DOWN TO PULL THE PLUNGER',
    'LEFT / RIGHT ARROWS FLIP — TIMING IS THE GAME',
    'CLEAR THE DROP BANK TO RAISE THE BONUS MULT',
    'SHOOT THE LANE — RAMP ROLLOVERS PAY',
    'AROUND THE DOME INTO THE FIRELANE — LOCK 3 FOR MULTIBALL',
    'THE LEFT OUTLANE SPINS AND KICKS — B NUDGES, CAREFULLY',
];
