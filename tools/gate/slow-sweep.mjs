// usage: node slow-sweep.mjs --worktree <integration checkout> [--since <sha>] [--root <gate root>]
// Slow sweep (DESIGN §14): runs the slow tier (history median PASS >= policy/tiers.json threshold) at the
// integration head as one `full` job at priority `scan` through the scheduler (submit.ps1), then records the
// swept commit in <root>/slow-sweep.json. On PASS it becomes the last-good marker; on failure the report lists
// the failing files plus the first-parent commit range since the last good sweep, for the main session to bisect.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadThresholdMs, slowFiles } from './tiers.mjs';

const T = path.dirname(fileURLToPath(import.meta.url));
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Pure: marker + this sweep's outcome -> new marker (lastGood moves only on PASS).
export function nextMarker(marker, { sha, status, failing = [], at }) {
  const last = { sha, status, at, failing };
  return { ...(marker || {}), last, lastGood: status === 'PASS' ? { sha, at } : marker?.lastGood ?? null };
}

export async function sweep({ worktree, since, root = process.env.GATE_ROOT || 'F:/dnd/logs/gate', sessions = process.env.GATE_SESSIONS || 'F:/dnd/logs/sessions',
  pollMs = Number(process.env.GATE_POLL_MS) || 2000, log = console.log } = {}) {
  const git = (...args) => execFileSync('git', args, { cwd: worktree, encoding: 'utf8' }).trim();
  const sha = git('rev-parse', '--verify', 'HEAD^{commit}');
  const history = readJson(path.join(root, 'history.json')) || {};
  const files = slowFiles(history, loadThresholdMs(path.join(T, 'policy/tiers.json')), f => fs.existsSync(path.join(worktree, f)));
  if (!files.length) throw Error('no slow-tier files found (history empty or all below threshold)');
  fs.mkdirSync(sessions, { recursive: true });
  const listFile = path.join(sessions, 'slow-sweep.files.txt');
  fs.writeFileSync(listFile, `${files.join('\n')}\n`);
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(T, 'submit.ps1'), '-Kind', 'full', '-Card', 'slow-sweep',
    '-Worktree', worktree, '-Snapshot', sha, '-Priority', 'scan', '-FilesFile', listFile, '-Root', root, '-Owner', 'slow-sweep'], { encoding: 'utf8' });
  const runId = out.trim().split(/\r?\n/).pop();
  log(`slow sweep ${runId}: ${files.length} files at ${sha.slice(0, 10)}`);
  let result;
  for (;;) {
    result = readJson(path.join(root, 'jobs', runId, 'result.json'));
    for (let hops = 0; result?.duplicateOf && hops < 5; hops++) result = readJson(path.join(root, 'jobs', result.duplicateOf, 'result.json'));
    if (result && !result.duplicateOf) break;
    let age = Infinity;
    try { age = Date.now() - fs.statSync(path.join(root, 'scheduler.heartbeat')).mtimeMs; } catch { /* missing */ }
    if (age > 120000) throw Error(`scheduler heartbeat stale/missing under ${root}; ${runId} stays queued (re-run is idempotent)`);
    await sleep(pollMs);
  }
  const returned = Array.isArray(result.files) ? result.files : [];
  // A selected file with no result counts as not passing, like card-gate.
  const failing = files.filter(f => returned.find(r => r.file === f)?.status !== 'PASS');
  const status = result.status === 'PASS' && !failing.length ? 'PASS' : 'FAIL';
  const markerFile = path.join(root, 'slow-sweep.json');
  const marker = readJson(markerFile);
  const from = since || marker?.lastGood?.sha;
  fs.writeFileSync(markerFile, JSON.stringify(nextMarker(marker, { sha, status, failing, at: new Date().toISOString() }), null, 2) + '\n');
  const lines = [`slow sweep ${status} at ${sha.slice(0, 10)}; ${files.length - failing.length}/${files.length} slow files PASS`];
  if (status === 'FAIL') {
    lines.push(`failing: ${failing.join(', ')}`);
    if (from) {
      let range = '';
      try { range = git('log', '--first-parent', '--oneline', `${from}..${sha}`); } catch (error) { range = `(range unavailable: ${error.message.split('\n')[0]})`; }
      lines.push(`bisect range ${from.slice(0, 10)}..${sha.slice(0, 10)} (first-parent):`, range);
    } else lines.push('no last-good sweep recorded; pass --since <sha> to get a bisect range');
  }
  log(lines.join('\n'));
  return { status, sha, failing, runId };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  if (!opt('worktree')) { console.error('usage: slow-sweep.mjs --worktree <integration checkout> [--since <sha>] [--root <gate root>]'); process.exit(2); }
  const result = await sweep({ worktree: opt('worktree'), since: opt('since'), root: opt('root') });
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}
