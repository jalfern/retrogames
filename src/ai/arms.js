/**
 * Sensor arms — the lab switch.
 *
 * The player default is **hybrid** (state from the emulator's memory, language
 * from OCR of the CGA text): it plays best. `eye` (pixels only) and `ram`
 * (memory only) exist so the A/B harness can hold the brain still and move the
 * sensor — which is the only way to learn how much of a win belongs to the
 * policy and how much belongs to the cheat sheet.
 *
 * Precedence (highest first):
 *   1. window.__aiSensor          — set by the check scripts, DEV only
 *                                 (also the only way to select `transcript`, which
 *                                 is Zork's arm: a text game has no pixels to read)
 *   2. ?sensor=eye|ram|hybrid     — a URL is a reproducible experiment
 *   3. localStorage               — what the player last chose in OPTIONS
 *   4. HYBRID                     — the default
 *
 * The chosen arm is ALWAYS printed in the AI strip. No generic "🤖 AI" badge
 * that lets a privileged run pass for a perceptive one.
 */

export const ARMS = ['hybrid', 'eye', 'ram', 'transcript']
export const DEFAULT_ARM = 'hybrid'
const STORAGE_KEY = 'arcade.ai.sensor'

/** What the HUD prints for each arm. Honest labels only. */
export const ARM_LABELS = {
  hybrid: 'RAM + PIXELS + OCR',
  eye: 'PIXELS + OCR',
  ram: 'STATE PEEK',
  transcript: 'TRANSCRIPT',
}

export function armLabel(arm) {
  return ARM_LABELS[arm] || String(arm || '?').toUpperCase()
}

const listeners = new Set()
let current = DEFAULT_ARM

function readInitial() {
  if (typeof window === 'undefined') return DEFAULT_ARM
  if (ARMS.includes(window.__aiSensor)) return window.__aiSensor
  try {
    const q = new URLSearchParams(window.location.search)
    const fromUrl = (q.get('sensor') || q.get('arm') || '').toLowerCase()
    if (ARMS.includes(fromUrl)) return fromUrl
    const saved = localStorage.getItem(STORAGE_KEY)
    if (ARMS.includes(saved)) return saved
  } catch {
    // private mode / storage disabled — the default is fine
  }
  return DEFAULT_ARM
}

export function getArm() {
  return current
}

export function setArm(arm, { persist = true } = {}) {
  const next = ARMS.includes(arm) ? arm : DEFAULT_ARM
  if (next === current) return next
  current = next
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* storage disabled */ }
  }
  listeners.forEach(fn => fn(next))
  return next
}

/** Subscribe to lab-switch changes. Returns the unsubscribe function. */
export function subscribeArm(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Arms a given game actually implements, straight from the GAMES registry.
 *
 * An *empty* declaration means "no sensor exists yet" and returns [] — which the
 * badge prints as NOT IMPLEMENTED. Only a game with no `sensors` field at all
 * (a game that never shows a badge) falls back to the default. That distinction
 * is the whole point: a title must not be able to advertise an eye it does not
 * have. King's Quest currently declares [] on purpose — stage 3 adds `eye`,
 * stage 4b adds `ram`, and each one flips this list when its check goes green.
 */
export function armsForGame(game) {
  const declared = game?.sensors
  if (!Array.isArray(declared)) return [DEFAULT_ARM]
  return ARMS.filter((a) => declared.includes(a))
}

/** The arm to use for a game: the lab choice if it supports it, else its best, else none. */
export function effectiveArm(game) {
  const supported = armsForGame(game)
  if (!supported.length) return null
  return supported.includes(current) ? current : supported[0]
}

if (typeof window !== 'undefined') current = readInitial()
