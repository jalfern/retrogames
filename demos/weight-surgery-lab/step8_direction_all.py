"""Jon's steps 2 + 3 (#1493 steer 08:01:53Z, resumed on #1506), using the
fair-cap sweep from step7 (results/cap_sweep.json):

2. CORPUS — with finished answers present, check whether the cap-hits actually
   REPEAT (tight loops: long exact substrings at the tail) or are just
   long-winded (progress without repetition).
3. DIRECTION — loop-vs-finished MLP-write contrast scanned over ALL 24 layers,
   per-layer (no 15/19 prior; fixes the layer-collision shortcut in
   step3_capture.py which pooled layers 15+19 rows into one shared d).

Writes results/corpus_check.json + results/directions_all.npz
(d: [24,1024] per-layer unit directions, t: separability score per layer).
Logs one capture batch line."""
import json
import numpy as np
import mlx.core as mx
mx.set_default_device(mx.cpu)
import mlx_lm
import common as C

LAYERS = list(range(24))

def longest_repeat_words(words):
    """Length (words) of the longest word substring occurring >=2 times,
    plus how far into the text the second copy ends (onset of repetition)."""
    n = len(words)
    best = 0
    best_end = 0
    # suffix-array-ish O(n^2) cap: texts here are <= ~3000 words, fine
    seen = {}
    L = 12  # anchor length in words
    if n <= L:
        return dict(sub=0, onset=None)
    for i in range(n - L):
        key = tuple(words[i:i + L])
        if key in seen:
            j = seen[key]
            ext = L
            while i + ext < n and words[j + ext - L] == words[i + ext]:
                ext += 1
            if ext > best:
                best = ext
                best_end = i + ext
        # keep the EARLIEST start for each anchor
        if key not in seen:
            seen[key] = i
    return dict(sub=best, onset=round(best_end / n, 3) if best else None)

def main():
    sweep = json.load(open(f"{C.RESULTS}/cap_sweep.json"))
    # pick the fair cap: penalty-free rows only; smallest cap with >=25% finished
    fair = None
    for key in sorted((k for k in sweep if k.endswith("_pp0.0")),
                     key=lambda k: int(k[3:].split("_")[0])):
        rows = sweep[key]
        fin = sum(1 for r in rows if not r["hit_cap"])
        if fin / max(len(rows), 1) >= 0.25:
            fair = key
            break
    if fair is None:
        # nothing finishes even at the top sweep cap -> take the largest pp0 row
        fair = max((k for k in sweep if k.endswith("_pp0.0")),
                  key=lambda k: int(k[3:].split("_")[0]))
    cap = int(fair[3:].split("_")[0])
    rows = sweep[fair]
    loop_rows = [r for r in rows if r["hit_cap"]]
    end_rows = [r for r in rows if not r["hit_cap"]]
    print(f"fair cap = {cap} ({fair}); loop/cap-hit {len(loop_rows)}, finished {len(end_rows)}")

    # --- step 2: corpus check on the cap-hits of the fair-cap run ---
    corpus = []
    for r in loop_rows:
        lr = longest_repeat_words(r["text"].split())
        corpus.append(dict(problem=r["problem"][:80], words=len(r["text"].split()),
                           longest_repeat_words=lr["sub"], repeat_onset=lr["onset"],
                           word_loop=llm_loop(r["text"])))
    json.dump(dict(fair_cap=cap, row=fair, corpus=corpus),
             open(f"{C.RESULTS}/corpus_check.json", "w"), indent=1)
    tight = sum(1 for c in corpus if c["longest_repeat_words"] >= 24)
    print(f"tight-loop cap-hits (>=24-word exact repeat): {tight}/{len(corpus)}")

    # --- step 3: per-layer contrast across ALL layers ---
    model, tok = C.load_model()
    C.CAPTURE_LAYERS = LAYERS
    stash = C._install_capture(model)

    def passes(recs, bucket, region):
        outs = []
        for rec in recs:
            prompt = tok.apply_chat_template([{"role": "user", "content": rec["problem"].strip()}],
                                            add_generation_prompt=True)
            gen = tok.encode(rec["text"], add_special_tokens=False)[:4096]
            full = prompt + gen
            for L in LAYERS:
                stash[L].clear()
            out = model(mx.array([full]))
            mx.eval(out)
            s = len(prompt)
            for L in LAYERS:
                c, _ = stash[L][0]
                cn = np.array(c[0].astype(mx.float32))
                body = cn[s:]
                if region == "tail":
                    body = body[-1024:]
                if len(body) == 0:
                    continue
                outs.append((L, body))
            print("captured", region, len(full), flush=True)
        return outs

    loop_caps = loop_rows[:6]
    end_caps = end_rows[:6]
    n_pass = len(loop_caps) + len(end_caps)
    acc = {}
    for region, recs in (("tail", loop_caps), ("all", end_caps)):
        for L, body in passes(recs, region, region):
            acc.setdefault(L, {"loop": [], "end": []})
            acc[L]["loop" if region == "tail" else "end"].append(body)

    C._remove_capture(model)
    d = np.zeros((24, 1024), np.float32)
    t = np.zeros(24, np.float32)
    for L, parts in acc.items():
        ml = np.concatenate(parts["loop"]) if parts["loop"] else np.zeros((1, 1024), np.float32)
        me = np.concatenate(parts["end"]) if parts["end"] else np.zeros((1, 1024), np.float32)
        diff = ml.mean(0) - me.mean(0)
        nrm = np.linalg.norm(diff)
        pooled = np.sqrt(ml.var(0).mean() + me.var(0).mean())
        d[L] = diff / (nrm if nrm > 0 else 1.0)
        t[L] = nrm / (pooled if pooled > 0 else 1.0)
        print(f"layer {L:2d}: ||d||={nrm:.4f} pooled={pooled:.4f} t={t[L]:.4f}")
    np.savez(f"{C.RESULTS}/directions_all.npz", d=d, t=t,
             loop_rows=[int(np.concatenate(acc[L]["loop"]).shape[0]) if acc.get(L, {}).get("loop") else 0 for L in range(24)],
             end_rows=[int(np.concatenate(acc[L]["end"]).shape[0]) if acc.get(L, {}).get("end") else 0 for L in range(24)],
             fair_cap=np.int32(cap))
    order = np.argsort(-t)
    print("layer ranking (top 8):", [(int(L), round(float(t[L]), 4)) for L in order[:8]])
    json.dump(dict(fair_cap=cap, ranking=[{"layer": int(L), "t": round(float(t[L]), 4)} for L in order],
                   corpus_tight=tight, corpus_n=len(corpus)),
             open(f"{C.RESULTS}/layer_ranking.json", "w"), indent=1)
    C.log_batch(dict(phase="capture", split=f"train(loop+finished @cap{cap})", batch=n_pass,
                     cap="prefill",
                     purpose=f"Jon step2+3 on fair cap {cap}: corpus repeat check ({tight}/{len(corpus)} tight repeats) + per-layer loop-vs-finished MLP-write contrast over all 24 layers",
                     ruled_out="loop direction confined to layers 15/19 (ranking over all layers will show where it actually peaks)"))

def llm_loop(text):
    words = text.split()
    n = len(words)
    if n < 40:
        return False
    W = 8
    windows = [" ".join(words[i:i + W]) for i in range(0, n - W, 2)]
    repeat_frac = 1.0 - len(set(windows)) / len(windows) if windows else 0.0
    tail = words[-120:]
    tail_uniq = len(set(tail)) / len(tail)
    return repeat_frac > 0.5 or tail_uniq < 0.3

if __name__ == "__main__":
    main()
