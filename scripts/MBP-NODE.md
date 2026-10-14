# Making the MacBook Pro a fleet node

The router (`scripts/node-router.mjs`, launchd `com.jalfern.noderouter`,
`:8010`) already carries an `mbp` slot and heartbeats it every 6 s. When
oMLX starts serving there, it joins `/v1/models` by itself; lid shut, it
leaves. No router change needed — `nodercheck` proves both directions.

## One-time (needs a human once)

1. From the Studio: `ssh-copy-id calistogamacpro` (tailscale alias, key
   auth from here was never authorized).
2. Install the same oMLX on the MBP (`brew install omlx` — the Mac Studio
   runs `/opt/homebrew/bin/omlx`).

## On the MBP, when you want it serving

```bash
omlx serve --host 100.67.39.74 --port 8000 --model-dir <a model it can hold>
```

`--host <tailscale-ip>` binds the mesh directly — no ssh tunnel, and the
Studio reaches it at `http://100.67.39.74:8000` (the address already in
`~/.config/noderouter/nodes.json` on the Studio — put the MBP's real oMLX
key in that node's `key` field once it prints one).

## Battery rule (do not skip on a laptop)

Do not put `omlx serve` in a plain LaunchAgent: it will run inference on
battery and flatten the battery in an afternoon. Gate it:

```zsh
pmset -g batt | grep -q "AC Power" || exit 0   # first line of the wrapper
```

Then `omlx serve ...` behind it, RunAtLoad+KeepAlive like
`com.jalfern.noderouter.plist`, and `sudo pmset -a ttyskeepawake 1` if
the lid is closed while plugged in.

## What the router does with it

- Only models the MBP actually declares become routable to it (`prio 3` —
  it is the overflow valve, not the workhorse: Studio first, mini second,
  MBP when it is alive and someone is busy or it holds the model).
- `GET :8010/router/status` shows it flip online/offline between heartbeats.
- Requests that started there while the lid was closed die like any stream:
  honest truncation, never a silent wrong answer.
