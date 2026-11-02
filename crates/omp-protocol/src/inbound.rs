//! Inbound protocol message types (fixture-driven, unknown-tolerant)

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Inbound {
    Ready(Ready),
    Response(Response),
    ExtensionUiRequest(ExtensionUiRequest),
    Event(AgentEvent),
    Unknown(Value),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ready {
    pub protocol_version: u32,
    pub max_frame_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Response {
    pub command: String,
    pub success: bool,
    pub data: Option<Value>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionUiRequest {
    pub id: String,
    pub method: String,
    pub title: Option<String>,
    pub options: Option<Vec<String>>,
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentEvent {
    AgentStart(Value),
    TurnStart(Value),
    MessageStart(Value),
    MessageUpdate { event: AssistantMessageEvent },
    MessageEnd(Value),
    TurnEnd(Value),
    AgentEnd(Value),
    PromptResult(Value),
    SessionSettled(Value),
    ToolExecutionStart(Value),
    ToolExecutionEnd(Value),
    AvailableCommandsUpdate { commands: Vec<Value> },
    Raw(Value),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AssistantMessageEvent {
    ThinkingStart(Value),
    ThinkingDelta(Value),
    ThinkingEnd(Value),
    TextStart(Value),
    TextDelta(Value),
    TextEnd(Value),
    ToolcallStart(Value),
    ToolcallDelta(Value),
    ToolcallEnd(Value),
    Raw(Value),
}

impl Inbound {
    /// Lenient parsing: any shape never panics, unrecognized falls to Unknown.
    pub fn from_value(v: Value) -> Self {
        let ty = v.get("type").and_then(Value::as_str).unwrap_or("");
        match ty {
            "ready" => Inbound::Ready(Ready {
                protocol_version: v.get("protocolVersion").and_then(Value::as_u64).unwrap_or(0) as u32,
                max_frame_bytes: v.get("maxFrameBytes").and_then(Value::as_u64).unwrap_or(0),
            }),
            "response" => Inbound::Response(Response {
                command: v.get("command").and_then(Value::as_str).unwrap_or("").to_string(),
                success: v.get("success").and_then(Value::as_bool).unwrap_or(false),
                data: v.get("data").cloned(),
                error: v.get("error").and_then(Value::as_str).map(str::to_string),
            }),
            "extension_ui_request" => {
                let mut extra = v.as_object().cloned().unwrap_or_default();
                for k in ["type", "id", "method", "title", "options"] {
                    extra.remove(k);
                }
                Inbound::ExtensionUiRequest(ExtensionUiRequest {
                    id: v.get("id").and_then(Value::as_str).unwrap_or("").to_string(),
                    method: v.get("method").and_then(Value::as_str).unwrap_or("").to_string(),
                    title: v.get("title").and_then(Value::as_str).map(str::to_string),
                    options: v.get("options").and_then(Value::as_array)
                        .map(|a| a.iter().filter_map(|o| o.as_str().map(str::to_string)).collect()),
                    extra,
                })
            }
            _ => match agent_event(&v) {
                Some(ev) => Inbound::Event(ev),
                None => Inbound::Unknown(v),
            },
        }
    }
}

/// Event dispatch: actual observed types from blueprint §0. New types in fixture → add variant; uncertain fields → store Value.
fn agent_event(v: &Value) -> Option<AgentEvent> {
    let ty = v.get("type").and_then(Value::as_str)?;
    let ev = match ty {
        "agent_start" => AgentEvent::AgentStart(v.clone()),
        "turn_start" => AgentEvent::TurnStart(v.clone()),
        "message_start" => AgentEvent::MessageStart(v.clone()),
        "message_update" => {
            let inner = v.get("assistantMessageEvent").cloned().unwrap_or(Value::Null);
            AgentEvent::MessageUpdate { event: assistant_event(inner) }
        }
        "message_end" => AgentEvent::MessageEnd(v.clone()),
        "turn_end" => AgentEvent::TurnEnd(v.clone()),
        "agent_end" => AgentEvent::AgentEnd(v.clone()),
        "prompt_result" => AgentEvent::PromptResult(v.clone()),
        "session_settled" => AgentEvent::SessionSettled(v.clone()),
        "tool_execution_start" => AgentEvent::ToolExecutionStart(v.clone()),
        "tool_execution_end" => AgentEvent::ToolExecutionEnd(v.clone()),
        "available_commands_update" => AgentEvent::AvailableCommandsUpdate {
            commands: v.get("commands").and_then(Value::as_array).cloned().unwrap_or_default(),
        },
        _ => return None,
    };
    Some(ev)
}

fn assistant_event(v: Value) -> AssistantMessageEvent {
    let ty = v.get("type").and_then(Value::as_str).unwrap_or("");
    match ty {
        "thinking_start" => AssistantMessageEvent::ThinkingStart(v),
        "thinking_delta" => AssistantMessageEvent::ThinkingDelta(v),
        "thinking_end" => AssistantMessageEvent::ThinkingEnd(v),
        "text_start" => AssistantMessageEvent::TextStart(v),
        "text_delta" => AssistantMessageEvent::TextDelta(v),
        "text_end" => AssistantMessageEvent::TextEnd(v),
        "toolcall_start" => AssistantMessageEvent::ToolcallStart(v),
        "toolcall_delta" => AssistantMessageEvent::ToolcallDelta(v),
        "toolcall_end" => AssistantMessageEvent::ToolcallEnd(v),
        _ => AssistantMessageEvent::Raw(v),
    }
}

/// Response format (§0): {"type":"extension_ui_response","id":"…","value":…}
pub fn extension_ui_response(id: &str, value: Value) -> String {
    serde_json::json!({"type": "extension_ui_response", "id": id, "value": value}).to_string()
}