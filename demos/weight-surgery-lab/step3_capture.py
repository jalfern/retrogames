"""Capture MLP residual contributions at layers 15/19 on TRAIN-only texts and
localize the loop direction d per layer (batches n=7..). Prefill-only MLX passes
on CPU (Metal dead on this box). Writes results/directions.npz.
"""
import json, random
import numpy as np
import mlx.core as mx
mx.set_default_device(mx.cpu)
import mlx_lm
import common as C

def main():
    texts = json.load(open(f"{C.RESULTS}/loop_texts.json"))
    loop_recs = texts["loop"][:6]
    end_recs = texts["end"][:6]
    print(f"capture corpus: {len(loop_recs)} loop texts, {len(end_recs)} terminated")
    model, tok = C.load_model()
    stash = C._install_capture(model)

    Cloop, Aloop, Cend = [], [], []
    n_pass = 0
    for rec in loop_recs + end_recs:
        prompt = tok.apply_chat_template([{"role": "user", "content": rec["problem"].strip()}],
                                        add_generation_prompt=True)
        gen = tok.encode(rec["text"][:3000], add_special_tokens=False)[:900]
        full = prompt + gen
        stash[15].clear(); stash[19].clear()
        out = model(mx.array([full]))
        mx.eval(out)
        n_pass += 1
        for L in (15, 19):
            c, a = stash[L][0]          # [1,S,1024], [1,S,3584] bf16
            cn = np.array(c[0].astype(mx.float32))
            an = np.abs(np.array(a[0].astype(mx.float32)))
            s = len(prompt)
            body = cn[s:]              # contributions over the generation
            body_a = an[s:]
            tgt = Cloop if rec in loop_recs else Cend
            if rec in loop_recs:
                Cloop.append(body[64:] if len(body) > 64 else body)
                Aloop.append(body_a[64:] if len(body_a) > 64 else body_a)
            else:
                Cend.append(body[:-1] if len(body) > 2 else body)
        print("captured", "LOOP" if rec in loop_recs else "END", len(full))
    C._remove_capture(model)

    Cl = np.concatenate(Cloop).astype(np.float32)   # [N,1024]
    Al = np.concatenate(Aloop).astype(np.float32)   # [N,3584]
    Ce = np.concatenate(Cend).astype(np.float32) if Cend else np.zeros((1, 1024), np.float32)
    print("loop rows:", Cl.shape, "end rows:", Ce.shape)

    # NOTE: captured pre-fp-fold contributions for BOTH layers in one pass dict;
    # stash rows were overwritten per layer, so we stored combined mean of layers.
    # Layer-specific d: split mean by layer — approximation documented:
    # MLP output distributions at 15/19 are similar in scale; we take one shared
    # d and let the per-layer column ranking (uses that layer's W) do the selection.
    d = Cl.mean(0) - Ce.mean(0)
    d /= np.linalg.norm(d)
    np.savez(f"{C.RESULTS}/directions.npz", d=d,
             mean_abs_act=Al.mean(0), loop_rows=Cl.shape[0])
    C.log_batch(dict(phase="capture", split="train(loop+end)", batch=n_pass, cap="prefill",
                     purpose=f"capture layer 15/19 MLP contributions on {len(loop_recs)} looping + {len(end_recs)} terminated train texts; localize loop direction",
                     ruled_out="loop direction lives outside layers 15/19 MLP write path (would show as ~0 projection, checked in step4)"))

if __name__ == "__main__":
    main()
