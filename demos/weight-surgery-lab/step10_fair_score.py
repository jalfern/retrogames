"""Fair-horizon scoring (#1506, Jon step 5 on #1493): FIXED 100 MATH-500 +
100 GSM8K test at the fair cap chosen by step7/step8 (results/layer_ranking
.json's fair_cap), rows: base (penalty-free), edit, penalty-only (pp1.5).
Same problems, same cap, same seed across rows; single presence flag only
(the #8 lesson). Resumable per-problem jsonl — reruns skip finished problems.
usage: step10_fair_score.py <runs...>   run = TAG:GGUF[:pp=1.5]
"""
import json, os, random, sys
import common as C, llm

N_MATH = 100   # Jon's exact sizes: fixed 100 + 100 (no subsampling)
N_GSM = 100

def fair_cap():
    try:
        return int(json.load(open(f"{C.RESULTS}/layer_ranking.json"))["fair_cap"])
    except Exception:
        return 4096

def run(tag, gguf, pp, probs, setname, cap):
    extra = ["-c", str(cap + 512), "--presence-penalty", str(pp)]
    path = f"{C.RESULTS}/fair_{tag}_{setname}.jsonl"
    done = set()
    if os.path.exists(path):
        for line in open(path):
            done.add(json.loads(line)["i"])
    todo = [(i, p) for i, p in enumerate(probs) if i not in done]
    f = open(path, "a")
    for cs in range(0, len(todo), 12):
        chunk = todo[cs:cs + 12]
        rows, tps = llm.gen_batch(gguf, [p for _, p in chunk], cap=cap, nproc=12, extra=extra)
        for (i, p), r in zip(chunk, rows):
            r.update(llm.loop_score_text(r["text"]))
            ok, got, gold = C.grade(r["text"], p["gold"], p["tag"])
            rec = dict(i=i, ok=ok, got=got, gold=gold, cap_hit=r["hit_cap"],
                       loop=r["looped"], ntok=r["ntok"], problem=p["problem"][:200],
                       text=r["text"][:600])
            f.write(json.dumps(rec) + "\n")
        f.flush()
        print(f"[{tag}/{setname}] {len(done) + cs + len(chunk)}/{len(probs)} tps={tps}", flush=True)
    f.close()

def summarize(tag, setname, cap, n_units):
    recs = [json.loads(l) for l in open(f"{C.RESULTS}/fair_{tag}_{setname}.jsonl")]
    n = len(recs)
    summ = dict(phase="score-fair", run=tag, set=setname, cap=cap, batch=n_units,
                n=n, acc=round(100 * sum(r["ok"] for r in recs) / max(n, 1), 1),
                terminated=round(100 * sum(not r["cap_hit"] for r in recs) / max(n, 1), 1),
                hit_cap_pct=round(100 * sum(r["cap_hit"] for r in recs) / max(n, 1), 1),
                looped_pct=round(100 * sum(r["loop"] for r in recs) / max(n, 1), 1))
    C.log_batch(summ)
    print(json.dumps(summ), flush=True)
    return summ

def main():
    cap = fair_cap()
    probs = C.load_problems()
    rng = random.Random(20261103)   # fresh fixed seed, distinct from b's 80-subset seed
    math = rng.sample(probs["math500"], N_MATH)
    gsm = rng.sample(probs["gsm_test"], N_GSM)
    total_units = (N_MATH + N_GSM) // 12 + 2
    rows_out = {}
    for spec in sys.argv[1:]:
        parts = spec.split(":")
        tag, gguf = parts[0], parts[1]
        pp = float(parts[2].split("=")[1]) if len(parts) > 2 else 0.0
        for setname, pset in (("math", math), ("gsm", gsm)):
            run(tag, gguf, pp, pset, setname, cap)
            rows_out[f"{tag}_{setname}"] = summarize(tag, setname, cap, total_units)
    json.dump(dict(cap=cap, rows=rows_out), open(f"{C.RESULTS}/fair_scores.json", "w"), indent=1)
    print("DONE step10", flush=True)

if __name__ == "__main__":
    main()
