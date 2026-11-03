"""WEIGHT SURGERY II (#1505) step 1: LONGER-HORIZON capture with REPEAT-ONSET d.

Generate 12 train problems at cap 4096 (penalty-free baseline sampling, seed 23
— deliberately different from slot-a/#1506's seed 11 so corpora don't collide).
For each looping generation, find the token position where SUSTAINED n-gram
repetition starts (the onset of the loop attractor), then MLX-prefill the text
and capture the MLP residual write at all six full-attention layers
{3,7,11,15,19,23} (full_attention_interval=4, from config.json).

d per layer = mean(write | during-loop) - mean(write | pre-loop).
Also stores the old sequence-mean d for the comparison row.
Writes results/v2_directions.npz + results/v2_loop_texts.json. ONE gen batch.
New file only — never mutates the shared #1493 scripts (slot-a collision rule).
"""
import json, random, sys
import numpy as np
import common as C, llm

GGUF = "q35-f16.gguf"
SEED = "23"
CAP = 4096
FA = (3, 7, 11, 15, 19, 23)

def pick_probs():
    probs = C.load_problems()
    rng = random.Random(23)
    gsm = rng.sample(probs["gsm_train"], 6)
    easy = [p for p in probs["math_train"] if str(p.get("level")) in ("1", "2", "Level 1", "Level 2")]
    if len(easy) < 6:
        easy = probs["math_train"]
    math = rng.sample(easy, 6)
    return gsm + math

def repeat_onset(toks):
    """Earliest position i where the token run matches an earlier run with a
    fixed period p sustained for >= SUST tokens. Returns (i, p) or None."""
    SUST, PMAX = 64, 256
    n = len(toks)
    for i in range(32, n - SUST):
        for p in range(4, PMAX):
            j = i - p
            if j < 0:
                break
            if toks[i] != toks[j]:
                continue
            if toks[i:i + SUST] == toks[j:j + SUST]:
                return i, p
    return None

def main():
    probs = pick_probs()
    extra = ["-c", str(CAP + 512), "--presence-penalty", "0"]
    print(f"gen batch: {len(probs)} problems @ cap {CAP}, pp0, seed {SEED}")
    rows, tps = llm.gen_batch(GGUF, probs, cap=CAP, nproc=12, extra=extra, seed=SEED)
    for r, p in zip(rows, probs):
        r.update(problem=p["problem"], gold=p["gold"], tag=p["tag"],
                 **llm.loop_score_text(r["text"]))
    hit = sum(r["hit_cap"] for r in rows)
    print(f"cap-hits {hit}/{len(rows)} tps {tps}")

    # token-level onset detection using the HF tokenizer (approx positions ok)
    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained(C.BASE)
    loop_recs, end_recs = [], []
    for r in rows:
        ids = tok.encode(r["text"], add_special_tokens=False)
        on = repeat_onset(ids)
        r["onset_tok"], r["onset_period"] = (on if on else (None, None))
        (loop_recs if r["hit_cap"] else end_recs).append(r)
    print(f"looping {len(loop_recs)}, terminated {len(end_recs)}; "
          f"onsets: {[r['onset_tok'] for r in loop_recs]}")
    json.dump(dict(loop=loop_recs, end=end_recs, cap=CAP, seed=SEED),
             open(f"{C.RESULTS}/v2_loop_texts.json", "w"))

    # ---- MLX capture at FA layers, prefill-only, per-record pre/during split ----
    import mlx.core as mx
    mx.set_default_device(mx.cpu)
    model, mtok = C.load_model()

    stash = {L: [] for L in FA}
    for L in FA:
        layer = model.model.layers[L]
        orig = layer.mlp
        class Wrap:
            def __init__(self, inner, L=L):
                self.inner, self.L = inner, L
            def __call__(self, x):
                out = self.inner(x)
                o = mx.contiguous(out)
                mx.eval(o)
                stash[self.L].append(o)
                return out
            def __getattr__(self, k):
                return getattr(self.inner, k)
            @property
            def parameters(self):
                return self.inner.parameters
        layer.mlp = Wrap(orig)

    pre_rows = {L: [] for L in FA}   # generation tokens BEFORE the loop
    dur_rows = {L: [] for L in FA}   # generation tokens DURING the loop
    end_rows = {L: [] for L in FA}   # terminated generations (whole body)
    n_pass = 0
    for rec in loop_recs + end_recs:
        prompt = mtok.apply_chat_template([{"role": "user", "content": rec["problem"].strip()}],
                                         add_generation_prompt=True)
        gen = tok.encode(rec["text"], add_special_tokens=False)[:CAP]
        full = prompt + gen
        for L in FA:
            stash[L].clear()
        out = model(mx.array([full]))
        mx.eval(out)
        n_pass += 1
        s = len(prompt)
        onset = rec["onset_tok"]
        # MLX prefill writes cover the whole prefill; align rows to generation
        for L in FA:
            w = np.array(stash[L][0][0][s:].astype(mx.float32))
            if len(w) < 32:
                continue
            if rec in loop_recs and onset is not None:
                o = min(max(onset, 32), len(w) - 16)
                pre_rows[L].append(w[:o][32:])
                dur_rows[L].append(w[o:])
            elif rec in loop_recs:
                # looped but no detectable strict onset: first half vs second half
                h = len(w) // 2
                pre_rows[L].append(w[:h])
                dur_rows[L].append(w[h:])
            else:
                end_rows[L].append(w[:-1] if len(w) > 2 else w)
        print(f"prefilled {'LOOP' if rec in loop_recs else 'END'} len={len(full)}")

    d_layers, stats = [], {}
    for L in FA:
        D = np.concatenate(dur_rows[L]).astype(np.float32) if dur_rows[L] else np.zeros((1, 1024), np.float32)
        P = np.concatenate(pre_rows[L] + end_rows[L]).astype(np.float32) if (pre_rows[L] or end_rows[L]) else np.zeros((1, 1024), np.float32)
        d = D.mean(0) - P.mean(0)
        nrm = np.linalg.norm(d)
        d_layers.append(d / nrm if nrm > 0 else d)
        stats[L] = dict(dur=int(D.shape[0]), pre=int(P.shape[0]), norm=round(float(nrm), 4))
        print(f"L{L}: during {D.shape[0]} pre {P.shape[0]} |d| {nrm:.4f}")

    dl = np.stack(d_layers)                       # [6,1024]
    d_shared = dl.mean(0)
    d_shared /= np.linalg.norm(d_shared)
    np.savez(f"{C.RESULTS}/v2_directions.npz", d_shared=d_shared, d_layers=dl,
             layers=np.array(FA), stats=json.dumps(stats))
    C.log_batch(dict(phase="capture-v2", split="gsm+math_train(easy)", batch=22,
                     cap=CAP, pp=0, seed=int(SEED), n=len(rows), tps=tps,
                     hit_cap=hit, onsets=[r["onset_tok"] for r in loop_recs],
                     purpose="v2 long-horizon capture: generate cap4096 pp0 + repeat-onset contrast (pre vs during loop) at all 6 FA-layer MLP writes -> per-layer d",
                     ruled_out="loop attractor reachable at 4k horizon with onset-contrast d (would be a strong projection signal in step9 evals)"))
    print("wrote results/v2_directions.npz", stats)

if __name__ == "__main__":
    main()
