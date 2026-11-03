"""WEIGHT SURGERY II (#1505) step 2: EDIT variants from repeat-onset directions.

Three variants, each written as a full HF dir + converted to f16 GGUF:
  A  upstream   — top-K=256 down_proj columns removed along d_L at ALL six FA
                  layers {3,7,11,15,19,23} (extends #1493's 2-layer edit to six)
  B  downstream — remove d from what READS the residual: rank-1 strip of the
                  tied embed_tokens rows (logits cannot express d) + o_proj
                  rank-1 W_o -= d(d.W_o) at the six FA layers
  C  both       — A+B combined

Uses per-layer d from results/v2_directions.npz (step8). New file only.
usage: step9_edit2.py [variant ...]   (default: A B C)
"""
import json, os, shutil, subprocess, sys
import numpy as np
import torch
from safetensors.torch import load_file, save_file

LAB = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(LAB, "base")
FA = (3, 7, 11, 15, 19, 23)
K = 256
CONVERT = "/tmp/llamacpp-src/convert_hf_to_gguf.py"
PY = os.path.join(LAB, "tvenv", "bin", "python")

def embed_key(sd):
    for k in sd:
        if "embed_tokens.weight" in k:
            return k
    raise KeyError("no embed_tokens")

def upstream(sd, d_layers, report):
    changed = 0
    for i, L in enumerate(FA):
        key = f"model.language_model.layers.{L}.mlp.down_proj.weight"
        W = sd[key].float().numpy()
        d = d_layers[i]
        proj = d @ W                                  # [3584]
        cols = np.argsort(-np.abs(proj))[:K]
        before = W[:, cols].copy()
        W[:, cols] -= np.outer(d, proj[cols])
        sd[key] = torch.tensor(W, dtype=sd[key].dtype)
        changed += K * W.shape[0]
        report["layers"][str(L)] = dict(
            op="down_proj top-K column removal", K=K,
            proj_top=[round(float(x), 4) for x in proj[cols][:6]],
            norm_removed=round(float(np.linalg.norm(W[:, cols] - before)), 4))
    return changed

def downstream(sd, d_layers, report):
    d_shared = d_layers.mean(0)
    d_shared = d_shared / np.linalg.norm(d_shared)
    ek = embed_key(sd)
    E = sd[ek].float().numpy()                     # [V,1024]
    coef = E @ d_shared                            # [V]
    E -= np.outer(coef, d_shared)                  # rows lose their d-component
    sd[ek] = torch.tensor(E, dtype=sd[ek].dtype)
    emb_removed = float(np.linalg.norm(coef))      # ||E.d|| = energy of d in vocab space
    changed = E.size
    report["embed"] = dict(op="tied embed_tokens rank-1 row strip",
                           norm_removed=round(emb_removed, 4), rows=int(E.shape[0]))
    for i, L in enumerate(FA):
        key = f"model.language_model.layers.{L}.self_attn.o_proj.weight"
        W = sd[key].float().numpy()                # [1024, 2048]
        d = d_layers[i]
        rowproj = d @ W                            # [2048] (d is in residual/output space)
        before = float(np.linalg.norm(W))
        W -= np.outer(d, rowproj)                  # attention no longer writes along d
        sd[key] = torch.tensor(W, dtype=sd[key].dtype)
        changed += W.size
        report["layers"][str(L)] = report["layers"].get(str(L), {}) | dict(
            o_proj_norm_removed=round(before - float(np.linalg.norm(W)), 4))
    return changed

def build(variant, sd, report):
    outdir = os.path.join(LAB, f"edited2_{variant}")
    os.makedirs(outdir, exist_ok=True)
    src_name = os.path.basename(glob_shard())
    save_file(sd, os.path.join(outdir, src_name), metadata={"format": "pt"})
    shutil.copy(os.path.join(BASE, "model.safetensors.index.json"), outdir)
    for f in ("config.json", "tokenizer.json", "tokenizer_config.json",
              "vocab.json", "merges.txt", "chat_template.jinja"):
        shutil.copy(os.path.join(BASE, f), outdir)
    json.dump(report, open(os.path.join(outdir, "edit_report.json"), "w"), indent=1)
    gguf = os.path.join(LAB, f"q35-v2-{variant.lower()}.gguf")
    r = subprocess.run([PY, CONVERT, outdir, "--outfile", gguf, "--outtype", "f16"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-800:])
        raise SystemExit(f"convert failed for {variant}")
    print(variant, "->", gguf, f"({report['pct_changed']}% weights)",
          report.get("embed", {}).get("norm_removed"))
    return gguf

def glob_shard():
    return os.path.join(BASE, "model.safetensors-00001-of-00001.safetensors")

def main():
    z = np.load(os.path.join(LAB, "results/v2_directions.npz"))
    d_layers = z["d_layers"].astype(np.float32)
    variants = sys.argv[1:] or ["A", "B", "C"]
    specs = dict(A=lambda sd, rep: upstream(sd, d_layers, rep),
                 B=lambda sd, rep: downstream(sd, d_layers, rep),
                 C=lambda sd, rep: upstream(sd, d_layers, rep) + downstream(sd, d_layers, rep))
    total = sum(t.numel() for t in load_file(glob_shard()).values())
    for v in variants:
        sd = load_file(glob_shard())
        report = dict(variant=v, method={"A": f"down_proj top-{K} x 6 FA layers, repeat-onset d",
                                        "B": "embed rank-1 + o_proj rank-1 x 6 FA layers",
                                        "C": "A+B"}[v],
                      layers={})
        changed = specs[v](sd, report)
        report["weights_changed"] = int(changed)
        report["weights_total"] = int(total)
        report["pct_changed"] = round(100 * changed / total, 4)
        build(v, sd, report)

if __name__ == "__main__":
    main()
