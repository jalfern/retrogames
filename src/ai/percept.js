/**
 * The Percept — the ONLY thing an AI brain is allowed to look at.
 *
 * A brain never touches the canvas, the emulator's memory, the DOM, or the raw
 * transcript. Sensors read those and hand up a Percept. That single boundary is
 * what makes the two-sensor experiment possible: swap `sense()`, keep the brain,
 * and any difference in outcome belongs to the sensor and nothing else.
 *
 * SHAPE
 *   room                string|null  a fingerprint/id, never a picture. Zork: the
 *                                    room heading ("Kitchen"). KQ: a screen hash.
 *   ego                 { x, y, dir, moving, conf }   pixels or tiles, per game.
 *   actors              [{ id, x, y, view, loop, visible, conf }]
 *   inventory           [string]
 *   message             { text, conf }   the language channel — what the game said.
 *   score, moves        number|null      whatever progress currency the game has.
 *   extra               object           game-specific remainder (Zork keeps its
 *                                        parsed exits here; KQ its flags).
 *
 * CONFIDENCE IS NOT OPTIONAL
 * --------------------------
 * Every sensor field carries `conf` in [0,1]. `ram` reports 1 because it reads
 * the truth; `eye` reports what it actually earned (a sprite match at 0.62 is
 * not a position, it is a guess with a score). The planner is then allowed to
 * *degrade honestly* — rescan instead of committing to the climb — instead of
 * acting on a confident fiction. A silently wrong sensor is the failure mode
 * this whole design exists to catch: Mario's `?`-block rule aimed one tile
 * early, so he sailed over the fire flower every single run and the entire fire
 * branch had literally never executed.
 */

export const NO_CONF = 0

export function makePercept(over = {}) {
  return {
    room: null,
    ego: { x: null, y: null, dir: null, moving: false, conf: NO_CONF },
    actors: [],
    inventory: [],
    message: { text: null, conf: NO_CONF },
    score: null,
    moves: null,
    extra: {},
    ts: 0,
    sensor: 'none',
    ...over,
  }
}

/** A pose/think/did diary line — the thing that makes an AI legible to a viewer. */
export function diaryLine(saw, did, ok) {
  return { saw, did, ok: !!ok }
}

/**
 * A cheap stable signature of the parts of a percept that mean "something
 * happened". Used by the loop's stuck watchdog; deliberately ignores `ts`.
 */
export function perceptSignature(p) {
  if (!p) return ''
  const ego = p.ego ? `${p.ego.x},${p.ego.y}` : '-'
  const actors = (p.actors || []).map(a => `${a.id}:${a.x},${a.y}`).join(';')
  return [p.room, ego, (p.inventory || []).join(','), p.score, p.moves, p.message?.text, actors].join('|')
}

/** Lowest confidence among the fields a decision is about to depend on. */
export function minConf(...fields) {
  const vals = fields.map(f => (f && typeof f === 'object' ? f.conf : f)).filter(v => typeof v === 'number')
  return vals.length ? Math.min(...vals) : NO_CONF
}
