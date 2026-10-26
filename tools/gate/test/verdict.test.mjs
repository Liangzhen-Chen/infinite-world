import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { judge, isDeferredOnly } from '../verdict.mjs';
import { loadThresholdMs, splitTiers } from '../tiers.mjs';

const now = '2026-10-26T12:00:00.000Z';
const failure = (name = 'A', fingerprint = 'assertion-1', suite = 'suite') => ({
  id: `${suite} > ${name}`, path: [suite, name], fingerprint, location: 'tests/a.test.mjs:12:3' });
const file = (status = 'FAIL', failures = [failure()], extra = {}) => ({
  file: 'tests/a.test.mjs', status, exitCode: status === 'PASS' ? 0 : 1,
  failures: status === 'PASS' ? [] : failures, ...extra });
const job = (files = [file()], runId) => ({ runId,
  status: files.every(f => f.status === 'PASS') ? 'PASS'
    : files.every(f => ['PASS', 'FAIL'].includes(f.status)) ? 'FAIL' : 'INCOMPLETE', files });
const known = (extra = {}) => ({ file: 'tests/a.test.mjs', ...failure(), owner: 'gate-owner',
  expiresAt: '2026-10-27', ...extra });
const input = (extra = {}) => ({ candidate: job(), baselineRuns: [job([file()], 'base1'), job([file()], 'base2')],
  knownFailures: [], now, ...extra });
const first = result => result.files[0].cases[0];
const deferred = (name = 'later', kind = 'todo') => ({ id: `suite > ${name}`, path: ['suite', name], kind });
const deferredFile = (items = [deferred()], extra = {}) => file('INCOMPLETE', [], {
  reason: 'unauthorised skip/todo', exitCode: 0, streamComplete: true, badEventLines: 0,
  deferred: items, counts: { tests: items.length + 1, passed: 1, failed: 0, cancelled: 0,
    skipped: items.filter(d => d.kind === 'skip').length, todo: items.filter(d => d.kind === 'todo').length }, ...extra });

test('candidate deferred subset passes with one complete baseline, reporting counts', () => {
  const result = judge(input({ candidate: job([deferredFile()]),
    baselineRuns: [job([deferredFile([deferred(), deferred('other')])])] }));
  assert.equal(result.status, 'PASS');
  assert.equal(result.files[0].category, '既有待办');
  assert.deepEqual(result.files[0].deferred.existing, [deferred()]);
  assert.deepEqual(result.files[0].deferred.resolved, [deferred('other')]);
  assert.match(result.files[0].reason, /1.*0.*1/);
});

test('new todo, executable test changed to skip, and todo changed to skip are blocked by identity and kind', () => {
  for (const [current, previous] of [
    [[deferred(), deferred('new')], [deferred()]],
    [[deferred('was-executable', 'skip')], []],
    [[deferred('later', 'skip')], [deferred()]],
    [[{ ...deferred(), path: ['different-suite', 'later'] }], [deferred()]],
  ]) {
    const baseline = previous.length ? deferredFile(previous) : deferredFile([], { status: 'PASS', reason: 'ok' });
    const result = judge(input({ candidate: job([deferredFile(current)]), baselineRuns: [job([baseline])] }));
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.files[0].deferred.added.length, 1);
    assert.equal(result.files[0].deferred.added[0].id, current.at(-1).id);
  }
});

test('missing or incomplete baseline cannot authorise deferred, even with a later good run', () => {
  for (const base of [job([]), job([deferredFile(undefined, { status: 'TIMEOUT' })]),
    job([deferredFile(undefined, { streamComplete: false })]),
    job([deferredFile(undefined, { badEventLines: 1 })]),
    job([deferredFile(undefined, { reason: 'zero test cases' })]),
    job([deferredFile(undefined, { status: 'PASS', exitCode: undefined })])]) {
    const result = judge(input({ candidate: job([deferredFile()]), baselineRuns: [base, job([deferredFile()])] }));
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.files[0].deferred.unverified, [deferred()]);
  }
});

test('last todo becoming a real test passes and is reported when baseline is supplied', () => {
  const candidate = deferredFile([], { status: 'PASS', reason: 'ok' });
  const result = judge(input({ candidate: job([candidate]), baselineRuns: [job([deferredFile()])] }));
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.files[0].deferred.resolved, [deferred()]);
  assert.deepEqual(result.files[0].deferred.added, []);
});

test('deferred cannot excuse incomplete streams, failed exits, invalid counts or unrelated job errors', () => {
  for (const change of [{ streamComplete: false }, { streamComplete: undefined }, { badEventLines: 1 },
    { timedOut: true }, { signal: 'SIGSEGV' }, { exitCode: 1 }, { reason: 'zero test cases' },
    { counts: { tests: 2, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 2 } }]) {
    const result = judge(input({ candidate: job([deferredFile(undefined, change)]), baselineRuns: [job([deferredFile()])] }));
    assert.equal(result.status, 'INCOMPLETE');
  }
  const result = judge(input({ candidate: { ...job([deferredFile()]), reason: 'policy unreadable' },
    baselineRuns: [job([deferredFile()])] }));
  assert.equal(result.status, 'INCOMPLETE');
});

test('real failures retain two-run rules while deferred is compared separately', () => {
  const mixed = items => deferredFile(items, { status: 'FAIL', exitCode: 1, failures: [failure()],
    counts: { tests: items.length + 2, passed: 1, failed: 1, cancelled: 0, skipped: 0, todo: items.length } });
  const baselineRuns = [job([mixed([deferred()])], 'base1'), job([mixed([deferred()])], 'base2')];
  const args = input({ candidate: job([mixed([deferred()])]), baselineRuns });
  const blockedOldFailure = judge(args);
  assert.equal(blockedOldFailure.status, 'BLOCKED');
  assert.equal(first(blockedOldFailure).baselineStatus, 'BASELINE_REPRODUCED');
  assert.equal(blockedOldFailure.files[0].deferred.status, 'PASS');
  assert.equal(judge({ ...args, knownFailures: [known()] }).status, 'PASS');
  const added = judge({ ...args, candidate: job([mixed([deferred(), deferred('new')])]), knownFailures: [known()] });
  assert.equal(added.status, 'BLOCKED');
  assert.equal(first(added).status, 'KNOWN');
  assert.equal(added.files[0].deferred.added[0].id, deferred('new').id);
  assert.equal(judge({ ...args, baselineRuns: baselineRuns.slice(0, 1), knownFailures: [known()] }).status, 'INCOMPLETE');
  const regression = judge({ ...args, baselineRuns: [job([deferredFile()], 'base1'), job([deferredFile()], 'base2')] });
  assert.equal(regression.status, 'FAIL');
  assert.equal(first(regression).status, 'REGRESSION');
  assert.equal(regression.files[0].deferred.status, 'PASS');
  const regressionAndAdded = judge({ ...args, candidate: job([mixed([deferred(), deferred('new')])]),
    baselineRuns: [job([deferredFile()], 'base1'), job([deferredFile()], 'base2')] });
  assert.equal(regressionAndAdded.status, 'FAIL');
  assert.equal(regressionAndAdded.files[0].deferred.status, 'BLOCKED');
});

test('candidate PASS needs no baseline and input remains unchanged', () => {
  const args = input({ candidate: job([file('PASS')]), baselineRuns: [] });
  const before = JSON.stringify(args);
  assert.equal(judge(args).status, 'PASS');
  assert.equal(judge(args).files[0].sourceStatus, 'PASS');
  assert.equal(JSON.stringify(args), before);
  assert.deepEqual(judge(args), judge(args));
});

test('baseline A and candidate B in the same file is a regression', () => {
  const result = judge(input({ candidate: job([file('FAIL', [failure('B')])]) }));
  assert.equal(result.status, 'FAIL');
  assert.equal(first(result).status, 'REGRESSION');
  assert.deepEqual(first(result).path, ['suite', 'B']);
  assert.match(first(result).reason, /0\/2/);
});

test('same name with a different fingerprint is a regression even if registered', () => {
  const result = judge(input({ candidate: job([file('FAIL', [failure('A', 'new-assertion')])]),
    knownFailures: [known({ fingerprint: 'new-assertion' })] }));
  assert.equal(result.status, 'FAIL');
  assert.equal(first(result).status, 'REGRESSION');
});

test('full suite path and duplicate suffix distinguish same-named cases', () => {
  for (const f of [failure('A', 'assertion-1', 'other-suite'), { ...failure(), id: 'suite > A #2' },
    { ...failure(), path: ['different', 'A'] }]) {
    assert.equal(judge(input({ candidate: job([file('FAIL', [f])]) })).status, 'FAIL');
  }
});

test('one observed baseline failure is never a waiver, in either order', () => {
  for (const bases of [[job(), job([file('PASS')])], [job([file('PASS')]), job()]]) {
    const result = judge(input({ baselineRuns: bases, knownFailures: [known()] }));
    assert.equal(result.status, 'FAIL');
    assert.match(first(result).reason, /1\/2/);
  }
});

test('two reproduced failures require an exact, live registration', () => {
  const blocked = judge(input());
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(first(blocked).status, 'BLOCKED_PREEXISTING');
  assert.equal(first(blocked).baselineStatus, 'BASELINE_REPRODUCED');
  const allowed = judge(input({ knownFailures: [known()] }));
  assert.equal(allowed.status, 'PASS');
  assert.equal(first(allowed).status, 'KNOWN');
  assert.equal(first(allowed).baselineStatus, 'BASELINE_REPRODUCED');
  for (const entry of [known({ expiresAt: '2026-10-25' }), known({ owner: ' ' }),
    known({ expiresAt: 'bad-date' }), known({ expiresAt: '2026-02-30' }),
    known({ file: 'tests/other.test.mjs' }), known({ path: ['other', 'A'] }),
    known({ id: 'suite > B' }), known({ fingerprint: 'different' }), null]) {
    assert.equal(judge(input({ knownFailures: [entry] })).status, 'BLOCKED');
  }
});

test('expiry is deterministic, inclusive for UTC dates, exact for timestamps', () => {
  assert.equal(judge(input({ knownFailures: [known({ expiresAt: '2026-10-26' })],
    now: '2026-10-26T23:59:59.999Z' })).status, 'PASS');
  assert.equal(judge(input({ knownFailures: [known({ expiresAt: now })] })).status, 'PASS');
  assert.equal(judge(input({ knownFailures: [known({ expiresAt: now })],
    now: '2026-10-26T12:00:00.001Z' })).status, 'BLOCKED');
  assert.equal(judge(input({ knownFailures: [known()], now: undefined })).status, 'BLOCKED');
  const args = input({ knownFailures: [known()], now: undefined });
  args.candidate.endedAt = now;
  assert.equal(judge(args).status, 'PASS');
});

test('nonzero exit without cases, timeout, crash and incomplete are infrastructure failures', () => {
  for (const f of [file('FAIL', []), file('TIMEOUT'), file('CRASH'), file('INCOMPLETE'),
    file('PASS', [], { exitCode: 1 }), file('PASS', [], { exitCode: null }),
    file('PASS', [], { timedOut: true }), file('PASS', [], { signal: 'SIGSEGV' })]) {
    const result = judge(input({ candidate: job([f]), knownFailures: [known()] }));
    assert.equal(result.status, 'INCOMPLETE');
    assert.equal(result.files[0].category, '基础设施');
    if (f.failures.length) {
      assert.equal(first(result).id, f.failures[0].id, 'retain partial failure evidence');
      assert.equal(first(result).status, 'UNRESOLVED');
    }
  }
});

test('missing, incomplete or reused baseline jobs cannot prove reproduction', () => {
  for (const bases of [[job(), job([])], [job()],
    [job(), job([file('TIMEOUT')])], [job(), job([file('CRASH')])],
    [job(), job([file('INCOMPLETE')])], [job(), job([file('FAIL', [])])],
    [job([file()], 'same-run'), job([file()], 'same-run')]]) {
    const result = judge(input({ baselineRuns: bases, knownFailures: [known()] }));
    assert.equal(result.status, 'INCOMPLETE');
    assert.equal(first(result).status, 'UNRESOLVED');
  }
});

test('all failures must be covered; malformed failure evidence cannot be waived', () => {
  const result = judge(input({ candidate: job([file('FAIL', [failure(), failure('B')])]), knownFailures: [known()] }));
  assert.equal(result.status, 'FAIL');
  assert.deepEqual(result.files[0].cases.map(c => c.status), ['KNOWN', 'REGRESSION']);
  assert.equal(judge(input({ candidate: job([file('FAIL', [{ ...failure(), fingerprint: null }])]) })).status, 'INCOMPLETE');
  assert.equal(judge({}).status, 'INCOMPLETE');
  assert.equal(judge(input({ candidate: { status: 'FAIL', files: [] } })).status, 'INCOMPLETE');
});

test('legacy expected failure matching stays separate and checks unexpected passes', () => {
  const args = input({ candidate: job([file('PASS')]), baselineRuns: [],
    expected23: { failures: ['E1', 'M3a'], expectedFailures: ['E1', 'M3a'] } });
  assert.equal(judge(args).status, 'PASS');
  assert.equal(judge({ ...args, expected23: { ...args.expected23, failures: ['E1'] } }).status, 'FAIL');
  assert.deepEqual(judge({ ...args, expected23: { ...args.expected23, failures: ['E1', 'M3a', 'E100'] } })
    .expected23.unexpectedFailures, ['E100']);
  assert.equal(judge(input({ expected23: args.expected23 })).status, 'BLOCKED', 'legacy match cannot waive ordinary failures');
});

// Execute the real card-gate aggregation with in-memory scheduler/filesystem and
// command adapters. No subprocesses, git writes, timers or temporary files.
async function aggregate(candidate, bases = [], policy = [], options = {}) {
  const url = new URL('../card-gate.mjs', import.meta.url);
  const source = fs.readFileSync(url, 'utf8').replace(/^import .*;\r?\n/gm, '')
    .replaceAll('import.meta.url', JSON.stringify(url.href));
  const writes = new Map(), submissions = [], baseArgs = [], submittedFiles = [];
  const fakeProcess = { argv: ['node', 'card-gate', '/fixture', 'moving-base', 'fixture'],
    env: { GATE_SESSIONS: '/sessions', GATE_ROOT: '/gate' }, execPath: 'node', exitCode: undefined };
  const jobs = [candidate, ...bases];
  const fakeFs = {
    existsSync: () => false, mkdirSync: () => {},
    writeFileSync: (file, text) => writes.set(file, text),
    readFileSync: file => {
      if (file.endsWith('history.json')) return JSON.stringify(options.history || {});
      if (file.endsWith('known-failures.json')) return JSON.stringify(policy);
      const index = Number(file.match(/run-(\d+)/)?.[1]);
      const detailIndex = file.match(/results[\\/]file-(\d+)\.json$/)?.[1];
      if (detailIndex !== undefined) {
        if (options.missingDetail) throw Error('runner result missing');
        return JSON.stringify({ ...jobs[index].files[Number(detailIndex)], runId: `run-${index}` });
      }
      if (Number.isInteger(index)) {
        const result = { ...jobs[index], runId: `run-${index}` };
        if (options.persisted) result.files = result.files.map((f, i) => ({ file: f.file, id: `file-${i}`,
          status: f.status, reason: f.reason, counts: f.counts, failures: f.failures, exitCode: f.exitCode }));
        return JSON.stringify(result);
      }
      throw Error(`unexpected read ${file}`);
    },
  };
  const execFileSync = (command, args) => {
    // P5: the selector now answers in JSON (shadow mode: the conservative set is what runs).
    if (command === 'node') {
      const tests = (options.affected || 'tests/a.test.mjs\n').split('\n').filter(Boolean);
      return JSON.stringify({ mode: 'shadow', tests, requiredFiles: [] });
    }
    if (command === 'git') {
      if (options.baseError) throw Error('invalid baseline revision');
      return 'fixed-base-sha\n';
    }
    assert.equal(command, 'powershell.exe');
    submissions.push(args);
    submittedFiles.push(writes.get(args[args.indexOf('-FilesFile') + 1]).trim().split('\n'));
    if (args.includes('-Base')) baseArgs.push(args[args.indexOf('-Base') + 1]);
    return `run-${submissions.length - 1}\n`;
  };
  await vm.runInNewContext(`(async () => { ${source}\n })()`, { fs: fakeFs, path, fileURLToPath,
    judge, isDeferredOnly, loadThresholdMs, splitTiers, execFileSync, process: fakeProcess, console: { log() {} }, setTimeout });
  return { gate: JSON.parse(writes.get(path.join('/sessions', 'fixture.gate.json'))),
    md: writes.get(path.join('/sessions', 'fixture.gate.md')), exitCode: fakeProcess.exitCode, submissions, baseArgs, submittedFiles };
}

test('aggregation hydrates runner evidence and submits only one baseline for deferred-only files', async () => {
  const result = await aggregate(job([deferredFile()]), [job([deferredFile()])], [], { persisted: true });
  assert.equal(result.gate.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.equal(result.submissions.length, 2);
  assert.deepEqual(result.baseArgs, ['fixed-base-sha']);
  assert.deepEqual(result.submittedFiles, [['tests/a.test.mjs'], ['tests/a.test.mjs']]);
  // Deferred items are summarised as numbers only; ids are in gate.json.
  assert.ok(result.md.includes('既有待办：既有 1，新增 0，已移除 0，未核实 0'));
  assert.equal(result.md.includes(deferred().id), false);
  const added = await aggregate(job([deferredFile([deferred('new')])]), [job([deferredFile()])], [], { persisted: true });
  assert.equal(added.gate.status, 'BLOCKED');
  assert.equal(added.exitCode, 1);
  assert.ok(added.md.includes('既有待办：既有 0，新增 1，已移除 1，未核实 0'));
  assert.ok(added.md.includes('## BLOCKED（1）') && added.md.includes('tests/a.test.mjs'));
  const missing = await aggregate(job([deferredFile()]), [], [], { persisted: true, missingDetail: true });
  assert.equal(missing.gate.status, 'INCOMPLETE');
  assert.equal(missing.submissions.length, 1);
});

test('aggregation merges first baseline lists and reruns only real failures', async () => {
  const waiting = deferredFile(undefined, { file: 'tests/b.test.mjs' });
  const result = await aggregate(job([file(), waiting]), [job([file(), waiting]), job()], [],
    { persisted: true, affected: 'tests/a.test.mjs\ntests/b.test.mjs\n' });
  assert.equal(result.submissions.length, 3);
  assert.deepEqual(result.submittedFiles, [['tests/a.test.mjs', 'tests/b.test.mjs'],
    ['tests/a.test.mjs', 'tests/b.test.mjs'], ['tests/a.test.mjs']]);
  assert.deepEqual(result.baseArgs, ['fixed-base-sha', 'fixed-base-sha']);
  assert.equal(result.submissions[2].includes('-Rerun'), true);
  assert.equal(result.gate.files[0].cases[0].baselineStatus, 'BASELINE_REPRODUCED');
  assert.equal(result.gate.files[1].status, 'PASS');
  assert.equal(result.gate.status, 'BLOCKED');
});

test('real aggregation writes JSON/Markdown and sets matching exit codes for every verdict', async () => {
  for (const [candidate, bases, policy, status] of [
    [job([file('PASS')]), [], [], 'PASS'],
    [job([file('FAIL', [failure('B')])]), [job(), job()], [], 'FAIL'],
    [job(), [job(), job()], [], 'BLOCKED'],
    [job(), [job(), job()], [known({ expiresAt: '2999-12-31' })], 'PASS'],
    [job([file('TIMEOUT')]), [], [], 'INCOMPLETE'],
    [{ status: 'INCOMPLETE', files: [] }, [], [], 'INCOMPLETE'],
  ]) {
    const result = await aggregate(candidate, bases, policy);
    assert.equal(result.gate.status, status);
    assert.equal(result.exitCode, status === 'PASS' ? 0 : 1);
    assert.equal(result.exitCode, result.gate.exitCode);
    assert.match(result.md, new RegExp(`\\*\\*${status}\\*\\*`));
    // Compact report: PASS files are only counted, every non-PASS file is named.
    const listed = result.md.includes('tests/a.test.mjs');
    assert.equal(listed, result.gate.files.some(f => f.status !== 'PASS'));
    assert.match(result.md, new RegExp(`通过 ${result.gate.files.filter(f => f.status === 'PASS').length}/${result.gate.files.length}`));
    if (candidate.files[0]?.status === 'FAIL') {
      assert.equal(result.submissions.length, 3);
      assert.deepEqual(result.baseArgs, ['fixed-base-sha', 'fixed-base-sha']);
      assert.equal(result.submissions[1].includes('-Rerun'), false);
      assert.equal(result.submissions[2].includes('-Rerun'), true);
      if (result.gate.files[0].status === 'PASS') assert.ok(result.md.includes('已登记既有失败（KNOWN，已判 PASS）：1 个用例'));
      else assert.ok(result.md.includes(result.gate.files[0].cases[0].id));
      assert.ok(result.gate.files[0].cases[0].reason.length > 0);
    } else assert.equal(result.submissions.length, 1);
  }
});

test('aggregation reruns every failing candidate file even when baseline first passed or went missing', async () => {
  for (const baseline of [job([file('PASS')]), job([])]) {
    const result = await aggregate(job(), [baseline, job()]);
    assert.equal(result.submissions.length, 3);
    assert.notEqual(result.gate.status, 'PASS');
    assert.equal(result.gate.files[0].cases[0].status, baseline.files.length ? 'REGRESSION' : 'UNRESOLVED');
  }
});

test('aggregation still writes INCOMPLETE JSON for invalid policy or base revision', async () => {
  const badPolicy = await aggregate(job([file('PASS')]), [], { invalid: 'not an array' });
  assert.equal(badPolicy.gate.status, 'INCOMPLETE');
  assert.equal(badPolicy.exitCode, 1);
  assert.match(badPolicy.md, /policy unreadable/);
  const badBase = await aggregate(job([file('PASS')]), [], [], { baseError: true });
  assert.equal(badBase.gate.status, 'INCOMPLETE');
  assert.equal(badBase.exitCode, 1);
  assert.equal(badBase.submissions.length, 0);
  assert.match(badBase.md, /base resolution failed/);
});

test('policy starts empty; its schema is documented beside the pure interface', () => {
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../policy/known-failures.json', import.meta.url), 'utf8')), []);
});

test('card gate runs only the fast tier and reports deferred slow files', async () => {
  const history = { runs: { 'tests/b.test.mjs': [{ durationMs: 120000, status: 'PASS' }], 'tests/a.test.mjs': [{ durationMs: 500, status: 'PASS' }] } };
  const result = await aggregate(job(), [], [], { affected: 'tests/a.test.mjs\ntests/b.test.mjs\ntests/c.test.mjs\n', history });
  assert.deepEqual(result.submittedFiles[0], ['tests/a.test.mjs', 'tests/c.test.mjs']);
  assert.ok(result.md.includes('1 slow files deferred to slow sweep'));
  assert.ok(result.md.includes('仅覆盖快档'));
});
