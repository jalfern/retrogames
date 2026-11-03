"""Contrast probe: problems the 0.8B model CAN finish, to collect END-state
contributions for the direction contrast. Adds to loop_texts.json["end"]."""
import json
import common as C, llm

GGUF = "q35-f16.gguf"
EASY = [
    "What is 17*23?", "What is 144/12?", "What is 15% of 80?",
    "Solve: 2x + 6 = 14. What is x?", "What is 7 squared plus 1?",
    "If a book costs $4 and you buy 3, how much change from $20?",
    "What is 100 - 37?", "What is the double of 48?",
    "Compute 3/4 of 20.", "What is 9*8?",
]

def main():
    texts = json.load(open(f"{C.RESULTS}/loop_texts.json"))
    probs = [dict(problem=q, gold="", tag="gsm") for q in EASY]
    rows, tps = llm.gen_batch(GGUF, probs, cap=512, nproc=10)
    ends = 0
    for q, r in zip(EASY, rows):
        if not r["hit_cap"]:
            texts["end"].append(dict(problem=q, text=r["text"], hit_cap=False, looped=False))
            ends += 1
    json.dump(texts, open(f"{C.RESULTS}/loop_texts.json", "w"))
    prev = sum(1 for _ in open(C.BATCHLOG))
    C.log_batch(dict(n=prev+1, phase="practice", split="easy-probe", batch=len(probs),
                     cap=512, tps=tps, terminated=ends,
                     purpose="collect terminated END-state texts for direction contrast",
                     ruled_out="model cannot terminate at all (would leave end-corpus empty)"))
    print("terminated:", ends, "/", len(probs))

if __name__ == "__main__":
    main()
