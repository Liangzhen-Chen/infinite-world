import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/baseline/regression.test.mjs', 'tests/baseline/invariants.test.mjs'], { encoding: 'utf8' });
const output = result.stdout + result.stderr;
fs.mkdirSync('docs/测试报告/最新', { recursive: true });
fs.writeFileSync('docs/测试报告/最新/原版基线复测日志.txt', output);
const actual = [...output.matchAll(/^not ok \d+ - (E\d+|M3[a-d])\b/gm)].map(v => v[1]);
const expected = [...Array.from({ length: 19 }, (_, i) => `E${i + 1}`), 'M3a', 'M3b', 'M3c', 'M3d'];
const unexpected = actual.filter(id => !expected.includes(id));
const missing = expected.filter(id => !actual.includes(id));
const report = { node: process.version, command: 'npm run test:baseline', exitCode: result.status, failures: actual,
    expectedFailures: expected, unexpectedFailures: unexpected, unexpectedlyPassing: missing, baselineMatches: !unexpected.length && !missing.length };
fs.writeFileSync('docs/测试报告/最新/原版基线复测.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (!report.baselineMatches) process.exitCode = 1;
