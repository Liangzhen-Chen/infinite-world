// usage: node card-gate.mjs <worktree> <base> <name> [jobs]   (jobs is ignored: the scheduler decides concurrency)
// Card hand-in gate. Selects the affected fast-tier tests, then only SUBMITS requests to the
// single machine-wide scheduler (submit.ps1) and waits for each run's result.json; it never
// starts a test pool itself. A failing file is re-run on <base> as a separate "baseline" job
// (own git worktree at the fixed base SHA, made by the scheduler) twice independently.
// Writes F:/dnd/logs/sessions/<name>.gate.md, .gate.json and .gate.tsv.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge } from './verdict.mjs';
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
// Keep the runner's full identities and fingerprints intact through aggregation.
async function runJob(kind, files, extra = []) {
  if (!files.length) return { status: 'PASS', files: [] };
  let result;
  try {
    result = await waitFor(submit(kind, files, extra));
  } catch (error) {
    result = { status: 'INCOMPLETE', reason: error.message, files: [] };
  }
  const returned = Array.isArray(result.files) ? result.files : [];
  // Missing selected files must not disappear from the gate's denominator.
  result = { ...result, files: files.map(file => returned.find(f => f.file === file)
    || { file, status: 'INCOMPLETE', reason: result.reason || 'job returned no result for selected file', failures: [] }) };
  for (const f of result.files) {
    console.log(`${new Date().toISOString().slice(11, 19)} ${kind === 'baseline' ? 'base ' : ''}${f.file} ${f.status} fail=${f.counts?.failed ?? f.failures?.length ?? 0} ${Math.round((f.durationMs || 0) / 1000)}s`);
  }
  return result;
}

const started = Date.now();
// Resolve once: a moving branch name must not compare two different baselines.
let baseSHA = null, candidate;
try {
  baseSHA = execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { cwd: wt, encoding: 'utf8' }).trim();
  candidate = await runJob('card', fast);
} catch (error) {
  candidate = { status: 'INCOMPLETE', reason: `base resolution failed: ${error.message}`,
    files: fast.map(file => ({ file, status: 'INCOMPLETE', reason: error.message, failures: [] })) };
}
const bad = candidate.files.filter(f => f.status === 'FAIL').map(f => f.file);
const baselineRuns = [];
if (bad.length) {
  baselineRuns.push(await runJob('baseline', bad, ['-Base', baseSHA]));
  // -Rerun bypasses submit/scheduler deduplication. Both runs cover ALL failing
  // candidate files, even when the first baseline passed or was incomplete.
  baselineRuns.push(await runJob('baseline', bad, ['-Base', baseSHA, '-Rerun']));
}
let knownFailures = [];
try {
  knownFailures = JSON.parse(fs.readFileSync(path.join(T, 'policy/known-failures.json'), 'utf8'));
  if (!Array.isArray(knownFailures)) throw Error('known-failures policy must be an array');
} catch (error) {
  knownFailures = [];
  candidate.status = 'INCOMPLETE';
  candidate.reason = `known-failures policy unreadable: ${error.message}`;
}
const verdict = judge({ candidate, baselineRuns, knownFailures, now: new Date().toISOString() });
const minutes = Math.round((Date.now() - started) / 60000);
const gate = { ...verdict, worktree: wt, base: baseSHA, name,
  candidateRunId: candidate.runId ?? null, baselineRunIds: baselineRuns.map(r => r.runId ?? null),
  selectedFiles: fast, skippedFiles: skipped, minutes };
fs.mkdirSync(L, { recursive: true });
fs.writeFileSync(path.join(L, `${name}.gate.json`), JSON.stringify(gate, null, 2) + '\n');
// Retain legacy TSV columns for existing consumers, appending the final verdict.
fs.writeFileSync(path.join(L, `${name}.gate.tsv`), candidate.files.map((f, i) => [f.file,
  f.counts?.passed ?? '', f.counts?.failed ?? (f.status === 'PASS' ? 0 : f.failures?.length || 1),
  Math.round((f.durationMs || 0) / 1000), baselineRuns[0]?.files.find(b => b.file === f.file)?.counts?.failed ?? '',
  verdict.files[i].status].join('\t')).join('\n') + '\n');
const md = [`# 卡片门禁 ${name}`, `worktree ${wt} vs ${baseSHA}；${selectorName}；受影响 ${affected.length}，快档 ${fast.length}，慢档未跑 ${skipped.length}；耗时 ${minutes} 分钟`,
  `总判定：**${gate.status}**；退出码：${gate.exitCode}`,
  ...gate.issues.map(issue => `- [${issue.category}] ${issue.status}：${issue.reason}${candidate.reason ? `；${candidate.reason}` : ''}`),
  ...gate.files.flatMap(file => [`- [${file.category}] ${file.file}：${file.status}；${file.reason}`,
    ...file.cases.map(c => `  - ${c.id || JSON.stringify(c.path)}；指纹 ${c.fingerprint || '缺失'}：${c.status}${c.baselineStatus ? ` (${c.baselineStatus})` : ''}；${c.reason}${c.location ? `；${c.location}` : ''}`)]),
  `- 慢档未跑：${skipped.join('、') || '无'}`].join('\n');
fs.writeFileSync(path.join(L, `${name}.gate.md`), md + '\n');
console.log(md);
process.exitCode = gate.exitCode;
