"""Baseline practice: characterize the loop on TRAIN splits (batches 4-6).
Writes loop/end generation texts to results/loop_texts.json for capture."""
import json, random
import common as C, llm

GGUF = "q35-f16.gguf"

def run(name, probs, split, purpose, ruled_out, nproc=12):
    rows, tps = llm.gen_batch(GGUF, probs, cap=C.CAP, nproc=nproc)
    for r, p in zip(rows, probs):
        r.update(problem=p["problem"], gold=p["gold"], tag=p["tag"])
        r.update(llm.loop_score_text(r["text"]))
        ok, got, gold = C.grade(r["text"], r["gold"], r["tag"])
        r["correct"] = ok
    n = sum(1 for _ in rows)
    summary = dict(phase="practice", split=split, batch=len(rows), cap=C.CAP, tps=tps,
                   hit_cap=sum(r["hit_cap"] for r in rows),
                   looped=sum(r["looped"] for r in rows),
                   correct=sum(r["correct"] for r in rows),
                   purpose=purpose, ruled_out=ruled_out)
    C.log_batch(summary)
    print(name, json.dumps(summary))
    return rows

def main():
    probs = C.load_problems()
    random.seed(7)
    texts = {"loop": [], "end": []}
    # already-logged batches: 1,2,3 (smoke). this is n=4..6
    prev = sum(1 for _ in open(C.BATCHLOG))
    for i, (name, pset, split) in enumerate([
            ("gsmA", random.sample(probs["gsm_train"], 12), "gsm_train"),
            ("gsmB", random.sample(probs["gsm_train"], 12), "gsm_train"),
            ("mathA", random.sample(probs["math_train"], 12), "math_train")]):
        rows = run(name, pset, split,
                   "baseline loop signature + capture corpus on train split",
                   "nothing yet")
        for r in rows:
            rec = dict(problem=r["problem"], text=r["text"], hit_cap=r["hit_cap"],
                       looped=r["looped"])
            (texts["loop"] if r["hit_cap"] else texts["end"]).append(rec)
        json.dump(texts, open(f"{C.RESULTS}/loop_texts.json", "w"))
    print("total logged batches:", prev + 3)

if __name__ == "__main__":
    main()
