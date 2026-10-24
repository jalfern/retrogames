// MYST — the sound plan. Pure: an event name maps to a list of cue descriptors.
// It is deliberately free of audioController and three.js so
// scripts/mystcheck.mjs imports it under Node and asserts on what a sound
// event schedules. A cue that never schedules — or that schedules identically
// to its neighbour — is a silent regression the gate catches.
//
// Cue shape: { type: 'tone' | 'sweep' | 'noise' | 'fnoise', ... }
//   tone   { f, dur, wave, vol, delay? }
//   sweep  { f0, f1, dur, wave, vol }
//   noise  { dur, vol }                       (raw crackle)
//   fnoise { dur, vol, freq }                 (lowpassed: paper, whoosh)

export const TONES = [196, 262, 330, 392]
// The sounding path of SELENITIC: six stones, biggest sings lowest. Strictly
// ascending and distinct — the puzzle IS the pitch order.
export const STONE_TONES = [110, 131, 147, 165, 196, 220]

export function plan(ev) {
  // A linking-book leap is a whole other event than a walk: a long rising
  // whoosh under a soft page-rustle. It must never collapse into the plain
  // travel sweep, so it is matched on its prefix before the switch below.
  if (typeof ev === 'string' && ev.startsWith('link:')) {
    return [
      { type: 'sweep', f0: 90, f1: 1400, dur: 0.9, wave: 'sine', vol: 0.1 },
      { type: 'fnoise', dur: 0.5, vol: 0.12, freq: 600 },
    ]
  }
  // Stepping a sounding stone rings ITS tone: the pitch is the progress.
  if (typeof ev === 'string' && ev.startsWith('stone:')) {
    const i = Math.max(0, Math.min(STONE_TONES.length - 1, Number(ev.split(':')[1]) || 0))
    return [{ type: 'tone', f: STONE_TONES[i], dur: 0.8, wave: 'sine', vol: 0.1 }, { type: 'tone', f: STONE_TONES[i] * 2, dur: 0.5, wave: 'sine', vol: 0.03, delay: 0.05 }]
  }
  // The sphere's posts sing THIS save's ring order (#1005): `sing:2031` is a
  // different island's clue than `sing:0123`. The player reads the code by
  // ear, so the sequence must ride the seed, not a hardcoded chirp.
  if (typeof ev === 'string' && ev.startsWith('sing:')) {
    const order = (ev.split(':')[1] || '').split('').map(Number).filter((n) => n >= 0 && n < TONES.length)
    return order.map((r, i) => ({ type: 'tone', f: TONES[r], dur: 0.4, wave: 'sine', vol: 0.09, delay: i * 0.34 }))
  }
  const P = []
  switch (ev) {
    case 'turn': P.push({ type: 'tone', f: 220, dur: 0.05, wave: 'triangle', vol: 0.05 }); break
    case 'travel': P.push({ type: 'sweep', f0: 140, f1: 420, dur: 0.5, wave: 'sine', vol: 0.08 }); break
    case 'look': P.push({ type: 'tone', f: 520, dur: 0.06, wave: 'sine', vol: 0.05 }); break
    case 'blocked': P.push({ type: 'tone', f: 110, dur: 0.12, wave: 'square', vol: 0.06 }); break
    case 'reveal': P.push({ type: 'sweep', f0: 330, f1: 180, dur: 0.35, wave: 'triangle', vol: 0.09 }, { type: 'noise', dur: 0.2, vol: 0.1 }); break
    case 'takePage': P.push({ type: 'noise', dur: 0.18, vol: 0.12 }, { type: 'tone', f: 660, dur: 0.12, wave: 'sine', vol: 0.07, delay: 0.08 }); break
    case 'placePage': P.push({ type: 'tone', f: 392, dur: 0.18, wave: 'sine', vol: 0.09 }, { type: 'tone', f: 523, dur: 0.22, wave: 'sine', vol: 0.08, delay: 0.12 }); break
    case 'pickup': P.push({ type: 'tone', f: 587, dur: 0.1, wave: 'square', vol: 0.06 }); break
    case 'dial': P.push({ type: 'tone', f: 150 + Math.random() * 40, dur: 0.04, wave: 'square', vol: 0.05 }); break
    case 'safeOpen': P.push({ type: 'sweep', f0: 90, f1: 300, dur: 0.6, wave: 'sawtooth', vol: 0.1 }, { type: 'noise', dur: 0.3, vol: 0.12 }); break
    case 'switchSolved': P.push({ type: 'tone', f: 196, dur: 0.1, wave: 'square', vol: 0.07 }, { type: 'tone', f: 294, dur: 0.1, wave: 'square', vol: 0.07, delay: 0.09 }, { type: 'tone', f: 392, dur: 0.16, wave: 'square', vol: 0.07, delay: 0.18 }); break
    case 'starSolved': P.push({ type: 'sweep', f0: 300, f1: 900, dur: 0.7, wave: 'sine', vol: 0.08 }); break
    case 'sphereSolved': P.push({ type: 'tone', f: 262, dur: 0.25, wave: 'sine', vol: 0.08 }, { type: 'tone', f: 330, dur: 0.25, wave: 'sine', vol: 0.08, delay: 0.1 }, { type: 'tone', f: 392, dur: 0.3, wave: 'sine', vol: 0.08, delay: 0.2 }, { type: 'noise', dur: 0.4, vol: 0.1 }); break
    case 'burn': P.push({ type: 'noise', dur: 0.9, vol: 0.16 }, { type: 'sweep', f0: 200, f1: 80, dur: 0.8, wave: 'sawtooth', vol: 0.08 }); break
    case 'whitePage': [523, 659, 784, 1046].forEach((f, i) => P.push({ type: 'tone', f, dur: 0.35, wave: 'sine', vol: 0.09, delay: i * 0.14 })); break
    case 'endGood': [392, 494, 587, 784, 988].forEach((f, i) => P.push({ type: 'tone', f, dur: 0.5, wave: 'triangle', vol: 0.1, delay: i * 0.16 })); break
    case 'endBad': P.push({ type: 'sweep', f0: 300, f1: 60, dur: 1.2, wave: 'sawtooth', vol: 0.12 }, { type: 'noise', dur: 0.8, vol: 0.14 }); break
    case 'restart': P.push({ type: 'sweep', f0: 600, f1: 200, dur: 0.4, wave: 'triangle', vol: 0.08 }); break
    // A book or panel turning over: a short, dry sheet of paper, lowpassed so
    // it reads as paper rather than static. Fired on every open and close.
    case 'page': P.push({ type: 'fnoise', dur: 0.16, vol: 0.08, freq: 1400 }); break
    case 'panel': P.push({ type: 'fnoise', dur: 0.2, vol: 0.09, freq: 1100 }, { type: 'tone', f: 240, dur: 0.1, wave: 'sine', vol: 0.05, delay: 0.03 }); break
    // The Mechanical cage and door: the cage motor is a low cable-hiss under a
    // rising brake whine; bolts are a hard clank; the plates thud; the latch
    // bites with a double click. Each distinct, so the harness can tell them.
    case 'motor': P.push({ type: 'sweep', f0: 70, f1: 150, dur: 0.7, wave: 'sawtooth', vol: 0.07 }, { type: 'noise', dur: 0.6, vol: 0.05 }); break
    case 'clank': P.push({ type: 'tone', f: 140, dur: 0.12, wave: 'square', vol: 0.08 }, { type: 'noise', dur: 0.18, vol: 0.1 }); break
    case 'plate': P.push({ type: 'tone', f: 320, dur: 0.07, wave: 'triangle', vol: 0.05 }); break
    case 'latch': P.push({ type: 'noise', dur: 0.1, vol: 0.1 }, { type: 'tone', f: 90, dur: 0.09, wave: 'square', vol: 0.07, delay: 0.07 }); break
    case 'spectator': [330, 440, 550].forEach((f, i) => P.push({ type: 'tone', f, dur: 0.5, wave: 'sine', vol: 0.07, delay: i * 0.22 })); break
    // SELENITIC: a wrong stone is a sour buzz — two detuned saws beating against
    // each other, nothing sweet in it. The throne swivels on oiled bronze; the
    // alignment rings a sun-moon fifth; the gear lifts free with a slot's hiss.
    case 'buzz': P.push({ type: 'tone', f: 82, dur: 0.7, wave: 'sawtooth', vol: 0.09 }, { type: 'tone', f: 87, dur: 0.7, wave: 'sawtooth', vol: 0.07, delay: 0.02 }, { type: 'noise', dur: 0.4, vol: 0.06 }); break
    case 'swivel': P.push({ type: 'sweep', f0: 120, f1: 190, dur: 0.28, wave: 'triangle', vol: 0.06 }, { type: 'tone', f: 96, dur: 0.08, wave: 'square', vol: 0.05, delay: 0.26 }); break
    case 'alignOpen': P.push({ type: 'tone', f: 220, dur: 0.9, wave: 'sine', vol: 0.09 }, { type: 'tone', f: 330, dur: 0.9, wave: 'sine', vol: 0.08, delay: 0.12 }, { type: 'sweep', f0: 70, f1: 130, dur: 1.1, wave: 'sawtooth', vol: 0.06 }); break
    case 'gateOpen': P.push({ type: 'sweep', f0: 60, f1: 110, dur: 1.2, wave: 'sawtooth', vol: 0.08 }, { type: 'noise', dur: 0.9, vol: 0.09 }); break
    case 'gearTake': P.push({ type: 'fnoise', dur: 0.35, vol: 0.09, freq: 900 }, { type: 'tone', f: 440, dur: 0.25, wave: 'sine', vol: 0.07, delay: 0.18 }); break
    // The field of stones hums before you touch it: a low drone under a soft
    // fifth, so the corridor of rock feels alive as you cross it, not silent.
    // Distinct from the sour buzz (detuned saws) and the gate grind — a sweet,
    // sustained hum, which is the point of the tell.
    case 'flood': P.push({ type: 'sweep', f0: 90, f1: 240, dur: 1.2, wave: 'sine', vol: 0.06 }, { type: 'noise', dur: 1.1, vol: 0.05 }); break
    case 'hum': P.push({ type: 'tone', f: 98, dur: 1.6, wave: 'sine', vol: 0.035 }, { type: 'tone', f: 147, dur: 1.2, wave: 'sine', vol: 0.02, delay: 0.25 }); break
    default: break
  }
  return P
}
