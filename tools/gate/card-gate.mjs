// usage: node card-gate.mjs <worktree> <base> <name> [jobs]   (jobs is ignored: the scheduler decides concurrency)
// Card hand-in gate. Selects the affected fast-tier tests, then only SUBMITS requests to the
// single machine-wide scheduler (submit.ps1) and waits for each run's result.json; it never
// starts a test pool itself. A failing file is re-run on <base> as a separate "baseline" job
// (own git worktree at the fixed base SHA, made by the scheduler) twice independently.
// Writes F:/dnd/logs/sessions/<name>.gate.md, .gate.json and .gate.tsv.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge, isDeferredOnly } from './verdict.mjs';
import { loadAlwaysFast, loadStaticSlow, loadThresholdMs, splitTiers } from './tiers.mjs';
import { mergeBaseline, splitCached, writeCached } from './baseline-cache.mjs';
const [wt, base = 'master', name = 'card'] = process.argv.slice(2);
const T = path.dirname(fileURLToPath(import.meta.url));
const L = process.env.GATE_SESSIONS || 'F:/dnd/logs/sessions', ROOT = process.env.GATE_ROOT || 'F:/dnd/logs/gate';
const HEARTBEAT_STALE_MS = 120000, POLL_MS = Number(process.env.GATE_POLL_MS) || 2000;
if (!wt) throw Error('usage: card-gate.mjs <worktree> <base> <name> [jobs]');
// Shadow runs the conservative set; both sets are persisted without changing judgement.
const MAP = path.join(T, 'tia-map.json');
const selector = [path.join(T, 'test-impact/select.mjs'), wt, base, '--map', MAP, '--json'];
const selection = JSON.parse(execFileSync(process.execPath, selector, { cwd: wt, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }));
const affected = selection.tests;
const selectorName = `覆盖率选测 (${selection.mode})`;
// §14: changed tests and CORE remain blocking regardless of historical duration.
const required = new Set(selection.requiredFiles);
const thresholdMs = loadThresholdMs(path.join(T, 'policy/tiers.json'));
const readHistory = () => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'history.json'), 'utf8')); } catch { return {}; } };
// Fast tier: median PASS < threshold, no history at all, required, or alwaysFast (current stage acceptance tests). The slow tier is left to slow-sweep.mjs.
const { fast, slow: skipped } = splitTiers({ tests: affected, required: [...required], alwaysFast: loadAlwaysFast(path.join(T, 'policy/tiers.json')), history: readHistory(), thresholdMs, staticSlow: loadStaticSlow(path.join(T, 'slow-tests.tsv')) });

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
  // Scheduler summaries omit deferred/event evidence. Read the persisted runner
  // result belonging to this exact job/file without changing the scheduler.
  const returned = (Array.isArray(result.files) ? result.files : []).map(f => {
    const detail = f.id && result.runId
      ? readJson(path.join(ROOT, 'jobs', result.runId, 'results', `${f.id}.json`)) : null;
    return detail?.file === f.file && detail.runId === result.runId && detail.status === f.status
      ? { ...f, ...detail, id: f.id } : f;
  });
  // Missing selected files must not disappear from the gate's denominator.
  result = { ...result, files: files.map(file => returned.find(f => f.file === file)
    || { file, status: 'INCOMPLETE', reason: result.reason || 'job returned no result for selected file', failures: [] }) };
  for (const f of result.files) {
    console.log(`${new Date().toISOString().slice(11, 19)} ${kind === 'baseline' ? 'base ' : ''}${f.file} ${f.status} fail=${f.counts?.failed ?? f.failures?.length ?? 0} ${Math.round((f.durationMs || 0) / 1000)}s`);
  }
  return result;
}

// Immutable snapshot of the worktree (tracked + untracked, non-ignored) as a commit built through a throw-away index,
// so edits made while the gate runs cannot change what is tested. Fixed author/date: same tree => same SHA => idempotent job. Failure makes the gate INCOMPLETE.
function makeSnapshot() {
  const index = path.join(os.tmpdir(), `gate-snap-idx-${process.pid}-${Date.now()}`);
  const git = (...args) => execFileSync('git', ['-C', wt, ...args], { encoding: 'utf8', env: { ...process.env, GIT_INDEX_FILE: index, GIT_AUTHOR_NAME: 'gate', GIT_AUTHOR_EMAIL: 'gate@localhost', GIT_COMMITTER_NAME: 'gate', GIT_COMMITTER_EMAIL: 'gate@localhost', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' }, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    git('read-tree', 'HEAD'); git('add', '-A');
    return git('commit-tree', git('write-tree'), '-p', 'HEAD', '-m', `gate snapshot ${name}`);
  } catch (error) {
    throw Error(`snapshot failed: ${String(error.message).slice(0, 160)}`);   // never gate the editable live worktree instead
  } finally { fs.rmSync(index, { force: true }); }
}

const started = Date.now();
// Resolve once: a moving branch name must not compare two different baselines.
let baseSHA = null, candidate;
try {
  baseSHA = execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { cwd: wt, encoding: 'utf8' }).trim();
  const snapshot = makeSnapshot();
  candidate = await runJob('card', fast, ['-Snapshot', snapshot]);
} catch (error) {
  candidate = { status: 'INCOMPLETE', reason: /^snapshot failed/.test(error.message) ? error.message : `base resolution failed: ${error.message}`,
    files: fast.map(file => ({ file, status: 'INCOMPLETE', reason: error.message, failures: [] })) };
}
const bad = candidate.files.filter(f => f.status === 'FAIL').map(f => f.file);
const deferredFiles = candidate.files.filter(isDeferredOnly).map(f => f.file);
const baselineRuns = [];
const firstBaselineFiles = [...new Set([...bad, ...deferredFiles])];
// An INCOMPLETE candidate (cancelled, timeout, snapshot failed) is not judged on baselines, so none is started.
const candidateIncomplete = candidate.status === 'INCOMPLETE' && candidate.files.some(f => !['PASS', 'FAIL'].includes(f.status) && !isDeferredOnly(f));
if (firstBaselineFiles.length && !candidateIncomplete) {
  // Cards on the same base share first-run results; the -Rerun below is never cached, so the two runs stay independent.
  const { hits, misses } = splitCached(ROOT, baseSHA, firstBaselineFiles);
  const fresh = misses.length ? await runJob('baseline', misses, ['-Base', baseSHA]) : null;
  for (const f of fresh?.files || []) writeCached(ROOT, baseSHA, f);
  if (hits.length) console.log(`baseline cache hit ${hits.length}/${firstBaselineFiles.length} @${baseSHA.slice(0, 8)}`);
  baselineRuns.push(hits.length ? mergeBaseline(baseSHA, firstBaselineFiles, hits, fresh) : fresh);
  // -Rerun bypasses submit/scheduler deduplication. The second run covers every failing
  // candidate file whose first baseline did not PASS (FAIL, incomplete or missing).
  // A file that PASSed the first baseline can never be BASELINE_REPRODUCED, so only the others get the independent second run.
  const rerun = bad.filter(file => baselineRuns[0].files.find(f => f.file === file)?.status !== 'PASS');
  if (rerun.length) baselineRuns.push(await runJob('baseline', rerun, ['-Base', baseSHA, '-Rerun']));
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
  selectedFiles: fast, skippedFiles: skipped, minutes, selection };
fs.mkdirSync(L, { recursive: true });
fs.writeFileSync(path.join(L, `${name}.gate.json`), JSON.stringify(gate, null, 2) + '\n');
// Retain legacy TSV columns for existing consumers, appending the final verdict.
fs.writeFileSync(path.join(L, `${name}.gate.tsv`), candidate.files.map((f, i) => [f.file,
  f.counts?.passed ?? '', f.counts?.failed ?? (f.status === 'PASS' ? 0 : f.failures?.length || 1),
  Math.round((f.durationMs || 0) / 1000), baselineRuns[0]?.files.find(b => b.file === f.file)?.counts?.failed ?? '',
  verdict.files[i].status].join('\t')).join('\n') + '\n');
// Compact report: verdict, pass ratio, only non-PASS files (grouped), deferred counts, shadow summary, skipped slow tier.
const clip = (text, n = 120) => { const one = String(text ?? '').replace(/\s+/g, ' ').trim(); return one.length > n ? `${one.slice(0, n - 1)}…` : one; };
const caseLabel = c => clip(c.id || JSON.stringify(c.path), 80);
const nonPass = gate.files.filter(file => file.status !== 'PASS');
const groupOf = status => (['FAIL', 'BLOCKED', 'INCOMPLETE'].includes(status) ? status : 'INCOMPLETE');
const groups = ['FAIL', 'BLOCKED', 'INCOMPLETE'].map(status => [status, nonPass.filter(file => groupOf(file.status) === status)]).filter(([, list]) => list.length);
const bad1 = file => {
  const worst = file.cases.find(c => c.status !== 'KNOWN') || file.cases[0];
  const detail = worst ? `${caseLabel(worst)}：${clip(worst.reason, 80)}${file.cases.length > 1 ? `（共 ${file.cases.length} 个用例）` : ''}` : clip(file.reason);
  return `- ${file.file}（${file.category}）：${detail}`;
};
const deferredTotals = { existing: 0, added: 0, resolved: 0, unverified: 0 };
for (const file of gate.files) for (const key of Object.keys(deferredTotals)) deferredTotals[key] += file.deferred?.[key]?.length || 0;
const conservativeCount = selection.conservative?.tests?.length ?? affected.length;
const coverageCount = selection.coverage?.tests?.length ?? affected.length;
const omitted = selection.shadow?.omittedFiles?.length ?? 0;
const md = [`# 卡片门禁 ${name}`, `worktree ${wt} vs ${baseSHA}；${selectorName}；耗时 ${minutes} 分钟`,
  `总判定：**${gate.status}**；退出码：${gate.exitCode}${skipped.length ? '；本结果仅覆盖快档，慢档由慢档扫描兜底' : ''}`,
  `通过 ${gate.files.length - nonPass.length}/${gate.files.length}（快档 ${fast.length}）`,
  ...gate.issues.map(issue => `- [${issue.category}] ${issue.status}：${clip(issue.reason)}${candidate.reason ? `；${clip(candidate.reason)}` : ''}`),
  ...groups.flatMap(([status, list]) => [`## ${status}（${list.length}）`, ...list.map(bad1)]),
  `已登记既有失败（KNOWN，已判 PASS）：${gate.files.reduce((n, file) => n + file.cases.filter(c => c.status === 'KNOWN').length, 0)} 个用例`,
  `既有待办：既有 ${deferredTotals.existing}，新增 ${deferredTotals.added}，已移除 ${deferredTotals.resolved}，未核实 ${deferredTotals.unverified}`,
  `影子选测：保守集合 ${conservativeCount}，裁剪集合 ${coverageCount}，裁剪会漏掉 ${omitted} 个文件`,
  `${skipped.length} slow files deferred to slow sweep`].join('\n');
fs.writeFileSync(path.join(L, `${name}.gate.md`), md + '\n');
console.log(md);
process.exitCode = gate.exitCode;
