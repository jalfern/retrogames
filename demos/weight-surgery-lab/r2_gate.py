"""r2 gate (#1533 step 1): mechanical neighborhood check, written to step1_gate.json.

Jon's rule: score base and MIT p50c on the fixed held-out set at 32K/think35;
"expect roughly base 8% MATH / 14% GSM8K with ~93% cut off; MIT p50c about
48%/67% with ~33% cut. If our numbers aren't in that neighborhood, stop."

Neighborhood (mechanical, frozen here BEFORE the rows land):
  base   math acc 2–14   | gsm acc 8–20    | finished <= 20% per set
  p50c   math acc 40–56  | gsm acc 59–75   | finished 40–80% per set
"""
import json
import os
import sys

import r2_common as R

CLAIMS = {
    "base": {"math": (2, 14), "gsm": (8, 20), "fin": (0, 20)},
    "p50c": {"math": (40, 56), "gsm": (59, 75), "fin": (40, 80)},
}


def set_stats(tag, set_name):
    """True stats from the append-only jsonl (n, acc, finished)."""
    path = f"{R.RESULTS}/scores_{tag}_{set_name}.jsonl"
    recs = []
    if os.path.exists(path):
        with open(path) as f:
            for l in f:
                try:
                    recs.append(json.loads(l))
                except Exception:  # noqa: BLE001
                    pass
    n = len(recs)
    return n, (sum(1 for r in recs if r["ok"]) / max(n, 1) * 100,
               sum(1 for r in recs if r["finished"]) / max(n, 1) * 100)


def main():
    problems = []
    rows = {}
    for tag, lim in CLAIMS.items():
        per = {}
        for set_name in ("math", "gsm"):
            n, (acc, fin) = set_stats(tag, set_name)
            if n < (R.N_MATH if set_name == "math" else R.N_GSM):
                print(f"INCOMPLETE: {tag}/{set_name} {n} rows — gate not written "
                     "(wait for the full row; killed runners must not fake a gate)")
                return 3
            per[set_name] = {"acc": round(acc, 1), "finished": round(fin, 1)}
        rows[tag] = per
        for set_name in ("math", "gsm"):
            lo, hi = lim[set_name]
            if not (lo <= rows[tag][set_name]["acc"] <= hi):
                problems.append(f"{tag} {set_name} acc {rows[tag][set_name]['acc']} "
                              f"outside [{lo},{hi}]")
            f = rows[tag][set_name]["finished"]
            if not (lim["fin"][0] <= f <= lim["fin"][1]):
                problems.append(f"{tag} {set_name} finished {f}% "
                              f"outside [{lim['fin'][0]},{lim['fin'][1]}]")
    out = {"pass": not problems,
           "detail": ("base and p50c both inside MIT's claimed neighborhood." if not problems
                     else "; ".join(problems) + ". "),
           "rows": rows}
    with open(f"{R.RESULTS}/step1_gate.json", "w") as f:
        json.dump(out, f, indent=1)
    print("GATE", "PASS" if out["pass"] else "STOP:", out["detail"])


if __name__ == "__main__":
    sys.exit(main())
