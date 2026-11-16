// Gauntlet's controller mapping on RetroKit's seat-based Controls (two seats).
//
// Seat 1 = the first controller, seat 2 = the second (a full gamepad wins a
// seat over the Siri Remote; with no gamepad the Remote drives seat 1: rest a
// thumb toward an edge of the touch surface to walk, click = sword,
// Play/Pause = arrow). Gamepad: stick / D-pad walk 8 ways, A (Cross) sword,
// B (Circle) arrow, Y (Triangle) WATCH, X (Square) toggles the CPU partner on
// the hero select, Menu/Options pause. On iPhone/iPad an on-screen pad shows
// while no controller is connected. Keyboard as on the web: arrows + Space
// (sword) / Z (arrow) for player 1, WASD + F for player 2.

import GameController
import RetroKitApp

extension Controls {
    static func gauntlet() -> Controls {
        Controls(Controls.Config(
            seats: 2,
            virtualElements: [GCInputLeftThumbstick, GCInputButtonA, GCInputButtonB, GCInputButtonY],
            gamepad: { g in
                var p = Buttons()
                let lx = g.leftThumbstick.xAxis.value, ly = g.leftThumbstick.yAxis.value
                p.left = g.dpad.left.isPressed || lx < -0.4
                p.right = g.dpad.right.isPressed || lx > 0.4
                p.up = g.dpad.up.isPressed || ly > 0.4
                p.down = g.dpad.down.isPressed || ly < -0.4
                p.a = g.buttonA.isPressed || g.rightTrigger.isPressed
                p.b = g.buttonB.isPressed || g.leftTrigger.isPressed
                p.x = g.buttonX.isPressed
                p.y = g.buttonY.isPressed
                if let opt = g.buttonOptions, opt.isPressed { p.menu = true }
                return p
            },
            remote: { m in
                var p = Buttons()
                let dx = m.dpad.xAxis.value, dy = m.dpad.yAxis.value
                p.left = dx < -0.35; p.right = dx > 0.35
                p.up = dy > 0.35; p.down = dy < -0.35
                p.a = m.buttonA.isPressed
                p.b = m.buttonX.isPressed
                return p
            },
            keyboard: { k, s in
                s[0].left = s[0].left || k(.leftArrow); s[0].right = s[0].right || k(.rightArrow)
                s[0].up = s[0].up || k(.upArrow); s[0].down = s[0].down || k(.downArrow)
                s[0].a = s[0].a || k(.spacebar) || k(.returnOrEnter); s[0].b = s[0].b || k(.keyZ)
                s[0].y = s[0].y || k(.keyY); s[0].x = s[0].x || k(.keyC)
                s[0].menu = s[0].menu || k(.escape) || k(.keyP)
                s[1].left = s[1].left || k(.keyA); s[1].right = s[1].right || k(.keyD)
                s[1].up = s[1].up || k(.keyW); s[1].down = s[1].down || k(.keyS)
                s[1].a = s[1].a || k(.keyF)
            }))
    }
}
