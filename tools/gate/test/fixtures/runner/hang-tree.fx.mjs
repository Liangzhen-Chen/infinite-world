import test from 'node:test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
// Starts a grandchild node process, records its PID, then hangs forever.
test('hangs with a child process', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  fs.writeFileSync(process.env.GATE_FX_PIDFILE, String(child.pid));
  setInterval(() => {}, 1000);
  await new Promise(() => {});
});
