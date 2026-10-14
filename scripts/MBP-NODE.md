# Fleet nodes: what is what, and adding the MacBook Pro

**Honesty first:** this file previously claimed `100.67.39.74` was the
MacBook Pro. It is the tailnet address of **`calistogamacpro`**, which per
Claude's #201 review is the **Mac Pro tower in Calistoga** — a node worth
having too (better thermals than a laptop), but not the MBP. Identity of
every node comes from the machine itself, never from a name guess:

```bash
tailscale ip -4        # run ON the machine and name it yourself
```

Until the MBP's real tailnet IP is known there is **no MBP entry** in
`~/.config/noderouter/nodes.json` — the router needs no change when one
appears: a new node block joins `/v1/models` by itself on the next
heartbeat and leaves the same way when the lid shuts (nodercheck proves
both directions).

## No ssh-copy-id anywhere

The router reaches every node over Tailscale **directly over HTTP** —
the old "ssh-copy-id calistogamacpro" step was doubly wrong (wrong
machine, and unneeded transport). Nothing here should ever need ssh to a
node; if it does, that is a design smell, not a setup step.

## Starting a Mac as a serving node (MBP or the Calistoga tower)

```bash
omlx serve --host <tailscale-ip-from-above> --port 8000 --model-dir <model>
```

Then add a node block on the Studio with that IP, the printed key, a prio,
a max, and — load-bearing — an `allow` list (the role map, see AGENTS.md:
Studio = Flash/gemma class; mini/laptop = 27B).

## Battery rule (laptops only)

`omlx serve` on battery flattens it in an afternoon. Gate the LaunchAgent:

```zsh
pmset -g batt | grep -q "AC Power" || exit 0   # first line of the wrapper
```

`sudo pmset -a ttyskeepawake 1` if the lid stays closed while plugged.
The tower does not need this; it is the better overnight node.
