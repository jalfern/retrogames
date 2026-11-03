"""Fair-horizon scoring, continuous-batching runner (#1506 step 5, runner #2).

Same job as step10_fair_score.py (Jon's procedure: fixed 100 MATH-500 + 100
GSM8K-test @ fair cap, rows base/k256/sampfix, seed 20261103 per-problem
sampling seed 42, identical per-row treatment) but against ONE llama-server
with --cont-batching: the 12-llama-cli design is RAM-bandwidth-bound (~1.4 GB
weight traffic per token PER PROCESS; aggregate ~52 tps = machine ceiling).
Continuous batching shares the weight read across all in-flight sequences
(~200-700 tps aggregate measured/expected). Deviation logged on #1506
11:30Z: backend changes logits rounding, so ALL rows re-run here — CPU
partial moved to results/cpu_partial/, nothing is mixed across backends.

usage: step10b_fair_server.py <runs...>   run = TAG:GGUF[:pp=1.5]
"""
import json, os, random, subprocess, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import common as C
import llm

PORT = int(os.environ.get("WS_PORT", "8090"))
PARALLEL = int(os.environ.get("WS_PARALLEL", "24"))
SERVER = "/tmp/llamacpp-src/build/bin/llama-server"
N_MATH, N_GSM = 100, 100

def fair_cap():
    try:
        return int(json.load(open(f"{C.RESULTS}/layer_ranking.json"))["fair_cap"])
    except Exception:
        return 4096

def server_start(gguf, cap):
    p = subprocess.Popen(
        [SERVER, "-m", gguf, "--jinja", "--host", "127.0.0.1", "--port", str(PORT),
         "--parallel", str(PARALLEL), "--cont-batching", "-c", str((cap + 1024) * PARALLEL),
         "--threads", "24", "--seed", "42", "--temp", "1.0", "--top-p", "0.95",
         "--top-k", "20", "--presence-penalty", "0.0", "--repeat-penalty", "1.0",
         "--no-webui", "--log-disable"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    t0 = time.time()
    while time.time() - t0 < 180:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=3) as r:
                if json.load(r).get("status") == "ok":
                    return p
        except Exception:
            if p.poll() is not None:
                raise RuntimeError("server died during boot")
            time.sleep(1)
    p.kill()
    raise RuntimeError("server not ready")

def ask(prob, cap, pp):
    body = json.dumps({
        "messages": [{"role": "user", "content": prob["problem"].strip()}],
        "max_tokens": cap, "seed": 42, "temperature": 1.0,
        "top_p": 0.95, "top_k": 20, "presence_penalty": pp, "repeat_penalty": 1.0,
    }).encode()
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}/chat/completions",
                                data=body, headers={"content-type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=cap * 10) as r:
                d = json.load(r)
            c = d["choices"][0]
            text = c["message"]["content"]
            ntok = d.get("usage", {}).get("completion_tokens", 0)
            return dict(text=text, ntok=ntok, hit_cap=c.get("finish_reason") == "length")
        except Exception as e:
            if attempt == 2:
                return dict(text="", ntok=0, hit_cap=True, err=str(e)[-200:])
            time.sleep(2)

def run(server_tag, gguf, pp, probs, setname, cap):
    path = f"{C.RESULTS}/fair_{server_tag}_{setname}.jsonl"
    done = set()
    if os.path.exists(path):
        for line in open(path):
            done.add(json.loads(line)["i"])
    todo = [(i, p) for i, p in enumerate(probs) if i not in done]
    f = open(path, "a")
    for cs in range(0, len(todo), PARALLEL):
        chunk = todo[cs:cs + PARALLEL]
        t0 = time.time()
        with ThreadPoolExecutor(max_workers=PARALLEL) as ex:
            rows = list(ex.map(lambda p: ask(p[1], cap, pp), chunk))
        dt = max(time.time() - t0, 1e-6)
        for (i, p), r in zip(chunk, rows):
            r.update(llm.loop_score_text(r["text"]))
            ok, got, gold = C.grade(r["text"], p["gold"], p["tag"])
            rec = dict(i=i, ok=ok, got=got, gold=gold, cap_hit=r["hit_cap"],
                       loop=r["looped"], ntok=r["ntok"], problem=p["problem"][:200],
                       text=r["text"][:600])
            f.write(json.dumps(rec) + "\n")
        f.flush()
        tps = sum(r["ntok"] for r in rows) / dt
        print(f"[{server_tag}/{setname}] {len(done) + cs + len(chunk)}/{len(probs)} tps={tps:.1f}", flush=True)
    f.close()

def summarize(tag, setname, cap, n_units):
    recs = [json.loads(l) for l in open(f"{C.RESULTS}/fair_{tag}_{setname}.jsonl")]
    n = len(recs)
    summ = dict(phase="score-fair", run=tag, set=setname, cap=cap, batch=n_units,
                n=n, acc=round(100 * sum(r["ok"] for r in recs) / max(n, 1), 1),
                terminated=round(100 * sum(not r["cap_hit"] for r in recs) / max(n, 1), 1),
                hit_cap_pct=round(100 * sum(r["cap_hit"] for r in recs) / max(n, 1), 1),
                looped_pct=round(100 * sum(r["loop"] for r in recs) / max(n, 1), 1))
    summ["purpose"] = f"fair hold-out row — acc {summ['acc']}% terminated {summ['terminated']}%"
    C.log_batch(summ)
    print(json.dumps(summ), flush=True)
    return summ

def main():
    cap = fair_cap()
    probs = C.load_problems()
    rng = random.Random(20261103)   # Jon's fixed seed, identical sampling to step10
    math = rng.sample(probs["math500"], N_MATH)
    gsm = rng.sample(probs["gsm_test"], N_GSM)
    total_units = (N_MATH + N_GSM) // PARALLEL + 2
    rows_out = {}
    srv = None
    cur_gguf = None
    for spec in sys.argv[1:]:
        parts = spec.split(":")
        tag, gguf = parts[0], parts[1]
        pp = float(parts[2].split("=")[1]) if len(parts) > 2 else 0.0
        if cur_gguf != gguf:   # one server per gguf (reaped on switch/exit)
            if srv:
                srv.kill(); srv.wait(); time.sleep(2)
            srv = server_start(gguf, cap)
            cur_gguf = gguf
        for setname, pset in (("math", math), ("gsm", gsm)):
            run(tag, gguf, pp, pset, setname, cap)
            rows_out[f"{tag}_{setname}"] = summarize(tag, setname, cap, total_units)
    if srv:
        srv.kill()
    json.dump(dict(cap=cap, rows=rows_out), open(f"{C.RESULTS}/fair_scores.json", "w"), indent=1)
    print("DONE step10b", flush=True)

if __name__ == "__main__":
    main()
