"""#1567 candidate 2 — pick the alpha winner from PRACTICE rows only.

DECISION RULE (frozen by Jon's ruling 2026-11-04 + this script, written BEFORE
any practice row was scored):
  winner = argmax PRACTICE ACCURACY over alpha in {2,4,8} on the fresh 64-math
  batch (r3_practice.py; cap 8192, think35 pp1.5 ctx32768);
  tie-break 1: higher finished-rate; tie-break 2: smaller alpha.
  Accuracy first because escape without a correct answer is not success.

The winner alone earns the held-out 100+100 row (r2_score.py, full think35
protocol, cap 32768). No other alpha variant is ever scored on held-out —
that was Jon's correction: choosing among variants on the test set is tuning
on the test set.

usage: ./.venv/bin/python r3_pick.py        (deterministic; refuses incomplete sweeps)
out:   results/r2/r3_alpha_pick.json
"""
import json
import os
import sys
import time

import r2_common as R

ALPHAS = [2, 4, 8]
OUT = f"{R.RESULTS}/r3_alpha_pick.json"
RULE = ("winner = max practice accuracy on fresh 64-math @cap8192 (think35 "
        "pp1.5 ctx32768); ties -> higher finished-rate, then smaller alpha; "
        "held-out 100+100 scored once for the winner only")


def main():
    if os.path.exists(OUT):
        d = json.load(open(OUT))
        print(f"already picked: {d['decision']} ({d['winner']['acc']}% practice acc) — "
              "marker-guarded, no re-pick")
        print(d["decision"])
        return
    rows = {}
    missing = []
    for a in ALPHAS:
        p = f"{R.RESULTS}/practice_own{a}.json"
        if not os.path.exists(p):
            missing.append(f"own{a}")
            continue
        rows[f"own{a}"] = json.load(open(p))
    if missing:
        sys.exit(f"refusing to pick — practice rows missing: {','.join(missing)}")
    for tag, s in rows.items():
        if s["n"] < 64:
            sys.exit(f"refusing to pick — {tag} practice batch incomplete (n={s['n']})")
    base_p = f"{R.RESULTS}/practice_base.json"
    base = json.load(open(base_p)) if os.path.exists(base_p) else None
    best = sorted(rows.items(), key=lambda kv: (-kv[1]["acc"], -kv[1]["finished"],
                                                int(kv[0][3:])))[0]
    out = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "issue": 1567,
        "rule": RULE,
        "rows": {t: {"acc": s["acc"], "finished": s["finished"], "n": s["n"],
                     "mean_ntok": s["mean_ntok"]} for t, s in rows.items()},
        "base_reference": ({"acc": base["acc"], "finished": base["finished"],
                            "n": base["n"]} if base else None),
        "decision": best[0],
        "winner": {"alpha": int(best[0][3:]), "acc": best[1]["acc"],
                   "finished": best[1]["finished"]},
        "lift_over_base": (round(best[1]["acc"] - base["acc"], 1) if base else None),
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
    print(json.dumps(out, indent=1))
    print(best[0])  # last line = the winner tag, for the runner


if __name__ == "__main__":
    main()
