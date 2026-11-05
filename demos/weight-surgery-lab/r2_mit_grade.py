"""#1547 C2: grade with MIT's OWN code/mathqa.py, not ours (jalfern #1539).

Two jobs, CPU only:
1. VERIFY — the three rows jalfern listed (#1539 comment): our predictions that
   MIT graded CORRECT and ours graded WRONG must come out True under MIT's
   checker (is_correct = math-verify over boxed-wrapped strings + hendrycks
   equiv reported alongside). Writes results/r2/mit_grader.json.
2. REGRADE — any scored tag whose full-text sidecar exists under
   ~/Dev/weight-lab/r2_text/ (WS_R2_SAVETEXT runs from #1547 on) is re-graded
   end-to-end with MIT's extract() + is_correct(); ours-vs-MIT per-row diffs
   land in the same JSON. pred=None-on-finished rows can only be re-graded
   from saved text — the step-1 rows predate sidecars and are flagged as such.

usage: r2_mit_grade.py [tag:set ...]   (default: every tag with a sidecar)
"""
import glob
import json
import os
import sys

MIT_CODE = os.path.expanduser("~/Dev/weight-lab/mit-exp8/exp8_math/code")
os.environ.setdefault("MATHVERIFY_PKGS", os.path.expanduser("~/Dev/weight-lab/mathverify_pkgs"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "mit_shim"))
sys.path.insert(0, MIT_CODE)  # MIT's own modules win if the tarball grows mcqa.py

import mathqa  # noqa: E402  MIT's grader (vendored clone at ~/Dev/weight-lab)

import r2_common as R  # noqa: E402
import common as C  # noqa: E402

TEXTDIR = os.path.expanduser(os.environ.get("WS_R2_TEXTDIR", "~/Dev/weight-lab/r2_text"))

# jalfern #1539: identical predictions, MIT correct / ours wrong.
KNOWN_MISMATCHES = {
    "math500_10": "[-2, 7]",
    "math500_36": "\\frac{11+9a}{20}",
    "math500_88": "C",          # MIT's pred for the same row was "(C)"
}
MIT_PRED_88 = "(C)"


def main():
    probs = {pid: (prob, gold) for st, pid, prob, gold in R.held_out()}
    out = {"source": "jalfern #1539 comment 6620997026 (rows 10/36/88)",
           "grader": "MIT exp8 code/mathqa.py is_correct (math-verify) + is_equiv",
           "rows": {}, "regrade": {}}

    for pid, our_pred in KNOWN_MISMATCHES.items():
        gold_raw = probs[pid][1]
        gold = R.gold_answer(gold_raw)
        mit_ok = bool(mathqa.is_correct(our_pred, gold))
        mit_eq = bool(mathqa.is_equiv(our_pred, gold))
        ours_ok, ours_method = R.grade(gold_raw, our_pred)
        out["rows"][pid] = {"our_pred": our_pred, "gold_final": gold,
                            "mit_correct": mit_ok, "mit_equiv": mit_eq,
                            "ours_correct": bool(ours_ok), "ours_method": ours_method}
    gold88 = R.gold_answer(probs["math500_88"][1])
    out["rows"]["math500_88"]["mit_pred_variant"] = {
        "pred": MIT_PRED_88,
        "mit_correct": bool(mathqa.is_correct(MIT_PRED_88, gold88))}
    out["all_match_mit"] = all(v["mit_correct"] for v in out["rows"].values())

    # re-grade every tag with a saved full-text sidecar
    want = sys.argv[1:]
    if not want:
        sidecars = sorted(glob.glob(f"{TEXTDIR}/*.jsonl"))
        want = [os.path.basename(p)[: -len(".jsonl")].replace("_", ":", 1) for p in sidecars]
    for spec in want:
        tag, set_name = spec.split(":")
        spath = f"{TEXTDIR}/{tag}_{set_name}.jsonl"
        jpath = f"{R.RESULTS}/scores_{tag}_{set_name}.jsonl"
        if not os.path.exists(spath):
            continue
        # #1567 stage-F lesson: practice runs leave full-text sidecars too, and they
        # have NO scored rows file — the no-arg sweep must skip them, not crash
        # (crashing silently left every later row uncovered).
        if not os.path.exists(jpath):
            continue
        texts = {}
        for l in open(spath):
            try:
                r = json.loads(l)
                texts[r["id"]] = r
            except Exception:  # noqa: BLE001
                continue
        rows = {}
        for l in open(jpath):
            r = json.loads(l)
            rows[r["id"]] = r
        diffs, n_mit, n_ours = [], 0, 0
        for pid, row in rows.items():
            t = texts.get(pid)
            if not t:
                continue
            gold = R.gold_answer(probs[pid][1])
            mit_pred, _ = mathqa.extract((t.get("reasoning") or "") + "\n" + (t.get("text") or ""))
            mit_ok = bool(mathqa.is_correct(mit_pred, gold))
            n_mit += int(mit_ok)
            n_ours += int(bool(row.get("ok")))
            if mit_ok != bool(row.get("ok")) or (mit_pred or None) != (row.get("pred") or None):
                diffs.append({"id": pid, "ours": {"pred": row.get("pred"), "ok": bool(row.get("ok"))},
                            "mit": {"pred": mit_pred, "ok": mit_ok}})
        n = len(rows)
        out["regrade"][f"{tag}:{set_name}"] = {
            "n": n, "ours_acc": round(n_ours / max(n, 1) * 100, 1),
            "mit_acc": round(n_mit / max(n, 1) * 100, 1),
            "pred_none_finished_sidecar_ok": sum(
                1 for r in rows.values() if r.get("finished") and not r.get("pred")
                and r["id"] in texts),
            "diffs": diffs}

    with open(f"{R.RESULTS}/mit_grader.json", "w") as f:
        json.dump(out, f, indent=1)
    print(json.dumps({"all_match_mit": out["all_match_mit"],
                     "rows": {k: (v["mit_correct"], v["ours_correct"]) for k, v in out["rows"].items()},
                     "regrade": {k: {"ours": v["ours_acc"], "mit": v["mit_acc"], "n": v["n"]}
                               for k, v in out["regrade"].items()}}, indent=1))
    if not out["all_match_mit"]:
        sys.exit(1)  # grader expectations broken -> loud


if __name__ == "__main__":
    main()
