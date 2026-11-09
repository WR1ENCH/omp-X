#!/usr/bin/env bash
# fake_omp.sh - Test double for omp session tests
#
# `spawn()` always executes `omp --mode rpc-ui`, so this shim is installed as
# `omp` on PATH (or pointed at by OMP_BIN) and must tolerate those arguments.
# The fixture to replay comes from FAKE_OMP_FIXTURE; stdin is echoed to stderr
# as noise. Blocking on stdin keeps the process alive until the test kills it
# or closes the pipe, mirroring the real binary between turns.

set -euo pipefail

FIXTURE_FILE="${FAKE_OMP_FIXTURE:-/dev/null}"

if [[ -r "$FIXTURE_FILE" ]]; then
    while IFS= read -r line || [ -n "$line" ]; do
        echo "$line"
        sleep 0.01
    done < "$FIXTURE_FILE"
fi

# Echo stdin to stderr as noise. The read blocks until the test closes the
# pipe, so no extra `tail -f`/`sleep` child is left behind on teardown.
while IFS= read -r stdin_line; do
    echo "[noise] stdin: $stdin_line" >&2
done
