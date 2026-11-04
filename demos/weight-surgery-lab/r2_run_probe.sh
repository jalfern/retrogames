#!/bin/bash
# r2 (#1533) engine probe launcher (session 120): qwen35-p50c (vlm+mtp),
# math-only, PAR 32. Run via r2_detach.py so it survives the session.
cd "$(dirname "$0")"
export WS_R2_PARALLEL=32
exec ./.venv/bin/python r2_probe_engine.py qwen35-p50c
