// Real `omp --mode rpc-ui` round, exactly like omp-host's Session::spawn does.
import { spawn } from 'node:child_process';

const cwd = process.argv[2] || '/home/wr1ench/omp-X';
const prompt = process.argv[3] || 'Reply with exactly the word PONG and nothing else.';

const child = spawn('omp', ['--mode', 'rpc-ui'], {
  cwd,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env },
});
child.stderr.on('data', (d) => process.stderr.write(`[omp stderr] ${d}`));

let buf = '';
const events = [];
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let v;
    try { v = JSON.parse(line); } catch { console.log('NONJSON', JSON.stringify(line.slice(0, 200))); continue; }
    events.push(v);
    if (v.type === 'message_update') {
      console.log('EVENT type=message_update inner=', v.assistantMessageEvent?.type, 'delta=', JSON.stringify(v.assistantMessageEvent?.delta ?? '').slice(0, 60));
    } else if (/tool/.test(v.type)) {
      console.log('TOOL_EVENT', line.slice(0, 500));
    } else {
      console.log('EVENT type=', v.type);
    }
    if (v.type === 'ready' || v.protocol_version != null) {
      console.log('READY -> sending prompt');
      child.stdin.write(JSON.stringify({ type: 'prompt', message: prompt }) + '\n');
    }
    if (v.type === 'agent_end' || v.type === 'session_settled') {
      console.log('--- round complete ---');
      child.kill('SIGTERM');
      setTimeout(() => process.exit(0), 500);
    }
  }
});

setTimeout(() => { console.log('TIMEOUT after 120s, events:', events.length); child.kill('SIGKILL'); process.exit(2); }, 120000);
