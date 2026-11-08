#!/usr/bin/env bash
# M3 协议验证脚本：Deny select → 确认 bash 工具未执行、文件未变
set -u
DIR=/tmp/denytest
PR=/tmp/deny_probe
rm -rf "$DIR" "$PR"
mkdir -p "$DIR" "$PR"
echo "ORIGINAL" > "$DIR/target.txt"

mkfifo "$PR/in" "$PR/out"

omp --mode rpc-ui --cwd "$DIR" --approval-mode always-ask < "$PR/in" > "$PR/out" 2> "$PR/omp.err" &
OMP_PID=$!
exec 3>"$PR/in"

printf '{"type":"prompt","message":"Use the bash tool to run: echo appended >> target.txt  (append a line to target.txt). Do nothing else."}\n' >&3

# tail -f 流式读（避开 fifo 写入前 EOF 竞态）；settle 后杀掉 tail
tail -n +1 -f "$PR/out" > "$PR/tail.log" 2>/dev/null &
TAIL_PID=$!

settle=0
for _ in $(seq 1 180); do
  sleep 1
  cp "$PR/tail.log" "$PR/log.jsonl" 2>/dev/null
  if [ -f "$PR/log.jsonl" ]; then
    while IFS= read -r line; do
      if echo "$line" | grep -q '"method":"select"'; then
        id=$(echo "$line" | jq -r '.id' 2>/dev/null)
        # 只回一次（去重）
        if ! grep -q "SENT_DENY_FOR=$id" "$PR/resp.log" 2>/dev/null; then
          printf '{"type":"extension_ui_response","id":"%s","value":"Deny"}\n' "$id" >&3
          echo "SENT_DENY_FOR=$id" >> "$PR/resp.log"
        fi
      fi
    done < <(grep -a '"method":"select"' "$PR/log.jsonl" 2>/dev/null)
    if grep -q '"type":"session_settled"' "$PR/log.jsonl" 2>/dev/null; then
      settle=1
      break
    fi
  fi
done

kill "$TAIL_PID" 2>/dev/null
kill "$OMP_PID" 2>/dev/null
wait "$OMP_PID" 2>/dev/null
exec 3>&-

echo "=== settle: $settle ==="
echo "=== omp.err (first 5) ==="
head -5 "$PR/omp.err"
echo "=== target.txt (MUST be ORIGINAL only) ==="
cat "$DIR/target.txt"
echo "=== log stats ==="
wc -l < "$PR/log.jsonl" 2>/dev/null | sed 's/^/total_lines: /'
grep -ac '"method":"select"' "$PR/log.jsonl" 2>/dev/null | sed 's/^/select_requests: /'
echo "=== select request ==="
grep -a '"method":"select"' "$PR/log.jsonl" | head -2 | jq -c '{id, method, title, options}'
echo "=== tool_execution lines ==="
jq -c 'select(.type=="tool_execution_start" or .type=="tool_execution_end") | {type, toolCallId, toolName, args, isError, resultText: (.result.content[0].text // null)}' "$PR/log.jsonl" 2>/dev/null
