// MYST — per-save puzzle codes (#1005). The 1993 original stamped its
// combination locks per game save: every fresh copy of the island read
// different numbers at the Mechanical safe, the Selenitic sphere and the
// star panel, so the answer always came from the world, never from
// someone else's walkthrough. This module derives the same way: one 32-bit
// seed per fresh game (or per ?seed= pin) decides all three codes.

export const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const shuffled = (arr, rnd) => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

export function deriveCodes(seed) {
  const rnd = mulberry32(seed >>> 0)
  return {
    seed: seed >>> 0,
    safe: [0, 1, 2].map(() => 1 + Math.floor(rnd() * 9)).join(''),
    star: shuffled([1, 2, 3, 4], rnd),
    sphere: shuffled([0, 1, 2, 3], rnd),
  }
}

export function freshSeed() {
  return (Math.random() * 0xffffffff) >>> 0
}

export function seedFromSearch(search) {
  const q = search != null ? search : (typeof window !== 'undefined' ? window.location.search : '')
  const m = /[?&]seed=(\d{1,10})/.exec(q || '')
  return m ? (Number(m[1]) >>> 0) : null
}

// #1008 — the notebook. The original kept one copy's codes for the life of
// its save file; we keep the seed in localStorage so a returning explorer
// finds the same locks where they left them. A ?seed= pin always beats the
// notebook; a blocked store (private mode) degrades to per-visit islands.
const SEED_KEY = 'myst:save-seed'

export function loadSeed() {
  try {
    const v = globalThis.localStorage.getItem(SEED_KEY)
    return v == null ? null : Number(v) >>> 0
  } catch { return null }
}

export function storeSeed(seed) {
  try { globalThis.localStorage.setItem(SEED_KEY, String(seed >>> 0)) } catch { /* ephemeral island */ }
}

export function notebookSeed(search) {
  const pinned = seedFromSearch(search)
  if (pinned != null) return pinned
  const saved = loadSeed()
  return saved != null ? saved : freshSeed()
}

export function safeWords(safe) {
  return String(safe).split('').map((d) => NUMBER_WORDS[Number(d)]).join(', ')
}
