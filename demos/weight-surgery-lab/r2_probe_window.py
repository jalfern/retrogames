"""#1547 C1 probe: does oMLX honour `presence_context_size`, and does the window
matter? Source audit (oMLX-bundled mlx_lm server.py L1331 + sample_utils.py
make_presence_penalty): the penalty is applied to tokens[-context_size:] with
body default 20 — vLLM penalizes ALL generated tokens.

Probe: one known looping practice problem, think35 seed 0, cap 1024, pp 1.5,
three arms: ctx=20 (legacy default), ctx=1024 (covers whole generation), and
pp=0 control. The parameter is live iff the ctx arms differ from each other
(sha) and the wide arm differs from the narrow loop profile. Writes
results/r2/pp_window.json; CPU-light (~3 streams x 1024 tok).
"""
import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor

import r2_common as R
import llm

MODEL = "qwen35-p50c-mlx"
CAP = 1024
ARMS = [("pp1.5_ctx20", 1.5, 20), ("pp1.5_ctx1024", 1.5, 1024), ("pp0", 0.0, 20)]


def main():
    import common as C
    prob = C.load_problems()["math_train"][0]["problem"]
    out = {"model": MODEL, "cap": CAP, "seed": 0,
           "audit": {"file": "oMLX.app/Contents/Resources/Python/framework-mlx-base/"
                             "lib/python3.11/site-packages/mlx_lm",
                     "finding": "presence penalty = tokens[-presence_context_size:], "
                               "server body default 20; vLLM penalizes every generated token",
                     "fix": "pass presence_context_size >= max_tokens (r2_common.ask pp_ctx / WS_R2_PP_CTX)"},
           "arms": {}}
    t0 = time.time()

    def run(arm):
        name, pp, ctx = arm
        g = R.ask(MODEL, prob, cap=CAP, pp=pp, pp_ctx=(ctx if pp else None))
        txt = (g["reasoning"] + " " + (g["text"] or "")).strip()
        lm = llm.loop_score_text(txt)
        return name, {"ntok": g["ntok"], "finished": g["finished"],
                     "sha": hashlib.sha256(txt.encode()).hexdigest()[:12],
                     **lm}
    with ThreadPoolExecutor(max_workers=3) as ex:
        for name, rec in ex.map(run, ARMS):
            out["arms"][name] = rec
    out["accepted"] = all(a["ntok"] > 0 for a in out["arms"].values())
    out["window_changes_output"] = (out["arms"]["pp1.5_ctx20"]["sha"]
                                    != out["arms"]["pp1.5_ctx1024"]["sha"])
    out["t_seconds"] = round(time.time() - t0, 1)
    with open(f"{R.RESULTS}/pp_window.json", "w") as f:
        json.dump(out, f, indent=1)
    print(json.dumps(out, indent=1))
    if not (out["accepted"] and out["window_changes_output"]):
        sys.exit(1)


if __name__ == "__main__":
    import sys
    main()
