"""WEIGHT SURGERY II (#1505) step 3: paired practice eval at the long cap.

Same 12 train problems for every model (paired seed), cap 4096, penalty-free
sampling (pp 0 — the #8 lesson: penalty 1.5 is its own row, never the baseline).
Rows: base f16 + variants built by step9. Reports terminated/looped/correct.
usage: step10_eval2.py <label:gguf> [<label:gguf> ...]
"""
import json, random, sys
import common as C, llm

CAP = 4096
EXTRA = ["--presence-penalty", "0"]

def main():
    probs = C.load_problems()
    rng = random.Random(77)   # eval seed distinct from capture (23) and slot a (11)
    gsm = rng.sample(probs["gsm_train"], 6)
    easy = [p for p in probs["math_train"] if str(p.get("level")) in ("1", "2", "Level 1", "Level 2")]
    if len(easy) < 6:
        easy = probs["math_train"]
    batch = gsm + rng.sample(easy, 6)
    out_all = {}
    n0 = sum(1 for _ in open(C.BATCHLOG))
    for i, spec in enumerate(sys.argv[1:]):
        label, gguf = spec.split(":", 1)
        rows, tps = llm.gen_batch(gguf, batch, cap=CAP, nproc=12, extra=EXTRA)
        out = []
        for r, p in zip(rows, batch):
            r.update(llm.loop_score_text(r["text"]))
            ok, got, gold = C.grade(r["text"], p["gold"], p["tag"])
            out.append(dict(ok=ok, cap=r["hit_cap"], loop=r["looped"], ntok=r["ntok"]))
        summ = dict(n=n0 + i + 1, phase="practice-v2", split="gsm+math_train(easy)",
                    batch=12, cap=CAP, pp=0, tps=tps, model=label,
                    terminated=sum(1 for o in out if not o["cap"]),
                    looped=sum(1 for o in out if o["loop"]),
                    correct=sum(1 for o in out if o["ok"]),
                    rows=out,
                    purpose=f"v2 eval {label}: terminate/loop/correct at cap4096 pp0, paired 12 train problems",
                    ruled_out="see paired rows")
        C.log_batch(summ)
        out_all[label] = summ
        print(label, json.dumps({k: summ[k] for k in
              ("terminated", "looped", "correct", "tps")}))
    json.dump(out_all, open(f"{C.RESULTS}/v2_variants.json", "w"), indent=1)

if __name__ == "__main__":
    main()
