#!/bin/bash
# r2 step-2/3 runner (#1533) — ONLY after step1_gate.json PASS (each script also
# self-guards). Detach with r2_detach.py; resumable: G1 appends own_practice_gen.jsonl,
# R1 reuses it; edit/convert/score re-run cheap. Budget passes logged by the scripts.
cd "$(dirname "$0")" || exit 1
V=./.venv/bin/python
echo "[step23] start $(date -u +%FT%TZ)"
$V r2_directions.py || { echo "[step23] STOP: directions refused/failed"; exit 1; }
$V r2_edit.py 1.0 128 edited_own || { echo "[step23] STOP: own edit refused/failed"; exit 1; }
$V r2_convert.py edited_own "$HOME/models/weightlab/qwen35-own" || exit 1
KEY=$($V -c "import r2_common as R; print(R.api_key())")
curl -sS -m 30 -X POST -H "Authorization: Bearer $KEY" http://localhost:8000/admin/api/reload >/dev/null \
  || echo "[step23] WARN reload failed — register qwen35-own manually"
sleep 5
$V r2_score.py own:qwen35-own || exit 1
echo "[step23] done $(date -u +%FT%TZ) — next: regenerate page + ws2/ws3check + merge lane"
