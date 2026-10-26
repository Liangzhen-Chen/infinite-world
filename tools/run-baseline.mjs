import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import {artifactPath, artifactsRoot} from './tmp-root.mjs';
// P3: separate processes prevent preloaded modules from hiding import/order failures.
const files = ['tests/baseline/regression.test.mjs', 'tests/baseline/invariants.test.mjs'];
const results = files.map(file => spawnSync(process.execPath,
    ['--test', '--test-isolation=none', '--test-reporter=tap', file],
    { encoding: 'utf8', env: {...process.env, FIELDS_TEST_ARTIFACTS: artifactsRoot()} }));
const output = results.map(result => (result.stdout || '') + (result.stderr || '')).join('\n');
const directory = artifactPath('测试报告','最新');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(artifactPath('测试报告','最新','原版基线复测日志.txt'), output);
// Count every failing case, so an unrelated invariant failure cannot be hidden by the 23 known IDs.
const actual = [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map(v => /^(E\d+|M3[a-d])\b/.exec(v[1])?.[1] || v[1]);
const expected = [...Array.from({ length: 19 }, (_, i) => `E${i + 1}`), 'M3a', 'M3b', 'M3c', 'M3d'];
const unexpected = actual.filter(id => !expected.includes(id));
const missing = expected.filter(id => !actual.includes(id));
const report = { node: process.version, command: 'npm run test:baseline', exitCode: results.some(result => result.status === null) ? null : Math.max(...results.map(result => result.status)),
    runs: results.map((result, i) => ({file: files[i], pid: result.pid, exitCode: result.status, signal: result.signal, error: result.error?.message})), failures: actual,
    expectedFailures: expected, unexpectedFailures: unexpected, unexpectedlyPassing: missing, baselineMatches: actual.length === expected.length && !unexpected.length && !missing.length && results.every(result => [0, 1].includes(result.status) && !result.error && !result.signal) };
fs.writeFileSync(artifactPath('测试报告','最新','原版基线复测.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (!report.baselineMatches) process.exitCode = 1;
