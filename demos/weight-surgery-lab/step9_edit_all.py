"""Edit v2 (#1506): remove the PER-LAYER loop directions from step8 over the
layer set that the all-layer scan actually ranks highest (no 15/19 prior —
Jon's steer). Same ablation math as step4: w_j -= alpha * d_L * (d_L . w_j)
on the top-K columns by |d_L . w_j| of each chosen layer's down_proj.

usage: step9_edit_all.py <alpha> <topk> <outdir> [layers]
  layers = comma list, default = top-2 layers by t from results/directions_all.npz
Writes edited model dir + edit_report.json; prints GGUF convert command."""
import json, os, shutil, subprocess, sys
import numpy as np
from safetensors.torch import load_file, save_file

LAB = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(LAB, "base")

def main():
    alpha = float(sys.argv[1]); topk = int(sys.argv[2]); outdir = sys.argv[3]
    z = np.load(os.path.join(LAB, "results/directions_all.npz"))
    d = z["d"].astype(np.float32)          # [24,1024]
    t = z["t"].astype(np.float32)
    if len(sys.argv) > 4:
        layers = [int(x) for x in sys.argv[4].split(",")]
    else:
        layers = [int(L) for L in np.argsort(-t)[:2]]
    print("edit layers:", layers, "alphas t:", [round(float(t[L]), 4) for L in layers])
    src = os.path.join(BASE, "model.safetensors-00001-of-00001.safetensors")
    sd = load_file(src)
    total_changed = 0
    report = {"alpha": alpha, "topk": topk, "method":
              "w_j -= alpha * d_L * (d_L.w_j), top-K columns by |d_L.w_j|, "
              "d_L per layer from all-layer loop-vs-finished contrast (step8)",
              "layers": {}}
    import torch
    for L in layers:
        dl = d[L]
        key = f"model.language_model.layers.{L}.mlp.down_proj.weight"
        W = sd[key]
        Wf = W.float().numpy()                     # [1024, 3584]
        proj = dl @ Wf
        cols = np.argsort(-np.abs(proj))[:topk]
        before = Wf[:, cols].copy()
        Wf[:, cols] -= alpha * np.outer(dl, proj[cols])
        report["layers"][L] = dict(
            t_score=round(float(t[L]), 4),
            cols=[int(c) for c in cols],
            proj_top=[round(float(x), 4) for x in proj[cols]],
            norm_removed=round(float(np.linalg.norm(Wf[:, cols] - before)), 4),
            frac_of_layer=round(topk / Wf.shape[1], 4))
        total_changed += topk * Wf.shape[0]
        sd[key] = torch.tensor(Wf, dtype=W.dtype)
        print(f"layer {L}: removed norm {report['layers'][L]['norm_removed']}")
    os.makedirs(outdir, exist_ok=True)
    save_file(sd, os.path.join(outdir, os.path.basename(src)), metadata={"format": "pt"})
    shutil.copy(os.path.join(BASE, "model.safetensors.index.json"), outdir)
    for f in ("config.json", "tokenizer.json", "tokenizer_config.json",
              "vocab.json", "merges.txt", "chat_template.jinja"):
        shutil.copy(os.path.join(BASE, f), outdir)
    report["weights_changed"] = total_changed
    report["weights_total"] = 752393024
    report["pct_changed"] = round(100 * total_changed / 752393024, 4)
    json.dump(report, open(os.path.join(outdir, "edit_report.json"), "w"), indent=1)
    print("wrote", outdir, f"({report['pct_changed']}% of weights)")
    print("CONVERT: cd ~/Dev/llama.cpp && tvenv python convert_hf_to_gguf.py "
          f"-m {outdir} --outfile <name>.gguf --outtype f16")

if __name__ == "__main__":
    main()
