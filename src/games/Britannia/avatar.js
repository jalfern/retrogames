// Avatar sprite (#1135 polish): the original walks on 8-direction sprites,
// our movement is 4-way, so the Avatar gets 4 facings x 3 frames drawn
// procedurally — face only when the world sees it, boots that stride,
// a cloak flap that trails the movement. Pure canvas ops: no DOM, no state,
// so britanniacheck can verify it headless with a recording ctx.

export const FACES = ['down', 'left', 'right', 'up']

export const faceFor = (dx, dy) => {
    if (dx < 0) return 'left'
    if (dx > 0) return 'right'
    if (dy < 0) return 'up'
    return 'down'
}

export const walkFrame = (anim, moving) => (moving ? 1 + (anim % 2) : 0)

const SKIN = '#e8c89a'
const CLOAK = '#7a2f2f'
const TRIM = '#3d1a1a'
const BOOT = '#2a1c10'
const STRAW = '#d9c98f'

export function drawAvatar(ctx, face, frame, bob) {
    const side = face === 'left' || face === 'right'
    const back = face === 'up'
    const s = face === 'left' ? -1 : 1
    const step = frame === 1 ? 1 : frame === 2 ? -1 : 0
    ctx.save()
    ctx.translate(0, bob)
    if (side) ctx.scale(s, 1)
    ctx.fillStyle = BOOT
    if (side) {
        ctx.fillRect(step > 0 ? 3 : step < 0 ? -7 : -4, 9, 4, 3)
        ctx.fillRect(step > 0 ? -6 : step < 0 ? 2 : 1, 8, 4, 2)
    } else {
        ctx.fillRect(-5 + (step > 0 ? 1 : 0), step < 0 ? 8 : 9, 4, step < 0 ? 2 : 3)
        ctx.fillRect(1 + (step < 0 ? -1 : 0), step > 0 ? 8 : 9, 4, step > 0 ? 2 : 3)
    }
    ctx.fillStyle = CLOAK
    if (side) {
        ctx.beginPath()
        ctx.moveTo(-5, 9); ctx.lineTo(5, 9); ctx.lineTo(3, -8); ctx.lineTo(-3, -8); ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#5e2121'
        ctx.beginPath()
        ctx.moveTo(-6 - (step !== 0 ? 2 : 0), 9); ctx.lineTo(-2, -6); ctx.lineTo(-2, 9); ctx.closePath()
        ctx.fill()
    } else {
        ctx.beginPath()
        ctx.arc(0, -4, 7, Math.PI, 0); ctx.lineTo(7, 10); ctx.lineTo(-7, 10); ctx.closePath()
        ctx.fill()
    }
    ctx.fillStyle = TRIM
    ctx.fillRect(side ? -5 : -7, 7, side ? 10 : 14, 2)
    if (back) {
        ctx.fillStyle = '#3d2415'
        ctx.beginPath(); ctx.arc(0, -9, 3.4, 0, 7); ctx.fill()
    } else {
        ctx.fillStyle = SKIN
        ctx.beginPath(); ctx.arc(side ? 2 : 0, -9, side ? 3.2 : 3.4, 0, 7); ctx.fill()
    }
    ctx.fillStyle = STRAW
    ctx.fillRect(side ? -4 : -6, side ? -12 : -13, side ? 9 : 12, 2)
    ctx.fillRect(-3, side ? -16 : -17, 6, 4)
    if (side && step !== 0) {
        ctx.fillStyle = SKIN
        ctx.fillRect(-1 + step * 2, -2, 3, 3)
    }
    ctx.restore()
}
