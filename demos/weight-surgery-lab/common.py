"""WEIGHT SURGERY lab — shared utilities (#1493).
Model: Qwen/Qwen3.5-0.8B @ 2fc06364715b967f1860aea9cf38778875588b17 (local ./base).
No gradients anywhere. Practice = train splits only. Every batch logged to batches.jsonl.
"""
import json, os, re, time

LAB = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(LAB, "data")
BASE = os.path.join(LAB, "base")
BATCHLOG = os.path.join(LAB, "batches.jsonl")
RESULTS = os.path.join(LAB, "results")
os.makedirs(RESULTS, exist_ok=True)

# Fixed sampling config — identical before/after edits (law of the experiment).
# Qwen3.5 card "thinking mode for text tasks" (README L707): temp 1.0, top_p 0.95,
# top_k 20, min_p 0.0, presence_penalty 1.5, repetition_penalty 1.0.
# Cap lowered 32768 -> 1024 for laptop compute (documented deviation, both sides).
SAMP = dict(temperature=1.0, top_p=0.95, top_k=20, min_p=0.0,
            presence_penalty=1.5, repetition_penalty=1.0)
CAP = 1024
CAPTURE_LAYERS = (15, 19)

def load_problems():
    out = {}
    def jl(path, pq, aq, extra=lambda r: {}):
        rows = []
        with open(path) as f:
            for line in f:
                r = json.loads(line)
                rows.append(dict(problem=r[pq], gold=r[aq], **extra(r)))
        return rows
    out["gsm_train"] = jl(f"{DATA}/train.jsonl", "question", "answer",
                          lambda r: {"tag": "gsm"})
    out["gsm_test"] = jl(f"{DATA}/test.jsonl", "question", "answer",
                         lambda r: {"tag": "gsm"})
    # math_train needs parquet; scoring never uses it. On boxes without
    # pyarrow (lab venv is 3.12, no PyPI reach) degrade to empty.
    try:
        import pyarrow.parquet as pq
        import glob
        mrows = []
        for f in sorted(glob.glob(f"{DATA}/math/*.parquet")):
            t = pq.read_table(f)
            for r in t.to_pylist():
                mrows.append(dict(problem=r["problem"], gold=r["solution"],
                                 tag="math", level=r.get("level"), type=r.get("type")))
        out["math_train"] = mrows
    except ImportError:
        out["math_train"] = []
    out["math500"] = jl(f"{DATA}/math500.jsonl", "problem", "solution",
                        lambda r: {"tag": "math", "level": r.get("level"),
                                  "type": r.get("type")})
    return out

def gold_answer(gold, tag):
    if tag == "gsm":
        m = re.search(r"####\s*(.+)", gold)
        return m.group(1).strip() if m else gold.strip().split("\n")[-1]
    return extract_boxed(gold) or gold.strip()

def extract_boxed(text):
    idx = text.rfind("\\boxed{")
    if idx < 0:
        return None
    i = idx + len("\\boxed{")
    depth, out = 1, []
    while i < len(text) and depth > 0:
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                break
        out.append(c)
        i += 1
    return "".join(out).strip() if depth == 0 else None

def norm_num(s):
    s = str(s).strip().replace(",", "").replace("$", "").replace(" ", "")
    s = s.replace("\\!", "").replace("%", "")
    s = re.sub(r"\\(?:text|mbox|mathrm|operatorname)\{([^}]*)\}", r"\1", s)
    s = re.sub(r"(?<=[a-zA-Z])(units?|degrees?|meters?|metres?|cm)$", "", s)
    frac = re.match(r"^\\frac\{(-?\d+)\}\{(-?\d+)\}$", s)
    if frac:
        return float(frac.group(1)) / float(frac.group(2))
    try:
        return float(s)
    except ValueError:
        pass
    return None

def grade(completion, gold, tag):
    """Approximation of the paper's grader (documented): boxed extraction +
    numeric/string match."""
    gold_a = gold_answer(gold, tag)
    got = extract_boxed(completion)
    if got is None:
        m = re.findall(r"(?:final answer|answer (?:is|=))\s*[:=]?\s*([^\n]+)",
                       completion, re.I)
        if m:
            got = m[-1].strip().rstrip(". ")
    if got is None:
        return False, None, str(gold_a)
    gn, cn = norm_num(gold_a), norm_num(got)
    if gn is not None and cn is not None:
        return abs(gn - cn) <= 1e-6 * max(1.0, abs(gn)), got, str(gold_a)
    ok = re.sub(r"\s+", "", str(got).lower()) == re.sub(r"\s+", "", str(gold_a).lower())
    return ok, got, str(gold_a)

def loop_score(tokens):
    n = len(tokens)
    if n < 64:
        return dict(repeat_frac=0.0, tail_uniq=1.0, looped=False)
    W = 16
    windows = [tuple(tokens[i:i+W]) for i in range(0, n - W, 4)]
    repeat_frac = 1.0 - len(set(windows)) / len(windows) if windows else 0.0
    tail = tokens[-256:]
    tail_uniq = len(set(tail)) / len(tail)
    return dict(repeat_frac=round(repeat_frac, 3), tail_uniq=round(tail_uniq, 3),
                looped=repeat_frac > 0.5 or tail_uniq < 0.25)

def log_batch(entry):
    entry["ts"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(BATCHLOG, "a") as f:
        f.write(json.dumps(entry) + "\n")

def load_model():
    import mlx.core as mx
    mx.set_default_device(mx.cpu)  # this box: MTLCompilerService unreachable (#737 family)
    import mlx_lm
    return mlx_lm.load(BASE)

def gen_batch(model, tok, problems, cap=CAP, sampler=None, capture=False,
              step_every=1):
    """ONE forward-pass BATCH (the budget unit) via mlx_lm.batch_generate.
    Returns (rows, toks_per_s). rows carry generation/ntok/hit_cap/loop metrics.
    If capture: stash MLP contributions of CAPTURE_LAYERS per seq (looped seqs
    only are aggregated by the caller from the returned stash)."""
    import mlx_lm
    import mlx.core as mx
    from mlx_lm.sample_utils import make_sampler, make_presence_penalty, make_repetition_penalty
    prompts = [tok.apply_chat_template([{"role": "user", "content": p["problem"].strip()}],
                                      add_generation_prompt=True)
               for p in problems]
    samp = dict(SAMP)
    if sampler:
        samp.update(sampler)
    presence = samp.pop("presence_penalty", 0.0)
    rept = samp.pop("repetition_penalty", 1.0)
    sampler_obj = make_sampler(temp=samp["temperature"], top_p=samp["top_p"],
                              top_k=samp["top_k"], min_p=samp["min_p"])
    procs = []
    if presence:
        procs.append(make_presence_penalty(presence, context_size=16384))
    if rept != 1.0:
        procs.append(make_repetition_penalty(rept, context_size=16384))
    stash = _install_capture(model) if capture else None
    t0 = time.time()
    resp = mlx_lm.batch_generate(model, tok, prompts, max_tokens=cap,
                                 return_token_ids=True, sampler=sampler_obj,
                                 logits_processors=procs or None)
    dt = time.time() - t0
    if capture:
        _remove_capture(model)
    texts = resp.texts if hasattr(resp, "texts") else resp
    tids = resp.token_ids if hasattr(resp, "token_ids") else None
    rows = []
    for b, p in enumerate(problems):
        tks = list(tids[b]) if tids is not None else list(tok.encode(texts[b]))
        ls = loop_score(tks)
        rows.append(dict(problem=p["problem"], tag=p["tag"], gold=p["gold"],
                        generation=texts[b], ntok=len(tks), hit_cap=len(tks) >= cap,
                        **ls))
    tps = round(sum(r["ntok"] for r in rows) / max(dt, 1e-6), 1)
    return rows, tps, stash

# ---- capture of MLP residual contributions at layers 15/19 ----
_STASH = []

def _install_capture(model):
    import mlx.core as mx
    stash = {L: [] for L in CAPTURE_LAYERS}
    for L in CAPTURE_LAYERS:
        layer = model.model.layers[L]
        orig = layer.mlp

        class Wrap:
            def __init__(self, inner):
                self.inner = inner
            def __call__(self, x, L=L):
                out = self.inner(x)
                a, o = mx.contiguous(x), mx.contiguous(out)
                mx.eval(a, o)
                stash[L].append((o, a))
                return out
            def __getattr__(self, k):
                return getattr(self.inner, k)
            @property
            def parameters(self):
                return self.inner.parameters
        layer.mlp = Wrap(orig)
        stash[f"_orig_{L}"] = orig
    return stash

def _remove_capture(model):
    for L in CAPTURE_LAYERS:
        layer = model.model.layers[L]
        if hasattr(layer.mlp, "inner"):
            layer.mlp = layer.mlp.inner
