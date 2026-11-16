// Input: game controllers → one pad, polled once per frame.
//
// A full gamepad wins over the Siri Remote. Gamepad: stick / D-pad move,
// A = sword (hold to draw the bow), B = bomb (hold for the Gale Charm),
// X = potion, Menu/Options = pause. Siri Remote: the touch surface moves
// (rest a thumb toward a side), click = A, Play/Pause = B. On iPhone/iPad an
// on-screen pad (GCVirtualController) appears while no real controller is
// connected, and a hardware keyboard works as on the web: arrows/WASD,
// Space/Z = A, X = B, C = potion, Esc/P = pause.

import GameController

struct Buttons: Equatable {
    var up = false, down = false, left = false, right = false
    var a = false, b = false, x = false, y = false, menu = false
    var any: Bool { up || down || left || right || a || b || x || y || menu }
}

final class Controls {
    private(set) var held = Buttons()
    private(set) var pressed = Buttons() // went down this frame
    private var prev = Buttons()
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
        let pads = all.filter { $0.extendedGamepad != nil && !$0.isSnapshot }
        let remotes = all.filter { $0.extendedGamepad == nil && $0.microGamepad != nil }
        return pads + remotes
    }

    func rescan() {
        for (i, c) in ordered.enumerated() {
            c.playerIndex = i == 0 ? .index1 : .indexUnset
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

    #if os(iOS)
    private func isVirtual(_ c: GCController) -> Bool {
        if virtual?.controller === c { return true }
        let tags = [(c.vendorName ?? ""), c.productCategory].joined(separator: " ").lowercased()
        return tags.contains("touch") || tags.contains("virtual")
    }
    func screenAppeared() { screenReady = true; updateVirtual() }
    private func updateVirtual() {
        guard screenReady else { return }
        let real = GCController.controllers().contains { $0.extendedGamepad != nil && !isVirtual($0) }
        if real {
            virtual?.disconnect(); virtual = nil
        } else if virtual == nil {
            let cfg = GCVirtualController.Configuration()
            cfg.elements = [GCInputDirectionPad, GCInputButtonA, GCInputButtonB, GCInputButtonX]
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
            p.a = g.buttonA.isPressed
            p.b = g.buttonB.isPressed
            p.x = g.buttonX.isPressed || g.rightShoulder.isPressed
            p.y = g.buttonY.isPressed
            if let opt = g.buttonOptions, opt.isPressed { p.menu = true }
        } else if let m = c.microGamepad {
            // touch surface: rest a thumb off-centre to walk that way
            let dx = m.dpad.xAxis.value, dy = m.dpad.yAxis.value
            p.left = dx < -0.35; p.right = dx > 0.35
            p.up = dy > 0.35; p.down = dy < -0.35
            p.a = m.buttonA.isPressed // click
            p.b = m.buttonX.isPressed // play/pause
        }
        return p
    }

    /// the seat is driven by a Siri Remote (no gamepad): the pause screen adapts
    var remoteDriving: Bool { (ordered.first.map { $0.extendedGamepad == nil }) ?? false }

    func poll() {
        var now = ordered.first.map(read) ?? Buttons()
        if let kb = GCKeyboard.coalesced?.keyboardInput {
            func k(_ code: GCKeyCode) -> Bool { kb.button(forKeyCode: code)?.isPressed ?? false }
            now.left = now.left || k(.leftArrow) || k(.keyA)
            now.right = now.right || k(.rightArrow) || k(.keyD)
            now.up = now.up || k(.upArrow) || k(.keyW)
            now.down = now.down || k(.downArrow) || k(.keyS)
            now.a = now.a || k(.spacebar) || k(.keyZ) || k(.returnOrEnter)
            now.b = now.b || k(.keyX)
            now.x = now.x || k(.keyC)
            now.y = now.y || k(.keyL)
            now.menu = now.menu || k(.escape) || k(.keyP) || k(.slash)
        }
        var e = Buttons()
        e.up = now.up && !prev.up; e.down = now.down && !prev.down
        e.left = now.left && !prev.left; e.right = now.right && !prev.right
        e.a = now.a && !prev.a; e.b = now.b && !prev.b; e.x = now.x && !prev.x; e.y = now.y && !prev.y
        e.menu = now.menu && !prev.menu
        if menuEdge { e.menu = true; menuEdge = false }
        pressed = e
        prev = now
        held = now
    }
}
