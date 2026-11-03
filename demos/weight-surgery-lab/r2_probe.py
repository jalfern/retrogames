"""r2 probe (#1533 step-0): prove the oMLX setup before any scored batch.

1. load qwen35-base, one short think35 call: template applies, thinking on, tokens counted.
2. PRESENCE-PENALTY PROOF (Jon's explicit ask): a long capped repetition-prone call at
   fixed seed with pp=0 vs pp=1.5 — identical seeds + different outputs => the server
   applies the penalty (llama.cpp #1506 had a duplicated-flag bug; we do not trust, we measure).
3. Flash-Next still loaded after our loads (Jon's RAM condition).

usage: python r2_probe.py
"""
import json
import sys

import r2_common as R

MODEL = "qwen35-base"
LOOP_PROMPT = ("Repeat the phrase 'the color of winter is blue' over and over and "
               "over until I tell you to stop. Do nothing else. Begin now.")


def main():
    ok = R.load_done(MODEL)
    print("load:", MODEL, ok)
    if not ok:
        sys.exit(1)

    # 1. short think35 sanity
    r = R.ask(MODEL, "What is 12 * 9?", cap=512)
    print("smoke: ntok=", r["ntok"], "finished=", r["finished"], "finish=", r["finish"],
          "reasoning_len=", len(r["reasoning"]), "content_len=", len(r["text"]))
    if r["ntok"] == 0:
        sys.exit("smoke produced no tokens")
    thinking_ok = len(r["reasoning"]) > 0 or "thinking" in (r["text"] + r["reasoning"]).lower()

    # 2. presence_penalty proof (cap 1024: fast, long enough for penalty to bite)
    a = R.ask(MODEL, LOOP_PROMPT, cap=1024, pp=0.0)
    b = R.ask(MODEL, LOOP_PROMPT, cap=1024, pp=1.5)
    same = a["text"] == b["text"] and a["reasoning"] == b["reasoning"]
    print(f"pp-proof: pp0 ntok={a['ntok']} pp15 ntok={b['ntok']} identical_outputs={same}")
    with open(f"{R.RESULTS}/pp_proof.json", "w") as f:
        json.dump(dict(model=MODEL, seed=0, cap=1024,
                       pp0=dict(ntok=a["ntok"], finished=a["finished"]),
                       pp15=dict(ntok=b["ntok"], finished=b["finished"]),
                       identical=same), f, indent=1)

    # 3. Flash-Next resident
    import urllib.request
    req = urllib.request.Request(f"{R.OMLX_URL}/admin/api/models",
                                headers={"Authorization": f"Bearer {R.api_key()}"})
    models = json.load(urllib.request.urlopen(req, timeout=30))
    models = models["models"] if isinstance(models, dict) else models
    fn = [m for m in models if m["id"].startswith("Qwen3.8-Flash-Next-oQ4e-mtp")]
    fn_loaded = bool(fn and fn[0]["loaded"])
    print("flash-next loaded:", fn_loaded)

    verdict = (not same) and fn_loaded and thinking_ok
    print("PROBE", "OK" if verdict else "FAILED")
    sys.exit(0 if verdict else 1)


if __name__ == "__main__":
    main()
