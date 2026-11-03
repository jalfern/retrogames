"""WEIGHT SURGERY II (#1505) step 1b: LOOSE repeat-onset refinement.

Strict periodic detection (step8: fixed period >=4 sustained >=64 tokens) found
NO onsets in the cap-4096 corpus — the base model's non-termination at 4k is
semantically repetitive rambling, not a fixed-period attractor. This step asks:
where does n-gram *reuse* (the lab's own loop metric) begin?

  loose onset = first position whose trailing 256-gram window exceeds 50%
                repeated 16-grams (same grammar as common.loop_score)
  strict v2   = fixed-period detector relaxed to period <=1024, sustain >=32

If any looping text gains an onset, recompute d per FA layer using the real
pre/during split (re-prefill, no new generation batch) -> v2_directions_b.npz.
"""
import json
import numpy as np
import common as C

FA = (3, 7, 11, 15, 19, 23)
CAP = 4096

def loose_onset(toks):
    W, WIN, THRESH = 16, 256, 0.5
    seen, dup = {}, []
    for i in range(W, len(toks)):
        g = tuple(toks[i - W:i])
        prev = seen.get(g)
        dup.append(1 if prev is not None and prev < i - W else 0)
        seen.setdefault(g, i)
    for i in range(len(dup)):
        lo = max(0, i - WIN)
        seg = dup[lo:i + 1]
        if len(seg) >= 64 and sum(seg) / len(seg) > THRESH:
            return i + W
    return None

def strict_onset(toks, SUST=32, PMAX=1024):
    n = len(toks)
    for i in range(32, n - SUST):
        for p in range(4, min(PMAX, i) + 1):
            j = i - p
            if toks[i] != toks[j]:
                continue
            if toks[i:i + SUST] == toks[j:j + SUST]:
                return i
    return None

def main():
    data = json.load(open(f"{C.RESULTS}/v2_loop_texts.json"))
    loop_recs, end_recs = data["loop"], data["end"]
    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained(C.BASE)
    found = 0
    for rec in loop_recs:
        ids = tok.encode(rec["text"], add_special_tokens=False)
        rec["loose_onset"] = loose_onset(ids)
        rec["strict_onset2"] = strict_onset(ids)
        if rec["loose_onset"] is not None or rec["strict_onset2"] is not None:
            found += 1
        print("loop:", rec["loose_onset"], rec["strict_onset2"])
    json.dump(data, open(f"{C.RESULTS}/v2_loop_texts.json", "w"))
    print(f"onsets gained: {found}/{len(loop_recs)}")
    if found == 0:
        C.log_batch(dict(phase="capture-v2b", split="train(cached cap4096)", batch=0,
                         cap=CAP, pp=0, purpose="loose-onset refinement on cached corpus: n-gram-reuse onset + relaxed periodic detector",
                         ruled_out="any fixed or windowed loop-onset exists below 4k horizon — non-termination at <=4k is verbose rambling, not a localizable attractor; d stays the half-split contrast"))
        return

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
                o = mx.contiguous(self.inner(x))
                mx.eval(o)
                stash[self.L].append(o)
                return o
            def __getattr__(self, k):
                return getattr(self.inner, k)
            @property
            def parameters(self):
                return self.inner.parameters
        layer.mlp = Wrap(orig)

    pre_rows, dur_rows = {L: [] for L in FA}, {L: [] for L in FA}
    for rec in loop_recs + end_recs:
        prompt = mtok.apply_chat_template([{"role": "user", "content": rec["problem"].strip()}],
                                         add_generation_prompt=True)
        gen = tok.encode(rec["text"], add_special_tokens=False)[:CAP]
        full = prompt + gen
        for L in FA:
            stash[L].clear()
        mx.eval(model(mx.array([full])))
        s = len(prompt)
        on = rec.get("loose_onset") or rec.get("strict_onset2")
        for L in FA:
            w = np.array(stash[L][0][0][s:].astype(mx.float32))
            if len(w) < 48:
                continue
            if on is not None:
                o = min(max(on, 32), len(w) - 16)
                pre_rows[L].append(w[:o][32:])
                dur_rows[L].append(w[o:])
            else:
                end_rows = pre_rows[L]
                end_rows.append(w[:-1])
    d_layers, stats = [], {}
    for L in FA:
        D = np.concatenate(dur_rows[L]) if dur_rows[L] else np.zeros((1, 1024), np.float32)
        P = np.concatenate(pre_rows[L]) if pre_rows[L] else np.zeros((1, 1024), np.float32)
        d = D.mean(0) - P.mean(0)
        nrm = float(np.linalg.norm(d))
        d_layers.append(d / nrm if nrm > 0 else d)
        stats[L] = dict(dur=int(D.shape[0]), pre=int(P.shape[0]), norm=round(nrm, 4))
    dl = np.stack(d_layers)
    d_shared = dl.mean(0)
    d_shared /= np.linalg.norm(d_shared)
    np.savez(f"{C.RESULTS}/v2_directions_b.npz", d_shared=d_shared, d_layers=dl,
             layers=np.array(FA), stats=json.dumps(stats))
    C.log_batch(dict(phase="capture-v2b", split="train(cached cap4096)", batch=12,
                     cap=CAP, pp=0, purpose=f"recompute d with real loose/strict onsets ({found}/{len(loop_recs)} looping texts gained onset)",
                     ruled_out="onset-contrast d differs materially from half-split d (compare norms in v2_directions_b stats vs v2_directions)"))
    print("wrote v2_directions_b.npz", stats)

if __name__ == "__main__":
    main()
