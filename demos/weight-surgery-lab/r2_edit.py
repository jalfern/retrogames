"""r2 step-3 own edit (#1533): remove OUR OWN loop directions (round-2 npz) from
top-K down_proj columns — the Astra-style ablation, ours end to end.

Runs ONLY after step1_gate.json passes (issue rule). MIT's edit tensors are NEVER a
source (their manifest FACTS are compared to, never read as numbers): d vectors come
from results/r2/r2_directions.npz (pass G1+R1 only). The st_numpy module is imported
for torch-free safetensors/bf16 I/O only — the same helper apply_edit.py uses, no
tensor content from MIT.

recipe (same algebra as round-1 step9_edit_all, new direction source):
  per chosen layer L:  proj = d_L @ W_down ; top-K cols by |proj|
                       W_down[:, cols] -= alpha * outer(d_L, proj[cols])
  alpha = 1.0 default -> the d-component is removed outright (no extra scaling knob
  beyond alpha itself; K default 128 mirrors MIT p50c's 128 columns for fairness).
Layers default = top-2 FA layers by gap_norm (layer strength from R1).

usage: python r2_edit.py <alpha> <topk> <outdir> [layers]
then:  python r2_convert.py <outdir> ~/models/weightlab/qwen35-own
and:   register via POST /admin/api/reload (see README), score once with
       r2_score.py own:qwen35-own

Self-check: R2_EDIT_UNICHECK=1 runs the pure edit_model() on synthetic tensors.
"""
import json
import os
import shutil
import sys

import numpy as np

LAB = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(LAB, "base")
NPZ = os.path.join(LAB, "results/r2/r2_directions.npz")
sys.path.insert(0, os.path.expanduser("~/Dev/weight-lab/mit-exp8/exp8_math/code"))
import st_numpy as S  # noqa: E402  (torch-free safetensors I/O; no MIT tensors read)

DOWN = "model.language_model.layers.{L}.mlp.down_proj.weight"


def edit_model(tensors, d_by_layer, layers, alpha, topk):
    """Pure core on st_numpy shapes {name: (dtype_str, arr)}; returns (out, report)."""
    out = dict(tensors)
    report = {"alpha": alpha, "topk": topk,
              "method": "w_j -= alpha * d_L * (d_L.w_j), top-K cols by |d_L.w_j|, "
                       "per-layer d from round-2 R1 write vectors (r2_directions.npz)",
              "layers": {}}
    total_changed = 0
    for L in layers:
        dl = np.asarray(d_by_layer[L], dtype=np.float32)
        key = DOWN.format(L=L)
        if key not in tensors:
            raise KeyError(f"missing tensor {key}")
        dt, bits = tensors[key]
        Wf = S.bf16_to_f32(bits).astype(np.float32)     # [hidden, inter]
        proj = dl @ Wf
        cols = np.argsort(-np.abs(proj))[:topk]
        before = Wf[:, cols].copy()
        Wf[:, cols] -= alpha * np.outer(dl, proj[cols])
        report["layers"][L] = dict(
            cols=[int(c) for c in cols],
            proj_top=[round(float(x), 4) for x in proj[cols]],
            norm_removed=round(float(np.linalg.norm(Wf[:, cols] - before)), 4),
            frac_of_layer=round(topk / Wf.shape[1], 4))
        out[key] = (dt, S.bf16_bits(Wf.astype(np.float32)))
        total_changed += topk * Wf.shape[0]
    report["weights_changed"] = total_changed
    return out, report


def unicheck():
    rng = np.random.default_rng(1533)
    layers = [1, 0]
    d = {L: (lambda v: v / np.linalg.norm(v))(rng.standard_normal(8).astype(np.float32))
         for L in layers}
    tensors = {DOWN.format(L=L): ("BF16", S.bf16_bits(rng.standard_normal((8, 6)).astype(np.float32)))
               for L in layers}
    keep = ("model.language_model.layers.0.mlp.gate_proj.weight",
            "model.language_model.layers.5.ml.down_proj.weight")
    for k in keep:
        tensors[k] = ("BF16", S.bf16_bits(np.ones((4, 8), np.float32)))
    out, rep = edit_model(tensors, d, layers, 1.0, 3)
    for L in layers:
        W = S.bf16_to_f32(out[DOWN.format(L=L)][1])
        proj = d[L] @ W
        cols = rep["layers"][L]["cols"]
        assert len(cols) == 3 and len(set(cols)) == 3
        assert all(abs(proj[c]) < 2e-2 for c in cols), f"alpha=1 must remove d-projection (L{L})"
    for k in keep:
        assert np.array_equal(out[k][1], tensors[k][1]), f"{k} must be untouched"
    print("unicheck ok:", {L: rep["layers"][L]["norm_removed"] for L in layers})


def main():
    if os.environ.get("R2_EDIT_UNICHECK") == "1":
        unicheck()
        return
    gate_path = os.path.join(LAB, "results/r2/step1_gate.json")
    gate = json.load(open(gate_path))
    if not gate.get("pass"):
        sys.exit("step-1 gate did NOT pass — own edit is forbidden (issue rule #1533)")
    alpha = float(sys.argv[1]); topk = int(sys.argv[2]); outdir = sys.argv[3]
    z = np.load(NPZ)
    d_all = z["d"].astype(np.float32)
    fa = [int(x) for x in z["fa_layers"]]
    gap = z["gap_norm"].astype(np.float32)
    if len(sys.argv) > 4:
        layers = [int(x) for x in sys.argv[4].split(",")]
    else:
        layers = [fa[i] for i in np.argsort(-gap)[:2]]
    print("own-edit layers:", layers,
          "gap:", [round(float(gap[fa.index(L)]), 4) for L in layers])
    src = os.path.join(BASE, "model.safetensors-00001-of-00001.safetensors")
    tensors = S.load(src)
    d_by_layer = {L: d_all[fa.index(L)] for L in layers}
    out, report = edit_model(tensors, d_by_layer, layers, alpha, topk)
    report["source"] = "own R1 write vectors; MIT edit tensors never read as a source"
    os.makedirs(outdir, exist_ok=True)
    S.save(os.path.join(outdir, os.path.basename(src)), out, metadata={"format": "pt"})
    for f in ("config.json", "tokenizer.json", "tokenizer_config.json",
              "vocab.json", "merges.txt", "chat_template.jinja",
              "model.safetensors.index.json", "README.md"):
        p = os.path.join(BASE, f)
        if os.path.exists(p):
            shutil.copy(p, outdir)
    json.dump(report, open(os.path.join(outdir, "edit_report.json"), "w"), indent=1)
    import time
    with open(os.path.join(LAB, "batches.jsonl"), "a") as f:
        f.write(json.dumps({
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "run": "r2 (#1533)", "phase": "own-edit", "n": topk * len(layers),
            "purpose": f"own edit apply: alpha={alpha} topk={topk} layers={layers} "
                      "from own R1 directions (step-3)",
            "ruled_out": "nothing yet — scoring follows (r2_score own:qwen35-own)",
        }) + "\n")
    print("wrote", outdir)
    print("NEXT: python r2_convert.py", outdir, "~/models/weightlab/qwen35-own",
          "&& POST /admin/api/reload && r2_score.py own:qwen35-own")


if __name__ == "__main__":
    main()
