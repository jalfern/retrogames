"""llama.cpp CPU generation harness for WEIGHT SURGERY (#1493).
Every gen_batch call = ONE forward-pass BATCH (budget unit). All batches logged.
"""
import json, os, re, subprocess, time
from concurrent.futures import ThreadPoolExecutor

LLAMA_CLI = "/tmp/llamacpp-src/build/bin/llama-cli"
CAP = 1024
SEED = "42"
# Identical before/after sampling (card thinking-mode text settings, README L707):
SAMP_ARGS = ["--temp", "1.0", "--top-p", "0.95", "--top-k", "20",
             "--presence-penalty", "1.5", "--repeat-penalty", "1.0"]

def _cli_one(gguf, problem, cap, extra=None, seed=SEED):
    cmd = [LLAMA_CLI, "-m", gguf, "--jinja", "-p", problem.strip(),
           "-n", str(cap), "--seed", seed, "--single-turn",
           "--no-display-prompt", "--verbose", "--threads", "2", *SAMP_ARGS]
    if extra:
        cmd += extra
    t0 = time.time()
    try:
        p = subprocess.run(cmd, capture_output=True, text=True,
                           timeout=cap * 10, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        return dict(text="", ntok=0, hit_cap=True, err="timeout")
    dt = time.time() - t0
    err = p.stderr or ""
    m = re.search(r"eval time\s+=\s+[\d.]+ ms\s+\|\s+(\d+) tokens", err)
    ntok = int(m.group(1)) if m else 0
    if ntok == 0:
        ntok = len(p.stdout.split()) * 2  # crude fallback (words->tokens)
    stopped = ntok < cap or "stop token" in err.lower()
    text = p.stdout
    marker = "> " + problem.strip()[:60]
    i = text.find(marker)
    if i >= 0:
        text = text[i + len(marker):]
    text = re.sub(r"\n\[ Prompt:.*$", "", text, flags=re.S).strip()
    return dict(text=text, ntok=ntok, hit_cap=not stopped,
                t_wall=round(dt, 1), err=None if text else err[-300:])

def gen_batch(gguf, problems, cap=CAP, nproc=12, extra=None, seed=SEED):
    """One batch: len(problems) generations, nproc parallel llama-cli procs."""
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=nproc) as ex:
        rows = list(ex.map(lambda p: _cli_one(gguf, p["problem"], cap, extra, seed),
                           problems))
    dt = time.time() - t0
    total = sum(r["ntok"] for r in rows)
    return rows, round(total / max(dt, 1e-6), 1)

def loop_score_text(text):
    words = text.split()
    n = len(words)
    if n < 40:
        return dict(repeat_frac=0.0, tail_uniq=1.0, looped=False)
    W = 8
    windows = [" ".join(words[i:i+W]) for i in range(0, n - W, 2)]
    repeat_frac = 1.0 - len(set(windows)) / len(windows) if windows else 0.0
    tail = words[-120:]
    tail_uniq = len(set(tail)) / len(tail)
    return dict(repeat_frac=round(repeat_frac, 3), tail_uniq=round(tail_uniq, 3),
                looped=repeat_frac > 0.5 or tail_uniq < 0.3)
