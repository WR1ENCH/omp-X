//! Integration tests for the session actor against a fixture-replaying shim.
//!
//! `spawn()` executes `omp` resolved from PATH (or `OMP_BIN` when set), so
//! these tests rely on a shim installed at `<workspace>/.test-shim/omp`
//! (created by `scripts/test-setup.sh`) and on `FAKE_OMP_FIXTURE` pointing at
//! the captured round. Both are set in the environment before the test process
//! starts, because `Command` snapshots PATH when the child is spawned and a
//! directory-level change made mid-test would race the spawn.
//!
//! Without the shim the tests print an explicit reason and skip rather than
//! driving the real agent.

use std::path::PathBuf;
use std::time::Duration;

use omp_host::session::{spawn, SessionEvent};
use tokio::time::timeout;

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn fixture_jsonl() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/session_fixture.jsonl")
}

fn shim_path() -> PathBuf {
    workspace_root().join(".test-shim/omp")
}

/// Point `spawn` at the fixture shim. Returns `false` (with a printed reason)
/// when the shim has not been installed by `scripts/test-setup.sh`.
fn install_shim_env() -> bool {
    let fixture = fixture_jsonl();
    if !fixture.exists() {
        eprintln!("skipping: fixture missing at {}", fixture.display());
        return false;
    }
    let shim = shim_path();
    if !shim.exists() {
        eprintln!(
            "skipping: fixture shim not installed at {} (run scripts/test-setup.sh)",
            shim.display()
        );
        return false;
    }
    std::env::set_var("OMP_BIN", &shim);
    std::env::set_var("FAKE_OMP_FIXTURE", &fixture);
    true
}

#[tokio::test]
async fn fixture_round_produces_ready_then_session_settled() {
    if !install_shim_env() {
        return;
    }

    let (mut session, mut events) =
        spawn(".", &[] as &[String]).unwrap_or_else(|e| panic!("spawn failed: {e}"));

    let mut saw_ready = false;
    let mut saw_settled = false;
    let deadline = Duration::from_secs(20);
    loop {
        match timeout(deadline, events.recv()).await {
            Ok(Ok(SessionEvent::Inbound(omp_protocol::inbound::Inbound::Ready(_)))) => {
                saw_ready = true
            }
            Ok(Ok(SessionEvent::Inbound(omp_protocol::inbound::Inbound::Event(
                omp_protocol::inbound::AgentEvent::SessionSettled(_),
            )))) => {
                saw_settled = true;
                break;
            }
            // Non-JSON lines are expected: the real binary prints a banner.
            Ok(Ok(SessionEvent::Noise(_))) | Ok(Ok(SessionEvent::Oversized { .. })) => {}
            Ok(Ok(_)) => {}
            Ok(Err(tokio::sync::broadcast::error::RecvError::Lagged(n))) => {
                panic!("event receiver lagged by {n}");
            }
            Ok(Err(tokio::sync::broadcast::error::RecvError::Closed)) => break,
            Err(_) => panic!("timed out waiting for fixture frames"),
        }
    }
    session.kill().expect("kill fixture child");
    assert!(saw_ready, "expected a Ready frame");
    assert!(saw_settled, "expected a SessionSettled event");
}

#[tokio::test]
async fn prompt_round_trips_through_the_child() {
    if !install_shim_env() {
        return;
    }
    let (mut session, mut events) = spawn(".", &[] as &[String]).expect("spawn");
    let handle = session.handle();

    // Wait for `ready`, then queue a prompt. The shim echoes stdin to stderr,
    // which arrives as a Noise event, proving the outbound queue reached the
    // child and the inbound pumps framed the reply.
    let deadline = Duration::from_secs(20);
    let mut saw_ready = false;
    let mut saw_echo = false;
    loop {
        match timeout(deadline, events.recv()).await {
            Ok(Ok(SessionEvent::Inbound(omp_protocol::inbound::Inbound::Ready(_)))) => {
                if !saw_ready {
                    saw_ready = true;
                    handle.send_prompt("hello").expect("queue prompt");
                }
            }
            Ok(Ok(SessionEvent::Noise(text))) => {
                if text.contains("[noise] stdin:") && text.contains("hello") {
                    saw_echo = true;
                    break;
                }
            }
            Ok(Ok(SessionEvent::Oversized { .. })) => {}
            Ok(Ok(_)) => {}
            Ok(Err(tokio::sync::broadcast::error::RecvError::Lagged(n))) => {
                panic!("event receiver lagged by {n}");
            }
            Ok(Err(tokio::sync::broadcast::error::RecvError::Closed)) => break,
            Err(_) => panic!("timed out waiting for the prompt echo"),
        }
    }
    session.kill().expect("kill fixture child");
    assert!(saw_ready, "expected a Ready frame");
    assert!(saw_echo, "expected the prompt to reach the child stdin");
}
