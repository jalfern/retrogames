// Input: game controllers → two seats, polled once per frame.
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

struct Buttons: Equatable {
    var up = false, down = false, left = false, right = false
    var a = false, b = false, x = false, y = false, menu = false
    var any: Bool { up || down || left || right || a || b || x || y || menu }
}

final class Controls {
    private(set) var held: [Buttons] = [Buttons(), Buttons()]
    private(set) var pressed: [Buttons] = [Buttons(), Buttons()]
    private var prev: [Buttons] = [Buttons(), Buttons()]
    var menuEdge = false
    #if os(iOS)
    private var virtual: GCVirtualController?
    private var screenReady = false
    #endif

    init() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: .GCControllerDidConnect, object: nil, queue: .main) { [weak self] _ in self?.rescan() }
        nc.addObserver(forName: .GCControllerDidDisconnect, object: nil, queue: .main) { [weak self] _ in self?.rescan() }
        #if os(tvOS)
        GCController.startWirelessControllerDiscovery {}
        #endif
        rescan()
    }

    private var ordered: [GCController] {
        let all = GCController.controllers()
        let pads = all.filter { $0.extendedGamepad != nil && !$0.isSnapshot && !isVirtual($0) }
        let virt = all.filter { isVirtual($0) }
        let remotes = all.filter { $0.extendedGamepad == nil && $0.microGamepad != nil }
        return pads + virt + remotes
    }

    /// how many real seats can play (2 = a second controller or a keyboard is here)
    var seatCount: Int { GCKeyboard.coalesced != nil ? 2 : min(2, ordered.filter { $0.extendedGamepad != nil }.count) }
    var remoteDriving: Bool { (ordered.first.map { $0.extendedGamepad == nil }) ?? false }

    func rescan() {
        for (i, c) in ordered.enumerated() {
            c.playerIndex = i == 0 ? .index1 : i == 1 ? .index2 : .indexUnset
            if let m = c.microGamepad { m.reportsAbsoluteDpadValues = true; m.allowsRotation = true }
            #if os(tvOS)
            if let mg = c.microGamepad, c.extendedGamepad == nil {
                mg.buttonMenu.pressedChangedHandler = { [weak self] _, _, down in if down { self?.menuEdge = true } }
            }
            #endif
            if let eg = c.extendedGamepad {
                eg.buttonMenu.pressedChangedHandler = { [weak self] _, _, down in if down { self?.menuEdge = true } }
            }
        }
        #if os(iOS)
        updateVirtual()
        #endif
    }

    private func isVirtual(_ c: GCController) -> Bool {
        #if os(iOS)
        if virtual?.controller === c { return true }
        let tags = [(c.vendorName ?? ""), c.productCategory].joined(separator: " ").lowercased()
        return tags.contains("touch") || tags.contains("virtual")
        #else
        return false
        #endif
    }

    #if os(iOS)
    func screenAppeared() { screenReady = true; updateVirtual() }
    private func updateVirtual() {
        guard screenReady else { return }
        let real = GCController.controllers().contains { $0.extendedGamepad != nil && !isVirtual($0) }
        if real { virtual?.disconnect(); virtual = nil }
        else if virtual == nil {
            let cfg = GCVirtualController.Configuration()
            cfg.elements = [GCInputLeftThumbstick, GCInputButtonA, GCInputButtonB, GCInputButtonY]
            let v = GCVirtualController(configuration: cfg)
            virtual = v
            v.connect()
        }
    }
    #endif

    private func read(_ c: GCController) -> Buttons {
        var p = Buttons()
        if let g = c.extendedGamepad {
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
        } else if let m = c.microGamepad {
            let dx = m.dpad.xAxis.value, dy = m.dpad.yAxis.value
            p.left = dx < -0.35; p.right = dx > 0.35
            p.up = dy > 0.35; p.down = dy < -0.35
            p.a = m.buttonA.isPressed
            p.b = m.buttonX.isPressed
        }
        return p
    }

    func poll() {
        var now = [Buttons(), Buttons()]
        for (i, c) in ordered.prefix(2).enumerated() { now[i] = read(c) }
        if let kb = GCKeyboard.coalesced?.keyboardInput {
            func k(_ code: GCKeyCode) -> Bool { kb.button(forKeyCode: code)?.isPressed ?? false }
            now[0].left = now[0].left || k(.leftArrow); now[0].right = now[0].right || k(.rightArrow)
            now[0].up = now[0].up || k(.upArrow); now[0].down = now[0].down || k(.downArrow)
            now[0].a = now[0].a || k(.spacebar) || k(.returnOrEnter); now[0].b = now[0].b || k(.keyZ)
            now[0].y = now[0].y || k(.keyY); now[0].x = now[0].x || k(.keyC)
            now[0].menu = now[0].menu || k(.escape) || k(.keyP)
            now[1].left = now[1].left || k(.keyA); now[1].right = now[1].right || k(.keyD)
            now[1].up = now[1].up || k(.keyW); now[1].down = now[1].down || k(.keyS)
            now[1].a = now[1].a || k(.keyF)
        }
        for i in 0..<2 {
            var e = Buttons()
            e.up = now[i].up && !prev[i].up; e.down = now[i].down && !prev[i].down
            e.left = now[i].left && !prev[i].left; e.right = now[i].right && !prev[i].right
            e.a = now[i].a && !prev[i].a; e.b = now[i].b && !prev[i].b
            e.x = now[i].x && !prev[i].x; e.y = now[i].y && !prev[i].y; e.menu = now[i].menu && !prev[i].menu
            pressed[i] = e
        }
        if menuEdge { pressed[0].menu = true; menuEdge = false }
        prev = now
        held = now
    }
}
