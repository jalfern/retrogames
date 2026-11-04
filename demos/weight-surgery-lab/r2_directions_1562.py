"""#1562 WEIGHT SURGERY step 2 — Qwen finds its own edit (Astra rules, 20-pass cap).

Jon's mandate (#1562, 2026-11-04): run step 2 now; the p50cw row (#1547: acc 31.0 /
fin 51.0, MIT-grader 37.0%) is the baseline — judge our edit against OUR p50c row,
same box and settings. The step1_gate.json floors vs MIT's published numbers are
superseded by this directive; run with WS_R2_JON_GO=1 (checked below).

Pass budget (Jon #1562): a pass = ONE generation batch of <=64 practice problems,
or ONE teacher-forced read. This script spends 5 of 20:
  P1  gen 64 practice (32 gsm + 32 math train) @cap 8192, think35 pp1.5 ctx32768
  P2  gen 64 practice @cap 8192 (batch B — more loop tokens)
  P3  gen 64 practice @cap 2048 — the FINISHED corpus: base escape at >=8k is ~8%
      (#1506/#1533 rows), a 2k horizon yields genuine terminated reasoning to
      contrast against. Fixes the #1506 confound (loop-tail-vs-finished d carried
      an about-to-EOS component; here fin excerpts EXCLUDE the ending, loop excerpts
      the cap-hit tail, so d is loopiness, not EOS proximity).
  P4  teacher-forced read x fit-corpus — per FA layer d_L = mean(MLP write on loop
      tokens) - mean(write on finished tokens), EOS zones cut; also mean |down_proj
      input| (column ranking) and raw gap norms.
  P5  teacher-forced read x held-out corpus — validation: projection x.d_L must
      separate loop vs finished texts on texts NOT used to fit d. sep_L =
      (mean_loop - mean_fin)/pooled_sd. sep<1 layers are RULED OUT; the edit takes
      the top-2 separating layers.

MIT's edit tensors are NEVER read (issue rule; only their prompt/manifest prose).
Practice corpus: mit-exp8/exp8_math/practice/ ONLY (Astra rule).
Generations run on qwen35-base over oMLX at WS_R2_PARALLEL (32); captures run
locally on MLX CPU (Metal dead in sandbox, #737).
"""
import json
import os
import random
import time

import numpy as np

import common as C
import llm
import r2_common as R

MIT_PRACTICE = os.path.expanduser("~/Dev/weight-lab/mit-exp8/exp8_math/practice")
FA_LAYERS = (3, 7, 11, 15, 19, 23)
MLX_DIR = os.path.expanduser("~/models/weightlab/qwen35-base")
OUT = f"{R.RESULTS}/r2_directions_1562.npz"
PAR = int(os.environ.get("WS_R2_PARALLEL", "4"))
GEN_MODEL = "qwen35-base"
CAP_LOOP, CAP_FIN = 8192, 4096
TAIL_LOOP, TAIL_FIN = 256, 128          # tokens cut from bucket ends (EOS/cap hygiene)
FIT_N = 48                              # fit-corpus texts per bucket (rest => P5 validate)
SEED = 1562


def log_pass(no, kind, n, ruled, extra=None):
    rec = {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "run": "r2 (#1562)",
           "phase": "step2", "pass_no": no, "kind": kind, "n": n,
           "purpose": f"#1562 own-direction search, pass {no} ({kind})",
           "ruled_out": ruled}
    if extra:
        rec.update(extra)
    with open(C.BATCHLOG, "a") as f:
        f.write(json.dumps(rec) + "\n")


def practice_batches():
    """Practice problems ONLY; disjoint batches by a fixed shuffle."""
    gsm, math = [], []
    with open(f"{MIT_PRACTICE}/gsm8k_train.jsonl") as f:
        for l in f:
            r = json.loads(l)
            gsm.append(("gsm", r.get("question") or r.get("problem"),
                        str(r.get("answer") or "")))
    with open(f"{MIT_PRACTICE}/math_train.jsonl") as f:
        for l in f:
            r = json.loads(l)
            math.append(("math", r.get("problem"), str(r.get("solution") or "")))
    rng = random.Random(SEED)
    rng.shuffle(gsm)
    rng.shuffle(math)
    b1 = gsm[:32] + math[:32]
    b2 = gsm[32:64] + math[32:64]
    b3 = gsm[64:96] + math[64:96]
    return b1, b2, b3


def make_refs(n=96):
    """Teacher-forced FINISHED exemplars: reference solutions of practice problems,
    read as the assistant continuation of the same chat prompt the generations used.
    MIT-prompt sanctioned ('read the reference solutions of up to 1,024 practice
    problems'). Flagged separately from model-finished runs in the npz."""
    refs = []
    _b1, _b2, _b3 = practice_batches()
    pool = _b3 + _b1[:16] + _b2[:16]
    for set_name, q, sol in pool:
        if len(sol) >= 220:
            refs.append((set_name, q, sol))
    random.Random(SEED + 2).shuffle(refs)
    refs = refs[:n]
    recs = [{"i": i, "set": s, "ntok": len(sol), "finished": True, "looped": False,
             "pred": "ref", "text": sol[-3000:], "_pool": "ref"}
            for i, (s, _q, sol) in enumerate(refs)]
    return refs


def gen_pass(pass_no, probs, cap, tag):
    """One generation batch (<=64 problems) on qwen35-base via oMLX. Resumable."""
    path = f"{R.RESULTS}/p1562_gen_{tag}.jsonl"
    done = set()
    if os.path.exists(path):
        with open(path) as f:
            for l in f:
                done.add(json.loads(l)["i"])
    todo = [(i, p) for i, p in enumerate(probs) if i not in done]
    assert R.load_done(GEN_MODEL), f"{GEN_MODEL} not loaded"
    from concurrent.futures import ThreadPoolExecutor

    def work(ip):
        i, prob = ip
        set_name, q = prob[0], prob[1]
        g = R.ask(GEN_MODEL, q, cap=cap, pp=1.5)
        full = (g["reasoning"] + "\n" + (g["text"] or "")).strip()
        lm = llm.loop_score_text(full)
        pred = C.extract_boxed(g["text"] or "") or C.extract_boxed(g["reasoning"] or "")
        return {"i": i, "set": set_name, "ntok": g["ntok"], "finished": g["finished"],
                "looped": lm["looped"], "pred": pred, "text": full[-8192:]}

    t0 = time.time()
    if todo:
        with open(path, "a") as out, ThreadPoolExecutor(max_workers=PAR) as ex:
            for rec in ex.map(work, todo):
                out.write(json.dumps(rec) + "\n")
                out.flush()
    recs = [json.loads(l) for l in open(path)]
    fins = sum(1 for r in recs if r["finished"])
    loops = sum(1 for r in recs if not r["finished"] or r["looped"])
    dt = time.time() - t0
    return recs, fins, loops, dt


def corpus():
    """Build loop/fin text pools from the three generation passes (idempotent)."""
    b1, b2, b3 = practice_batches()
    loop_pool, fin_pool = [], []
    stats = {}
    for pass_no, probs, cap, tag in ((1, b1, CAP_LOOP, "8k_a"), (2, b2, CAP_LOOP, "8k_b")):
        recs, fins, loops, dt = gen_pass(pass_no, probs, cap, tag)
        stats[tag] = dict(n=len(recs), finished=fins, loops=loops, t=round(dt / 60, 1))
        log_pass(pass_no, f"gen x64 @{cap} (base, think35 pp1.5 ctx32768)", len(recs),
                 "nothing yet — loop/finished label corpus",
                 {"finished": fins, "loop_or_cut": loops, "t_hours": round(dt / 3600, 3)})
        for r in recs:
            r["_pool"] = tag
            if not r["finished"]:
                loop_pool.append(r)      # cap-hits are the loop attractor
            elif r["pred"]:
                fin_pool.append(r)      # terminated WITH a boxed answer
    recs3, fins3, loops3, dt3 = gen_pass(3, b3, CAP_FIN, "4k")
    stats["4k"] = dict(n=len(recs3), finished=fins3, loops=loops3, t=round(dt3 / 60, 1))
    log_pass(3, f"gen x64 @{CAP_FIN} finished-corpus (escape rate {fins3}/{len(recs3)})",
             len(recs3),
             "nothing yet — terminated-reasoning corpus for the EOS-hygiene contrast "
             "(#1506 confound fix)",
             {"finished": fins3, "t_hours": round(dt3 / 3600, 3)})
    for r in recs3:
        r["_pool"] = "4k"
        if r["finished"] and r["pred"]:
            fin_pool.append(r)
        elif not r["finished"]:
            loop_pool.append(r)
    return loop_pool, fin_pool, stats


class Bucket:
    """Running sums per FA layer so memory stays O(hidden), not O(tokens)."""

    def __init__(self):
        self.sum_o = {L: np.zeros(1024, np.float64) for L in FA_LAYERS}
        self.cnt = {L: 0 for L in FA_LAYERS}
        self.sum_act = {L: np.zeros(1024, np.float64) for L in FA_LAYERS}
        self.texts = 0


def tf_read(model, tok, items, fit, val, d_val=None, probs_by_pool=None):
    """Teacher-forced forward per text; accumulate write stats.

    items: [(rec, bucket, phase)] bucket in {"loop","fin"}, phase in {"fit","val"}.
    fit:  {"loop": Bucket, "fin": Bucket} accumulating o/act stats for d (P4 texts).
    val:  dict L -> {bucket: [sum, sumsq, n]} projection stats (P5 texts); d_val
          carries the FIXED fitted directions (P4 already run).
    """
    import mlx.core as mx
    pbs = practice_batches()
    if probs_by_pool is None:
        probs_by_pool = {"8k_a": pbs[0], "8k_b": pbs[1], "4k": pbs[2], "ref": make_refs()}
    for rec, bucket, phase in items:
        q = probs_by_pool[rec["_pool"]][rec["i"]][1]
        p_ids = tok.apply_chat_template([{"role": "user", "content": q}],
                                       add_generation_prompt=True)
        g_ids = tok.encode(rec["text"][-3000:], add_special_tokens=False)[:2048]
        tail = TAIL_LOOP if bucket == "loop" else TAIL_FIN
        if len(g_ids) - tail < 64:
            continue
        full = mx.array([p_ids + g_ids])
        for L in FA_LAYERS:
            stash[L].clear()
        model(full)
        mx.eval(model.parameters())
        s = len(p_ids)
        tgt = (val if phase == "val" else fit[bucket])
        for L in FA_LAYERS:
            if not stash[L]:
                raise RuntimeError(f"layer {L}: capture stash empty — hook dead")
            o, a = stash[L][0]
            on = np.array(o[0].astype(mx.float32))[s:len(g_ids) - tail]
            an = np.abs(np.array(a[0].astype(mx.float32))[s:len(g_ids) - tail])
            if len(on) < 64:
                continue
            if phase == "fit":
                tgt.sum_o[L] += on.sum(0)
                tgt.sum_act[L] += an.sum(0)
                tgt.cnt[L] += len(on)
                tgt.texts += 1
            else:
                proj = on @ d_val[L]
                st = tgt[L][bucket]
                st[0] += float(proj.sum())
                st[1] += float((proj ** 2).sum())
                st[2] += len(proj)


if __name__ == "__main__":
    import sys
    gate_path = f"{R.RESULTS}/step1_gate.json"
    if os.environ.get("WS_R2_JON_GO") != "1":
        if os.path.exists(gate_path) and not json.load(open(gate_path)).get("pass"):
            sys.exit("step-1 gate did NOT pass — run only under WS_R2_JON_GO=1 "
                    "(Jon authorized step 2 against OUR p50c row, #1562)")
    if os.environ.get("R2_SKIP_GEN") == "1":
        b1, b2, b3 = practice_batches()
        recs_a = [json.loads(l) for l in open(f"{R.RESULTS}/p1562_gen_8k_a.jsonl")]
        recs_b = [json.loads(l) for l in open(f"{R.RESULTS}/p1562_gen_8k_b.jsonl")]
        recs_c = [json.loads(l) for l in open(f"{R.RESULTS}/p1562_gen_4k.jsonl")]
        loop_pool, fin_pool, stats = [], [], {"resumed": True}
        for tag, recs in (("8k_a", recs_a), ("8k_b", recs_b)):
            for r in recs:
                r["_pool"] = tag
                if not r["finished"]:
                    loop_pool.append(r)
                elif r["pred"]:
                    fin_pool.append(r)
        for r in recs_c:
            r["_pool"] = "4k"
            if r["finished"] and r["pred"]:
                fin_pool.append(r)
            elif not r["finished"]:
                loop_pool.append(r)
        print("resumed pools:", len(loop_pool), len(fin_pool))
    else:
        loop_pool, fin_pool, stats = corpus()
    refs = make_refs()
    n_model_fin = len(fin_pool)
    fin_pool = fin_pool + refs          # ref exemplars flagged by pred == "ref"
    print("corpus stats:", stats)
    print("pools: loop", len(loop_pool), " fin", len(fin_pool),
          f"(model-finished {n_model_fin} + reference-solutions {len(refs)})")
    if len(fin_pool) < 24 or len(loop_pool) < 24:
        sys.exit(f"pools too small (loop={len(loop_pool)} fin={len(fin_pool)}) — "
                 "escape-rate too low even at cap 4096; raise P3 pool, do not proceed")

    rng = random.Random(SEED + 1)
    rng.shuffle(loop_pool)
    rng.shuffle(fin_pool)
    fit_items = ([(r, "loop", "fit") for r in loop_pool[:FIT_N]]
                 + [(r, "fin", "fit") for r in fin_pool[:FIT_N]])
    val_items = ([(r, "loop", "val") for r in loop_pool[FIT_N:FIT_N + 48]]
                 + [(r, "fin", "val") for r in fin_pool[FIT_N:FIT_N + 24]])
    n_ref_fit = sum(1 for x in fit_items if x[0].get("pred") == "ref")
    n_ref_val = sum(1 for x in val_items if x[0].get("pred") == "ref")
    print(f"fit texts: {sum(1 for x in fit_items if x[1] == 'loop')} loop + "
          f"{sum(1 for x in fit_items if x[1] == 'fin')} fin ({n_ref_fit} ref);  "
          f"val texts: {sum(1 for x in val_items if x[1] == 'loop')} loop + "
          f"{sum(1 for x in val_items if x[1] == 'fin')} fin ({n_ref_val} ref)")

    import mlx.core as mx
    mx.set_default_device(mx.cpu)
    from mlx_lm import load
    model, tok = load(MLX_DIR)
    old_layers = C.CAPTURE_LAYERS
    C.CAPTURE_LAYERS = FA_LAYERS
    stash = C._install_capture(model)

    # ---- Pass P4: fit d on the fit corpus
    fit = {b: Bucket() for b in ("loop", "fin")}
    t0 = time.time()
    tf_read(model, tok, fit_items, fit, None)
    dt4 = time.time() - t0
    d, ACT, GAP = [], [], []
    for L in FA_LAYERS:
        cl, cf = fit["loop"], fit["fin"]
        if cl.cnt[L] < 64 or cf.cnt[L] < 64:
            raise RuntimeError(f"layer {L}: token-starved bucket (loop={cl.cnt[L]} "
                             f"fin={cf.cnt[L]})")
        raw = cl.sum_o[L] / cl.cnt[L] - cf.sum_o[L] / cf.cnt[L]
        GAP.append(float(np.linalg.norm(raw)))
        d.append(raw / (np.linalg.norm(raw) + 1e-12))
        ACT.append(fit["loop"].sum_act[L] / max(fit["loop"].cnt[L], 1))
    d_np = np.stack(d).astype(np.float32)
    log_pass(4, f"teacher-forced read x{len(fit_items)} texts @FA layers (fit d)",
             len(fit_items),
             "loop direction outside the FA-layer MLP write paths would show as "
             "gap_norm ~0 on every layer",
             {"gap_norm": [round(g, 4) for g in GAP],
              "t_hours": round(dt4 / 3600, 3)})
    print("P4 gap_norm:", {L: round(g, 4) for L, g in zip(FA_LAYERS, GAP)})

    # ---- Pass P5: validate separation on held-out texts
    d_val = {L: d_np[i] for i, L in enumerate(FA_LAYERS)}
    val = {L: {"loop": [0.0, 0.0, 0], "fin": [0.0, 0.0, 0]} for L in FA_LAYERS}
    t0 = time.time()
    tf_read(model, tok, val_items, None, val, d_val)
    dt5 = time.time() - t0
    SEP = []
    for L in FA_LAYERS:
        ml, sl, nl = val[L]["loop"]
        mf, sf, nf = val[L]["fin"]
        if nl < 64 or nf < 64:
            SEP.append(0.0)
            continue
        mlv, mfv = ml / nl, mf / nf
        var = ((sl - nl * mlv ** 2) + (sf - nf * mfv ** 2)) / max(nl + nf - 2, 1)
        SEP.append((mlv - mfv) / float(np.sqrt(var) + 1e-9))
    log_pass(5, f"teacher-forced read x{len(val_items)} texts @FA layers (held-out "
             "separation validation)", len(val_items),
             "layers whose x.d_L fails to separate loop vs finished on unseen texts "
             f"(sep<1: {[L for L, s in zip(FA_LAYERS, SEP) if abs(s) < 1]})",
             {"sep": [round(s, 2) for s in SEP], "t_hours": round(dt5 / 3600, 3)})
    print("P5 held-out sep:", {L: round(s, 2) for L, s in zip(FA_LAYERS, SEP)})
    order = np.argsort(-np.abs(SEP))
    chosen = [FA_LAYERS[int(i)] for i in order[:2] if abs(SEP[int(i)]) >= 1.0]
    if not chosen:
        sys.exit("no layer separates (|sep|>=1) on held-out texts — search yields no "
                 "edit direction; report honestly")
    print("chosen layers:", chosen)

    np.savez(OUT, d=d_np, mean_abs_act=np.stack(ACT).astype(np.float32),
             gap_norm=np.array(GAP, np.float32), sep=np.array(SEP, np.float32),
             chosen_layers=np.array(chosen), fa_layers=np.array(FA_LAYERS),
             loop_fit=fit["loop"].texts, fin_fit=fit["fin"].texts,
             n_ref_fit=n_ref_fit, n_ref_val=n_ref_val, n_model_fin=n_model_fin)
    print("wrote", OUT, " (budget: 5 of 20 passes used)")
