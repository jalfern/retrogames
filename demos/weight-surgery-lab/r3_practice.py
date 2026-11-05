"""#1567 candidate 2 (corrected) — score ONE alpha variant on PRACTICE only.

Jon's ruling (#1567, 2026-11-04 23:31Z): scoring several alpha variants on the
held-out 100+100 would be tuning on the test set. Alpha selection therefore runs
on practice problems; the single winner gets the ONE held-out row (r3_run_1567.sh
stage E, via r2_score.py).

Practice batch: 64 FRESH math_train problems — indices 96..159 of the SEED-1562
shuffle of mit-exp8/exp8_math/practice/math_train.jsonl. The direction search
(#1562 P1-P3 fit + P5/P6 validation + b3 finished-corpus) consumes indices
0..95 of the same deterministic shuffle, so this batch has never been generated
over, fitted on, or validated on. Asserted at start, not assumed.

Settings: think35, cap 8192 (the #1562 direction-search pass settings — escape
at <=8k is exactly what the direction targets; ~4x cheaper than cap 32768),
pp 1.5 over the whole generation (WS_R2_PP_CTX=32768), PAR-32, seed 0.
Metric (frozen in r3_pick.py): accuracy first, finished-rate tie-break —
escape without a correct answer is not success.

Pass accounting: a scored practice batch IS an Astra pass (Jon: "finished-rate
plus accuracy; it counts against the 20 passes"). Logged to batches.jsonl with
pass_no from WS_R3_PASS, and ONLY when new rows were generated (#1562 law: a
resume that generated nothing spends nothing and logs nothing).

usage: WS_R3_PASS=8 ./.venv/bin/python r3_practice.py TAG:MODEL [...]
out:   results/r2/practice_TAG.json (+ practice_TAG.jsonl rows, resumable)
"""
import contextlib
import hashlib
import json
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import r2_common as R
import common as C
import llm
import r2_directions_1562 as D

PAR = int(os.environ.get("WS_R2_PARALLEL", "4"))
SAVETEXT = os.environ.get("WS_R2_SAVETEXT") == "1"
TEXTDIR = os.path.expanduser(os.environ.get("WS_R2_TEXTDIR", "~/Dev/weight-lab/r2_text"))
CAP = 8192
N_PRACTICE = 64
USED = 96          # indices 0..95 of the SEED-1562 math shuffle belong to #1562


def fresh_practice_batch():
    """64 math practice problems never touched by #1562's fit/validation.

    practice_batches() shuffles gsm THEN math with random.Random(1562) and takes
    math[0:96] across b1-b3. Reproduce that EXACT rng sequence, slice math[96:160]:
    deterministic and provably disjoint.
    """
    math = []
    with open(f"{D.MIT_PRACTICE}/math_train.jsonl") as f:
        for l in f:
            r = json.loads(l)
            math.append(r)
    # gsm must be shuffled FIRST with the same rng to land math on the same order
    gsm = [json.loads(l) for l in open(f"{D.MIT_PRACTICE}/gsm8k_train.jsonl")]
    rng = random.Random(D.SEED)
    rng.shuffle(gsm)
    rng.shuffle(math)
    seen = {r.get("problem") for r in math[:USED]}
    batch = math[USED:USED + N_PRACTICE]
    assert len(batch) == N_PRACTICE, f"practice pool too small: {len(math)}"
    assert not ({r["problem"] for r in batch} & seen), "practice batch overlaps #1562 corpus"
    rows = [(f"mathp_{USED + i}", r["problem"], str(r.get("solution") or ""))
            for i, r in enumerate(batch)]
    return rows


def existing(path):
    done = set()
    if os.path.exists(path):
        with open(path) as f:
            for l in f:
                try:
                    done.add(json.loads(l)["id"])
                except Exception:  # noqa: BLE001
                    pass
    return done


def run_practice(tag, model):
    assert R.load_done(model), f"{model} not loaded"
    rows = fresh_practice_batch()
    path = f"{R.RESULTS}/practice_{tag}.jsonl"
    done = existing(path)
    todo = [r for r in rows if r[0] not in done]
    t0 = time.time()
    tpath = f"{TEXTDIR}/practice_{tag}.jsonl"
    if SAVETEXT:
        os.makedirs(TEXTDIR, exist_ok=True)
    with open(path, "a") as out, \
            (open(tpath, "a") if SAVETEXT else contextlib.nullcontext()) as tout:
        def work(rec):
            pid, prob, gold = rec
            g = R.ask(model, prob, cap=CAP, pp=1.5)
            pred = C.extract_boxed(g["text"] or "") or C.extract_boxed(g["reasoning"] or "")
            lm = llm.loop_score_text((g["reasoning"] + " " + (g["text"] or "")).strip())
            raw = {"id": pid, "pred": pred, "ntok": g["ntok"],
                   "finished": g["finished"], **lm,
                   "t_wall": round(time.time() - t0, 1)}
            if SAVETEXT and pid not in done:
                body = json.dumps({"text": g["text"], "reasoning": g["reasoning"]})
                tout.write(json.dumps({"id": pid, **json.loads(body)}) + "\n")
                tout.flush()
                raw["text"] = {"bytes": len(body.encode()),
                              "sha": hashlib.sha256(body.encode()).hexdigest()[:12]}
            return raw
        with ThreadPoolExecutor(max_workers=PAR) as ex:
            raws = list(ex.map(work, todo))
        # grading on the MAIN thread only (signal.alarm law, #1533)
        for rec, raw in zip(todo, raws):
            ok, method = R.grade(rec[2], raw["pred"])
            raw.update(ok=ok, method=method)
            out.write(json.dumps(raw) + "\n")
            out.flush()
    recs = [json.loads(l) for l in open(path)]
    n = len(recs)
    summ = {
        "tag": tag, "model": model, "n": n,
        "acc": round(sum(1 for r in recs if r["ok"]) / max(n, 1) * 100, 1),
        "finished": round(sum(1 for r in recs if r["finished"]) / max(n, 1) * 100, 1),
        "mean_ntok": round(sum(r["ntok"] for r in recs) / max(n, 1)),
        "cap": CAP, "pp": 1.5, "pp_ctx": R.PP_CTX,
        "set": "fresh math_train 96..159 (SEED-1562 shuffle; disjoint from #1562 fit/val)",
        "t_minutes": round((time.time() - t0) / 60, 1),
    }
    with open(f"{R.RESULTS}/practice_{tag}.json", "w") as f:
        json.dump(summ, f, indent=1)
    n_new = len(todo)
    if n_new:  # a resume generated nothing: no pass, no log line
        pass_no = int(os.environ.get("WS_R3_PASS", "0")) or None
        with open(C.BATCHLOG, "a") as f:
            f.write(json.dumps({
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "run": "r3 (#1567)", "phase": "practice", "pass_no": pass_no,
                "kind": f"practice gen x{n} math @cap {CAP} (think35 pp1.5 ctx {R.PP_CTX})",
                "purpose": f"#1567 candidate 2 practice scoring {tag} ({model}) — "
                          "alpha selection on practice ONLY (Jon ruling: held-out is scored once)",
                "ruled_out": f"alpha variants at practice acc {summ['acc']} / finished "
                            f"{summ['finished']} on the fresh 64-math batch",
                "n": n, "total_tokens": sum(r["ntok"] for r in recs),
                "t_hours": round((time.time() - t0) / 3600, 3),
            }) + "\n")
    print(f"PRACTICE {tag}: acc {summ['acc']}% / fin {summ['finished']}% "
          f"(n={n}, new={n_new}, {summ['t_minutes']} min)")


if __name__ == "__main__":
    for spec in sys.argv[1:]:
        tag, model = spec.split(":")[:2]
        run_practice(tag, model)
