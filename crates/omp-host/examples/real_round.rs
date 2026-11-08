//! One real `omp --mode rpc-ui` round through the production spawn() path.
//!
//! Not a unit test: it needs the real binary (OMP_BIN or PATH) and live
//! credentials, so it is run manually as acceptance evidence:
//!   OMP_BIN=$(which omp) HOME=<writable> cargo run -p omp-host --example real_round

use std::time::Duration;

use omp_host::session::{spawn, SessionEvent};
use tokio::time::timeout;

#[tokio::main]
async fn main() {
    let cwd = std::env::var("REAL_ROUND_CWD").unwrap_or_else(|_| ".".into());
    let prompt = std::env::var("REAL_ROUND_PROMPT")
        .unwrap_or_else(|_| "Reply with exactly the word PONG and nothing else.".into());

    let (mut session, mut events) =
        spawn(&cwd, &[] as &[String]).expect("spawn real omp");
    let handle = session.handle();
    println!("spawned session id={}", handle.id());

    let deadline = Duration::from_secs(180);
    let mut saw_ready = false;
    let mut saw_agent_start = false;
    let mut saw_text_delta = false;
    let mut saw_turn_end = false;
    let mut saw_agent_end = false;
    let mut saw_prompt_result = false;
    let mut assistant_text = String::new();

    loop {
        let ev = match timeout(deadline, events.recv()).await {
            Ok(Ok(ev)) => ev,
            Ok(Err(tokio::sync::broadcast::error::RecvError::Closed)) => break,
            Ok(Err(e)) => panic!("recv error: {e}"),
            Err(_) => panic!("timed out mid-round"),
        };
        match ev {
            SessionEvent::Inbound(omp_protocol::inbound::Inbound::Ready(r)) => {
                saw_ready = true;
                println!("ready protocol_version={} max_frame_bytes={}", r.protocol_version, r.max_frame_bytes);
                handle.send_prompt(&prompt).expect("queue prompt");
                println!("sent prompt");
            }
            SessionEvent::Inbound(omp_protocol::inbound::Inbound::Event(e)) => match e {
                omp_protocol::inbound::AgentEvent::AgentStart(_) => {
                    saw_agent_start = true;
                }
                omp_protocol::inbound::AgentEvent::TurnEnd(_) => saw_turn_end = true,
                omp_protocol::inbound::AgentEvent::AgentEnd(_) => saw_agent_end = true,
                omp_protocol::inbound::AgentEvent::PromptResult(p) => {
                    saw_prompt_result = true;
                    println!("prompt_result: {}", p);
                }
                other => {
                    if let Some((omp_host::session::AssistantDeltaKind::Text, delta)) =
                        omp_host::session::assistant_delta(&other)
                    {
                        saw_text_delta = true;
                        assistant_text.push_str(&delta);
                    }
                }
            },
            SessionEvent::Noise(text) => println!("noise: {}", text.lines().next().unwrap_or("")),
            SessionEvent::Oversized { len } => println!("oversized frame: {len} bytes"),
            SessionEvent::Inbound(omp_protocol::inbound::Inbound::Response(resp)) => {
                println!("response command={} success={}", resp.command, resp.success);
            }
            SessionEvent::Inbound(other) => println!("inbound: {:?}", other),
        }
        if saw_agent_end && saw_prompt_result {
            break;
        }
    }

    session.kill().expect("kill real child");
    let code = loop {
        match session.try_wait().expect("try_wait") {
            Some(status) => break status,
            None => tokio::time::sleep(Duration::from_millis(50)).await,
        }
    };
    println!("exit code: {code}");

    println!("assistant text: {:?}", assistant_text);
    assert!(saw_ready, "ready");
    assert!(saw_agent_start, "agent_start");
    assert!(saw_text_delta, "text_delta");
    assert!(saw_turn_end, "turn_end");
    assert!(saw_agent_end, "agent_end");
    assert!(saw_prompt_result, "prompt_result");
    let expected = std::env::var("REAL_ROUND_EXPECT").unwrap_or_else(|_| "PONG".into());
    assert!(assistant_text.contains(&expected), "assistant must say {expected}, got {assistant_text:?}");
    println!("REAL ROUND: PASS");
}
