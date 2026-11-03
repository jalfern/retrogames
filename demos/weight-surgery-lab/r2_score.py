"""r2 scorer (#1533): one fixed held-out set, every row on the same oMLX backend.

usage: r2_score.py TAG:MODEL[:pp=X] [TAG:MODEL:pp=X ...]
  rows run sequentially; inside a row, WS_R2_PARALLEL (default 4) concurrent streams.
  Resumable: one jsonl per row+set under results/r2/; already-scored ids are skipped.
  After every row, results/r2/r2_scores.json is rewritten: {tag: {math:{acc,finished,n},
  gsm:{...}}} — the round-2 table source for the demo page.

Budget note: step-3 scoring passes are NOT part of Astra's 50-pass budget (MIT logs
them separately), but every pass still lands in batches.jsonl for provenance.
"""
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import r2_common as R
import common as C

PAR = int(os.environ.get("WS_R2_PARALLEL", "4"))


def log_batch(purpose, ruled_out, model, n, tokens, hours):
    with open(C.BATCHLOG, "a") as f:
        f.write(json.dumps({
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
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


def run_row(tag, model, pp):
    rows = R.held_out()
    assert R.load_done(model), f"{model} not loaded"
    t0 = time.time()
    tok_total = 0
    summary = {}
    for set_name in ("math", "gsm"):
        want = [r for r in rows if r[0] == set_name]
        path = f"{R.RESULTS}/scores_{tag}_{set_name}.jsonl"
        done = existing(path)
        todo = [r for r in want if r[1] not in done]
        with open(path, "a") as out:
            def work(rec):
                st, pid, prob, gold = rec
                t1 = time.time()
                g = R.ask(model, prob, cap=32768, pp=pp)
                pred = C.extract_boxed(g["text"] or "") or C.extract_boxed(g["reasoning"] or "")
                ok, method = R.grade(gold, pred)
                lm = C.loop_score_text((g["reasoning"] + " " + (g["text"] or "")).strip())
                return {"id": pid, "ok": ok, "method": method, "ntok": g["ntok"],
                        "finished": g["finished"], "pred": pred, **lm,
                        "t_wall": round(time.time() - t1, 1)}
            with ThreadPoolExecutor(max_workers=PAR) as ex:
                for rec in ex.map(work, todo):
                    out.write(json.dumps(rec) + "\n")
                    out.flush()
        recs = [json.loads(l) for l in open(path)]
        n = len(recs)
        summary[set_name] = {
            "n": n,
            "acc": round(sum(1 for r in recs if r["ok"]) / max(n, 1) * 100, 1),
            "finished": round(sum(1 for r in recs if r["finished"]) / max(n, 1) * 100, 1),
            "mean_ntok": round(sum(r["ntok"] for r in recs) / max(n, 1)),
        }
        tok_total += sum(r["ntok"] for r in recs)
    dt = time.time() - t0
    summary["t_hours"] = round(dt / 3600, 2)
    summary["pp"] = pp
    summary["model"] = model
    # rewrite aggregate
    agg = {}
    if os.path.exists(f"{R.RESULTS}/r2_scores.json"):
        agg = json.load(open(f"{R.RESULTS}/r2_scores.json"))
    agg[tag] = summary
    with open(f"{R.RESULTS}/r2_scores.json", "w") as f:
        json.dump(agg, f, indent=1)
    m, gsn = summary["math"], summary["gsm"]
    print(f"ROW {tag}: MATH {m['acc']}% acc / {m['finished']}% finished; "
          f"GSM {gsn['acc']}% / {gsn['finished']}%  ({summary['t_hours']} h)")
    log_batch(f"held-out scoring row {tag} ({model}, think35 pp={pp})",
              "step-1 gate vs MIT expectations happens after base+p50c rows",
              model, m["n"] + gsn["n"], tok_total, dt / 3600)


if __name__ == "__main__":
    for spec in sys.argv[1:]:
        parts = spec.split(":")
        tag, model = parts[0], parts[1]
        pp = 1.5
        for p in parts[2:]:
            if p.startswith("pp="):
                pp = float(p[3:])
        run_row(tag, model, pp)
