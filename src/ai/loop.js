/**
 * AgentLoop — one sense → decide → act → verify cycle, and the honesty that has
 * to surround it.
 *
 * The brain is a plain object; the loop owns everything that makes an agent
 * debuggable instead of mysterious:
 *
 *   diary       every tick records {saw, did, ok, progress} — "what it believed,
 *               what it did, what happened", shown live in <AiBadge />.
 *   watchdog    N ticks with no progress → ask the brain for a recovery action,
 *               otherwise STOP and say why. An unattended agent will happily
 *               oscillate in front of a closed door for an hour; a human at least
 *               gets bored. Silence is not a result.
 *   validation  a decision naming a skill that does not exist is REJECTED and
 *               counted, never thrown. That counter is the difference between
 *               "the planner is thinking" and "the planner is hallucinating" —
 *               and it is visible in stats().
 *   settle      after acting it waits for the percept to change (or a timeout),
 *               instead of the old fixed 5-second timer poking a game that had
 *               not finished animating.
 *
 * BRAIN CONTRACT
 *   brain.sense(arm)            -> Percept          (required)
 *   brain.skills                { name: fn(args, percept) -> {ok,note}|truthy }
 *   brain.step(percept, ctx)    -> { skill, args } | null
 *   brain.progress(percept)     -> number           progress currency (score, rooms…)
 *   brain.recover(percept, ctx) -> { skill, args } | null   optional
 *   brain.diagnose(percept)     -> string                    optional HUD detail
 *
 * ctx passed to step/recover: { stats, diary, arm, stuck, minConf }
 */

import { perceptSignature } from './percept.js'

const MAX_DIARY = 200

export class AgentLoop {
  constructor({
    brain,
    arm = 'hybrid',
    pollMs = 220,
    minActionGapMs = 380,
    watchdog = 14,        // ticks with zero progress before recovery/recover
    maxIdleTicks = 4,     // ticks where the brain declines to act before stopping
    maxSteps = Infinity,
    onDiary = null,
    onStatus = null,
    onError = null,
    now = () => Date.now(),
  }) {
    this.brain = brain
    this.arm = arm
    this.pollMs = pollMs
    this.minActionGapMs = minActionGapMs
    this.watchdog = watchdog
    this.maxIdleTicks = maxIdleTicks
    this.maxSteps = maxSteps
    this.onDiary = onDiary
    this.onStatus = onStatus
    this.onError = onError
    this.now = now

    this.running = false
    this.reason = null
    this.timer = null
    this.diary = []
    this.resetStats()
  }

  resetStats() {
    Object.assign(this, {
      steps: 0,
      actions: 0,
      successes: 0,
      failures: 0,
      invalid: 0,      // decisions naming a skill that does not exist
      stuck: 0,        // watchdog firings
      idle: 0,         // ticks where the brain declined to act
      stale: 0,        // ticks since progress improved
      progress: 0,
      progressMax: 0,
      lastSig: null,
      lastActionAt: 0,
      startedAt: 0,
    })
  }

  start() {
    if (this.running) return this
    this.running = true
    this.reason = null
    this.startedAt = this.now()
    this.schedule(0)
    this.emit()
    return this
  }

  stop(reason = 'stopped') {
    this.running = false
    this.reason = reason
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.emit()
    return this
  }

  reset() {
    this.stop('reset')
    this.diary = []
    this.resetStats()
    this.emit()
  }

  schedule(ms) {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.tick().catch(e => this.fail(e)) }, ms)
  }

  fail(e) {
    this.failures++
    if (this.onError) this.onError(e)
    else console.error('[ai]', this.brain?.name, e)
    this.stop('error')
  }

  emit() {
    if (this.onStatus) this.onStatus(this.stats())
  }

  stats() {
    const total = this.successes + this.failures
    return {
      running: this.running,
      reason: this.reason,
      arm: this.arm,
      steps: this.steps,
      actions: this.actions,
      successes: this.successes,
      failures: this.failures,
      invalid: this.invalid,
      stuck: this.stuck,
      progress: this.progress,
      progressMax: this.progressMax,
      successRate: total ? this.successes / total : null,
      elapsedMs: this.startedAt ? this.now() - this.startedAt : 0,
      diary: this.diary,
    }
  }

  /**
   * One full cycle, awaited to completion. The checks call this directly so a
   * "tick" is a unit of test, not a unit of wall clock.
   * Returns the diary entry for this tick (or null when nothing could be seen).
   */
  async tick() {
    if (!this.running) return null
    if (typeof document !== 'undefined' && document.hidden) { this.schedule(this.pollMs); return null }

    this.steps++
    const percept = this.brain.sense(this.arm)
    const sig = perceptSignature(percept)
    const progress = Number(this.brain.progress ? this.brain.progress(percept) : 0) || 0
    const advanced = progress > this.progressMax

    if (advanced) {
      this.progressMax = progress
      this.stale = 0
    } else {
      this.stale++
    }
    this.progress = progress
    const changed = sig !== this.lastSig
    this.lastSig = sig

    let decision = null
    let why = null

    if (this.stale >= this.watchdog) {
      this.stuck++
      this.stale = 0
      decision = this.brain.recover ? this.brain.recover(percept, this.ctx()) : null
      why = 'recover'
      if (!decision) return this.stopWith(percept, 'stuck — no recovery action')
    }

    if (!decision) {
      decision = this.brain.step(percept, this.ctx())
    }

    if (!decision || !decision.skill) {
      this.idle++
      const entry = {
        t: this.now(), step: this.steps, arm: this.arm,
        saw: describe(percept), did: `(nothing — ${why || 'brain declined'})`,
        ok: null, progress, changed, note: why,
      }
      this.record(entry)
      if (this.idle >= this.maxIdleTicks) return this.stopWith(percept, 'idle — brain has no move')
      this.schedule(this.pollMs)
      return entry
    }
    this.idle = 0

    const fn = (this.brain.skills || {})[decision.skill]
    if (typeof fn !== 'function') {
      this.invalid++
      const entry = {
        t: this.now(), step: this.steps, arm: this.arm,
        saw: describe(percept), did: `${decision.skill}(rejected: no such skill)`,
        ok: false, progress, changed, note: 'invalid-action',
      }
      this.record(entry)
      this.schedule(this.pollMs)
      return entry
    }

    const gap = this.now() - this.lastActionAt
    if (gap < this.minActionGapMs) await new Promise(res => setTimeout(res, this.minActionGapMs - gap))

    let result = null
    try {
      result = await fn(decision.args || {}, percept)
    } catch (e) {
      result = { ok: false, note: String(e && e.message ? e.message : e) }
      if (this.onError) this.onError(e)
    }
    this.actions++
    this.lastActionAt = this.now()

    const ok = result && typeof result === 'object' ? result.ok !== false : !!result
    if (ok) this.successes++
    else this.failures++

    const entry = {
      t: this.now(), step: this.steps, arm: this.arm,
      saw: describe(percept),
      did: render(decision.skill, decision.args),
      ok,
      progress,
      changed,
      note: result && result.note,
      forced: why,
    }
    this.record(entry)

    if (this.steps >= this.maxSteps) return this.stopWith(percept, 'budget — step limit')
    this.schedule(this.pollMs)
    return entry
  }

  stopWith(percept, reason) {
    this.reason = reason
    this.stop(reason)
    if (this.onStatus) this.onStatus(this.stats())
    return null
  }

  record(entry) {
    this.diary.push(entry)
    if (this.diary.length > MAX_DIARY) this.diary.shift()
    if (this.onDiary) this.onDiary(entry)
    this.emit()
  }

  ctx() {
    return {
      stats: this.stats(),
      arm: this.arm,
      stuck: this.stuck,
      steps: this.steps,
    }
  }
}

function render(skill, args) {
  if (args === undefined || args === null) return skill
  const s = typeof args === 'object' ? Object.values(args).join(' ') : String(args)
  return s ? `${skill} ${s}` : skill
}

/** One-line "what it believes is happening right now" for the HUD. */
function describe(percept) {
  if (!percept) return '(nothing)'
  const bits = []
  if (percept.room) bits.push(percept.room)
  if (percept.ego && percept.ego.x !== null && percept.ego.x !== undefined) bits.push(`@${percept.ego.x},${percept.ego.y}`)
  if (percept.inventory && percept.inventory.length) bits.push(`carry:${percept.inventory.join('+')}`)
  if (percept.message && percept.message.text) bits.push(`"${short(percept.message.text)}"`)
  if (percept.score !== null && percept.score !== undefined) bits.push(`score ${percept.score}`)
  const conf = percept.ego && typeof percept.ego.conf === 'number' ? percept.ego.conf : null
  if (conf !== null && conf < 1) bits.push(`conf ${conf.toFixed(2)}`)
  return bits.length ? bits.join(' · ') : '(unrecognised)'
}

function short(s, n = 34) {
  const t = String(s).replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
