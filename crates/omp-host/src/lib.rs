//! omp 主机层：切帧、噪声旁路、子进程 actor
//!
//! `session` owns the child process and exposes two channels:
//! - `events` (broadcast): parsed protocol frames for the UI
//! - `outbound` (mpsc): prompts / UI responses to write to the child's stdin
//! `framing` turns raw stdout bytes into complete JSON frames.

pub mod framing;
pub mod session;
