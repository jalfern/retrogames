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

# ---- agent_tick: the watermark PERSISTS across unchanged ticks so the silence
#      accumulates past the floors. The old code re-stamped the watermark to
#      NOW every tick, capping the silence at one 3-min tick — so 360 here
#      (not 180) is the proof the window crosses ticks. (Red on the old code.)
read -r _wm _sil <<< "$(agent_tick 2 0 180)"          # t1: first tick, baseline
t agent-baseline       "-1"   "$_sil"
t agent-baseline-wm    "180"  "$_wm"
read -r _wm _sil <<< "$(agent_tick 1 "$_wm" 360)"     # t2: +3 min, unchanged
t agent-3min           "180"  "$_sil"
read -r _wm _sil <<< "$(agent_tick 1 "$_wm" 540)"     # t3: +6 min
t agent-6min           "360"  "$_sil"                 # crosses the 300 s floor
t agent-crosses5m      "kill:dead-request" "$(decide_dead "$_sil" 1 0 0)"
read -r _wm _sil <<< "$(agent_tick 1 "$_wm" 1680)"    # +25 min since baseline
t agent-25min          "1500" "$_sil"                 # crosses the 1500 s floor
t agent-crosses25m     "kill:log-silent-25m" "$(decide_silent "$_sil" 0)"
read -r _wm _sil <<< "$(agent_tick 0 "$_wm" 1800)"    # log grows: clock resets
t agent-grew-reset     "0"    "$_sil"
t agent-grew-wm        "1800" "$_wm"

# ---- omlx_tick: the idle window accumulates across idle ticks and hits the
#      floor; a generating tick restarts the clock. (Red on the old code.)
read -r _idle _wm _wmc _pt _pc <<< "$(omlx_tick 0 0 0 0 1000000 100)"  # t1 baseline
t omlx-baseline        "0"    "$_idle"
read -r _idle _wm _wmc _pt _pc <<< "$(omlx_tick "$_wm" "$_wmc" "$_pt" "$_pc" 1000180 100)"  # t2 +3 min idle
t omlx-3min-not-idle   "0"    "$_idle"
read -r _idle _wm _wmc _pt _pc <<< "$(omlx_tick "$_wm" "$_wmc" "$_pt" "$_pc" 1000360 100)"  # t3 +6 min idle
t omlx-6min-idle       "1"    "$_idle"                 # window crossed 300 s
read -r _idle _wm _wmc _pt _pc <<< "$(omlx_tick "$_wm" "$_wmc" "$_pt" "$_pc" 1000540 1360)" # t4 busy tick
t omlx-gen-resets      "0"    "$_idle"                 # a generating tick is never idle
t omlx-gen-wm-moves    "1000540" "$_wm"                # the watermark jumped to now

echo "sentinelcheck: $PASS ok, $FAIL failed"
exit $(( FAIL > 0 ))
