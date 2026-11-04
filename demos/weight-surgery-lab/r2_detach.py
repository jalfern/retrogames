"""r2 detach launcher: double-fork so the step-1 runner reparents to launchd
and survives the forge session's end (round-1 detach_runner.sh pattern).

usage: python r2_detach.py r2_run_step1.sh /tmp/forge/ws-r2-step1.log
"""
import os
import subprocess
import sys

script = sys.argv[1] if len(sys.argv) > 1 else "r2_run_step1.sh"
log = sys.argv[2] if len(sys.argv) > 2 else "/tmp/forge/ws-r2-step1.log"
LAB = os.path.dirname(os.path.abspath(__file__))

if os.fork() == 0:
    os.setsid()
    if os.fork() == 0:
        with open(log, "a") as out:
            subprocess.Popen(["/bin/bash", os.path.join(LAB, script)],
                            stdout=out, stderr=out, cwd=LAB)
        os._exit(0)
    os._exit(0)
os._exit(0)
