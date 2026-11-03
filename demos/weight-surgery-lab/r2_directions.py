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


def pass_r1(recs, smoke=False):
    """teacher-forced read pass: per-FA-layer loop-vs-finished MLP-write vectors.

    mlx on CPU device (sandbox Metal dead). Input texts: loop-tail excerpts (capped
    runs) vs finished-answer excerpts from pass G1, each teacher-forced as
    chat-prompt + up to 2048 generation tokens. Replaces the round-2 SKETCH:
    captures the MLP residual contribution o (what the layer WRITES into the
    residual stream) per token — step3_capture.py (round 1) is the reference,
    generalized here to all six FA layers and both label buckets.
    d_L = mean(o over loop tokens) - mean(o over finished tokens), unit-normalized.
    """
    import mlx.core as mx
    mx.set_default_device(mx.cpu)
    from mlx_lm import load

    model, tok = load(MLX_DIR)
    # _install_capture reads C.CAPTURE_LAYERS at call time — point it at our layers
    old_layers = C.CAPTURE_LAYERS
    C.CAPTURE_LAYERS = FA_LAYERS
    stash = C._install_capture(model)
    # G1 record i indexes practice_problems() (seed-fixed) — rebuild for prompts
    probs = practice_problems()
    n = (2, 2) if smoke else (48, 48)
    loops = [r for r in recs if not r["finished"]][: n[0]]
    fins = [r for r in recs if r["finished"]][: n[1]]
    acc = {L: {"loop": [], "fin": [], "absact": []} for L in FA_LAYERS}

    def capture(rec, bucket):
        q = probs[rec["i"]][1]
        p_ids = tok.apply_chat_template([{"role": "user", "content": q}],
                                       add_generation_prompt=True)
        g_ids = tok.encode(rec["text"][-2400:], add_special_tokens=False)[:2048]
        if len(g_ids) < 8:
            return
        full = p_ids + g_ids
        for L in FA_LAYERS:
            stash[L].clear()
        model(mx.array([full]))
        mx.eval(model.parameters())
        s = len(p_ids)
        for L in FA_LAYERS:
            if not stash[L]:
                raise RuntimeError(f"layer {L}: capture stash empty — hook dead")
            o, a = stash[L][0]                      # [1,S,hidden] per step3_capture
            on = np.array(o[0].astype(mx.float32))[s:]
            an = np.abs(np.array(a[0].astype(mx.float32))[s:])
            if len(on) == 0:
                raise RuntimeError(f"layer {L}: no generation-token rows after prompt")
            acc[L][bucket].append(on[64:] if len(on) > 64 else on)
            if bucket == "loop":
                acc[L]["absact"].append(an[64:] if len(an) > 64 else an)

    for r in loops:
        capture(r, "loop")
    for r in fins:
        capture(r, "fin")
    C._remove_capture(model)   # reads CAPTURE_LAYERS — restore AFTER removing hooks
    C.CAPTURE_LAYERS = old_layers

    D, ACT, GAP = [], [], []
    for L in FA_LAYERS:
        cl, cf = acc[L]["loop"], acc[L]["fin"]
        if not cl or not cf:
            raise RuntimeError(f"layer {L}: empty bucket (loop={len(cl)} fin={len(cf)})"
                             " — G1 label buckets too small (need finished runs)")
        raw = np.concatenate(cl).mean(0) - np.concatenate(cf).mean(0)
        GAP.append(float(np.linalg.norm(raw)))      # layer strength BEFORE normalizing
        dl = raw / (np.linalg.norm(raw) + 1e-12)
        act = np.concatenate(acc[L]["absact"]).mean(0) if acc[L]["absact"] else np.zeros_like(dl)
        D.append(dl)
        ACT.append(act)
    d = np.stack(D)                       # [6, hidden] — per-layer unit write directions
    act = np.stack(ACT)                  # [6, hidden] — mean |MLP input| for col ranking
    out_path = f"{R.RESULTS}/r2_directions_smoke.npz" if smoke else OUT
    np.savez(out_path, d=d, mean_abs_act=act, gap_norm=np.array(GAP),
             fa_layers=np.array(FA_LAYERS),
             loop_texts=len(loops), fin_texts=len(fins))
    if smoke:
        print("R1 SMOKE ok:", out_path, d.shape,
              "row norms:", np.round(np.linalg.norm(d, axis=1), 4).tolist())
        return d
    log_pass(2, "teacher-forced read x96 texts @FA layers", len(loops) + len(fins),
             "loop direction outside all six FA-layer MLP write paths "
             "(would show as |d_L|~0 for every L)")
    print("pass R1 done:", {L: (len(acc[L]["loop"]), len(acc[L]["fin"])) for L in FA_LAYERS})
    return d


if __name__ == "__main__":
    import sys
    if os.environ.get("R2_R1_SMOKE") == "1":
        # Plumbing proof ONLY: synthetic recs, writes r2_directions_smoke.npz,
        # never the real OUT, consumes no generation budget, logs no pass.
        recs = [{"i": 0, "finished": False, "text": "So " * 300},
                {"i": 1, "finished": False, "text": "Wait, let me check " * 200},
                {"i": 2, "finished": True, "text": "Total is 42 apples. The answer is \\boxed{42}."},
                {"i": 3, "finished": True, "text": "7 + 5 = 12, the answer is \\boxed{12}."}]
        pass_r1(recs, smoke=True)
        sys.exit(0)
    if os.path.exists(f"{R.RESULTS}/step1_gate.json"):
        gate = json.load(open(f"{R.RESULTS}/step1_gate.json"))
        if not gate.get("pass"):
            sys.exit("step-1 gate did NOT pass — step 2 is forbidden (issue rule)")
    else:
        sys.exit("step-1 gate not written yet — run r2_run_step1.sh first")
    recs = pass_g1(*sys.argv[1:])
    pass_r1(recs)
