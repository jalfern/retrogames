/* DEEP GLASS — the shared first-person dungeon renderer (#1129 stage 1).
 *
 * One zero-dependency WebGL2 module that draws a grid maze in first person the
 * way Wizardry (Apple II, 1981), The Bard's Tale (1985) and the dungeons of
 * Ultima IV (1985) drew theirs — at the MODERN bar: procedural textures, a
 * flickering torch whose light falls off into true darkness, spell flashes,
 * doors that slide, stairs with real height, water that ripples, fog, and
 * lit monster billboards. Smooth animated step/turn with head-bob.
 *
 * The game's sim owns the maze and the party; the renderer only draws. The
 * API is deliberately primitive so three different games can drive it:
 *
 *   const R = DungeonRenderer.create(canvas)   // null if no WebGL2
 *   R.setMaze(maze)        // { w, h, cells:Uint8Array, doorOpen:Float32Array }
 *                          // cell: 0 open stone floor · 1 wall · 2 wood floor
 *                          //       3 water · 4 stairs up · 5 stairs down · 6 door
 *   R.setSprites(list)     // [{ x, y, z, w, h, mat, anim, tint }]
 *   R.animateTo(x, y, z, yaw, durMs)  // logical pose moves now; view eases in
 *   R.snapTo(x, y, z, yaw)
 *   R.pose()             // logical pose { x, y, z, yaw } (the sim's truth)
 *   R.renderPose()       // eye actually drawn { x, y, z, yaw } (bob included)
 *   R.light(x, y, z, r, g, b, radius, lifeMs)   // spell flash, decays
 *   R.torch = true|false                         // the party's torch
 *   R.frame(dtMs) -> number                    // advance + draw, draws++
 *   R.resize()
 *   R.blocked(x, y)      // wall / closed-door cell at the pose floor?
 *   R.viewCells(x, y, r) // cells visible by line of sight
 *   R.frameCount, R.drawing
 *
 * Sprite materials 8..10 are the built-in monster atlas (8 rat, 9 skeleton,
 * 10 goblyn; two-frame shamble selected by `anim`). The pure helpers
 * DungeonRenderer.cellBlocks / DungeonRenderer.viewCells work headless in Node.
 */
'use strict';

globalThis.DungeonRenderer = (function () {

  const CELL = 1.0;
  const WALL_H = 1.7;
  const CEIL_H = 1.75;
  const EYE_H = 0.82;
  const RANGE = 8;
  const FOV_V = 72 * Math.PI / 180;
  const TILE = 128, ATLAS = 512, TC = ATLAS / TILE;
  const MAT = { BRICK: 0, FLAG: 1, TIMBER: 2, WATER: 3, GRAVEL: 4, STAIR_UP: 5, STAIR_DN: 6, DOOR: 7, RAT: 8, SKEL: 9, GOB: 10 };
  const DOOR_W = 0.86, DOOR_H = 0.94;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  /* ---------------- procedural texture atlas ---------------- */

  function buildAtlas() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = ATLAS;
    const g = cv.getContext('2d');
    const rnd = mulberry32(0xD00F1E);
    const T = (i) => ({ ox: (i % TC) * TILE, oy: Math.floor(i / TC) * TILE });

    function speckle(i, base, blot, n, tint) {
      const { ox, oy } = T(i);
      g.fillStyle = base; g.fillRect(ox, oy, TILE, TILE);
      for (let k = 0; k < n; k++) {
        const d = (rnd() - 0.5) * tint;
        g.fillStyle = `rgba(${clamp(128 + d, 0, 255) | 0},${clamp(120 + d, 0, 255) | 0},${clamp(112 + d, 0, 255) | 0},0.16)`;
        g.beginPath(); g.arc(ox + rnd() * TILE, oy + rnd() * TILE, 1.5 + rnd() * blot, 0, 7); g.fill();
      }
    }

    // 0 BRICK — dungeon masonry: staggered courses, mortar, per-brick tone, chips
    {
      const { ox, oy } = T(MAT.BRICK);
      g.fillStyle = '#241d18'; g.fillRect(ox, oy, TILE, TILE);
      const rows = 5, bh = TILE / rows;
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) ? TILE / 4 : 0;
        for (let c = -1; c < 3; c++) {
          const bx0 = Math.max(ox, ox + off + c * (TILE / 2) + 2);
          const bx1 = Math.min(ox + TILE, ox + off + c * (TILE / 2) + TILE / 2 - 2);
          if (bx1 <= bx0) continue;
          const by = oy + r * bh + 2, bbh = bh - 4;
          const v = (rnd() - 0.5) * 34;
          g.fillStyle = `rgb(${clamp(96 + v, 0, 255) | 0},${clamp(76 + v, 0, 255) | 0},${clamp(60 + v * 0.8, 0, 255) | 0})`;
          g.fillRect(bx0, by, bx1 - bx0, bbh);
          g.fillStyle = 'rgba(255,225,190,0.10)'; g.fillRect(bx0, by, bx1 - bx0, 2);
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(bx0, by + bbh - 2, bx1 - bx0, 2);
        }
      }
      for (let k = 0; k < 26; k++) {
        g.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.20)' : 'rgba(255,230,200,0.10)';
        g.fillRect(ox + rnd() * TILE, oy + rnd() * TILE, 1 + rnd() * 3, 1 + rnd() * 2);
      }
    }
    // 1 FLAG — big worn flagstones with grit and pale seams
    speckle(MAT.FLAG, '#4c4a44', 10, 420, 46);
    {
      const { ox, oy } = T(MAT.FLAG);
      g.strokeStyle = 'rgba(20,18,16,0.55)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(ox, oy + TILE / 2); g.lineTo(ox + TILE, oy + TILE / 2); g.stroke();
      g.beginPath(); g.moveTo(ox + TILE / 2, oy); g.lineTo(ox + TILE / 2, oy + TILE); g.stroke();
      g.strokeStyle = 'rgba(150,146,134,0.20)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(ox, oy + TILE / 2 + 3); g.lineTo(ox + TILE, oy + TILE / 2 + 3); g.stroke();
    }
    // 2 TIMBER — dark dungeon planks with grain and knots
    {
      const { ox, oy } = T(MAT.TIMBER);
      g.fillStyle = '#3a2818'; g.fillRect(ox, oy, TILE, TILE);
      const pw = TILE / 4;
      for (let p = 0; p < 4; p++) {
        const v = (rnd() - 0.5) * 24;
        g.fillStyle = `rgb(${clamp(74 + v, 0, 255) | 0},${clamp(50 + v * 0.8, 0, 255) | 0},${clamp(28 + v * 0.6, 0, 255) | 0})`;
        g.fillRect(ox + p * pw + 1, oy, pw - 2, TILE);
        g.strokeStyle = 'rgba(25,15,8,0.6)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ox + p * pw, oy); g.lineTo(ox + p * pw, oy + TILE); g.stroke();
        for (let k = 0; k < 6; k++) {
          g.strokeStyle = 'rgba(30,18,10,0.35)'; g.lineWidth = 1;
          const gx = ox + p * pw + 3 + rnd() * (pw - 6);
          g.beginPath(); g.moveTo(gx, oy);
          g.bezierCurveTo(gx + 3, oy + 40, gx - 3, oy + 90, gx + 1, oy + TILE); g.stroke();
        }
        if (rnd() > 0.45) {
          const kx = ox + p * pw + pw / 2, ky = oy + 20 + rnd() * 80;
          g.fillStyle = 'rgba(24,14,6,0.7)'; g.beginPath(); g.ellipse(kx, ky, 4, 6, 0, 0, 7); g.fill();
          g.strokeStyle = 'rgba(90,60,32,0.5)'; g.lineWidth = 1.5;
          g.beginPath(); g.ellipse(kx, ky, 7, 10, 0, 0, 7); g.stroke();
        }
      }
    }
    // 3 WATER — deep green-black with wave bands and sparkle
    {
      const { ox, oy } = T(MAT.WATER);
      g.fillStyle = '#0c2028'; g.fillRect(ox, oy, TILE, TILE);
      for (let k = 0; k < 30; k++) {
        const y = oy + rnd() * TILE;
        g.strokeStyle = `rgba(${70 + rnd() * 40 | 0},${130 + rnd() * 50 | 0},${130 + rnd() * 40 | 0},${0.10 + rnd() * 0.12})`;
        g.lineWidth = 1 + rnd() * 2;
        g.beginPath(); g.moveTo(ox, y);
        g.bezierCurveTo(ox + 40, y - 6 - rnd() * 8, ox + 90, y + 6 + rnd() * 8, ox + TILE, y);
        g.stroke();
      }
      for (let k = 0; k < 140; k++) {
        g.fillStyle = 'rgba(180,230,225,0.05)';
        g.fillRect(ox + rnd() * TILE, oy + rnd() * TILE, 1, 1);
      }
    }
    // 4 GRAVEL — crypt floor of pebbles
    speckle(MAT.GRAVEL, '#38322c', 4, 700, 50);
    {
      const { ox, oy } = T(MAT.GRAVEL);
      for (let k = 0; k < 260; k++) {
        const v = 60 + rnd() * 70;
        g.fillStyle = `rgba(${v | 0},${(v * 0.92) | 0},${(v * 0.8) | 0},0.5)`;
        g.beginPath(); g.arc(ox + rnd() * TILE, oy + rnd() * TILE, 1 + rnd() * 2.4, 0, 7); g.fill();
      }
    }
    // 5/6 STAIRS — worn stone with an up / down arrow
    speckle(MAT.STAIR_UP, '#4e4a42', 8, 300, 40);
    speckle(MAT.STAIR_DN, '#443f3a', 8, 300, 40);
    for (const [i, dir] of [[MAT.STAIR_UP, 1], [MAT.STAIR_DN, -1]]) {
      const { ox, oy } = T(i);
      g.strokeStyle = 'rgba(18,16,14,0.6)'; g.lineWidth = 3;
      for (let s = 1; s < 4; s++) { g.beginPath(); g.moveTo(ox, oy + s * TILE / 4); g.lineTo(ox + TILE, oy + s * TILE / 4); g.stroke(); }
      g.fillStyle = dir > 0 ? '#c98a3a' : '#5aa89a';
      const cx = ox + TILE / 2, cy = oy + TILE / 2;
      g.beginPath();
      if (dir > 0) { g.moveTo(cx, cy - 34); g.lineTo(cx + 26, cy + 4); g.lineTo(cx + 9, cy + 4); g.lineTo(cx + 9, cy + 32); g.lineTo(cx - 9, cy + 32); g.lineTo(cx - 9, cy + 4); g.lineTo(cx - 26, cy + 4); }
      else { g.moveTo(cx, cy + 34); g.lineTo(cx + 26, cy - 4); g.lineTo(cx + 9, cy - 4); g.lineTo(cx + 9, cy - 32); g.lineTo(cx - 9, cy - 32); g.lineTo(cx - 9, cy - 4); g.lineTo(cx - 26, cy - 4); }
      g.closePath(); g.fill();
    }
    // 7 DOOR — oak with iron bands, hinges, ring
    {
      const { ox, oy } = T(MAT.DOOR);
      g.fillStyle = '#4a3218'; g.fillRect(ox, oy, TILE, TILE);
      for (let p = 0; p < 4; p++) {
        const v = (rnd() - 0.5) * 20;
        g.fillStyle = `rgb(${clamp(84 + v, 0, 255) | 0},${clamp(56 + v * 0.8, 0, 255) | 0},${clamp(28 + v * 0.6, 0, 255) | 0})`;
        g.fillRect(ox + p * (TILE / 4) + 1, oy, TILE / 4 - 2, TILE);
      }
      g.fillStyle = '#2e2e34';
      g.fillRect(ox, oy + 18, TILE, 12); g.fillRect(ox, oy + TILE - 30, TILE, 12);
      g.fillStyle = 'rgba(210,210,225,0.18)';
      g.fillRect(ox, oy + 18, TILE, 2); g.fillRect(ox, oy + TILE - 30, TILE, 2);
      g.fillStyle = '#17171c';
      for (const bx of [8, TILE - 14]) { g.fillRect(ox + bx, oy + 4, 6, 14); g.fillRect(ox + bx, oy + TILE - 18, 6, 14); }
      g.strokeStyle = '#8a8a96'; g.lineWidth = 4;
      g.beginPath(); g.arc(ox + TILE - 22, oy + TILE / 2, 8, 0, 7); g.stroke();
    }
    // 8 RAT — grey rodent, two frames side by side in one tile
    {
      const { ox, oy } = T(MAT.RAT);
      for (const f of [0, 1]) {
        g.save(); g.translate(ox + f * (TILE / 2), oy);
        g.strokeStyle = '#5a5148'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(64, 96); g.bezierCurveTo(84, 100, 92, 84, 84, 70); g.stroke();
        g.fillStyle = '#6e655a';
        g.beginPath(); g.ellipse(56, 84, 30, 20, -0.15, 0, 7); g.fill();
        g.fillStyle = '#7c7266';
        g.beginPath(); g.ellipse(34, 70, 16, 13, 0, 0, 7); g.fill();
        g.beginPath(); g.arc(26, 58, 6, 0, 7); g.fill();
        g.beginPath(); g.arc(40, 56, 6, 0, 7); g.fill();
        g.strokeStyle = '#c98a9a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(22, 66); g.lineTo(12, 62); g.stroke();
        g.fillStyle = '#e8e0d0'; g.beginPath(); g.arc(26, 68, 2.4, 0, 7); g.fill();
        g.strokeStyle = '#5a5148'; g.lineWidth = 5;
        const paw = f ? 8 : 0;
        g.beginPath(); g.moveTo(40 - paw, 100); g.lineTo(36 - paw, 118); g.stroke();
        g.beginPath(); g.moveTo(68 + paw, 100); g.lineTo(72 + paw, 118); g.stroke();
        g.restore();
      }
    }
    // 9 SKELETON — bone-white humanoid with a dagger, two frames
    {
      const { ox, oy } = T(MAT.SKEL);
      for (const f of [0, 1]) {
        g.save(); g.translate(ox + f * (TILE / 2), oy);
        const sw = f ? 1 : -1;
        g.strokeStyle = '#d8d2c0'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(64, 46); g.lineTo(64, 88); g.stroke();
        g.lineWidth = 3;
        for (let r = 0; r < 4; r++) { g.beginPath(); g.moveTo(52, 52 + r * 8); g.lineTo(76, 52 + r * 8); g.stroke(); }
        g.beginPath(); g.moveTo(54, 48); g.lineTo(42 + sw * 8, 66); g.stroke();
        g.beginPath(); g.moveTo(74, 48); g.lineTo(86 - sw * 4, 62); g.stroke();
        g.lineWidth = 5;
        g.beginPath(); g.moveTo(60, 88); g.lineTo(52 + sw * 6, 116); g.stroke();
        g.beginPath(); g.moveTo(68, 88); g.lineTo(78 - sw * 2, 116); g.stroke();
        g.fillStyle = '#e8e2d2';
        g.beginPath(); g.arc(64, 30, 14, 0, 7); g.fill();
        g.fillStyle = '#141014';
        g.beginPath(); g.arc(58, 28, 3.4, 0, 7); g.fill();
        g.beginPath(); g.arc(70, 28, 3.4, 0, 7); g.fill();
        g.fillRect(60, 36, 8, 3);
        g.strokeStyle = 'rgba(150,150,160,0.9)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(86 - sw * 4, 62); g.lineTo(94 - sw * 4, 42); g.stroke();
        g.restore();
      }
    }
    // 10 GOBLYN — green humanoid with a cleaver, two frames
    {
      const { ox, oy } = T(MAT.GOB);
      for (const f of [0, 1]) {
        g.save(); g.translate(ox + f * (TILE / 2), oy);
        const sw = f ? 1 : -1;
        g.fillStyle = '#3f7a3a';
        g.beginPath(); g.ellipse(64, 74, 22, 26, 0, 0, 7); g.fill();
        g.fillStyle = '#4c8f45';
        g.beginPath(); g.arc(62, 36, 15, 0, 7); g.fill();
        g.beginPath(); g.moveTo(48, 30); g.lineTo(30, 20); g.lineTo(46, 38); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(76, 30); g.lineTo(94, 20); g.lineTo(78, 38); g.closePath(); g.fill();
        g.fillStyle = '#ffd23a';
        g.beginPath(); g.arc(56, 34, 2.8, 0, 7); g.fill();
        g.beginPath(); g.arc(68, 34, 2.8, 0, 7); g.fill();
        g.fillStyle = '#1c1410';
        g.beginPath(); g.arc(56, 34, 1.3, 0, 7); g.fill();
        g.beginPath(); g.arc(68, 34, 1.3, 0, 7); g.fill();
        g.strokeStyle = '#3f7a3a'; g.lineWidth = 7;
        g.beginPath(); g.moveTo(50, 62); g.lineTo(34 + sw * 6, 78); g.stroke();
        g.beginPath(); g.moveTo(78, 60); g.lineTo(90 - sw * 4, 46); g.stroke();
        g.strokeStyle = '#2f5c59'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(90 - sw * 4, 46); g.lineTo(96 - sw * 4, 28); g.stroke();
        g.fillStyle = '#9aa0a8';
        g.beginPath(); g.moveTo(92 - sw * 4, 30); g.lineTo(106 - sw * 4, 22); g.lineTo(100 - sw * 4, 8); g.closePath(); g.fill();
        g.strokeStyle = '#356831'; g.lineWidth = 8;
        g.beginPath(); g.moveTo(56, 96); g.lineTo(48 + sw * 8, 120); g.stroke();
        g.beginPath(); g.moveTo(72, 96); g.lineTo(80 - sw * 2, 120); g.stroke();
        g.restore();
      }
    }
    return cv;
  }

  /* ---------------- shaders ---------------- */

  const LIGHT_GLSL = `
float distF(vec3 a, vec3 b){ return length(a - b); }
vec3 lightAt(vec3 p, vec3 n, vec3 camPos, vec3 LCol0,
            vec3 LC[2], vec3 LCol[2], vec2 LPR[2], vec3 LPC[2], float LI[2]){
  vec3 L = vec3(0.030, 0.036, 0.056);
  float lam = 0.0;
  float fogd = distF(camPos, p);
  for (int i = 0; i < 2; i++){
    float I = LI[i];
    if (I <= 0.0) continue;
    vec3 d = LC[i] - p;
    float dl = max(length(d), 1e-4);
    d = d / dl;
    float att = clamp(1.0 - dl / LPR[i], 0.0, 1.0);
    att = att * att * (3.0 - 2.0 * att);
    float cone = clamp(dot(d, LPC[i]), 0.0, 1.0);
    cone = mix(0.45, 1.0, pow(cone, 1.5));
    lam = max(lam, I * att * cone * (0.30 + 0.70 * max(dot(n, d), 0.0)));
  }
  float fog = clamp((fogd - 3.0) / 12.0, 0.0, 1.0);
  fog *= fog;
  return mix(LCol0 * clamp(lam, 0.0, 1.7) + L, vec3(0.006, 0.008, 0.013), fog * 0.92);
}`;

  const VS_MAZE = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec2 aUv;
layout(location=3) in float aMat;
uniform mat4 uVP;
uniform vec3 uCamPos;
uniform float uTime;
uniform vec3 uLC[2];
uniform vec3 uLCol[2];
uniform vec2 uLPR[2];
uniform vec3 uLPC[2];
uniform float uLI[2];
out vec2 vUv;
out vec3 vLight;
out float vMat;
` + LIGHT_GLSL + `
void main(){
  int m = int(aMat + 0.5);
  vec3 p = aPos;
  vec2 uv = aUv;
  vec3 n = aNor;
  if (m == 3){
    p.z += 0.022 * sin(aPos.x * 2.1 + uTime * 1.7) + 0.022 * cos(aPos.y * 2.7 - uTime * 1.3);
    uv += vec2(sin(aPos.y * 3.0 + uTime * 1.1), cos(aPos.x * 2.4 - uTime * 0.9)) * 0.03;
    n = normalize(vec3(-0.05 * cos(aPos.x * 2.1 + uTime * 1.7), 0.05 * sin(aPos.y * 2.7 - uTime * 1.3), 0.97));
  }
  gl_Position = uVP * vec4(p, 1.0);
  vLight = lightAt(p, n, uCamPos, uLCol[0], uLC, uLCol, uLPR, uLPC, uLI);
  vUv = uv;
  vMat = float(m);
}`;

  const FS_MAZE = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vLight;
in float vMat;
uniform sampler2D uAtlas;
out vec4 o;
void main(){
  vec2 base = vec2(mod(vMat, 4.0), floor(vMat / 4.0));
  vec2 suv = (base + clamp(vUv, 0.004, 0.996)) / 4.0;
  vec3 c = texture(uAtlas, suv).rgb * vLight;
  o = vec4(c, 1.0);
}`;

  const VS_SPR = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
uniform mat4 uVP;
uniform vec3 uCamPos;
uniform vec3 uRight;
uniform float uTime;
uniform vec3 uLC[2];
uniform vec3 uLCol[2];
uniform vec2 uLPR[2];
uniform vec3 uLPC[2];
uniform float uLI[2];
uniform vec3 uBase;
uniform vec2 uSize;
uniform vec2 uUvO;
uniform vec2 uUvS;
uniform float uAnim;
out vec2 vUv;
out vec3 vLight;
` + LIGHT_GLSL + `
void main(){
  float sway = 0.02 * sin(uTime * 6.0 + uAnim * 3.0);
  vec3 p = uBase + uRight * (aPos.x * uSize.x) + vec3(sway * aPos.y, 0.0, aPos.y * uSize.y);
  gl_Position = uVP * vec4(p, 1.0);
  vec3 n = normalize(uCamPos - p);
  vLight = lightAt(p - vec3(sway * aPos.y, 0.0, 0.0), n, uCamPos, uLCol[0], uLC, uLCol, uLPR, uLPC, uLI);
  vUv = uUvO + aUv * uUvS;
}`;

  const FS_SPR = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vLight;
uniform sampler2D uAtlas;
out vec4 o;
void main(){
  vec4 t = texture(uAtlas, vUv);
  if (t.a < 0.35) discard;
  o = vec4(t.rgb * vLight, 1.0);
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    return p;
  }

  /* ---------------- pure helpers (headless-safe) ---------------- */

  function cellBlocks(maze, cx, cy) {
    if (!maze || cx < 0 || cy < 0 || cx >= maze.w || cy >= maze.h) return true;
    const c = maze.cells[cy * maze.w + cx];
    if (c === 1) return true;
    if (c === 6) return !(maze.doorOpen && maze.doorOpen[cy * maze.w + cx] > 0.5);
    return false;
  }

  function viewCells(maze, x, y, r) {
    const out = [];
    if (!maze) return out;
    const px = Math.floor(x), py = Math.floor(y);
    for (let cy = Math.max(0, py - r); cy <= Math.min(maze.h - 1, py + r); cy++) {
      for (let cx = Math.max(0, px - r); cx <= Math.min(maze.w - 1, px + r); cx++) {
        if (cellBlocks(maze, cx, cy)) continue;
        const steps = Math.max(2, Math.round(Math.hypot(cx + 0.5 - x, cy + 0.5 - y) * 4));
        let los = true;
        for (let k = 1; k < steps; k++) {
          const t = k / steps;
          const sx = Math.floor(lerp(x, cx + 0.5, t)), sy = Math.floor(lerp(y, cy + 0.5, t));
          if ((sx !== cx || sy !== cy) && cellBlocks(maze, sx, sy)) { los = false; break; }
        }
        if (los) out.push([cx, cy]);
      }
    }
    return out;
  }

  /* ---------------- factory ---------------- */

  function create(canvas, opts) {
    opts = opts || {};
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) return null;

    const atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buildAtlas());
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const extAniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (extAniso) gl.texParameterf(gl.TEXTURE_2D, extAniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);

    const pMaze = program(gl, VS_MAZE, FS_MAZE);
    const pSpr = program(gl, VS_SPR, FS_SPR);
    const uM = {}, uS = {};
    for (const n of ['uVP', 'uCamPos', 'uTime', 'uLC', 'uLCol', 'uLPR', 'uLPC', 'uLI', 'uAtlas']) uM[n] = gl.getUniformLocation(pMaze, n);
    for (const n of ['uVP', 'uCamPos', 'uRight', 'uTime', 'uLC', 'uLCol', 'uLPR', 'uLPC', 'uLI', 'uAtlas', 'uBase', 'uSize', 'uUvO', 'uUvS', 'uAnim']) uS[n] = gl.getUniformLocation(pSpr, n);

    const STRIDE = 9 * 4;
    const vaoM = gl.createVertexArray();
    const bufM = gl.createBuffer();
    gl.bindVertexArray(vaoM);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufM);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, STRIDE, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE, 32);
    const vaoS = gl.createVertexArray();
    const bufS = gl.createBuffer();
    gl.bindVertexArray(vaoS);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufS);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);

    const VERTS = 24 * 1024;
    const mazeData = new Float32Array(VERTS * 9);
    const sprData = new Float32Array(96 * 6 * 5);

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0.004, 0.005, 0.008, 1);

    const api = {
      drawing: true,
      frameCount: 0,
      torch: true,
      maze: null,
      sprites: [],
      time: 0,
      flick: 1,
      eyeZ: EYE_H,
    };

    let logic = { x: 5.5, y: 12.5, z: 0, yaw: Math.PI / 2 };
    let view = { x: 5.5, y: 12.5, z: 0, yaw: Math.PI / 2 };
    let anim = null;
    const FLICK = [];
    { const rnd = mulberry32(0x70F1); for (let i = 0; i < 8; i++) FLICK.push(rnd()); }
    let lights = [];

    const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

    api.setMaze = (maze) => { api.maze = maze; };
    api.setSprites = (list) => { api.sprites = list || []; };
    api.animateTo = (x, y, z, yaw, dur) => {
      let dyaw = yaw - view.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      logic = { x, y, z, yaw: view.yaw + dyaw };
      anim = { t: 0, dur: Math.max(16, dur || 320), x0: view.x, y0: view.y, z0: view.z, yaw0: view.yaw, x1: x, y1: y, z1: z, yaw1: view.yaw + dyaw };
    };
    api.snapTo = (x, y, z, yaw) => {
      anim = null; logic = { x, y, z, yaw };
      view = { x, y, z, yaw }; api.eyeZ = EYE_H;
    };
    api.pose = () => ({ x: logic.x, y: logic.y, z: logic.z, yaw: logic.yaw });
    api.renderPose = () => ({ x: view.x, y: view.y, z: api.eyeZ, yaw: view.yaw });
    api.light = (x, y, z, r, g, b, radius, life) => { lights.push({ x, y, z, r, g, b, radius, life: Math.max(1, life), t: 0 }); };
    api.blocked = (x, y) => cellBlocks(api.maze, Math.floor(x), Math.floor(y));
    api.viewCells = (x, y, r) => viewCells(api.maze, x == null ? logic.x : x, y == null ? logic.y : y, r || RANGE);

    /* geometry builders -------------------------------------------------- */

    let n = 0;
    function push(x, y, z, nx, ny, nz, u, v, mat) {
      const b = n * 9;
      if (b + 9 > mazeData.length) return;
      mazeData[b] = x; mazeData[b + 1] = y; mazeData[b + 2] = z;
      mazeData[b + 3] = nx; mazeData[b + 4] = ny; mazeData[b + 5] = nz;
      mazeData[b + 6] = u; mazeData[b + 7] = v; mazeData[b + 8] = mat;
      n++;
    }
    function quad(ax, ay, az, bx, by, bz, cx2, cy2, cz2, dx, dy, dz, nx, ny, nz, u0, v0, u1, v1, mat) {
      push(ax, ay, az, nx, ny, nz, u0, v0, mat);
      push(bx, by, bz, nx, ny, nz, u1, v0, mat);
      push(cx2, cy2, cz2, nx, ny, nz, u1, v1, mat);
      push(ax, ay, az, nx, ny, nz, u0, v0, mat);
      push(cx2, cy2, cz2, nx, ny, nz, u1, v1, mat);
      push(dx, dy, dz, nx, ny, nz, u0, v1, mat);
    }

    function floorMat(c) {
      if (c === 2) return MAT.TIMBER;
      if (c === 3) return MAT.WATER;
      if (c === 4) return MAT.STAIR_UP;
      if (c === 5) return MAT.STAIR_DN;
      return MAT.FLAG;
    }

    // full brick wall across the face of cell (cx,cy) toward (dx,dy)
    function wallFace(cx, cy, dx, dy, zf) {
      const tx = -dy, ty = dx;
      const hx = cx + CELL / 2 + dx * CELL / 2, hy = cy + CELL / 2 + dy * CELL / 2;
      quad(hx + tx * 0.5, hy + ty * 0.5, zf,
        hx - tx * 0.5, hy - ty * 0.5, zf,
        hx - tx * 0.5, hy - ty * 0.5, zf + WALL_H,
        hx + tx * 0.5, hy + ty * 0.5, zf + WALL_H,
        -dx, -dy, 0, 0, 1, 1, 0, MAT.BRICK);
    }

    // the brickwork around a doorway (posts + lintel), face toward (dx,dy)
    function doorFrame(cx, cy, dx, dy, zf) {
      const tx = -dy, ty = dx;
      const hx = cx + CELL / 2 + dx * CELL / 2, hy = cy + CELL / 2 + dy * CELL / 2;
      for (const s of [1, -1]) {
        const o0 = s * DOOR_W / 2, o1 = s * CELL / 2;
        quad(hx + tx * o0, hy + ty * o0, zf,
          hx + tx * o1, hy + ty * o1, zf,
          hx + tx * o1, hy + ty * o1, zf + WALL_H,
          hx + tx * o0, hy + ty * o0, zf + WALL_H,
          -dx, -dy, 0, 0, 1, 1, 0, MAT.BRICK);
      }
      quad(hx + tx * DOOR_W / 2, hy + ty * DOOR_W / 2, zf + DOOR_H,
        hx - tx * DOOR_W / 2, hy - ty * DOOR_W / 2, zf + DOOR_H,
        hx - tx * DOOR_W / 2, hy - ty * DOOR_W / 2, zf + WALL_H,
        hx + tx * DOOR_W / 2, hy + ty * DOOR_W / 2, zf + WALL_H,
        -dx, -dy, 0, 0, 1, 1, 0, MAT.BRICK);
    }

    // the sliding oak panels inside a door cell, face toward (dx,dy)
    function doorPanels(cx, cy, dx, dy, zf, open) {
      const tx = -dy, ty = dx;
      const hx = cx + CELL / 2 + dx * CELL / 2, hy = cy + CELL / 2 + dy * CELL / 2;
      const o = clamp(open, 0, 1);
      const half = (DOOR_W / 2) * (1 - o * 0.7);
      const slide = o * DOOR_W * 0.62;
      const pz = zf + DOOR_H;
      for (const s of [1, -1]) {
        const c1 = s * (slide + half), c0 = s * slide;
        quad(hx + tx * c1, hy + ty * c1, zf,
          hx + tx * c0, hy + ty * c0, zf,
          hx + tx * c0, hy + ty * c0, pz,
          hx + tx * c1, hy + ty * c1, pz,
          -dx, -dy, 0, s > 0 ? 0.02 : 0.98, 1, s > 0 ? 0.98 : 0.02, 0, MAT.DOOR);
      }
    }

    function buildGeometry() {
      const m = api.maze;
      n = 0;
      if (!m) return 0;
      const zf = Math.round(logic.z);
      const cx0 = clamp(Math.floor(logic.x) - RANGE, 0, m.w - 1), cx1 = clamp(Math.floor(logic.x) + RANGE, 0, m.w - 1);
      const cy0 = clamp(Math.floor(logic.y) - RANGE, 0, m.h - 1), cy1 = clamp(Math.floor(logic.y) + RANGE, 0, m.h - 1);
      const at = (x, y) => (x < 0 || y < 0 || x >= m.w || y >= m.h) ? 1 : m.cells[y * m.w + x];
      const FACES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const i = cy * m.w + cx;
          const c = m.cells[i];
          if (c === 1) continue;
          const mat = floorMat(c);
          if (c === 4) {
            quad(cx + 1, cy, zf + 1, cx + 1, cy + 1, zf + 1, cx, cy + 1, zf, cx, cy, zf, -0.408, -0.408, 0.816, 0, 0, 1, 1, mat);
            quad(cx, cy + 1, zf, cx + 1, cy + 1, zf, cx + 1, cy + 1, zf + 1, cx, cy + 1, zf + 1, 0, 1, 0, 0, 0, 1, 1, mat);
          } else if (c === 5) {
            quad(cx + 1, cy, zf, cx + 1, cy + 1, zf - 1, cx, cy + 1, zf - 1, cx, cy, zf, -0.408, -0.408, -0.816, 0, 0, 1, 1, mat);
            quad(cx + 1, cy + 1, zf - 1, cx, cy + 1, zf - 1, cx, cy, zf, cx + 1, cy, zf, 0, -1, 0, 0, 0, 1, 1, mat);
          } else {
            const z = c === 3 ? zf - 0.07 : zf;
            quad(cx + 1, cy, z, cx + 1, cy + 1, z, cx, cy + 1, z, cx, cy, z, 0, 0, 1, cx, cy, cx + 1, cy + 1, mat);
          }
          quad(cx, cy, zf + CEIL_H, cx + 1, cy, zf + CEIL_H, cx + 1, cy + 1, zf + CEIL_H, cx, cy + 1, zf + CEIL_H, 0, 0, -1, cx * 0.5, cy * 0.5, (cx + 1) * 0.5, (cy + 1) * 0.5, MAT.BRICK);
          for (const [dx, dy] of FACES) {
            const nb = at(cx + dx, cy + dy);
            if (nb === 1) wallFace(cx, cy, dx, dy, zf);
            else if (nb === 6) doorFrame(cx, cy, dx, dy, zf);
          }
        }
      }
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const i = cy * m.w + cx;
          if (m.cells[i] !== 6) continue;
          const open = m.doorOpen ? m.doorOpen[i] : 0;
          if (at(cx + 1, cy) !== 1) doorPanels(cx, cy, 1, 0, zf, open);
          if (at(cx - 1, cy) !== 1) doorPanels(cx, cy, -1, 0, zf, open);
          if (at(cx, cy + 1) !== 1) doorPanels(cx, cy, 0, 1, zf, open);
          if (at(cx, cy - 1) !== 1) doorPanels(cx, cy, 0, -1, zf, open);
        }
      }
      return n;
    }

    /* sprites ------------------------------------------------------------ */

    let sn = 0;
    function pushS(px, py, u, v) {
      const k = sn * 5;
      sprData[k] = px; sprData[k + 1] = py; sprData[k + 2] = 0; sprData[k + 3] = u; sprData[k + 4] = v;
      sn++;
    }
    const SPR_U = { 8: 0, 9: 0.25, 10: 0.5 };
    function buildSprites() {
      sn = 0;
      const zf = Math.round(logic.z);
      const live = [];
      for (const s of api.sprites) {
        if ((s.z || 0) !== zf) continue;
        if (Math.hypot(s.x - logic.x, s.y - logic.y) > RANGE + 2) continue;
        const frame = (Math.floor((s.anim || 0) / 300) & 1);
        const u0 = SPR_U[s.mat] != null ? SPR_U[s.mat] : 0;
        const inset = 0.008;
        s._u = {
          base: [s.x, s.y, s.fz != null ? s.fz : zf],
          size: [s.w || 0.62, s.h || 0.62],
          uvO: [u0 + frame * 0.125 + inset, 0.5 + inset],
          uvS: [0.125 - 2 * inset, 0.25 - 2 * inset],
          anim: s.anim || 0,
        };
        live.push(s);
        if (live.length >= 64) break;
      }
      if (live.length) {
        pushS(-0.5, 1, 0, 0); pushS(0.5, 1, 1, 0); pushS(0.5, 0, 1, 1);
        pushS(-0.5, 1, 0, 0); pushS(0.5, 0, 1, 1); pushS(-0.5, 0, 0, 1);
      }
      api._live = live;
      return live.length ? 6 : 0;
    }

    /* simulation of view, lights, torch ------------------------------- */

    function tickAnim(dt) {
      if (!anim) { api.eyeZ = EYE_H; return; }
      anim.t += dt;
      const k = clamp(anim.t / anim.dur, 0, 1);
      const e = easeInOut(k);
      view.x = lerp(anim.x0, anim.x1, e);
      view.y = lerp(anim.y0, anim.y1, e);
      view.z = lerp(anim.z0, anim.z1, e);
      const dyaw = anim.yaw1 - anim.yaw0;
      view.yaw = anim.yaw0 + dyaw * e;
      const speed = clamp(Math.hypot(anim.x1 - anim.x0, anim.y1 - anim.y0) / (anim.dur / 1000), 0, 1.4);
      const bob = Math.sin(k * Math.PI * 2) * 0.045 * speed
        + Math.sin(k * Math.PI) * 0.02 * speed
        + Math.sin(k * Math.PI) * 0.03 * clamp(Math.abs(dyaw) / (Math.PI / 2), 0, 1);
      api.eyeZ = EYE_H + view.z + bob;
      if (k >= 1) { view = { x: anim.x1, y: anim.y1, z: anim.z1, yaw: anim.yaw1 }; anim = null; api.eyeZ = EYE_H + view.z; }
    }

    function tickLights(dt) { lights = lights.filter((L) => (L.t += dt) < L.life); }

    function tickFlick() {
      const t = api.time / 90;
      const i = Math.floor(t), f = t - i;
      const sm = f * f * (3 - 2 * f);
      let v = lerp(FLICK[i % 8], FLICK[(i + 1) % 8], sm) * 0.22;
      v += 0.12 * Math.sin(api.time / 53.3) * Math.sin(api.time / 31.7 + 1.3);
      api.flick = clamp(1 + v, 0.55, 1.25);
    }

    api.frame = function (dt) {
      dt = clamp(dt == null ? 16 : dt, 0, 100);
      api.time += dt;
      tickAnim(dt);
      tickLights(dt);
      tickFlick();
      if (!api.drawing) return api.frameCount;

      const w = canvas.width, h = canvas.height;
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const R = [Math.cos(view.yaw), Math.sin(view.yaw), 0];
      const F = norm3(-Math.sin(view.yaw), Math.cos(view.yaw), -0.05);
      const U = norm3(-F[1], F[0], 0);
      const eye = [view.x, view.y, api.eyeZ];
      const aspect = (w / Math.max(1, h)) || 1.333;
      const tanV = Math.tan(FOV_V / 2);
      const near = 0.08, far = 30;
      const V = new Float32Array([
        R[0], U[0], -F[0], 0,
        R[1], U[1], -F[1], 0,
        R[2], U[2], -F[2], 0,
        -(R[0] * eye[0] + R[1] * eye[1] + R[2] * eye[2]),
        -(U[0] * eye[0] + U[1] * eye[1] + U[2] * eye[2]),
        (F[0] * eye[0] + F[1] * eye[1] + F[2] * eye[2]), 1,
      ]);
      const P = new Float32Array([
        1 / (aspect * tanV), 0, 0, 0,
        0, 1 / tanV, 0, 0,
        0, 0, (far + near) / (near - far), -1,
        0, 0, (2 * far * near) / (near - far), 0,
      ]);
      const VPm = new Float32Array(16);
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          VPm[c * 4 + r] = P[r] * V[c * 4] + P[r + 4] * V[c * 4 + 1] + P[r + 8] * V[c * 4 + 2] + P[r + 12] * V[c * 4 + 3];
        }
      }

      const slots = [];
      if (api.torch) slots.push({ x: eye[0], y: eye[1], z: eye[2] + 0.06, col: [1.0, 0.71, 0.42], radius: 11.5 * api.flick, cone: F, I: api.flick });
      for (const L of lights) {
        const k = 1 - L.t / L.life;
        const pulse = k > 0.8 ? (1 - k) / 0.2 : k;
        slots.push({ x: L.x, y: L.y, z: L.z + 0.9, col: [L.r, L.g, L.b], radius: L.radius, cone: [0.1, 0.1, 0.99], I: 1.6 * clamp(pulse, 0, 1) });
      }
      slots.sort((a, b) => b.I - a.I);
      const LC = new Float32Array(6), LCol = new Float32Array(6), LPR = new Float32Array(4), LPC = new Float32Array(6), LI = new Float32Array(2);
      for (let i = 0; i < 2 && i < slots.length; i++) {
        const s = slots[i];
        LC[i * 3] = s.x; LC[i * 3 + 1] = s.y; LC[i * 3 + 2] = s.z;
        LCol[i * 3] = s.col[0]; LCol[i * 3 + 1] = s.col[1]; LCol[i * 3 + 2] = s.col[2];
        LPR[i * 2] = s.radius;
        LPC[i * 3] = s.cone[0]; LPC[i * 3 + 1] = s.cone[1]; LPC[i * 3 + 2] = s.cone[2];
        LI[i] = s.I;
      }

      gl.useProgram(pMaze);
      gl.uniformMatrix4fv(uM.uVP, false, VPm);
      gl.uniform3fv(uM.uCamPos, eye);
      gl.uniform1f(uM.uTime, api.time / 1000);
      gl.uniform3fv(uM.uLC, LC);
      gl.uniform3fv(uM.uLCol, LCol);
      gl.uniform2fv(uM.uLPR, LPR);
      gl.uniform3fv(uM.uLPC, LPC);
      gl.uniform1fv(uM.uLI, LI);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(uM.uAtlas, 0);
      const nv = buildGeometry();
      gl.bindVertexArray(vaoM);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufM);
      gl.bufferData(gl.ARRAY_BUFFER, mazeData.subarray(0, nv * 9), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, nv);

      const ns = buildSprites();
      if (ns) {
        gl.useProgram(pSpr);
        gl.uniformMatrix4fv(uS.uVP, false, VPm);
        gl.uniform3fv(uS.uCamPos, eye);
        gl.uniform3fv(uS.uRight, R);
        gl.uniform1f(uS.uTime, api.time / 1000);
        gl.uniform3fv(uS.uLC, LC);
        gl.uniform3fv(uS.uLCol, LCol);
        gl.uniform2fv(uS.uLPR, LPR);
        gl.uniform3fv(uS.uLPC, LPC);
        gl.uniform1fv(uS.uLI, LI);
        gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        gl.uniform1i(uS.uAtlas, 0);
        gl.depthMask(false);
        gl.bindVertexArray(vaoS);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufS);
        gl.bufferData(gl.ARRAY_BUFFER, sprData.subarray(0, ns * 5), gl.DYNAMIC_DRAW);
        for (const s of api._live) {
          const u = s._u;
          gl.uniform3f(uS.uBase, u.base[0], u.base[1], u.base[2]);
          gl.uniform2f(uS.uSize, u.size[0], u.size[1]);
          gl.uniform2f(uS.uUvO, u.uvO[0], u.uvO[1]);
          gl.uniform2f(uS.uUvS, u.uvS[0], u.uvS[1]);
          gl.uniform1f(uS.uAnim, u.anim);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        gl.depthMask(true);
      }
      gl.bindVertexArray(null);
      api.frameCount++;
      return api.frameCount;
    };

    api.resize = function () {
      const dpr = opts.dpr || 1;
      const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
      canvas.width = Math.max(8, Math.floor(w * dpr));
      canvas.height = Math.max(8, Math.floor(h * dpr));
    };

    return api;
  }

  return { create, cellBlocks, viewCells, MAT, CELL, WALL_H, EYE_H, RANGE };
})();
