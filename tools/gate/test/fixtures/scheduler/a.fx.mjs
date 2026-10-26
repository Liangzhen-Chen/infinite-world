import fs from 'node:fs';
import test from 'node:test';
// Logs start/end with the card id so the host test can measure real overlap independently of the scheduler.
const log = process.env.FX_LOG;
const mark = kind => log && fs.appendFileSync(log, JSON.stringify({ t: Date.now(), kind, pid: process.pid, card: process.env.FX_CARD || '', file: 'a' }) + String.fromCharCode(10));
test('a', async () => {
  mark('S');
  await new Promise(resolve => setTimeout(resolve, Number(process.env.FX_SLEEP || 600)));
  mark('E');
});
