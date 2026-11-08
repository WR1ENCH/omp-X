#!/usr/bin/env bash
# Install the fixture-replaying `omp` shim and point tests at it.
#
# omp-host's session tests spawn `omp` from PATH, so a directory-level PATH
# edit inside the test process is unreliable (the child resolves PATH at spawn
# time and the tests run concurrently). This script installs a persistent shim
# and exports the environment before `cargo test` starts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHIM_DIR="$ROOT/.test-shim"
FIXTURE="$ROOT/crates/omp-host/tests/fixtures/session_fixture.jsonl"

if [[ ! -f "$FIXTURE" ]]; then
    echo "Error: fixture missing at $FIXTURE" >&2
    exit 1
fi

mkdir -p "$SHIM_DIR"
cp "$ROOT/crates/omp-host/tests/fixtures/fake_omp.sh" "$SHIM_DIR/omp"
chmod +x "$SHIM_DIR/omp"

export FAKE_OMP_FIXTURE="$FIXTURE"
export PATH="$SHIM_DIR:$PATH"

echo "shim: $SHIM_DIR/omp -> $FAKE_OMP_FIXTURE"
exec cargo test -p omp-host "$@"
