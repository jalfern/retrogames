"""#1585 — export our OWN top-64 down_proj column ranking per layer (L15, L19)
from directions_all.npz (step-8 all-layer loop-vs-finished contrast) applied to
the frozen qwen35-base weights. This is the auditable source behind
edit_reports/ob_a*.json: ws3check §14 refuses any open-book edit whose columns
differ from this export ("columns from MIT's manifest" mutant).

Run with the lab venv on the CPU device (the GPU is busy with scored models,
and bf16->f32 kernel loads re-enter the Metal server):
    ./.venv/bin/python ws5_export_cols.py
out: results/r2/ws5_contrast_top64.json
"""
import json
import os

import mlx.core as mx
import numpy as np

mx.set_default_device(mx.cpu)
LAB = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.expanduser("~/models/weightlab/qwen35-base/model.safetensors")

z = np.load(f"{LAB}/results/r2/ws5_directions_all.npz")
d, t = z["d"], z["t"]
out = {}
for L in (15, 19):
    dl = d[L].astype("float32")
    dl = dl / np.linalg.norm(dl)
    W = mx.load(BASE)[f"language_model.model.layers.{L}.mlp.down_proj.weight"]
    proj = np.asarray(dl) @ np.asarray(W.astype(mx.float32))
    order = np.argsort(-np.abs(proj))[:64]
    out[str(L)] = [int(j) for j in order]
json.dump({
    "note": "top-64 down_proj columns per layer by |d_L.w_j|, d_L from "
            "directions_all.npz (step-8 all-layer contrast), base weights "
            "qwen35-base — OUR OWN measurement, MIT's manifest never read",
    "t_score": {"15": round(float(t[15]), 3), "19": round(float(t[19]), 3)},
    "layers": out,
}, open(f"{LAB}/results/r2/ws5_contrast_top64.json", "w"), indent=1)
print("wrote results/r2/ws5_contrast_top64.json",
      {k: len(v) for k, v in out.items()})
