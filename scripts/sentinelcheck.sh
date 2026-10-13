#!/bin/zsh
# sentinelcheck — the failable harness for scripts/sentinel.sh, in plain zsh.
#
# Sources sentinel.sh with SENTINEL_CHECK=1 (which skips main()) and drives
# the REAL decision functions and parsers against scenarios that actually
# happened:
#   - the 21:46 hang: silent + oMLX idle + no child  -> must DIE (dead-request)
#   - the same hang after a same-process model reload (no server restart)
#     is the same dead-request case; a real omlx-server restart must also DIE,
#     and EARLIER than the 5-min window (it is the extra cheap case)
#   - heistmutate: a builder inside a 40-min tool call — silent 25+ min with
#     a live child — must HOLD (killing it was the bug Jon's amendment fixed)
#   - a server restart while the builder is mid-tool must HOLD (no in-flight
#     request to die)
#   - the 25-min builder silence with no child must DIE (log-silent-25m)
#   - a healthy builder (oMLX generating) must HOLD even when silent+childless
#   - the parser fixtures are pinned to real `ps` output shapes from the
#     Mac Studio (omlx-server at 1343:10.61, an agent at 2:45.19, ...)
#
# Any mutation of a threshold (300 s floor, 1500 s floor, the 10% idle line)
# or removal of a child guard must flip at least one line red.
# ~1 s, no browser, no network.

SENTINEL_CHECK=1
. "${0:A:h}/sentinel.sh"

PASS=0
FAIL=0
t() {   # t <name> <expected> <actual>
    if [[ "$2" == "$3" ]]; then
        PASS=$((PASS + 1)); echo "ok   $1"
    else
        FAIL=$((FAIL + 1)); echo "FAIL $1: expected [$2] got [$3]"
    fi
}

# ---- parsers (real ps shapes) ----------------------------------------------
t cpusec-mm-ss      80590  "$(cpusec 1343:10.63)"
t cpusec-m-ss       165    "$(cpusec 2:45.19)"
t cpusec-h-ms       5039   "$(cpusec 1:23:59)"
t cpusec-plain      42     "$(cpusec 42)"
t etime-dd-hms      171295 "$(etime_sec 01-23:34:55)"
t etime-hms         5039   "$(etime_sec 1:23:59)"
t etime-ms          1439   "$(etime_sec 23:59)"

# ---- dead-request: all three conditions, or no kill --------------------------
t dr-hung            kill:dead-request "$(decide_dead 300 1 0 0)"   # the 21:46 hang
t dr-reload-same-proc kill:dead-request "$(decide_dead 420 1 0 0)"  # model reload, server kept up
t dr-under-5min      hold                "$(decide_dead 299 1 0 0)" # 5-min floor
t dr-busy-server     hold                "$(decide_dead 3600 0 0 0)"   # oMLX generating
t dr-healthy-tool    hold                "$(decide_dead 3600 1 1 0)"   # in a tool call (any silence)

# ---- server-restart: the extra cheap case ------------------------------------
t dr-restart-waiting kill:server-restart "$(decide_dead 120 0 0 1)" # kills before the 5-min window
t dr-restart-first   kill:server-restart "$(decide_dead 300 1 0 1)" # reason: the restart, not the silence
t dr-restart-tool    hold                "$(decide_dead 120 0 1 1)" # mid-tool restart: no request to die

# ---- builder silence: 25-min floor, same no-child guard -----------------------
t bs-heistmutate     hold                "$(decide_silent 2400 1)"  # 40-min tool call
t bs-dead-builder    kill:log-silent-25m "$(decide_silent 1500 0)"
t bs-under-25min     hold                "$(decide_silent 1499 0)"

# ---- omlx_idle: under 10% of the window, and the window must be >= 5 min -----
t idle-idle          1  "$(omlx_idle 30 360)"    # 8.3% of 6 min
t idle-generating    0  "$(omlx_idle 60 360)"    # 16.7%: generating, must NOT be idle
t idle-exact-10pct   0  "$(omlx_idle 30 300)"    # exactly 10%: not under
t idle-just-under    1  "$(omlx_idle 29 300)"    # 9.7%
t idle-window-floor  0  "$(omlx_idle 0 299)"     # window too short: unknown
t idle-zero-cpu      1  "$(omlx_idle 0 360)"     # server gone: nothing generating

# ---- floors are the values in the issue, not neighbours -----------------------
t floor-deadreq      300    "$DEAD_REQ_SECS"
t floor-builder      1500   "$BUILDER_SILENT_SECS"
t floor-warden       900    "$WARDEN_STUCK_SECS"

echo "sentinelcheck: $PASS ok, $FAIL failed"
exit $(( FAIL > 0 ))
