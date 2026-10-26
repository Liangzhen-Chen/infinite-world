// usage: node card-gate.mjs <worktree> <base> <name> [jobs]   (jobs is ignored: the scheduler decides concurrency)
// Card hand-in gate. Selects the affected fast-tier tests, then only SUBMITS requests to the
// single machine-wide scheduler (submit.ps1) and waits for each run's result.json; it never
// starts a test pool itself. A failing file is re-run on <base> as a separate "baseline" job
// (own git worktree at the base SHA, made by the scheduler) and compared per failing case.
// Writes F:/dnd/logs/sessions/<name>.gate.md and .gate.tsv (unchanged output files).
// Judgement aggregation below is deliberately the old per-case comparison; P1 replaces it.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [wt, base = 'master', name = 'card'] = process.argv.slice(2);
const T = path.dirname(fileURLToPath(import.meta.url));
const L = process.env.GATE_SESSIONS || 'F:/dnd/logs/sessions', ROOT = process.env.GATE_ROOT || 'F:/dnd/logs/gate';
const HEARTBEAT_STALE_MS = 120000, POLL_MS = Number(process.env.GATE_POLL_MS) || 2000;
if (!wt) throw Error('usage: card-gate.mjs <worktree> <base> <name> [jobs]');
const slow = new Set(fs.readFileSync(path.join(T, 'slow-tests.tsv'), 'utf8').split('\n').filter(Boolean).map(l => l.split('\t')[0]));
// Coverage-based selection when the nightly map exists; import-graph selection otherwise.
const MAP = path.join(T, 'tia-map.json'), useMap = fs.existsSync(MAP);
const selector = useMap ? [path.join(T, 'test-impact/select.mjs'), wt, base, '--map', MAP] : [path.join(T, 'affected-tests.mjs'), base];
const affected = execFileSync(process.execPath, selector, { cwd: wt, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
const selectorName = useMap ? '覆盖率选测' : 'import 关系选测';
const fast = affected.filter(f => !slow.has(f)), skipped = affected.filter(f => slow.has(f));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const heartbeatAge = () => { try { return Date.now() - fs.statSync(path.join(ROOT, 'scheduler.heartbeat')).mtimeMs; } catch { return Infinity; } };
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

function submit(kind, files, extra = []) {
  fs.mkdirSync(L, { recursive: true });
  const listFile = path.join(L, `${name}.${kind}.files.txt`);
  fs.writeFileSync(listFile, `${files.join('\n')}\n`);
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(T, 'submit.ps1'), '-Kind', kind, '-Card', name, '-Worktree', wt,
    '-FilesFile', listFile, '-Root', ROOT, '-Owner', `card-gate:${name}`, ...extra], { encoding: 'utf8' });
  return out.trim().split(/\r?\n/).pop();
}
async function waitFor(runId) {
  const start = Date.now();
  let lastNote = 0;
  for (;;) {
    let result = readJson(path.join(ROOT, 'jobs', runId, 'result.json'));
    for (let hops = 0; result?.duplicateOf && hops < 5; hops++) result = readJson(path.join(ROOT, 'jobs', result.duplicateOf, 'result.json'));
    if (result && !result.duplicateOf) return result;
    if (heartbeatAge() > HEARTBEAT_STALE_MS) throw Error(`scheduler heartbeat stale/missing under ${ROOT}; run ${runId} stays queued (start the scheduler, then re-run; the request is idempotent)`);
    if (Date.now() - lastNote > 60000) { lastNote = Date.now(); console.log(`${new Date().toISOString().slice(11, 19)} waiting ${runId} ${Math.round((Date.now() - start) / 1000)}s`); }
    await sleep(POLL_MS);
  }
}
// One entry per file in the shape the old per-case comparison expects.
const toRows = (result, prefix = '') => result.files.map(f => {
  const cases = [...new Set((f.failures || []).filter(x => x.kind !== 'suite').map(x => x.path[x.path.length - 1]))];
  const fail = f.status === 'PASS' ? 0 : (f.counts?.failed || cases.length || 1);
  const seconds = Math.round((f.durationMs || 0) / 1000);
  // One progress line per file: watch-progress.sh treats a silent log as stalled.
  console.log(`${new Date().toISOString().slice(11, 19)} ${prefix}${f.file} ${f.status} fail=${fail} ${seconds}s`);
  return { file: f.file, status: f.status, pass: f.counts?.passed ?? null, fail, cases, seconds };
});
async function runJob(kind, files, extra = []) {
  if (!files.length) return [];
  const result = await waitFor(submit(kind, files, extra));
  if (!result.files) throw Error(`run ${result.runId} ended without file results: ${result.status} ${result.reason || ''}`);
  return toRows(result, kind === 'baseline' ? 'base ' : '');
}

const started = Date.now();
const results = await runJob('card', fast);
const bad = results.filter(r => r.fail !== 0);
let baseline = [];
if (bad.length) {
  const baseArgs = ['-Base', base];
  baseline = await runJob('baseline', bad.map(r => r.file), baseArgs);
  // A base failure is confirmed only if it fails again (flaky base runs misled the gate once).
  const again = await runJob('baseline', baseline.filter(b => b.fail !== 0).map(b => b.file), [...baseArgs, '-Rerun']);
  baseline = baseline.map(b => { const a = again.find(x => x.file === b.file); return a ? { ...b, fail: a.fail, cases: b.cases.filter(c => a.cases.includes(c)) } : b; });
}
const baseOf = f => baseline.find(b => b.file === f);
// New regression: any failing case in the branch that the base does not also fail (case level, not file level).
const newCases = r => { const b = baseOf(r.file); if (!b || b.fail === 0) return r.cases.length ? r.cases : ['(file)']; return r.cases.filter(c => !b.cases.includes(c)); };
const newFail = bad.filter(r => newCases(r).length);
const sameFail = bad.filter(r => !newFail.includes(r));
const minutes = Math.round((Date.now() - started) / 60000);
fs.writeFileSync(`${L}/${name}.gate.tsv`, results.map(r => [r.file, r.pass, r.fail, r.seconds, baseOf(r.file)?.fail ?? ''].join('\t')).join('\n') + '\n');
const md = [`# 交卡门禁 ${name}`, `worktree ${wt} vs ${base}（${selectorName}）；受影响 ${affected.length}（快档 ${fast.length}，慢档跳过 ${skipped.length}）；用时 ${minutes} 分钟`,
  `- 通过 ${results.length - bad.length}/${results.length}`, `- **新回归 ${newFail.length}**：${newFail.map(r => `${r.file} ${r.pass}/${r.fail}〔${newCases(r).join(' | ').slice(0, 160)}〕`).join('；') || '无'}`,
  `- 基线同败 ${sameFail.length}：${sameFail.map(r => r.file).join('；') || '无'}`, `- 慢档未跑：${skipped.join('；') || '无'}`].join('\n');
fs.writeFileSync(`${L}/${name}.gate.md`, md + '\n');
console.log(md);
