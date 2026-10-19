// PLAYER SLOTS (#494) — any seat can be filled by anything that emits THE one
// pad (#420) each tick. The sim never knows which.
//
// A slot is a tiny machine with a kind and a producer:
//   human   reads the slot's held pad from #492 (slotPad) — keyboard, touch,
//           gamepad N. Slot 1's human pad is the classic held pad.
//   cpu     the game's partner AI, wrapped as an emitter: (ctx, tick) -> raw
//           pad. A cpu plays by human rules BECAUSE it only ever emits pads —
//           no extra speed, no special door handling, nothing the pad cannot say.
//   model   an external driver (QA bot, RL policy) that pushes pads ahead of
//           the clock with pushPad(); when the queue runs dry the pad is idle.
//   remote  RESERVED for a network driver: same interface, transport hook
//           (opts.transport = () => rawPadOrNull); unwired a remote is idle.
//   off     the empty seat: a blank pad forever.
//
// Whatever the kind, padFor() returns THE one pad (normalizePad), so a game
// folds one shape from every source. That sameness is the whole point: the
// same seed plus the same per-player pad streams gives the same state hash,
// whether the pads came from thumbs, the planner, or a recording (slotcheck
// proves it by recording a cpu's pads and replaying them as a plain stream).
//
// Pure: importable in Node (slotcheck) and the browser. No React, no DOM.

import { blankPad, slotPad, normalizePad } from './onePad.js'

export const SLOT_KINDS = ['off', 'human', 'cpu', 'model', 'remote']

// Make one player slot. opts:
//   padIndex  which onePad slot a human reads (default 1)
//   emit      (ctx, tick) -> raw pad — the producer for cpu / model / remote
//             (model prefers its pushed queue; emit is its fallback)
//   transport remote only: () -> raw pad | null — the reserved network hook
export function makeSlot(kind = 'off', opts = {}) {
    if (!SLOT_KINDS.includes(kind)) throw new Error(`unknown slot kind: ${kind}`)
    return {
        kind,
        padIndex: Math.max(1, opts.padIndex | 0 || 1),
        emit: typeof opts.emit === 'function' ? opts.emit : null,
        transport: typeof opts.transport === 'function' ? opts.transport : null,
        queue: [],
        last: blankPad(),
    }
}

export function setSlotKind(slot, kind) {
    if (!SLOT_KINDS.includes(kind)) throw new Error(`unknown slot kind: ${kind}`)
    if (slot.kind !== kind) slot.queue.length = 0
    slot.kind = kind
    return slot
}

// An external model driver feeds pads ahead of the clock. Only meaningful on
// a model slot; returns false when the seat is not model-driven.
export function pushPad(slot, pad) {
    if (!slot || slot.kind !== 'model') return false
    slot.queue.push(pad || {})
    return true
}

// THE pad this slot emits this tick. `ctx` is the game's own context object —
// it must carry `method` (the onePad method) and may carry anything the cpu
// emitter needs (the Gauntlet ctx carries `gs`).
export function padFor(slot, ctx) {
    const method = (ctx && ctx.method) || 'stick'
    let pad = blankPad()
    if (slot) {
        if (slot.kind === 'human') pad = slotPad(slot.padIndex, method)
        else if (slot.kind === 'model' && slot.queue.length) pad = normalizePad(slot.queue.shift(), method)
        else if ((slot.kind === 'cpu' || slot.kind === 'model' || slot.kind === 'remote') && (slot.kind === 'remote' ? slot.transport : slot.emit)) {
            const raw = slot.kind === 'remote' ? slot.transport(ctx) : slot.emit(ctx, ctx && ctx.tick)
            pad = normalizePad(raw || {}, method)
        }
    }
    if (slot) slot.last = pad
    return pad
}

// Drive a whole table of slots for one tick: every seat answers with its pad.
// `ctxFactory()` may rebuild the ctx per call, but usually one ctx suffices.
export function padsFor(slots, ctx) {
    return slots.map((s) => padFor(s, ctx))
}
