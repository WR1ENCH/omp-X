//! Session actor: manages PTY child process and I/O
//!
//! Note: This is a legacy implementation. The proper session actor per M1 Task 5
//! will use `omp_host::framing` and `omp_protocol::inbound` types.

use anyhow::{Context, Result};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::{Child, Command},
    sync::mpsc,
};
use tracing::{debug, error, info};

// Placeholder type for outbound messages (replaced in Task 5)
#[derive(Debug, Clone)]
pub struct OutboundMessage {
    pub data: String,
}

pub struct Session {
    child: Child,
    stdin_tx: mpsc::Sender<Vec<u8>>,
}

impl Session {
    /// Spawn a new session with the given command
    pub fn spawn(cmd: &str, args: &[&str], cwd: &str) -> Result<(Self, mpsc::Receiver<OutboundMessage>)> {
        let (stdin_tx, mut stdin_rx): (mpsc::Sender<Vec<u8>>, mpsc::Receiver<Vec<u8>>) = mpsc::channel(32);
        let (outbound_tx, outbound_rx) = mpsc::channel(32);

        let mut child = Command::new(cmd)
            .args(args)
            .current_dir(cwd)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .context("spawn child process")?;

        let mut stdin = child.stdin.take().context("stdin not piped")?;
        let mut stdout = child.stdout.take().context("stdout not piped")?;
        let mut stderr = child.stderr.take().context("stderr not piped")?;

        // Forward stdin to child
        tokio::spawn(async move {
            while let Some(data) = stdin_rx.recv().await {
                if stdin.write_all(&data).await.is_err() {
                    break;
                }
            }
        });

        // Read stdout -> outbound (placeholder, replaced in Task 5)
        let outbound_tx_clone = outbound_tx.clone();
        tokio::spawn(async move {
            let mut buf = vec![0u8; 4096];
            loop {
                match stdout.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        if outbound_tx_clone
                            .send(OutboundMessage {
                                data: String::from_utf8_lossy(&buf[..n]).into(),
                            })
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    Err(e) => {
                        error!("stdout read error: {}", e);
                        break;
                    }
                }
            }
        });

        // Read stderr -> log
        tokio::spawn(async move {
            let mut buf = vec![0u8; 4096];
            loop {
                match stderr.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => debug!("stderr: {}", String::from_utf8_lossy(&buf[..n])),
                    Err(e) => {
                        error!("stderr read error: {}", e);
                        break;
                    }
                }
            }
        });

        info!("Session spawned: {} {:?}", cmd, args);
        Ok((Self { child, stdin_tx }, outbound_rx))
    }

    /// Write data to child stdin
    pub async fn write(&self, data: &[u8]) -> Result<()> {
        self.stdin_tx.send(data.to_vec()).await.map_err(|_| anyhow::anyhow!("stdin channel closed"))
    }

    /// Wait for child to exit
    pub async fn wait(&mut self) -> Result<i32> {
        Ok(self.child.wait().await.context("wait for child")?.code().unwrap_or(-1))
    }

    /// Kill the child process
    pub async fn kill(&mut self) -> Result<()> {
        self.child.kill().await.context("kill child")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn spawn_echo_session() {
        let (_session, _rx) = Session::spawn("echo", &["hello"], ".").unwrap();
    }

    #[tokio::test]
    async fn write_to_session() {
        let (mut session, _rx) = Session::spawn("cat", &[], ".").unwrap();
        session.write(b"test\n").await.unwrap();
        session.kill().await.unwrap();
    }
}