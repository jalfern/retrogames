"""r2 (#1533) ENGINE probe, session 120.

Step-1 fact (admin API + safetensors header, 2026-11-04):
  qwen35-p50c-mlx  = MLX conversion, BatchedEngine, 0 mtp/nextn tensors
                     (r2_convert.py drops MTP; mtp_compatible:false).
  qwen35-p50c      = same edit, HF-name container, 15 mtp.* tensors,
                     vlm engine, mtp_enabled:true (applied 09:53 local).
The MTP hypothesis in the s119 gap analysis is therefore REFUTED for the
scored backend: speculation was never enabled there — a "MTP-off rerun"
of the identical config would be a no-op. The live suspect for the
p50c math deficit (30.0 vs MIT ~48, finished-rate passes, precision-per-
finished matches) is BatchedEngine PAR-32 numerics vs MIT's plain-AR HF.

This probe scores the SAME fixed held-out set, math only, same think35
protocol and main-thread grading, against qwen35-p50c (vlm engine) with
MTP explicitly DISABLED at runtime: PUT /admin/api/models/qwen35-p50c/settings
{"mtp_enabled": false}. (First attempt at 17:09 local ran MTP-ON despite
model_settings.json saying false — the running server caches settings; file
edits do NOT reach it. Verified plain-AR after the PUT: zero new MTP log
lines for warm requests. The kill also cut a 9.4-tok/s MTP-overhead run that
would have overrun the session.) Result vs the frozen 30.0 A/Bs container/
engine numerics under identical plain-AR semantics.
Isolated artifacts — scores_p50cvlm_math.jsonl + probe_engine.json:
  it never writes scores_p50c_math.jsonl nor r2_scores.json (CLAIMS law:
  the protocol rows stay byte-identical; the step-1 gate keeps reading them).

Reading the result:
  acc in [40,56]  -> engine/numerics identified as the gap source; the
                     protocol-consistent repair is re-running both rows on
                     one engine-matched container (next session / Jon's call).
  acc ~30 still   -> backend candidates exhausted -> close-as-negative path.

usage: WS_R2_PARALLEL=32 ./.venv/bin/python r2_probe_engine.py [MODEL]
"""
import datetime
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import r2_common as R
import common as C
import llm

PAR = int(os.environ.get("WS_R2_PARALLEL", "32"))
TAG = "p50cvlm"


def log_batch(purpose, ruled_out, model, n, tokens, hours):
    with open(C.BATCHLOG, "a") as f:
        f.write(json.dumps({
            "ts": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
            "run": "r2 (#1533)", "purpose": purpose, "ruled_out": ruled_out,
            "model": model, "n": n, "total_tokens": tokens,
            "t_hours": round(hours, 3),
        }) + "\n")


def existing(path):
    done = set()
    if os.path.exists(path):
        with open(path) as f:
            for l in f:
                try:
                    done.add(json.loads(l)["id"])
                except Exception:  # noqa: BLE001
                    pass
    return done


def main():
    model = sys.argv[1] if len(sys.argv) > 1 else "qwen35-p50c"
    assert R.load_done(model), f"{model} not loaded"
    want = [r for r in R.held_out() if r[0] == "math"]
    path = f"{R.RESULTS}/scores_{TAG}_math.jsonl"
    done = existing(path)
    todo = [r for r in want if r[1] not in done]
    print(f"probe: {TAG} on {model}, {len(todo)} of {len(want)} math rows, PAR={PAR}")

    # sanity: one warm row must produce sane thinking text, else abort before
    # burning 45 min on a mis-templated VL container.
    if not done:
        g = R.ask(model, want[0][2], cap=2048, pp=1.5)
        probe_text = (g["reasoning"] + " " + g["text"]).strip()
        if len(probe_text) < 100:
            print(f"ABORT: warm row empty/garbage ({len(probe_text)} chars), "
                  f"finish={g['finish']} — VL template incompatible")
            return 2
        print(f"warm ok: finish={g['finish']} ntok={g['ntok']} head={probe_text[:120]!r}")

    t0 = time.time()
    tok_total = 0
    by_id = {r[1]: r for r in todo}
    with open(path, "a") as out:
        def work(rec):
            st, pid, prob, gold = rec
            t1 = time.time()
            g = R.ask(model, prob, cap=32768, pp=1.5)
            pred = C.extract_boxed(g["text"] or "") or C.extract_boxed(g["reasoning"] or "")
            lm = llm.loop_score_text((g["reasoning"] + " " + (g["text"] or "")).strip())
            return {"id": pid, "pred": pred, "ntok": g["ntok"],
                    "finished": g["finished"], **lm,
                    "t_wall": round(time.time() - t1, 1)}
        # incremental: grade + persist each row as it completes, so a budget
        # abort mid-run still leaves gradable rows (resumable via id-skip).
        # grading ONLY on the main thread (math_verify signal.alarm() rule, s119);
        # a lock keeps grading exclusive to the main thread's consumption loop.
        with ThreadPoolExecutor(max_workers=PAR) as ex:
            futs = {ex.submit(work, rec): rec for rec in todo}
            for fut in as_completed(futs):
                raw = fut.result()
                rec = by_id[raw["id"]]
                ok, method = R.grade(rec[3], raw["pred"])
                raw.update(ok=ok, method=method)
                out.write(json.dumps(raw) + "\n")
                out.flush()

    recs = [json.loads(l) for l in open(path)]
    n = len(recs)
    summary = {
        "tag": TAG, "model": model, "engine_note": "vlm+mtp container, HF names",
        "n": n,
        "acc": round(sum(1 for r in recs if r["ok"]) / max(n, 1) * 100, 1),
        "finished": round(sum(1 for r in recs if r["finished"]) / max(n, 1) * 100, 1),
        "mean_ntok": round(sum(r["ntok"] for r in recs) / max(n, 1)),
        "par": PAR,
        "t_hours": round((time.time() - t0) / 3600, 2),
    }
    with open(f"{R.RESULTS}/probe_engine.json", "w") as f:
        json.dump(summary, f, indent=1)
    tok_total = sum(r["ntok"] for r in recs)
    print(f"PROBE {TAG}: MATH {summary['acc']}% acc / {summary['finished']}% finished "
          f"({summary['t_hours']} h) -> verdict: "
          f"{'ENGINE-IDENTIFIED (in [40,56])' if 40 <= summary['acc'] <= 56 else 'still out of [40,56]'}")
    log_batch(f"engine probe math-only ({model} vlm+mtp, think35 pp=1.5)",
              "isolated tag p50cvlm; protocol rows untouched",
              model, n, tok_total, (time.time() - t0) / 3600)
    return 0


if __name__ == "__main__":
    sys.exit(main())
