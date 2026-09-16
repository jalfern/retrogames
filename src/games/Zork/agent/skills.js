/**
 * The primitive verbs. One function per thing the agent can ask the game to do,
 * each bound to whatever actuator the host provides (the browser's input
 * resolver, or the Node harness's Glk callback — same verbs, same contract).
 *
 * Why this file exists separately: the parser is the referee, and these are the
 * only words the agent is allowed to speak. Every verb is one the game itself
 * teaches a player, and the list is deliberately short. When the agent wants
 * something it cannot say, the loop records a REJECTED decision rather than
 * improvising vocabulary — the failure mode that killed both previous AIs was a
 * brain emitting an action the game had no handler for, and the code reacting by
 * doing something else entirely (in King's Quest's case, opening the debug
 * wizard).
 *
 * Each skill resolves to { ok, note } where `ok` is the GAME'S answer, not our
 * hope: the reply prose decides. A skill that reports success because it sent a
 * command is how an agent ends up walking into a wall for an hour.
 */

const REFUSED = /(sorry|don'?t know|can'?t|won'?t|what|no one|impossible|won't|haven'?t|first|too dark|where|need\b|but)/i

/** @param {(cmd:string)=>Promise<string>} send  resolves with the printed reply */
export function makeSkills(send) {
  const say = async (cmd) => {
    const reply = String(await send(cmd) ?? '')
    return { ok: !REFUSED.test(reply) && reply.length > 0, note: reply.split('\n')[0].slice(0, 70), reply }
  }

  const skills = {
    // Movement. `go north` and `n` are the same verb; the short form is what a
    // player types, and using it keeps the trace honest about the input path.
    go: ({ dir }) => say(dir),
    look: () => say('look'),
    inventory: () => say('inventory'),
    examine: ({ what }) => say(`examine ${what}`),
    take: ({ what }) => say(`take ${what}`),
    drop: ({ what }) => say(`drop ${what}`),
    open: ({ what }) => say(`open ${what}`),
    close: ({ what }) => say(`close ${what}`),
    unlock: ({ what }) => say(`unlock ${what}`),
    move: ({ what }) => say(`move ${what}`),
    turnOn: ({ what }) => say(`turn on ${what}`),
    turnOff: ({ what }) => say(`turn off ${what}`),
    light: ({ what }) => say(`light ${what}`),
    read: ({ what }) => say(`read ${what}`),
    // A no-op that still costs a tick. The watchdog counts it, which is the
    // point: a brain with nothing to say must run out of patience, not time.
    wait: () => ({ ok: true, note: 'waited' }),
  }

  return skills
}

/**
 * Vocabulary the agent will happily say and the parser will reject. Kept as
 * data so the check can assert the trace never contains any of it — a run that
 * quietly filled the transcript with `Sorry, I don't know the word` would
 * otherwise still look alive.
 */
export const NEVER_SAY = [/sorry/i, /\bng\b/, /\bzyzzyva\b/]

export default makeSkills
