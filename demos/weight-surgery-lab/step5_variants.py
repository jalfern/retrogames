"""Practice evaluation of candidate edits on TRAIN split vs base, paired problems.
usage: step5_variants.py <label:gguf> [<label:gguf> ...]
One batch of 12 fresh gsm_train problems per model (paired seed). Logs each.
"""
import json, random, sys
import common as C, llm

BASE_GGUF = "q35-f16.gguf"

def main():
    probs_all = C.load_problems()
    random.seed(99)
    batch = random.sample(probs_all["gsm_train"], 12)
    prev = sum(1 for _ in open(C.BATCHLOG))
    n = prev
    results = {}
    for spec in sys.argv[1:]:
        label, gguf = spec.split(":", 1)
        n += 1
        rows, tps = llm.gen_batch(gguf, batch, cap=C.CAP, nproc=12)
        out = []
        for r, p in zip(rows, batch):
            r.update(llm.loop_score_text(r["text"]))
            ok, _, _ = C.grade(r["text"], p["gold"], p["tag"])
            out.append(dict(ok=ok, cap=r["hit_cap"], loop=r["looped"], ntok=r["ntok"]))
        summ = dict(n=n, phase="practice", split="gsm_train", batch=12, cap=C.CAP,
                    tps=tps, model=label,
                    terminated=sum(1 for o in out if not o["cap"]),
                    looped=sum(1 for o in out if o["loop"]),
                    correct=sum(1 for o in out if o["ok"]),
                    purpose=f"variant eval {label}: terminate/loop/correct vs base, same 12 train problems",
                    ruled_out="see paired rows")
        C.log_batch(summ)
        results[label] = summ
        print(label, json.dumps(summ))
    json.dump(results, open(f"{C.RESULTS}/variants.json", "w"), indent=1)

if __name__ == "__main__":
    main()
