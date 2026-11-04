"""r2 scorer (#1533): one fixed held-out set, every row on the same oMLX backend.

usage: r2_score.py TAG:MODEL[:pp=X] [TAG:MODEL:pp=X ...]
  rows run sequentially; inside a row, WS_R2_PARALLEL (default 4) concurrent streams.
  Resumable: one jsonl per row+set under results/r2/; already-scored ids are skipped.
  After every row, results/r2/r2_scores.json is rewritten: {tag: {math:{acc,finished,n},
  gsm:{...}}} — the round-2 table source for the demo page.

Budget note: step-3 scoring passes are NOT part of Astra's 50-pass budget (MIT logs
them separately), but every pass still lands in batches.jsonl for provenance.
"""
import contextlib
import hashlib
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import r2_common as R
import common as C
import llm  # loop_score_text lives in llm.py (round-1 split)

PAR = int(os.environ.get("WS_R2_PARALLEL", "4"))
# #1547 C2/C3: WS_R2_SETS restricts which sets a row runs (default math,gsm);
# WS_R2_SAVETEXT=1 writes each row's FULL text+reasoning to a sidecar OUTSIDE
# the repo (a 32K-token answer is ~60KB; 100 rows would bloat the repo ~10x the
# whole lab). Committed rows carry {bytes, sha} pointers; r2_mit_grade.py can
# re-grade the sidecars with MIT's own mathqa.py at any later time.
SETS = [s.strip() for s in os.environ.get("WS_R2_SETS", "math,gsm").split(",") if s.strip()]
SAVETEXT = os.environ.get("WS_R2_SAVETEXT") == "1"
TEXTDIR = os.path.expanduser(os.environ.get("WS_R2_TEXTDIR", "~/Dev/weight-lab/r2_text"))


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
    n_new = 0
    summary = {}
    for set_name in SETS:
        want = [r for r in rows if r[0] == set_name]
        path = f"{R.RESULTS}/scores_{tag}_{set_name}.jsonl"
        done = existing(path)
        todo = [r for r in want if r[1] not in done]
        tpath = f"{TEXTDIR}/{tag}_{set_name}.jsonl"
        if SAVETEXT:
            os.makedirs(TEXTDIR, exist_ok=True)
        # None is not a context manager: a resume run without SAVETEXT crashed
        # here (TypeError in (open(...) if False else None)); nullcontext fixes it.
        with open(path, "a") as out, \
                (open(tpath, "a") if SAVETEXT else contextlib.nullcontext()) as tout:
            def work(rec):
                st, pid, prob, gold = rec
                t1 = time.time()
                g = R.ask(model, prob, cap=32768, pp=pp)
                pred = C.extract_boxed(g["text"] or "") or C.extract_boxed(g["reasoning"] or "")
                lm = llm.loop_score_text((g["reasoning"] + " " + (g["text"] or "")).strip())
                raw = {"id": pid, "pred": pred, "ntok": g["ntok"],
                      "finished": g["finished"], **lm,
                      "t_wall": round(time.time() - t1, 1)}
                if SAVETEXT and pid not in done:  # full text in sidecar, not repo;
                    # `done` guards against resume duplicate writes
                    body = json.dumps({"text": g["text"], "reasoning": g["reasoning"]})
                    tout.write(json.dumps({"id": pid, **json.loads(body)}) + "\n")
                    tout.flush()
                    raw["text"] = {"bytes": len(body.encode()),
                                  "sha": hashlib.sha256(body.encode()).hexdigest()[:12]}
                return raw
            with ThreadPoolExecutor(max_workers=PAR) as ex:
                raws = list(ex.map(work, todo))
            # grading ONLY on the main thread: math_verify.parse() uses
            # signal.alarm() and raises ValueError in any worker thread — threaded
            # grading silently fell back to numeric/string compare and
            # undercounted acc (session 119: p50c/math read 30.0 live).
            for rec, raw in zip(todo, raws):
                ok, method = R.grade(rec[3], raw["pred"])
                raw.update(ok=ok, method=method)
                out.write(json.dumps(raw) + "\n")
                out.flush()
                n_new += 1
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
    summary["pp_ctx"] = R.PP_CTX  # #1547 C1: 0 = legacy server default (20-token window)
    summary["model"] = model
    # rewrite aggregate
    agg = {}
    if os.path.exists(f"{R.RESULTS}/r2_scores.json"):
        agg = json.load(open(f"{R.RESULTS}/r2_scores.json"))
    # merge, don't clobber: a WS_R2_SETS=gsm run must not erase the tag's
    # math entry (#1562: p50cw math vanished when its gsm-only row landed)
    prev = agg.get(tag, {})
    merged = {**prev, **summary}
    merged["model"] = model
    agg[tag] = merged
    with open(f"{R.RESULTS}/r2_scores.json", "w") as f:
        json.dump(agg, f, indent=1)
    desc = "; ".join(f"{s.upper()} {summary[s]['acc']}% acc / {summary[s]['finished']}% fin"
                    for s in SETS if s in summary)
    print(f"ROW {tag}: {desc}  ({summary['t_hours']} h)")
    n_tot = sum(summary[s]["n"] for s in SETS if s in summary)
    # a fully-resumed row generated nothing: it is NOT a pass and must not
    # land in batches.jsonl (pass accounting under Astra's cap stays honest)
    if n_new:
        log_batch(f"held-out scoring row {tag} ({model}, think35 pp={pp} pp_ctx={R.PP_CTX})",
                  "step-1 gate vs MIT expectations happens after base+p50c rows",
                  model, n_tot, tok_total, dt / 3600)


if __name__ == "__main__":
    for spec in sys.argv[1:]:
        parts = spec.split(":")
        tag, model = parts[0], parts[1]
        pp = 1.5
        for p in parts[2:]:
            if p.startswith("pp="):
                pp = float(p[3:])
        run_row(tag, model, pp)
