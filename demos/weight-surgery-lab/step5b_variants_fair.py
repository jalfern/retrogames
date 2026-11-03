"""Fair-cap variant practice (#1506): paired 12 TRAIN problems, base vs edited,
cap = fair cap, penalty-free. Picks K by terminated/correct vs base before the
single held-out scoring. Batches 22-23.
usage: step5b_variants_fair.py <label:gguf> [<label:gguf> ...]
"""
import json, random, sys
import common as C, llm

def main():
    cap = int(json.load(open(f"{C.RESULTS}/layer_ranking.json"))["fair_cap"])
    probs_all = C.load_problems()
    rng = random.Random(4242)
    batch = rng.sample(probs_all["gsm_train"], 6) + \
        rng.sample([p for p in probs_all["math_train"] if str(p.get("level", "")).startswith(("Level 1", "Level 2"))], 6)
    extra = ["-c", str(cap + 512), "--presence-penalty", "0.0"]
    out = {}
    n = 22
    for spec in sys.argv[1:]:
        label, gguf = spec.split(":", 1)
        rows, tps = llm.gen_batch(gguf, batch, cap=cap, nproc=12, extra=extra)
        res = []
        for r, p in zip(rows, batch):
            r.update(llm.loop_score_text(r["text"]))
            ok, _, _ = C.grade(r["text"], p["gold"], p["tag"])
            res.append(dict(ok=ok, cap=r["hit_cap"], loop=r["looped"], ntok=r["ntok"]))
        summ = dict(phase="practice", split="gsm+math_train(easy)", batch=n, cap=cap,
                    pp=0.0, tps=tps, model=label, n=len(res),
                    terminated=sum(1 for o in res if not o["cap"]),
                    looped=sum(1 for o in res if o["loop"]),
                    correct=sum(1 for o in res if o["ok"]),
                    purpose=f"fair-cap variant eval {label} vs base, same 12 train problems",
                    ruled_out="see paired rows")
        C.log_batch(summ)
        out[label] = summ
        print(label, json.dumps(summ), flush=True)
        n += 1
    json.dump(out, open(f"{C.RESULTS}/variants_fair.json", "w"), indent=1)

if __name__ == "__main__":
    main()
