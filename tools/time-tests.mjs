// 逐文件单跑测试并记录耗时。用法：
//   node tools/time-tests.mjs --out <tsv> [--concurrency 2] [--timeout 120] [--only a,b] [--skip a,b] [--append]
// 输出列：file, seconds, status(ok|fail|TIMEOUT), pass, fail, exitCode
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? '1' : arr[i + 1]]] : a, []));
const out = args.out, conc = Number(args.concurrency || 2), timeout = Number(args.timeout || 120) * 1000;
const only = args.only ? args.only.split(',') : null, skip = new Set(args.skip ? args.skip.split(',') : []);
let files = fs.readdirSync('tests').filter(f => f.endsWith('.test.mjs')).sort().map(f => 'tests/' + f);
if (only) files = files.filter(f => only.some(o => f.includes(o)));
files = files.filter(f => !skip.has(f));
if (args.append && fs.existsSync(out)) { const done = new Set(fs.readFileSync(out, 'utf8').split('\n').map(l => l.split('\t')[0])); files = files.filter(f => !done.has(f)); }
else if (!args.append) fs.writeFileSync(out, '');
const env = { ...process.env, TEMP: 'F:/dnd-tmp', TMP: 'F:/dnd-tmp' };
let idx = 0, running = 0;
function runOne(f) {
  return new Promise(res => {
    const t0 = Date.now(); let buf = ''; let timedOut = false;
    const p = spawn(process.execPath, [f], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', d => { buf += d; if (buf.length > 4e6) buf = buf.slice(-2e6); });
    p.stderr.on('data', d => { buf += d; if (buf.length > 4e6) buf = buf.slice(-2e6); });
    const tm = setTimeout(() => { timedOut = true; spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F']); }, timeout);
    p.on('close', code => {
      clearTimeout(tm);
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      const pass = (buf.match(/^ℹ pass (\d+)/m) || [])[1] ?? '', fail = (buf.match(/^ℹ fail (\d+)/m) || [])[1] ?? '';
      const status = timedOut ? 'TIMEOUT' : (code === 0 ? 'ok' : 'fail');
      fs.appendFileSync(out, [f, sec, status, pass, fail, code].join('\t') + '\n');
      res();
    });
  });
}
await new Promise(done => {
  const next = () => {
    while (running < conc && idx < files.length) { running++; runOne(files[idx++]).then(() => { running--; next(); }); }
    if (running === 0 && idx >= files.length) done();
  };
  next();
});
