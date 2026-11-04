"""r2 bench (#1533): measure tok/s on 16 train problems at the full 32,768 cap.

Jon's gate: measure throughput BEFORE committing the held-out size; if one row
would take > ~6 h, run 50+50 and say so. 16 train problems (8 MATH-train + 8
GSM-train, first ids of MIT's practice files' order after the round-1 splits),
4 concurrent streams (the server scheduler's max_concurrent_requests).

usage: python r2_bench.py [model]
"""
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import r2_common as R
import common as C

PAR = int(__import__("os").environ.get("WS_R2_PARALLEL", "4"))


def main():
    model = sys.argv[1] if len(sys.argv) > 1 else "qwen35-base"
    assert R.load_done(model), "model not loaded"
    p = C.load_problems()
    probs = [dict(problem=r["problem"]) for r in p["math_train"][:8]]
    probs += [dict(problem=r["problem"]) for r in p["gsm_train"][:8]]

    def one(pr):
        t0 = time.time()
        r = R.ask(model, pr["problem"], cap=32768)
        r["t_wall"] = round(time.time() - t0, 1)
        return r

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=PAR) as ex:
        rows = list(ex.map(one, probs))
    dt = time.time() - t0
    total = sum(r["ntok"] for r in rows)
    tps = total / dt
    cut = sum(1 for r in rows if not r["finished"])
    out = dict(model=model, n=len(rows), parallel=PAR, cap=32768,
               total_tokens=total, t_wall=round(dt, 1), agg_tps=round(tps, 1),
               cut_off=cut, ntok=[r["ntok"] for r in rows])
    # row estimate for the 200-problem held-out at observed mean length/cut share
    mean_len = total / len(rows)
    est_row_200 = 200 * mean_len / tps
    est_row_100 = 100 * mean_len / tps
    out["est_hours_100p50"] = round(est_row_100 / 3600, 2)
    out["est_hours_200p100"] = round(est_row_200 / 3600, 2)
    with open(f"{R.RESULTS}/bench16.json", "w") as f:
        json.dump(out, f, indent=1)
    print(json.dumps(out, indent=1))
    print("HOLD 50+50" if est_row_200 / 3600 > 6 else "HOLD 100+100")


if __name__ == "__main__":
    main()
