"""One-shot held-out scoring (#1493): base vs edited vs sampling-fix-only.
Same problems, same sampling, same cap before and after. Resumable: per-problem
lines appended to results/score_<tag>.jsonl; reruns skip finished problems.
usage: step6_score.py <runs...>   run = TAG:GGUF[:presence=2.0]
Sets: MATH-500 (fixed-seed n) + GSM8K test (fixed-seed n). Sizes documented.
"""
import json, os, random, sys
import common as C, llm

N_MATH = 80    # fixed-seed subsample (laptop compute; documented)
N_GSM = 80     # fixed-seed subsample (documented)

def run(tag, gguf, extra, probs, setname):
    path = f"{C.RESULTS}/score_{tag}_{setname}.jsonl"
    done = {}
    if os.path.exists(path):
        for line in open(path):
            r = json.loads(line)
            done[r["i"]] = r
    todo = [(i, p) for i, p in enumerate(probs) if i not in done]
    f = open(path, "a")
    for chunk_start in range(0, len(todo), 14):
        chunk = todo[chunk_start:chunk_start+14]
        rows, tps = llm.gen_batch(gguf, [p for _, p in chunk], cap=C.CAP, nproc=14, extra=extra)
        for (i, p), r in zip(chunk, rows):
            r.update(llm.loop_score_text(r["text"]))
            ok, got, gold = C.grade(r["text"], p["gold"], p["tag"])
            rec = dict(i=i, ok=ok, got=got, gold=gold, cap=r["hit_cap"],
                       loop=r["looped"], ntok=r["ntok"], text=r["text"][:600])
            f.write(json.dumps(rec) + "\n")
        f.flush()
        print(f"[{tag}/{setname}] {len(done)+len(chunk)}/{len(probs)} tps={tps}", flush=True)
    f.close()

def summarize(tag, setname, n_batch_units):
    path = f"{C.RESULTS}/score_{tag}_{setname}.jsonl"
    recs = [json.loads(l) for l in open(path)]
    n = len(recs)
    summ = dict(phase="score", run=tag, set=setname, batch=n_batch_units, cap=C.CAP,
                n=n, acc=round(100 * sum(r["ok"] for r in recs) / max(n, 1), 1),
                terminated=round(100 * sum(not r["cap"] for r in recs) / max(n, 1), 1),
                hit_cap_pct=round(100 * sum(r["cap"] for r in recs) / max(n, 1), 1),
                looped_pct=round(100 * sum(r["loop"] for r in recs) / max(n, 1), 1))
    C.log_batch(summ)
    print(json.dumps(summ))
    return summ

def main():
    probs = C.load_problems()
    random.seed(2026)
    math = random.sample(probs["math500"], min(N_MATH, len(probs["math500"])))
    gsm = random.sample(probs["gsm_test"], min(N_GSM, len(probs["gsm_test"])))
    prev = sum(1 for _ in open(C.BATCHLOG))
    n = prev
    out = {}
    for spec in sys.argv[1:]:
        parts = spec.split(":")
        tag, gguf = parts[0], parts[1]
        sets = ("math", "gsm")
        extra = None
        for kv in parts[2:]:
            if kv.startswith("@"):
                sets = tuple(kv[1:].split("+"))
                continue
            k, v = kv.split("=")
            if k == "presence":
                extra = (extra or []) + ["--presence-penalty", v]
        for setname, plist in (("math", math), ("gsm", gsm)):
            if setname not in sets:
                continue
            nb = (len(plist) + 13) // 14
            n += nb
            run(f"{tag}", gguf, extra, plist, setname)
            out[f"{tag}_{setname}"] = summarize(f"{tag}", setname, nb)
    json.dump(out, open(f"{C.RESULTS}/final_scores.json", "w"), indent=1)

if __name__ == "__main__":
    main()
