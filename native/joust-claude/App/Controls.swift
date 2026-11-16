// Joust's controller mapping on RetroKit's seat-based Controls.
//
// Seat 1 = the first controller, seat 2 = the second. A full gamepad wins a
// seat over the Siri Remote; with no gamepad the Remote drives seat 1 (swipe
// or tilt the touch surface to turn, click to flap). On iPhone/iPad an
// on-screen pad (GCVirtualController) appears while no real controller is
// connected, and a hardware keyboard works as on the web: arrows + Space/X
// for rider 1, A/D + W/F for rider 2.
//
// Flap = A, X, D-pad up or the right trigger. Y = WATCH (the autopilot rides).
// Menu/Options = pause. B = back.

import GameController
import RetroKitApp

extension Buttons {
    /// Joust has no up/down: the flap rides on `up`
    var flap: Bool { up }
}

extension Controls {
    static func joust() -> Controls {
        Controls(Controls.Config(
            seats: 2,
            virtualElements: [GCInputDirectionPad, GCInputButtonA, GCInputButtonY],
            gamepad: { g in
                var p = Buttons()
                let lx = g.leftThumbstick.xAxis.value
                p.left = g.dpad.left.isPressed || lx < -0.35
                p.right = g.dpad.right.isPressed || lx > 0.35
                p.a = g.buttonA.isPressed
                p.b = g.buttonB.isPressed
                p.x = g.buttonX.isPressed
                p.y = g.buttonY.isPressed
                p.up = p.a || p.x || g.dpad.up.isPressed || g.rightTrigger.isPressed // flap
                if let opt = g.buttonOptions, opt.isPressed { p.menu = true }
                return p
            },
            remote: { m in
                var p = Buttons()
                let dx = m.dpad.xAxis.value
                p.left = dx < -0.3
                p.right = dx > 0.3
                p.a = m.buttonA.isPressed // touch-surface click
                p.x = m.buttonX.isPressed // play/pause
                p.up = p.a // flap
                return p
            },
            keyboard: { k, s in
                s[0].left = s[0].left || k(.leftArrow)
                s[0].right = s[0].right || k(.rightArrow)
                s[0].up = s[0].up || k(.spacebar) || k(.upArrow) || k(.keyX) // flap
                s[0].a = s[0].a || k(.spacebar) || k(.returnOrEnter)
                s[0].y = s[0].y || k(.keyY)
                s[0].menu = s[0].menu || k(.slash) || k(.escape) || k(.keyP)
                s[0].b = s[0].b || k(.deleteOrBackspace)
                s[1].left = s[1].left || k(.keyA)
                s[1].right = s[1].right || k(.keyD)
                let f2 = k(.keyW) || k(.keyF)
                s[1].up = s[1].up || f2 // flap
                s[1].a = s[1].a || f2 || k(.two)
            }))
    }

    /// seats occupied by something that can play (for the 2-rider prompt)
    var seatCount: Int { keyboardConnected ? 2 : min(2, controllers.count) }
}
