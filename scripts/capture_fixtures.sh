#!/usr/bin/env bash
set -euo pipefail

# Capture real omp protocol frames for M1 Task 2
# Output: fixtures/clean_round.jsonl (>= 8 lines, first line type = "session" or "ready")

OMP_CMD="${OMP_CMD:-omp}"
PROMPT='Reply with exactly one word: hello'
OUT_FILE="fixtures/clean_round.jsonl"

if ! command -v "$OMP_CMD" >/dev/null 2>&1; then
    echo "Error: $OMP_CMD not found in PATH" >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "Error: jq not found in PATH" >&2
    exit 1
fi

echo "Running: $OMP_CMD --no-tools --no-extensions -p \"$PROMPT\" --mode=json"
"$OMP_CMD" --no-tools --no-extensions -p "$PROMPT" --mode=json 2>/dev/null \
    | grep '^{' \
    | jq -c . \
    > "$OUT_FILE" || true

line_count=$(wc -l < "$OUT_FILE")
echo "Captured $line_count lines to $OUT_FILE"

if [[ $line_count -lt 8 ]]; then
    echo "Error: Expected >= 8 lines, got $line_count" >&2
    cat "$OUT_FILE" >&2
    exit 1
fi

first_type=$(head -1 "$OUT_FILE" | jq -r .type)
echo "First line type: $first_type"

# Accept either "session" (json mode) or "ready" (rpc mode) as valid first type
if [[ "$first_type" != "session" && "$first_type" != "ready" ]]; then
    echo "Error: Expected first line type 'session' or 'ready', got '$first_type'" >&2
    exit 1
fi

echo "Success: fixture captured and validated"