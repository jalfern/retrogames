"""WEIGHT SURGERY II (#1505) step 3: paired practice eval at the long cap.

Same 12 train problems for every model (paired seed), cap 4096, penalty-free
sampling (pp 0 — the #8 lesson: penalty 1.5 is its own row, never the baseline).
Rows: base f16 + variants built by step9. Reports terminated/looped/correct.
usage: step10_eval2.py <label:gguf> [<label:gguf> ...]
"""
import json, os, random, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
import common as C, llm

CAP = 4096
EXTRA = ["--presence-penalty", "0"]

def cli_one_bytes(gguf, problem, cap, extra, seed):
    """llm._cli_one, but decodes stderr with errors='replace' — llama-cli's
    verbose stderr crossed 5MB under contention and a mid-multibyte split
    killed text=True (UnicodeDecodeError, eval row B)."""
    cmd = [llm.LLAMA_CLI, "-m", gguf, "--jinja", "-p", problem.strip(),
           "-n", str(cap), "--seed", seed, "--single-turn",
           "--no-display-prompt", "--verbose", "--threads", "2", *llm.SAMP_ARGS, *extra]
    try:
        p = subprocess.run(cmd, capture_output=True, timeout=cap * 10, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        return dict(text="", ntok=0, hit_cap=True, err="timeout")
    out = p.stdout.decode("utf-8", "replace")
    err = p.stderr.decode("utf-8", "replace")
    # llama v0.3.0 slot print_timing lines: "prompt eval time = X ms / N tokens"
    # then "eval time = Y ms / M tokens" — take the LAST match (generation), and
    # exclude the prompt line by lookbehind. The pipe-form summary llm.py matches
    # does not exist on this build (its runs used the words×2 estimate; see #1506
    # note). ntok here = generated tokens exactly.
    ms = re.findall(r"(?<!prompt )eval time\s+=\s+[\d.]+ ms\s*/\s+(\d+) tokens", err)
    ntok = int(ms[-1]) if ms else 0
    if ntok == 0:
        ntok = len(out.split()) * 2  # crude fallback, marked
        r_est = True
    else:
        r_est = False
    stopped = ntok < cap or "stop token" in err.lower()
    text = out
    marker = "> " + problem.strip()[:60]
    i = text.find(marker)
    if i >= 0:
        text = text[i + len(marker):]
    text = re.sub(r"\n\[ Prompt:.*$", "", text, flags=re.S).strip()
    return dict(text=text, ntok=ntok, hit_cap=not stopped, est=r_est,
                err=None if text else err[-300:])

def gen_batch_safe(gguf, problems, cap, extra, seed, nproc=12):
    import time
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=nproc) as ex:
        rows = list(ex.map(lambda p: cli_one_bytes(gguf, p["problem"], cap, extra, seed), problems))
    dt = time.time() - t0
    return rows, round(sum(r["ntok"] for r in rows) / max(dt, 1e-6), 1)

def main():
    probs = C.load_problems()
    rng = random.Random(77)   # eval seed distinct from capture (23) and slot a (11)
    gsm = rng.sample(probs["gsm_train"], 6)
    easy = [p for p in probs["math_train"] if str(p.get("level")) in ("1", "2", "Level 1", "Level 2")]
    if len(easy) < 6:
        easy = probs["math_train"]
    batch = gsm + rng.sample(easy, 6)
    # resume: reuse rows of models already logged this phase (crash mid-run #2)
    out_all = {}
    for line in open(C.BATCHLOG):
        b = json.loads(line)
        if b.get("phase") == "practice-v2" and "rows" in b and not os.environ.get("V2_REFRESH"):
            out_all[b["model"]] = b
    todo = [s for s in sys.argv[1:] if s.split(":", 1)[0] not in out_all]
    n0 = sum(1 for _ in open(C.BATCHLOG))
    for i, spec in enumerate(todo):
        label, gguf = spec.split(":", 1)
        rows, tps = gen_batch_safe(gguf, batch, CAP, EXTRA, llm.SEED)
        out = []
        for r, p in zip(rows, batch):
            r.update(llm.loop_score_text(r["text"]))
            ok, got, gold = C.grade(r["text"], p["gold"], p["tag"])
            out.append(dict(ok=ok, cap=r["hit_cap"], loop=r["looped"], ntok=r["ntok"], est=r.get("est", False)))
        summ = dict(n=n0 + i + 1, phase="practice-v2", split="gsm+math_train(easy)",
                    batch=12, cap=CAP, pp=0, tps=tps, model=label,
                    terminated=sum(1 for o in out if not o["cap"]),
                    looped=sum(1 for o in out if o["loop"]),
                    correct=sum(1 for o in out if o["ok"]),
                    rows=out,
                    purpose=f"v2 eval {label}: terminate/loop/correct at cap4096 pp0, paired 12 train problems",
                    ruled_out="see paired rows")
        C.log_batch(summ)
        out_all[label] = summ
        print(label, json.dumps({k: summ[k] for k in
              ("terminated", "looped", "correct", "tps")}))
    json.dump(out_all, open(f"{C.RESULTS}/v2_variants.json", "w"), indent=1)

if __name__ == "__main__":
    main()
