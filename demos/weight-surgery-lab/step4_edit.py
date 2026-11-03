"""WEIGHT SURGERY edit: remove the localized loop direction d from the top-K
down_proj columns of layers 15 & 19 in the pinned safetensors. No gradients —
pure linear-algebra edit of read values (representation ablation).

usage: step4_edit.py <alpha> <topk> <outdir>   (e.g. 1.0 64 edited_a1_k64)
Writes a full model dir (edited shard + copied configs) ready for GGUF convert.
"""
import json, os, shutil, sys
import numpy as np
from safetensors.torch import load_file, save_file

LAB = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(LAB, "base")

def main():
    alpha = float(sys.argv[1]); topk = int(sys.argv[2]); outdir = sys.argv[3]
    z = np.load(os.path.join(LAB, "results/directions.npz"))
    d = z["d"].astype(np.float32)
    mean_act = z["mean_abs_act"].astype(np.float32)
    src = os.path.join(BASE, "model.safetensors-00001-of-00001.safetensors")
    sd = load_file(src)
    total_changed = 0
    report = {"alpha": alpha, "topk": topk, "layers": {}}
    import torch
    for L in (15, 19):
        key = f"model.language_model.layers.{L}.mlp.down_proj.weight"
        W = sd[key]
        Wf = W.float().numpy()                     # [1024, 3584]
        proj = d @ Wf                             # [3584] alignment of each column with d
        score = np.abs(proj) * mean_act           # contribution of neuron j to direction d
        cols = np.argsort(-score)[:topk]
        before = Wf[:, cols].copy()
        Wf[:, cols] -= alpha * np.outer(d, proj[cols])
        after_norm_change = float(np.linalg.norm(Wf[:, cols] - before))
        sd[key] = __import__("torch").tensor(Wf, dtype=W.dtype)
        total_changed += topk * Wf.shape[0]
        report["layers"][L] = dict(
            cols=[int(c) for c in cols],
            proj_top=[round(float(x), 4) for x in proj[cols]],
            norm_removed=round(after_norm_change, 4),
            frac_of_layer=round(topk / Wf.shape[1], 4))
        print(f"layer {L}: top col alphas {report['layers'][L]['proj_top'][:8]} "
              f"|d-removed norm {after_norm_change:.3f}")
    os.makedirs(outdir, exist_ok=True)
    fname = os.path.basename(src)
    save_file(sd, os.path.join(outdir, fname), metadata={"format": "pt"})
    shutil.copy(os.path.join(BASE, "model.safetensors.index.json"), outdir)
    for f in ("config.json", "tokenizer.json", "tokenizer_config.json",
              "vocab.json", "merges.txt", "chat_template.jinja"):
        shutil.copy(os.path.join(BASE, f), outdir)
    report["weights_changed"] = total_changed
    report["weights_total"] = 752393024
    report["pct_changed"] = round(100 * total_changed / 752393024, 4)
    json.dump(report, open(os.path.join(outdir, "edit_report.json"), "w"), indent=1)
    print("wrote", outdir, f"({report['pct_changed']}% of weights)")

if __name__ == "__main__":
    main()
