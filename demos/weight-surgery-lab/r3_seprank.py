"""#1567 candidate 3 — how many layers should the own edit carry?

P5 (#1562) ranked the six FA layers by held-out text-level separation of the
per-layer token score s_L = x.d_L and the edit took the TOP-2 ({15,7}); every
layer except L23 cleared |sep| >= 1, so more than two layers carry signal.
This script answers the issue's question — "test top-4 layers vs top-2 on
held-out separation before committing scoring passes" — with ONE teacher-forced
read pass (declared P6, budget 6 of 20) over the SAME P5 validation texts
(same seeds, same pools, same tail hygiene):

  * per-layer sep recomputed from raw projections must reproduce the npz values
    (plumbing gate — proves this read sees exactly what P5 saw);
  * combined separation for layer sets S: standardize each s_L on POOLED val
    stats only (no bucket info in the normalizer — label-leak free), sum over S,
    sep_S = (mean_loop - mean_fin) / pooled_sd of the combined score.
    Cross-layer covariance comes from accumulated cross-products, so the combined
    sep is measured, not assumed (independence would predict sqrt-sum growth).

DECISION RULE (frozen before the read): commit scoring passes to a 4-layer edit
only if sep_top4 >= 1.10 x sep_top2; otherwise the layer budget stays 2 and the
alpha-scaling sweep (#1567 candidate 2) is the only scaling lever this round.

usage: .venv/bin/python r3_seprank.py   (MLX CPU, #737 sandbox)
out:   results/r2/r3_layer_rank.json + batches.jsonl pass record
"""
import itertools
import json
import os
import time

import numpy as np

import common as C
import r2_common as R
import r2_directions_1562 as D

FA = D.FA_LAYERS
OUT = f"{R.RESULTS}/r3_layer_rank.json"
NPZ = f"{R.RESULTS}/r2_directions_1562.npz"

# sets to compare: top-2 = the shipped own edit; top-4 = the issue's candidate;
# top-3 and all-6 for the curve. Ranked by the P5 sep stored in the npz.
z = np.load(NPZ)
SEP_NPZ = {int(L): float(s) for L, s in zip(z["fa_layers"], z["sep"])}
ORDER = [L for _, L in sorted(((abs(SEP_NPZ[L]), L) for L in FA), reverse=True)]
SETS = {"top2": ORDER[:2], "top3": ORDER[:3], "top4": ORDER[:4], "all6": list(ORDER)}


def val_corpus():
    """Rebuild the EXACT P5 validation items (resume path, R2_SKIP_GEN pattern)."""
    recs = {}
    for tag in ("8k_a", "8k_b", "4k"):
        recs[tag] = [json.loads(l) for l in open(f"{R.RESULTS}/p1562_gen_{tag}.jsonl")]
    loop_pool, fin_pool = [], []
    for tag in ("8k_a", "8k_b"):
        for r in recs[tag]:
            r["_pool"] = tag
            if not r["finished"]:
                loop_pool.append(r)
            elif r["pred"]:
                fin_pool.append(r)
    for r in recs["4k"]:
        r["_pool"] = "4k"
        if r["finished"] and r["pred"]:
            fin_pool.append(r)
        elif not r["finished"]:
            loop_pool.append(r)
    fin_pool = fin_pool + D.make_refs()
    import random
    rng = random.Random(D.SEED + 1)
    rng.shuffle(loop_pool)
    rng.shuffle(fin_pool)
    items = ([(r, "loop") for r in loop_pool[D.FIT_N:D.FIT_N + 48]]
             + [(r, "fin") for r in fin_pool[D.FIT_FIN:D.FIT_FIN + 24]])
    return items


class Moments:
    """Per-bucket sums / sumsq / cross-products for the six standardized scores."""

    def __init__(self):
        self.n = 0
        self.s = {L: 0.0 for L in FA}
        self.q = {L: 0.0 for L in FA}
        self.x = {(L, M): 0.0 for L, M in itertools.combinations(FA, 2)}


def main():
    import mlx.core as mx
    mx.set_default_device(mx.cpu)
    from mlx_lm import load
    model, tok = load(D.MLX_DIR)
    C.CAPTURE_LAYERS = FA
    stash = C._install_capture(model)
    d_all = z["d"].astype(np.float32)
    d_by = {L: d_all[list(z["fa_layers"]).index(L)] for L in FA}

    items = val_corpus()
    print(f"val texts: {sum(1 for _, b in items if b == 'loop')} loop + "
          f"{sum(1 for _, b in items if b == 'fin')} fin")
    raw = {b: Moments() for b in ("loop", "fin")}
    per_text = []
    t0 = time.time()
    pbs = D.practice_batches()
    probs_by_pool = {"8k_a": pbs[0], "8k_b": pbs[1], "4k": pbs[2]}
    skipped = 0
    for rec, bucket in items:
        q = rec.get("q") or probs_by_pool[rec["_pool"]][rec["i"]][1]
        p_ids = tok.apply_chat_template([{"role": "user", "content": q}],
                                       add_generation_prompt=True)
        g_ids = tok.encode(rec["text"][-3000:], add_special_tokens=False)[:2048]
        tail = D.TAIL_LOOP if bucket == "loop" else D.TAIL_FIN
        if len(g_ids) - tail < 64:
            skipped += 1
            continue
        full = mx.array([p_ids + g_ids])
        for L in FA:
            stash[L].clear()
        model(full)
        mx.eval(model.parameters())
        s0 = len(p_ids)
        outs = {}
        for L in FA:
            if not stash[L]:
                raise RuntimeError(f"layer {L}: capture stash empty — hook dead")
            o, _a = stash[L][0]
            outs[L] = np.array(o[0].astype(mx.float32))[s0:len(g_ids) - tail]
        n = min(len(v) for v in outs.values())
        if n < 64:
            skipped += 1
            continue
        scores = {L: outs[L][:n] @ d_by[L] for L in FA}  # per-token s_L
        m = raw[bucket]
        m.n += n
        for L in FA:
            m.s[L] += float(scores[L].sum())
            m.q[L] += float((scores[L] ** 2).sum())
        for L, M in itertools.combinations(FA, 2):
            m.x[(L, M)] += float((scores[L] * scores[M]).sum())
        per_text.append({"bucket": bucket,
                        **{f"s{L}": [round(float(v), 2) for v in scores[L]] for L in FA}})
        if len(per_text) % 12 == 0:
            print(f"  read {len(per_text)}/{len(items)} texts "
                  f"({(time.time() - t0) / 60:.1f} min)")
    dt = time.time() - t0

    # pooled (over BOTH val buckets) mean/sd per layer — the only normalizer used
    n_all = raw["loop"].n + raw["fin"].n
    mu = {L: (raw["loop"].s[L] + raw["fin"].s[L]) / n_all for L in FA}
    var = {L: max((raw["loop"].q[L] + raw["fin"].q[L]) / n_all - mu[L] ** 2, 1e-12)
           for L in FA}
    sd = {L: float(np.sqrt(var[L])) for L in FA}

    # combined separation for a layer set S on standardized scores
    # z_L = (s_L - mu_L)/sd_L;  E[z_S | b] = sum_L (mean_b s_L - mu_L)/sd_L
    def combined_sep(S):
        def zm(b):
            m = raw[b]
            return sum((m.s[L] / m.n - mu[L]) / sd[L] for L in S)

        def zv(m):  # Var(z_S) inside one bucket, from accumulated moments
            v = 0.0
            for L in S:
                v += (m.q[L] / m.n - 2 * mu[L] * m.s[L] / m.n + mu[L] ** 2) / sd[L] ** 2
            for L, M in itertools.combinations(S, 2):
                key = (L, M) if (L, M) in m.x else (M, L)
                cov = m.x[key] / m.n - (m.s[L] / m.n) * (m.s[M] / m.n)
                v += 2 * cov / (sd[L] * sd[M])
            return v

        ml, mf = zm("loop"), zm("fin")
        vl, vf = zv(raw["loop"]), zv(raw["fin"])
        pooled = ((vl * raw["loop"].n + vf * raw["fin"].n)
                  / (raw["loop"].n + raw["fin"].n))
        return (ml - mf) / float(np.sqrt(max(pooled, 1e-12)))

    # per-layer reproduction of the P5 sep (z-basis identical: pooled normalization)
    layer_sep = {L: combined_sep([L]) for L in FA}
    gate_ok = all(abs(layer_sep[L] - SEP_NPZ[L]) < 0.05 for L in FA)

    seps = {name: round(combined_sep(S), 3) for name, S in SETS.items()}
    # pairwise correlations (pooled val) for the report
    corr = {}
    for L, M in itertools.combinations(FA, 2):
        cov = raw["loop"].x[(L, M)] + raw["fin"].x[(L, M)]
        cov = cov / n_all - (raw["loop"].s[L] + raw["fin"].s[L]) / n_all \
            * (raw["loop"].s[M] + raw["fin"].s[M]) / n_all
        corr[f"L{L}~L{M}"] = round(cov / (sd[L] * sd[M]), 3)

    rule = seps["top4"] >= 1.10 * seps["top2"]
    out = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "issue": 1567, "pass_no": 6,
        "n_texts": len(per_text), "n_skipped": skipped,
        "t_minutes": round(dt / 60, 1),
        "reproduces_p5_sep": gate_ok,
        "layer_sep_recomputed": {f"L{L}": round(layer_sep[L], 3) for L in FA},
        "layer_sep_p5": {f"L{L}": round(SEP_NPZ[L], 3) for L in FA},
        "layer_rank": [f"L{L}" for L in ORDER],
        "combined_sep": seps,
        "sets": {k: [f"L{x}" for x in v] for k, v in SETS.items()},
        "decision_rule": "top4 needs >= 1.10 x top2 combined sep to commit scoring passes",
        "decision": "top4" if rule else "top2",
        "corr": corr,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
    with open(C.BATCHLOG, "a") as f:
        f.write(json.dumps({
            "ts": out["ts"], "run": "r3 (#1567)", "phase": "step3", "pass_no": 6,
            "kind": f"teacher-forced read x{len(per_text)} texts @FA layers "
                   "(combined top-2 vs top-4 held-out separation)",
            "purpose": "#1567 candidate 3: does carrying 4 layers beat 2 on held-out "
                      "separation before we commit scoring passes to it",
            "ruled_out": ("layer sets between top-2 and top-4 that add no separation "
                         f"(combined sep {seps})" if gate_ok
                         else "NOTHING — sep did not reproduce P5, plumbing suspect"),
            "n": len(per_text), "t_hours": round(dt / 3600, 3),
            "combined_sep": seps, "decision": out["decision"],
        }) + "\n")
    print(json.dumps({k: out[k] for k in
                     ("reproduces_p5_sep", "layer_sep_recomputed", "combined_sep",
                      "decision")}, indent=1))
    print("wrote", OUT)
    if not gate_ok:
        raise SystemExit("gate FAILED: recomputed sep != P5 sep — do not trust the ranking")


if __name__ == "__main__":
    main()
