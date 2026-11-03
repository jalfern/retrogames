"""r2 gate (#1533 step 1): mechanical neighborhood check, written to step1_gate.json.

Jon's rule: score base and MIT p50c on the fixed held-out set at 32K/think35;
"expect roughly base 8% MATH / 14% GSM8K with ~93% cut off; MIT p50c about
48%/67% with ~33% cut. If our numbers aren't in that neighborhood, stop."

Neighborhood (mechanical, frozen here BEFORE the rows land):
  base   math acc 2–14   | gsm acc 8–20    | finished <= 20% per set
  p50c   math acc 40–56  | gsm acc 59–75   | finished 40–80% per set
"""
import json

import r2_common as R

CLAIMS = {
    "base": {"math": (2, 14), "gsm": (8, 20), "fin": (0, 20)},
    "p50c": {"math": (40, 56), "gsm": (59, 75), "fin": (40, 80)},
}


def main():
    try:
        s = json.load(open(f"{R.RESULTS}/r2_scores.json"))
    except Exception as e:  # noqa: BLE001
        s = {}
        print("no scores yet:", e)
    problems = []
    for tag, lim in CLAIMS.items():
        row = s.get(tag)
        if not row:
            problems.append(f"{tag}: row missing")
            continue
        for set_name in ("math", "gsm"):
            t = row.get(set_name, {})
            lo, hi = lim[set_name]
            if not (lo <= t.get("acc", -1) <= hi):
                problems.append(f"{tag} {set_name} acc {t.get('acc')} outside [{lo},{hi}]")
            f = t.get("finished", -1)
            if not (lim["fin"][0] <= f <= lim["fin"][1]):
                problems.append(f"{tag} {set_name} finished {f}% outside [{lim['fin'][0]},{lim['fin'][1]}]")
    out = {"pass": not problems,
           "detail": ("base and p50c both inside MIT's claimed neighborhood." if not problems
                     else "; ".join(problems) + ". "),
           "rows": {k: {st: {m: s[k][st][m] for m in ("acc", "finished")}
                       for st in ("math", "gsm")} for k in s if k != "_hold"}}
    with open(f"{R.RESULTS}/step1_gate.json", "w") as f:
        json.dump(out, f, indent=1)
    print("GATE", "PASS" if out["pass"] else "STOP:", out["detail"])


if __name__ == "__main__":
    main()
