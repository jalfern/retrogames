"""#1562 pre-flight smoke: 4 gens @512 via oMLX + MLX-CPU capture hooks.
Writes only p1562_gen_smoke.jsonl; consumes no logged pass budget."""
import mlx.core as mx
mx.set_default_device(mx.cpu)

import common as C
import r2_common as R
import r2_directions_1562 as D

assert R.load_done("qwen35-base", wait_s=600), "base failed to load"
b1, _b2, _b3 = D.practice_batches()
recs, fins, loops, dt = D.gen_pass(99, b1[:4], 512, "smoke")
print("gen smoke: n=", len(recs), "fin", fins, "loops", loops, f"{dt:.0f}s")

from mlx_lm import load
model, tok = load(D.MLX_DIR)
C.CAPTURE_LAYERS = D.FA_LAYERS
stash = C._install_capture(model)
D.stash = stash
fit = {b: D.Bucket() for b in ("loop", "fin")}
items = [(dict(r, _pool="8k_a"), "fin" if (r["finished"] and r["pred"]) else "loop",
          "fit") for r in recs]
D.tf_read(model, tok, items, fit, None)
print("fit tokens L3/L23:", {L: (fit["loop"].cnt[L], fit["fin"].cnt[L])
                             for L in (3, 23)})
C.CAPTURE_LAYERS = D.FA_LAYERS
C._remove_capture(model)
print("SMOKE OK")
