// 卡 chore/cloud-test（全量测试上云工作流）黑盒验收。出题方 haiku-orca-test-cloud，依据卷十二:163（提交关口 pre_commit）、卷十二:108（门禁是拦，不是报）。
// 三件事：①.github/workflows/cloud-test.yml 只出报告（手动触发、只读、测试步不变红、末步汇总）；②ci.yml 合入闸门一点没放宽（只多 push 忽略 ci-run/**）；③CLAUDE.md「运行位置」写成新规矩。
// 仓库没有 YAML 解析库：按行与缩进解析，不新装依赖。ci.yml 的「原版」钉在提交 4d56bfab4，不读会移动的 origin/master。
// 只测文件文本，不跑工作流；合入后这些断言长期成立。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PINNED = '4d56bfab4';
const CLOUD = join(ROOT, '.github/workflows/cloud-test.yml');
const CI = join(ROOT, '.github/workflows/ci.yml');
const CLAUDE = join(ROOT, 'CLAUDE.md');

const norm = (s) => s.replace(/\r\n/g, '\n');
const indentOf = (l) => l.length - l.trimStart().length;
const isNoise = (l) => l.trim() === '' || l.trimStart().startsWith('#');
const pinnedCi = norm(execFileSync('git', ['show', `${PINNED}:.github/workflows/ci.yml`], { cwd: ROOT, encoding: 'utf8' }));

// 文件不存在时测试直接红，不在模块加载时就崩。
function readOrFail(path) {
  assert.ok(existsSync(path), `缺文件：${path.slice(ROOT.length + 1)}`);
  return norm(readFileSync(path, 'utf8'));
}

// 顶层键的子行（不含键行本身）；没有该键返回 null。
function topBlock(text, key) {
  const lines = norm(text).split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (isNoise(l)) continue;
    if (indentOf(l) === 0) break;
    out.push(l);
  }
  return out;
}

// 缩进为 indent 的键 -> { head: 键后同行的值, lines: 更深缩进的子行 }。
function childBlocks(lines, indent) {
  const out = new Map();
  let cur = null;
  for (const l of lines) {
    if (isNoise(l)) continue;
    const ind = indentOf(l);
    if (ind === indent) {
      const m = /^\s*([A-Za-z_'"][\w'"-]*):(.*)$/.exec(l);
      if (m) {
        cur = m[1].replace(/['"]/g, '');
        out.set(cur, { head: m[2].trim(), lines: [] });
        continue;
      }
    }
    if (cur !== null && ind > indent) out.get(cur).lines.push(l);
  }
  return out;
}

// 去注释、空行、行尾空白后的代码行（比对与禁词扫描用）。
const codeLines = (text) => norm(text).split('\n').map((l) => l.trimEnd()).filter((l) => !isNoise(l));

// 每个 steps: 段下的步骤（按 - 项切分），按出现顺序返回；步骤内注释与空行已去掉。
function parseSteps(text) {
  const lines = norm(text).split('\n');
  const steps = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*steps:\s*$/.test(lines[i])) continue;
    const first = lines.findIndex((l, k) => k > i && !isNoise(l));
    if (first < 0 || !/^\s*- /.test(lines[first])) continue;
    const S = indentOf(lines[first]);
    let cur = null;
    let k = first;
    for (; k < lines.length; k++) {
      const l = lines[k];
      if (isNoise(l)) continue;
      const ind = indentOf(l);
      if (ind < S) break;
      if (ind === S && /^\s*- /.test(l)) {
        cur = [];
        steps.push(cur);
      }
      if (cur) cur.push(l);
    }
    i = k - 1;
  }
  return steps;
}

const stepText = (s) => s.join('\n');
const stepsContaining = (steps, needle) =>
  steps.map((s, i) => [i, stepText(s)]).filter(([, t]) => t.includes(needle)).map(([i]) => i);

// ---------- ① cloud-test.yml 只出报告 ----------

test('cloud-test.yml 只能手动触发：on 下只有 workflow_dispatch', () => {
  const text = readOrFail(CLOUD);
  const on = topBlock(text, 'on');
  assert.ok(on, 'cloud-test.yml 缺顶层 on:');
  assert.deepEqual([...childBlocks(on, 2).keys()].sort(), ['workflow_dispatch']);
});

test('cloud-test.yml 手动触发的 ref 输入必填，且被检出步使用', () => {
  const text = readOrFail(CLOUD);
  const wd = childBlocks(topBlock(text, 'on'), 2).get('workflow_dispatch');
  assert.ok(wd, '缺 workflow_dispatch');
  const inputs = childBlocks(wd.lines, 4).get('inputs');
  assert.ok(inputs, '缺 inputs');
  const ref = childBlocks(inputs.lines, 6).get('ref');
  assert.ok(ref, 'inputs 下缺 ref');
  assert.match(ref.lines.join('\n'), /required:\s*true/, 'ref 输入必须 required: true');
  assert.match(codeLines(text).join('\n'), /\$\{\{\s*inputs\.ref\s*\}\}/, '检出步应使用 inputs.ref');
});

test('cloud-test.yml 权限只有 contents: read（且全文没有 write 授权、没有第二处 permissions）', () => {
  const text = readOrFail(CLOUD);
  const perm = topBlock(text, 'permissions');
  assert.ok(perm, '缺顶层 permissions');
  const kids = childBlocks(perm, 2);
  assert.deepEqual([...kids.keys()], ['contents']);
  assert.equal(kids.get('contents').head, 'read');
  assert.equal(perm.filter((l) => l.trim() !== '').length, 1, '顶层 permissions 下只许一行');
  const code = codeLines(text).join('\n');
  assert.doesNotMatch(code, /:\s*write\b/, '不许有任何 write 权限');
  assert.equal(codeLines(text).filter((l) => /^\s*permissions:/.test(l)).length, 1, 'permissions 只许出现一次（不许 job 级再开权限）');
});

test('cloud-test.yml 按序依次跑七个命令，且各占一步', () => {
  const text = readOrFail(CLOUD);
  const steps = parseSteps(text);
  const SEQ = [
    'npm ci',
    'npm run typecheck',
    'tools/accept/run.mjs pre_commit',
    'tools/gen-status-snapshot.mjs --check',
    'npm run test:all',
    'npm run test:e2e',
    'tools/accept/e2e-wire-cut.mjs',
  ];
  const at = SEQ.map((needle) => {
    const hits = stepsContaining(steps, needle);
    assert.equal(hits.length, 1, `「${needle}」应恰好出现在一步里，实际 ${hits.length} 步`);
    return hits[0];
  });
  for (let i = 1; i < at.length; i++) {
    assert.ok(at[i] > at[i - 1], `「${SEQ[i]}」应排在「${SEQ[i - 1]}」之后`);
  }
});

test('cloud-test.yml 的测试步（npm ci 之后、汇总步之前）全部 continue-on-error: true，测试失败不让运行变红', () => {
  const text = readOrFail(CLOUD);
  const steps = parseSteps(text);
  const npm = stepsContaining(steps, 'npm ci')[0];
  const summary = steps.findIndex((s) => stepText(s).includes('GITHUB_STEP_SUMMARY'));
  assert.ok(npm !== undefined, '缺 npm ci 步');
  assert.ok(summary > npm, '汇总步必须在 npm ci 之后');
  for (let i = npm + 1; i < summary; i++) {
    assert.match(stepText(steps[i]), /^\s*continue-on-error:\s*true\s*$/m, `第 ${i + 1} 步缺 continue-on-error: true`);
  }
});

test('cloud-test.yml 末步无条件执行：if: always()，写 GITHUB_STEP_SUMMARY 并打印 CLOUD-TEST 汇总行', () => {
  const text = readOrFail(CLOUD);
  const steps = parseSteps(text);
  const summary = steps.findIndex((s) => stepText(s).includes('GITHUB_STEP_SUMMARY'));
  assert.ok(summary >= 0, '缺写 GITHUB_STEP_SUMMARY 的步');
  assert.equal(summary, steps.length - 1, '汇总步必须是最后一步');
  const body = stepText(steps[summary]);
  assert.match(body, /if:\s*(\$\{\{\s*)?always\(\)/, '汇总步须 if: always()');
  assert.ok(body.includes('CLOUD-TEST '), '汇总步须打印以 CLOUD-TEST 开头的汇总行');
});

test('cloud-test.yml 不含写仓库或卡档案检查的命令（git push/commit/merge/tag、gh pr/release、pre-push、check-push-archive）', () => {
  const text = readOrFail(CLOUD);
  const code = codeLines(text).join('\n');
  assert.doesNotMatch(code, /\bgit\s+(push|commit|merge|tag)\b/);
  assert.doesNotMatch(code, /\bgh\s+(pr|release)\b/);
  assert.doesNotMatch(code, /pre-push|check-push-archive|docs\/卡档案/);
});

test('cloud-test.yml 不写死卡名与分支名', () => {
  const text = readOrFail(CLOUD);
  assert.doesNotMatch(codeLines(text).join('\n'), /\bchore\/|\bfeat\/|\bci-run\/|\bchore-cloud-test\b|\btest\/cloud-test\b/);
});

// ---------- ② ci.yml 合入闸门一点没放宽 ----------

test('ci.yml 的触发器只有 push 与 pull_request', () => {
  const text = readOrFail(CI);
  const on = topBlock(text, 'on');
  assert.ok(on, 'ci.yml 缺 on:');
  assert.deepEqual([...childBlocks(on, 2).keys()].sort(), ['pull_request', 'push']);
});

test('ci.yml 的 push 只多忽略 ci-run/**（除此之外不加任何过滤）', () => {
  const text = readOrFail(CI);
  const push = childBlocks(topBlock(text, 'on'), 2).get('push');
  assert.ok(push, 'ci.yml 缺 push');
  const kids = childBlocks(push.lines, 4);
  assert.deepEqual([...kids.keys()], ['branches-ignore'], 'push 下只许有 branches-ignore');
  const bi = kids.get('branches-ignore');
  const vals = [bi.head, ...bi.lines].join(' ')
    .replace(/[[\]]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^-$/, '').replace(/^['"]|['"],?$/g, '').replace(/,$/, ''))
    .filter(Boolean);
  assert.deepEqual(vals, ['ci-run/**']);
});

test('ci.yml 的 pull_request 触发与原版逐字相同（键行与子项）', () => {
  const text = readOrFail(CI);
  assert.ok(codeLines(text).includes('  pull_request:'), 'pull_request 键行须与原版相同');
  const now = childBlocks(topBlock(text, 'on'), 2).get('pull_request');
  const old = childBlocks(topBlock(pinnedCi, 'on'), 2).get('pull_request');
  assert.ok(now && old, '缺 pull_request');
  assert.deepEqual(codeLines(now.lines.join('\n')), codeLines(old.lines.join('\n')));
});

test('ci.yml 的 jobs 段与原版（4d56bfab4）逐字相同', () => {
  const literal = (t) => {
    const ls = norm(t).split('\n').map((l) => l.trimEnd());
    const i = ls.findIndex((l) => l.startsWith('jobs:'));
    assert.ok(i >= 0, '缺 jobs:');
    let end = ls.length;
    while (end > i && ls[end - 1] === '') end--;
    return ls.slice(i, end);
  };
  assert.deepEqual(literal(readOrFail(CI)), literal(pinnedCi));
});

test('ci.yml 对原版只多 push.branches-ignore 的 ci-run/** 一处（其余代码行全同，注释与空行不计）', () => {
  const cur = codeLines(readOrFail(CI));
  const stripped = [];
  let skipping = false;
  for (const l of cur) {
    if (skipping && indentOf(l) > 4) continue;
    skipping = false;
    if (/^ {4}branches-ignore:/.test(l)) {
      skipping = true;
      continue;
    }
    stripped.push(l);
  }
  assert.deepEqual(stripped, codeLines(pinnedCi));
});

// ---------- ③ CLAUDE.md 运行位置写成新规矩 ----------

test('CLAUDE.md「运行位置」只剩一条（改规矩直接替换旧行，不叠层）', () => {
  const rows = readOrFail(CLAUDE).split('\n').filter((l) => l.includes('运行位置'));
  assert.equal(rows.length, 1);
});

test('CLAUDE.md「运行位置」新规矩：本机只许跑单个测试文件、上云、cloud-test、合入闸门仍是 ci.yml', () => {
  const row = readOrFail(CLAUDE).split('\n').find((l) => l.includes('运行位置'));
  for (const phrase of ['本机只许跑单个测试文件', '上云', 'cloud-test']) {
    assert.ok(row.includes(phrase), `运行位置一条缺「${phrase}」`);
  }
  assert.match(row, /合入闸门仍是.*ci\.yml/);
});

test('CLAUDE.md「运行位置」引用亮圳原话（「……」或『……』）', () => {
  const row = readOrFail(CLAUDE).split('\n').find((l) => l.includes('运行位置'));
  assert.match(row, /亮圳[\s\S]*[「『][^」』]+[」』]/);
});

test('CLAUDE.md 全文不超过 80 行', () => {
  const lines = readOrFail(CLAUDE).replace(/\n$/, '').split('\n');
  assert.ok(lines.length <= 80, `CLAUDE.md 共 ${lines.length} 行`);
});
