/**
 * AiBadge — the one AI status strip, shared by every game.
 *
 * Every game used to hand-roll its own (King's Quest had a 30-line inline strip
 * wired to a backend that no longer answers). This is the replacement, and it
 * has one non-negotiable job: **it always prints which sensor the agent is
 * using.** `SENSING: RAM` is a different claim than `SENSING: EYE`, and a
 * visitor is entitled to know which one they are watching. The lab switch sits
 * next to it so the A/B can be flipped mid-run.
 *
 * Presentational only — no loops, no state beyond the arm hover.
 */

const GREEN = '#4ade80'
const DIM = '#3a5f3a'
const AMBER = '#f59e0b'
const BLUE = '#60a5fa'
const RED = '#ef4444'

const mono = (size) => ({ fontFamily: 'monospace', fontSize: size, lineHeight: 1.4 })

function statusOf(status, running) {
  if (!running) {
    if (status && status.reason && status.reason !== 'stopped') return { text: `stopped · ${status.reason}`, color: AMBER }
    return { text: 'off', color: DIM }
  }
  if (!status) return { text: 'waking…', color: BLUE }
  if (status.stuck) return { text: `stuck ×${status.stuck}`, color: AMBER }
  if (status.invalid) return { text: `thinking · ${status.invalid} rejected`, color: BLUE }
  return { text: 'thinking', color: BLUE }
}

export default function AiBadge({
  status = null,
  running = false,
  arm = 'hybrid',
  arms = ['hybrid'],
  onArm = null,
  onToggle = null,
  progress = null,      // { label, value, max }
  detail = null,        // brain-provided one-liner (diagnose)
}) {
  const s = statusOf(status, running)
  const last = status && status.diary && status.diary.length ? status.diary[status.diary.length - 1] : null
  const pct = progress && progress.max ? Math.max(0, Math.min(100, Math.round((progress.value / progress.max) * 100))) : null
  const rate = status && status.successRate !== null && status.successRate !== undefined
    ? `${Math.round(status.successRate * 100)}%` : null

  return (
    <div style={{
      flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '4px 12px',
      background: '#050f05',
      borderTop: `1px solid ${DIM}`,
      ...mono(11),
    }}>
      {/* No dead buttons. A title without a brain gets the arm label and the lab
          switch, but never a ▶ AI control that does nothing — King's Quest shipped
          exactly that, a working-looking button wired to a host that had stopped
          answering. If onToggle is absent, do not render the affordance. */}
      {onToggle && (
        <button
          onClick={onToggle}
          style={{
            ...mono(11),
            cursor: 'pointer',
            background: running ? '#14532d' : '#111',
            border: `1px solid ${running ? GREEN : '#444'}`,
            borderRadius: 6,
            color: running ? GREEN : '#777',
            padding: '3px 9px',
          }}
        >
          {running ? '⏸ AI' : '▶ AI'}
        </button>
      )}

      <span style={{ color: s.color }}>{s.text}</span>

      {/* The honest label. Never hidden, never abbreviated away. */}
      <span style={{ color: '#2a6a2a' }}>
        SENSING:
        {arm ? (
          <span style={{ color: arm === 'eye' ? AMBER : arm === 'ram' ? BLUE : GREEN, fontWeight: 700 }}>
            {' '}{arm.toUpperCase()}
          </span>
        ) : (
          /* No sensor is implemented for this title. Say so. The previous AI on
             this page showed a working-looking button for a backend that had
             been offline for months; "we do not have this yet" is the floor. */
          <span style={{ color: RED, fontWeight: 700 }}> NOT IMPLEMENTED</span>
        )}
      </span>

      {arms.length > 1 && (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {arms.map((a) => (
            <button
              key={a}
              onClick={() => onArm && onArm(a)}
              title={`switch the sensor to ${a} — same brain, different eyes`}
              style={{
                ...mono(10),
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: 4,
                background: a === arm ? '#122612' : 'transparent',
                border: `1px solid ${a === arm ? GREEN : '#223a22'}`,
                color: a === arm ? GREEN : '#2a5a2a',
              }}
            >
              {a}
            </button>
          ))}
        </span>
      )}

      {pct !== null && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 130 }}>
          <span style={{ color: DIM }}>{progress.label}</span>
          <span style={{
            display: 'inline-block', width: 70, height: 6, background: '#0b1a0b',
            border: '1px solid #1a3a1a', position: 'relative',
          }}>
            <span style={{
              display: 'block', height: '100%', width: `${pct}%`,
              background: pct > 66 ? GREEN : pct > 25 ? AMBER : '#7c2d12',
            }} />
          </span>
          <span style={{ color: GREEN }}>{progress.value}/{progress.max}</span>
        </span>
      )}

      {last && (
        <span style={{ color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '38%' }}>
          <span style={{ color: last.ok === false ? RED : last.ok === null ? DIM : '#6b7280' }}>
            › {last.did}
          </span>
          {last.saw ? <span style={{ color: '#374151' }}>  ·  {last.saw}</span> : null}
        </span>
      )}

      {rate && <span style={{ color: '#374151' }}>act {rate}</span>}
      {status && status.steps ? <span style={{ color: '#2a4a2a' }}>step {status.steps}</span> : null}
      {detail && <span style={{ color: DIM }}>{detail}</span>}
    </div>
  )
}
