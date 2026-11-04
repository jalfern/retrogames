"""Shim for MIT exp8's `mcqa.py` — NOT included in our mit-exp8 tarball (audited:
no mcqa.* anywhere in the tarball). mathqa.py imports `loop_signals` from it at
module load (its repetitive_end rule merges into mathqa.loop_signals), which blocks
importing the file at all. NOTHING on the grading path (extract / is_correct /
is_equiv / score's correctness fields) touches mcqa — only loop telemetry.
Stub returns empty signals so r2_mit_grade.py can use MIT's real checker.
"""


def loop_signals(text):  # noqa: ARG001 — telemetry-only stub, see docstring
    return {"repeat_frac": 0.0, "tail_uniq": 1.0}
