"""#1585 open-book edit — score ONE alpha variant on PRACTICE only.

Same law as #1567 (Jon's ruling): alpha selection on practice problems; the
single winner earns the ONE held-out 100+100 row (r5_openbook_edit.sh stage E,
via r2_score.py). The edit itself was built from MIT's written diagnosis
(runs/p50c/final_answer.md — layers 15+19, own top-64 down_proj columns); this
script only decides alpha ∈ {2,4,8} for that recipe.

Practice batch: 64 FRESH math_train problems — indices 160..223 of the
SEED-1562 shuffle. #1562's fit/val consumed 0..95; r3's alpha sweep consumed
96..159. This slice has never been generated over, fitted on, or validated on.
Asserted against BOTH prior ranges, not assumed.

Settings identical to r3_practice.py: think35, cap 8192 (the direction-search
horizon), pp 1.5 over the whole generation (WS_R2_PP_CTX=32768), PAR-32,
seed 0. Metric frozen in ws5_pick.py: accuracy first, finished tie-break.

Pass accounting: a scored practice batch IS an Astra pass (passes 13/14/15 of
the disclosed 20; pass_no from WS_R5_PASS). Logged ONLY when new rows were
generated (#1562 resume law).

usage: WS_R5_PASS=13 ./.venv/bin/python ws5_practice.py TAG:MODEL [...]
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
USED = 160          # 0..95 belong to #1562, 96..159 to #1567's alpha sweep


def fresh_practice_batch():
    """64 math practice problems never touched by #1562 or #1567.

    Reproduce the EXACT rng sequence of practice_batches() (gsm shuffled
    first with random.Random(1562), then math) and slice math[160:224]:
    deterministic and provably disjoint from every earlier batch.
    """
    math = [json.loads(l) for l in open(f"{D.MIT_PRACTICE}/math_train.jsonl")]
    gsm = [json.loads(l) for l in open(f"{D.MIT_PRACTICE}/gsm8k_train.jsonl")]
    rng = random.Random(D.SEED)
    rng.shuffle(gsm)
    rng.shuffle(math)
    seen = {r.get("problem") for r in math[:USED]}
    batch = math[USED:USED + N_PRACTICE]
    assert len(batch) == N_PRACTICE, f"practice pool too small: {len(math)}"
    assert not ({r["problem"] for r in batch} & seen), "practice batch overlaps earlier corpora"
    assert len({r["problem"] for r in batch}) == N_PRACTICE, "duplicate problems inside the batch"
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
        "set": "fresh math_train 160..223 (SEED-1562 shuffle; disjoint from #1562 fit/val and #1567 sweep)",
        "t_minutes": round((time.time() - t0) / 60, 1),
    }
    with open(f"{R.RESULTS}/practice_{tag}.json", "w") as f:
        json.dump(summ, f, indent=1)
    n_new = len(todo)
    if n_new:  # a resume generated nothing: no pass, no log line
        pass_no = int(os.environ.get("WS_R5_PASS", "0")) or None
        with open(C.BATCHLOG, "a") as f:
            f.write(json.dumps({
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "run": "r5 (#1585)", "phase": "practice", "pass_no": pass_no,
                "kind": f"practice gen x{n} math @cap {CAP} (think35 pp1.5 ctx {R.PP_CTX})",
                "purpose": f"#1585 open-book edit practice scoring {tag} ({model}) — "
                          "alpha selection on practice ONLY (held-out is scored once)",
                "ruled_out": f"open-book alpha variants at practice acc {summ['acc']} / finished "
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
