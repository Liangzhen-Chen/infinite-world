// S2-0b（死亡与玩家入口）黑盒验收，本文件覆盖卡文第 12 条（扫描式）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s20b。
// 依据：卷二:552（终止协议由规则层提案调用）、卷二:585（terminated 写者）、卷四:874（以个体为对象的 terminate 只由 death.mjs 调）、卷四:879–:880（die 写终端状态实例）、卷二:540（terminated 谓词只在 action-capacity.mjs）。
// 扫描范围：server-plugin 下全部 .mjs 的代码行（去掉注释行）。不认具体 id 以外的文件名约定之外的东西；物种 id 从 world/ontology/dimensions/species.json 读。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = join(ROOT, 'server-plugin');
const DIM_DIR = join(ROOT, 'world/ontology/dimensions');

function walk(/** @type {string} */ dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.mjs')) out.push(p);
  }
  return out.sort();
}

// 每个文件的代码行（去掉以 // 或 * 或 /* 开头的注释行，并去掉行尾 // 之后的注释）。
const FILES = walk(SRC).map((p) => ({
  rel: relative(SRC, p).split(sep).join('/'),
  lines: readFileSync(p, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^(\/\/|\*|\/\*)/.test(l))
    .map((l) => l.replace(/\/\/.*$/, '')),
}));

/** 含某正则代码行的文件（相对 server-plugin，/ 分隔），按名排序。 */
function filesWith(/** @type {RegExp} */ re, /** @type {(rel: string) => boolean} */ skip = () => false) {
  return FILES.filter((f) => !skip(f.rel) && f.lines.some((l) => re.test(l))).map((f) => f.rel);
}

test('12a. 写 terminal 状态实例（addStatus）的调用点只有 rules/body/death.mjs 的 die', () => {
  const hits = filesWith(/\baddStatus\s*\(/, (rel) => rel === 'rules/status/status.mjs');
  assert.deepEqual(hits, ['rules/body/death.mjs']);
});

test('12b. 以个体为对象调 terminate 的只有 rules/body/death.mjs', () => {
  const hits = filesWith(/\bterminate\s*\(/, (rel) => rel === 'rules/lifecycle/terminate.mjs');
  assert.deepEqual(hits, ['rules/body/death.mjs']);
});

test('12c. state.terminated 的写者只有 rules/lifecycle/terminate.mjs（写路径经 writePath/txSet 落在 P.terminated）', () => {
  const hits = FILES.filter((f) => f.lines.some((l) => /(writePath|txSet)\s*\(.*P\.terminated\s*\(/.test(l) || /writePath\s*\(\s*state\s*,\s*markPath/.test(l))).map((f) => f.rel);
  assert.deepEqual(hits, ['rules/lifecycle/terminate.mjs']);
});

test('12d. 读 terminal 字段的只有 rules/body/action-capacity.mjs', () => {
  const hits = filesWith(/\bterminal\b/, (rel) => rel === 'rules/body/action-capacity.mjs');
  assert.deepEqual(hits, []);
});

test('12e. 规则层代码里不出现物种 id 的字面比较（id 从 species 表读，不写死）', async () => {
  const { readFileSync: rf } = await import('node:fs');
  const species = JSON.parse(rf(join(DIM_DIR, 'species.json'), 'utf8'));
  const ids = Object.keys(species.rows);
  assert.ok(ids.length > 0, '物种表应有行');
  const rulesFiles = FILES.filter((f) => f.rel.startsWith('rules/'));
  for (const id of ids) {
    const re = new RegExp(`['"\`]${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
    const hits = rulesFiles.filter((f) => f.lines.some((l) => re.test(l))).map((f) => f.rel);
    assert.deepEqual(hits, [], `规则层不得出现物种 id ${id} 的字面量`);
  }
});
