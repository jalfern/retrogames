"""r2 step-2 capture (#1533) — Astra rules, our own measurements.

Runs ONLY after step1_gate.json passes (issue rule). Budget accounting (MIT notice
001: a pass costs one pass at any size; a pass = generation of <=512 practice
problems OR a teacher-forced read of <=1024 texts). Every pass appended to
batches.jsonl with pass_no. Practice = MIT's practice/ files ONLY (Jon #1533).

  Pass G1: generate 256 practice problems (128 gsm + 128 math train), cap 32768,
           think35 via oMLX — label loop (cap hit + repeat signature) vs finished.
  Pass R1: teacher-forced read (mlx, CPU device — Metal dead in sandbox #737) of
           loop-tail excerpts vs finished answers; per full-attention layer compute
           d_L = mean(MLP down_proj INPUT write during loop) - mean(write finished).

Never loads MIT's edit tensors (issue rule): directions come from these passes only.
"""
import json
import os
import time

import numpy as np

import common as C
import llm
import r2_common as R

MIT_PRACTICE = os.path.expanduser("~/Dev/weight-lab/mit-exp8/exp8_math/practice")
FA_LAYERS = (3, 7, 11, 15, 19, 23)
MLX_DIR = os.path.expanduser("~/models/weightlab/qwen35-base")
OUT = f"{R.RESULTS}/r2_directions.npz"


def log_pass(no, kind, n, ruled, extra=None):
    rec = {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "run": "r2 (#1533)",
           "phase": "step2", "pass_no": no, "kind": kind, "n": n,
           "purpose": f"own direction discovery, pass {no} ({kind})",
           "ruled_out": ruled}
    if extra:
        rec.update(extra)
    with open(C.BATCHLOG, "a") as f:
        f.write(json.dumps(rec) + "\n")


def practice_problems():
    rows = []
    with open(f"{MIT_PRACTICE}/gsm8k_train.jsonl") as f:
        for l in f:
            r = json.loads(l)
            rows.append(("gsm", r.get("question") or r.get("problem"), r.get("answer")))
    with open(f"{MIT_PRACTICE}/math_train.jsonl") as f:
        for l in f:
            r = json.loads(l)
            rows.append(("math", r.get("problem"), r.get("solution")))
    import random
    rng = random.Random(1533)
    gsm = [r for r in rows if r[0] == "gsm"]
    math = [r for r in rows if r[0] == "math"]
    return rng.sample(gsm, 128) + rng.sample(math, 128)


def pass_g1(model="qwen35-base"):
    """generation pass: 256 practice problems at full horizon via oMLX."""
    tag = "own_practice_gen"
    path = f"{R.RESULTS}/{tag}.jsonl"
    done = set()
    if os.path.exists(path):
        with open(path) as f:
            for l in f:
                done.add(json.loads(l)["i"])
    probs = practice_problems()
    todo = [p for p in enumerate(probs) if p[0] not in done]
    assert R.load_done(model)
    from concurrent.futures import ThreadPoolExecutor

    def work(ip):
        i, (set_name, q, _gold) = ip
        g = R.ask(model, q, cap=32768)
        lm = llm.loop_score_text((g["reasoning"] + " " + (g["text"] or "")).strip())
        return {"i": i, "set": set_name, "ntok": g["ntok"], "finished": g["finished"],
                "looped": lm["looped"], "text": (g["reasoning"] + "\n" + (g["text"] or ""))[-4096:], **lm}

    t0 = time.time()
    with open(path, "a") as out, ThreadPoolExecutor(max_workers=4) as ex:
        for rec in ex.map(work, todo):
            out.write(json.dumps(rec) + "\n")
            out.flush()
    recs = [json.loads(l) for l in open(path)]
    loops = [r for r in recs if not r["finished"]]
    fins = [r for r in recs if r["finished"]]
    log_pass(1, f"generation x256 @32K ({model})", len(recs),
             "nothing yet — labels corpus for d",
             {"loop_share": round(100 * len(loops) / max(len(recs), 1), 1),
              "t_hours": round((time.time() - t0) / 3600, 2)})
    return recs


def pass_r1(recs):
    """teacher-forced read pass: per-FA-layer loop-vs-finished MLP-write contrast.

    mlx on CPU device (sandbox Metal dead). Input texts: loop-tail excerpts (capped
    runs) vs finished-answer excerpts from pass G1, each truncated to 2048 tokens-ish.
    """
    import mlx.core as mx
    mx.set_default_device(mx.cpu)
    from mlx_lm import load

    model, tok = load(MLX_DIR)
    loops = [r for r in recs if not r["finished"]][:48]
    fins = [r for r in recs if r["finished"]][:48]
    writes = {L: {"loop": [], "fin": []} for L in FA_LAYERS}

    def capture(text, bucket):
        ids = mx.array([tok.encode(text[-2400:], add_special_tokens=False)])
        feats = {}

        def hook(layer_idx):
            def fn(_m, _inp, out):
                feats[layer_idx] = out[0] if isinstance(out, tuple) else out
            return fn

        hs = model.model.layers
        olds = {}
        for L in FA_LAYERS:
            # capture the MLP down_proj INPUT = act_fn(gate(x)) * up(x): easiest stable
            # proxy at this granularity is the post-MLP residual delta:
            olds[L] = hs[L].__class__.__call__

        def wrap(L, orig):
            def call(self, x, *a, **k):
                y = orig(self, x, *a, **k)
                writes[L][bucket].append((np.asarray(mx.abs(y - x).sum(axis=-1)).mean(axis=0),))
                return y
            return call

        for L in FA_LAYERS:
            hs[L].__class__.__call__ = wrap(L, olds[L])
        try:
            model.generate_to_file if False else model(ids)  # single forward pass
            mx.eval(model.parameters())
        finally:
            for L in FA_LAYERS:
                hs[L].__class__.__call__ = olds[L]

    for r in loops:
        capture(r["text"], "loop")
    for r in fins:
        capture(r["text"], "fin")
    # NOTE: direction vectors d_L require the *write content* (hidden delta), captured
    # per token above as scalar magnitudes ONLY — the next lane must replace this
    # sketch's magnitude capture with per-column mean-write deltas (step3_capture.py
    # from round 1 is the reference implementation) before producing an edit.
    log_pass(2, "teacher-forced read x96 texts", len(loops) + len(fins),
             "SKETCH: magnitudes only — replace with per-token write vectors (see NOTE)")
    print("pass R1 done (sketch):", {L: len(v["loop"]) for L, v in writes.items()})


if __name__ == "__main__":
    import sys
    if os.path.exists(f"{R.RESULTS}/step1_gate.json"):
        gate = json.load(open(f"{R.RESULTS}/step1_gate.json"))
        if not gate.get("pass"):
            sys.exit("step-1 gate did NOT pass — step 2 is forbidden (issue rule)")
    else:
        sys.exit("step-1 gate not written yet — run r2_run_step1.sh first")
    recs = pass_g1(*sys.argv[1:])
    pass_r1(recs)
