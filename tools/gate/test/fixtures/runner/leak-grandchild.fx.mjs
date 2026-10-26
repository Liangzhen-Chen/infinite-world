import test from 'node:test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
// Passes, then leaves a long-lived DETACHED grandchild (sharing stdout/stderr) behind and exits 0.
// (Non-detached children are reaped by libuv's job object on Windows, so only detached ones leak.)
test('leaves a grandchild behind', () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit', detached: true });
  fs.writeFileSync(process.env.GATE_FX_PIDFILE, String(child.pid));
  child.unref();
});
