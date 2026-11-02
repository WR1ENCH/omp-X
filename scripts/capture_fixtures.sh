#!/usr/bin/env bash
set -euo pipefail

# Capture real omp protocol frames for M1 Task 2
# Output: fixtures/clean_round.jsonl (>= 8 lines, first line type = "session" or "ready")
# Must be a *completed* round: prompt_result + session_settled present, no 429.
#
# Protocol (probed against omp --mode rpc-ui):
#   ready → extension_ui_request* (reply extension_ui_response) → prompt command →
#   agent events → prompt_result → session_settled
# The prompt command shape is {"type":"prompt","message":"<text>"}.

OMP_CMD="${OMP_CMD:-omp}"
OMP_MODEL="${OMP_MODEL:-}"
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

# Pre-truncate safely: write to temp, mv on success only.
TMP_FILE="${OUT_FILE}.tmp"
: > "$TMP_FILE"

MODEL_FLAG=""
if [[ -n "$OMP_MODEL" ]]; then
    MODEL_FLAG=(--model "$OMP_MODEL")
fi
echo "Running: $OMP_CMD --mode rpc-ui --no-tools --no-extensions ${MODEL_FLAG[*]:-}"
coproc OMP_PROC { "$OMP_CMD" --mode rpc-ui --no-tools --no-extensions "${MODEL_FLAG[@]}" > "$TMP_FILE" 2> "${TMP_FILE%.jsonl}.stderr" || true; }

# stdin/stdout of the coproc
exec 3>&"${OMP_PROC[1]}" 4<&"${OMP_PROC[0]}"

reply_to_ui() {
    # Auto-approve extension UI requests by echoing the request id.
    local line="$1" id
    id=$(printf '%s' "$line" | jq -r '.id // empty' 2>/dev/null || true)
    if [[ -n "$id" ]]; then
        printf '{"type":"extension_ui_response","id":"%s","value":"Approve"}\n' "$id" >&3
    fi
}

# Drain until ready, replying to any UI requests.
while IFS= read -r -t 60 line <&4; do
    case "$line" in
        *'"type":"extension_ui_request"'*) reply_to_ui "$line" ;;
        *'"type":"ready"'*) break ;;
    esac
done

# Send the prompt.
printf '{"type":"prompt","message":%s}\n' "$(printf '%s' "$PROMPT" | jq -Rs .)" >&3

# Drain events; stop at session_settled (completed round).
while IFS= read -r -t 90 line <&4; do
    case "$line" in
        *'"type":"extension_ui_request"'*) reply_to_ui "$line" ;;
        *'"type":"session_settled"'*) break ;;
    esac
done

# Close our ends; omp keeps stdin open past session_settled, so bound the
# wait and kill the child if it lingers (its output is already fully captured).
exec 3>&- 4<&-
for _ in 1 2 3 4 5; do
    if ! kill -0 "$OMP_PROC_PID" 2>/dev/null; then
        break
    fi
    sleep 1
done
if kill -0 "$OMP_PROC_PID" 2>/dev/null; then
    kill "$OMP_PROC_PID" 2>/dev/null || true
fi
wait "$OMP_PROC_PID" 2>/dev/null || true

mv "$TMP_FILE" "$OUT_FILE"
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

# A complete round must reach the terminal events; a failed round (e.g. provider
# 429 rate limit) captures garbage that would silently poison the test fixture.
if ! grep -q '"type":"prompt_result"' "$OUT_FILE"; then
    echo "Error: no prompt_result — capture is not a completed round (provider/rate failure?)" >&2
    cat "$OUT_FILE" >&2
    exit 1
fi
if ! grep -q '"type":"session_settled"' "$OUT_FILE"; then
    echo "Error: no session_settled — capture is not a completed round" >&2
    cat "$OUT_FILE" >&2
    exit 1
fi
if grep -q '"errorStatus":429\|FreeUsageLimitError\|rate_limit' "$OUT_FILE"; then
    echo "Error: capture hit a provider rate limit; retry later" >&2
    cat "$OUT_FILE" >&2
    exit 1
fi

echo "Success: fixture captured and validated"