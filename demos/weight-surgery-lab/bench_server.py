"""Benchmark continuous batching (#1506): llama-server --parallel 12 vs 12 procs.
12 real MATH-500 problems (same seed/rng as step10) at cap 4096 via /chat/completions.
Prints aggregate eval tps to compare against the ~52 tps per-row ceiling of
the 12-separate-llama-cli design (which is RAM-bandwidth-bound, not compute).
"""
import json, subprocess, time, sys, random
import common as C

SERVER = "/tmp/llamacpp-src/build/bin/llama-server"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8081
GGUF = sys.argv[2] if len(sys.argv) > 2 else "q35-f16.gguf"

proc = subprocess.Popen(
    [SERVER, "-m", GGUF, "--jinja", "--host", "127.0.0.1", "--port", str(PORT),
     "--parallel", "12", "--cont-batching", "-c", "4608", "--threads", "24",
     "--seed", "42", "--temp", "1.0", "--top-p", "0.95", "--top-k", "20",
     "--presence-penalty", "0.0", "--repeat-penalty", "1.0",
     "--no-webui", "--log-disable"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

import urllib.request
def wait_ready(tmo=120):
    t0 = time.time()
    while time.time() - t0 < tmo:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=3) as r:
                if json.load(r).get("status") == "ok":
                    return True
        except Exception:
            time.sleep(1)
    return False

if not wait_ready():
    proc.kill(); sys.exit("server not ready")

rng = random.Random(20261103)
math = rng.sample(C.load_problems()["math500"], 12)

def ask(p):
    body = json.dumps({
        "messages": [{"role": "user", "content": p["problem"].strip()}],
        "max_tokens": 4096, "seed": 42, "temperature": 1.0,
        "top_p": 0.95, "top_k": 20, "presence_penalty": 0.0,
    }).encode()
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}/chat/completions",
                                data=body, headers={"content-type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=1800) as r:
        d = json.load(r)
    c = d["choices"][0]
    return dict(ntok=d.get("usage", {}).get("completion_tokens", 0),
                finish=c.get("finish_reason"), wall=round(time.time() - t0, 1))

from concurrent.futures import ThreadPoolExecutor
t0 = time.time()
with ThreadPoolExecutor(max_workers=12) as ex:
    rows = list(ex.map(ask, math))
dt = time.time() - t0
tot = sum(r["ntok"] for r in rows)
print(json.dumps(dict(agg_tps=round(tot / dt, 1), seconds=round(dt), total_tok=tot,
                      per_stream_tps=round(tot / dt / 12, 1),
                      cap_hits=sum(1 for r in rows if r["finish"] == "length"),
                      rows=[{k: r[k] for k in ("ntok", "finish", "wall")} for r in rows]), indent=1))
proc.kill()
