"""Jon's step 1 + step 4 (issue #1493 comment 08:01:53Z, resumed on #1506):
measure the FRACTION FINISHED at cap 4096 and 8192 on 12 fixed TRAIN problems,
with the penalty-free baseline sampling (pp 0). Smallest cap where a real share
finishes becomes the cap for every later batch. A third reference row (4096 at
pp 1.5) keeps the model-card sampling as a comparison point, per step 4's note
that penalty-1.5 is its own row, not the baseline.

Batches 19-21. Writes finished/cap-hit texts to results/cap_sweep.json for the
corpus-repeat check (Jon step 2)."""
import json, random
import common as C, llm

GGUF = "q35-f16.gguf"
SEEDSEL = 11

def pick(probs):
    rng = random.Random(SEEDSEL)
    gsm = rng.sample(probs["gsm_train"], 6)
    easy = [p for p in probs["math_train"] if str(p.get("level")) in ("1", "2")]
    if len(easy) < 6:
        easy = probs["math_train"]
    math = rng.sample(easy, 6)
    return gsm + math

def run(cap, pp, batch, purpose, ruled_out):
    probs = pick(C.load_problems())
    extra = ["-c", str(cap + 512), "--presence-penalty", str(pp)]
    rows, tps = llm.gen_batch(GGUF, probs, cap=cap, nproc=12, extra=extra)
    out = []
    for r, p in zip(rows, probs):
        r.update(problem=p["problem"], gold=p["gold"], tag=p["tag"])
        r.update(llm.loop_score_text(r["text"]))
        ok, got, gold = C.grade(r["text"], r["gold"], r["tag"])
        r["correct"] = ok
        out.append(r)
    finished = sum(1 for r in rows if not r["hit_cap"])
    summary = dict(phase="practice", split="gsm+math_train(easy)", batch=batch,
                   cap=cap, pp=pp, n=len(rows), tps=tps,
                   finished=finished,
                   hit_cap=sum(r["hit_cap"] for r in rows),
                   looped=sum(r["looped"] for r in rows),
                   correct=sum(r["correct"] for r in rows),
                   purpose=purpose, ruled_out=ruled_out)
    C.log_batch(summary)
    print(json.dumps(summary), flush=True)
    return out

if __name__ == "__main__":
    sweep = {}
    for cap, pp, batch, purpose, ruled_out in [
        (4096, 0.0, 19, "Jon step1: fraction finished at cap 4096, penalty-free baseline", "cap 1024 was unmeasurable (Jon 08:01Z); choosing the fair cap"),
        (8192, 0.0, 20, "Jon step1: fraction finished at cap 8192, penalty-free baseline", "cap choice between 4096 and 8192"),
        (4096, 1.5, 21, "Jon step4 reference: cap 4096 at card penalty pp1.5", "penalty-only row baseline"),
    ]:
        sweep[f"cap{cap}_pp{pp}"] = run(cap, pp, batch, purpose, ruled_out)
        json.dump(sweep, open(f"{C.RESULTS}/cap_sweep.json", "w"))
    print("DONE step7")
