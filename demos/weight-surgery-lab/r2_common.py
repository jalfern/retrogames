"""r2 (#1533) shared: oMLX client, fixed held-out set, MIT-think35 protocol, grading.

Protocol (MIT exp8 code/evaluate.py SAMPLING_THINK35 + mathqa.py, per Jon #1533):
  thinking on (chat template enable_thinking), user turn = problem + suffix,
  temp 0.6 / top_p 0.95 / top_k 20 / presence_penalty 1.5 / max_tokens 32768 / seed 0,
  graded on the LAST \\boxed{} with math-verify (vendored at ~/Dev/weight-lab/mathverify_pkgs),
  numeric fallback recorded separately. ALL round-2 rows go through the same oMLX
  backend — never mixed with round-1 llama.cpp numbers (#1506 law).

Secrets: the API key is read from ~/.omlx/settings.json at runtime — never hardcoded.
"""
import json
import os
import random
import urllib.request

LAB = os.path.dirname(os.path.abspath(__file__))
import common as C  # noqa: E402  (round-1 utils: data, boxed extract, loop metrics)

RESULTS = os.path.join(C.RESULTS, "r2")
os.makedirs(RESULTS, exist_ok=True)

OMLX_URL = os.environ.get("WS_OMLX_URL", "http://127.0.0.1:8000")
MATHVERIFY = os.path.expanduser("~/Dev/weight-lab/mathverify_pkgs")

SUFFIX = "\nPlease reason step by step, and put your final answer within \\boxed{}."

# #1533 fixed held-out set: 100 MATH-500 + 100 GSM8K-test, one sample each,
# identical rows for every line. Selection is deterministic; ids logged at run time.
SET_SEED = 1533
N_MATH, N_GSM = 100, 100


def api_key():
    with open(os.path.expanduser("~/.omlx/settings.json")) as f:
        return json.load(f)["auth"]["api_key"]


def held_out():
    """[(tag, id, problem, gold)] fixed for the whole round; log on first use."""
    p = C.load_problems()
    rng = random.Random(SET_SEED)
    math = rng.sample(p["math500"], N_MATH)
    gsm = rng.sample(p["gsm_test"], N_GSM)
    rows = [("math", r.get("unique_id") or f"math500_{i}", r["problem"], r["gold"])
            for i, r in enumerate(math)]
    rows += [("gsm", f"gsm8ktest_{i}", r["problem"], r["gold"]) for i, r in enumerate(gsm)]
    return rows


def _mv():
    import sys
    if MATHVERIFY not in sys.path:
        sys.path.append(MATHVERIFY)
    import math_verify
    return math_verify


def grade(gold, pred):
    """MIT semantics: verify(parse(gold), parse(pred)); numeric fallback recorded."""
    if pred is None:
        return False, "no-answer"
    try:
        _mv()
        from math_verify import parse, verify
        g = parse(gold)
        x = parse(pred)
        if g and x:
            return bool(verify(g, x)), "math-verify"
        return False, "math-verify-unparseable"
    except Exception as e:  # noqa: BLE001 — fallback must never kill a run
        try:
            def num(s):
                s = str(s).replace(",", "").replace("$", "").strip()
                return float(s)
            ok = abs(num(gold) - num(pred)) < 1e-6
            return ok, f"numeric(fallback:{type(e).__name__})"
        except Exception:  # noqa: BLE001
            return str(gold).strip() == str(pred).strip(), f"string(fallback:{type(e).__name__})"


def ask(model, problem, cap=32768, pp=1.5, seed=0, timeout=2400):
    """One think35 generation via oMLX /v1/chat/completions."""
    body = {
        "model": model,
        "messages": [{"role": "user", "content": problem.strip() + SUFFIX}],
        "temperature": 0.6, "top_p": 0.95, "top_k": 20,
        "presence_penalty": pp, "max_tokens": cap, "seed": seed,
        "chat_template_kwargs": {"enable_thinking": True},
    }
    req = urllib.request.Request(
        f"{OMLX_URL}/v1/chat/completions", data=json.dumps(body).encode(),
        headers={"content-type": "application/json",
                 "Authorization": f"Bearer {api_key()}"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.load(r)
    ch = d["choices"][0]
    msg = ch["message"]
    text = msg.get("content") or ""
    reason = msg.get("reasoning_content") or ""
    usage = d.get("usage") or {}
    return dict(text=text, reasoning=reason,
                ntok=usage.get("completion_tokens") or 0,
                finished=ch.get("finish_reason") != "length",
                finish=ch.get("finish_reason"))


def load_done(model, wait_s=180):
    """POST /admin/api/models/<id>/load and poll until loaded."""
    import time
    import urllib.error

    def _get(path):
        req = urllib.request.Request(f"{OMLX_URL}{path}",
                                    headers={"Authorization": f"Bearer {api_key()}"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    def _models():
        ms = _get("/admin/api/models")
        return ms["models"] if isinstance(ms, dict) else ms
    for m in _models():
        if m.get("id") == model and m.get("loaded"):
            return True
    req = urllib.request.Request(f"{OMLX_URL}/admin/api/models/{model}/load",
                                data=b"{}", method="POST",
                                headers={"Authorization": f"Bearer {api_key()}"})
    try:
        urllib.request.urlopen(req, timeout=30).read()
    except urllib.error.HTTPError as e:  # noqa: PERF203
        if e.code not in (400, 409):
            raise
    t0 = time.time()
    while time.time() - t0 < wait_s:
        time.sleep(3)
        if any(m.get("id") == model and m.get("loaded") for m in _models()):
            return True
    return False
