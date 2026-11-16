// Emberwood's controller mapping on RetroKit's seat-based Controls (one seat).
//
// A full gamepad wins over the Siri Remote. Gamepad: stick / D-pad move,
// A = sword (hold to draw the bow), B = bomb (hold for the Gale Charm),
// X = potion, Menu/Options = pause. Siri Remote: the touch surface moves
// (rest a thumb toward a side), click = A, Play/Pause = B. On iPhone/iPad an
// on-screen pad (GCVirtualController) appears while no real controller is
// connected, and a hardware keyboard works as on the web: arrows/WASD,
// Space/Z = A, X = B, C = potion, Esc/P = pause.

import GameController
import RetroKitApp

extension Controls {
    static func emberwood() -> Controls {
        Controls(Controls.Config(
            seats: 1,
            virtualElements: [GCInputDirectionPad, GCInputButtonA, GCInputButtonB, GCInputButtonX],
            gamepad: { g in
                var p = Buttons()
                let lx = g.leftThumbstick.xAxis.value, ly = g.leftThumbstick.yAxis.value
                p.left = g.dpad.left.isPressed || lx < -0.4
                p.right = g.dpad.right.isPressed || lx > 0.4
                p.up = g.dpad.up.isPressed || ly > 0.4
                p.down = g.dpad.down.isPressed || ly < -0.4
                p.a = g.buttonA.isPressed
                p.b = g.buttonB.isPressed
                p.x = g.buttonX.isPressed || g.rightShoulder.isPressed
                p.y = g.buttonY.isPressed
                if let opt = g.buttonOptions, opt.isPressed { p.menu = true }
                return p
            },
            remote: { m in
                // touch surface: rest a thumb off-centre to walk that way
                var p = Buttons()
                let dx = m.dpad.xAxis.value, dy = m.dpad.yAxis.value
                p.left = dx < -0.35; p.right = dx > 0.35
                p.up = dy > 0.35; p.down = dy < -0.35
                p.a = m.buttonA.isPressed // click
                p.b = m.buttonX.isPressed // play/pause
                return p
            },
            keyboard: { k, s in
                s[0].left = s[0].left || k(.leftArrow) || k(.keyA)
                s[0].right = s[0].right || k(.rightArrow) || k(.keyD)
                s[0].up = s[0].up || k(.upArrow) || k(.keyW)
                s[0].down = s[0].down || k(.downArrow) || k(.keyS)
                s[0].a = s[0].a || k(.spacebar) || k(.keyZ) || k(.returnOrEnter)
                s[0].b = s[0].b || k(.keyX)
                s[0].x = s[0].x || k(.keyC)
                s[0].y = s[0].y || k(.keyL)
                s[0].menu = s[0].menu || k(.escape) || k(.keyP) || k(.slash)
            }))
    }
}
