"""r2 re-grade (#1533 session 118): re-apply the FIXED grade (gold_answer
extraction) to already-scored rows — predictions/ntok/finished stay, ok/method
recompute. Provenance: original verdict kept as ok_v1/method_v1. Resumable:
rows without ok_v1 get stamped; run once per file, safe to re-run.

usage: python r2_regrade.py scores_base_math.jsonl [more.jsonl ...]
"""
import json
import os
import sys

import r2_common as R

GOLDS = {(st, pid): gold for st, pid, prob, gold in R.held_out()}


def regrade(path):
    recs = [json.loads(l) for l in open(path)]
    flips = 0
    out = []
    for r in recs:
        if "ok_v1" not in r:
            r["ok_v1"], r["method_v1"] = r["ok"], r["method"]
        tag = "math" if "_math" in os.path.basename(path) else "gsm"
        gold = GOLDS[(tag, r["id"])]
        ok, method = R.grade(gold, r["pred"])
        if ok != r["ok"]:
            flips += 1
        r["ok"], r["method"] = ok, method
        out.append(r)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        for r in out:
            f.write(json.dumps(r) + "\n")
    os.replace(tmp, path)
    n = len(out)
    acc = sum(1 for r in out if r["ok"]) / max(n, 1) * 100
    print(f"{os.path.basename(path)}: {n} rows regraded, {flips} flipped -> acc {acc:.1f}%")


if __name__ == "__main__":
    for name in sys.argv[1:]:
        regrade(f"{R.RESULTS}/{name}")
