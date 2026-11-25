// 验收：卡 chore/status-snapshot（L-11 状态快照生成脚本）。出题方：Claude Haiku 5.5（API），标识 haiku-api-test-snap；未参与写码与审卡。
// 依据：docs/gemini/kickoff-1125.md:113（快照由脚本生成、≤80 行）、:357–:360（只由机器生成、≤80 行）、:397–:399（合入刷新与 --check）、:485（L-11 验收）；卷十二:468（baseline 分量）；卷二:763（总登记表）。
// 测什么与依据逐条见 docs/卡档案/chore-status-snapshot/出题.md。
// 黑盒：只经 renderSnapshot 纯函数与 CLI（无参 / --out / --check）观察输出；不读真实仓库的进度数据；期望值按约定手算成字面量。

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../../tools/gen-status-snapshot.mjs', import.meta.url));
const OUT_DEFAULT = join('docs', '状态快照.generated.md');
const HEADER = '# 状态快照（机器生成，禁止手改）';
const SECTIONS = ['## 生成基准', '## 最近提交', '## 入口接通', '## 门禁基线', '## 在途卡'];

const mod = () => import('../../../tools/gen-status-snapshot.mjs');

// ---------- 通用小工具 ----------

const lines = (text) => text.replace(/\n$/, '').split('\n');

// 取某个 `## ` 段的正文行（不含段标题本身），直到下一个 `## ` 段。
function sectionBody(text, header) {
  const ls = lines(text);
  const i = ls.findIndex((l) => l.trim() === header);
  assert.notEqual(i, -1, `缺少段：${header}`);
  let j = i + 1;
  while (j < ls.length && !ls[j].startsWith('## ')) j += 1;
  return ls.slice(i + 1, j);
}

const bodyText = (text, header) => sectionBody(text, header).join('\n');

// 独立数字（前后不是数字），避免 4 匹配到 14。
const hasNumber = (s, n) => new RegExp(`(^|\\D)${n}(\\D|$)`).test(s);

// 在某段的开头行之后插入一行（模拟手改）。
function insertAfterHeader(text, header, extra) {
  const ls = text.split('\n');
  const i = ls.findIndex((l) => l.trim() === header);
  assert.notEqual(i, -1, `缺少段：${header}`);
  ls.splice(i + 1, 0, extra);
  return ls.join('\n');
}

// ---------- 纯函数输入（期望值全部手算） ----------

const HEAD = { sha: 'a1b2c3d', time: '2026-11-20T10:00:00+08:00' };

const COMMITS = [
  { sha: 'a1b2c3d', subject: '第二次提交' },
  { sha: '9f8e7d6', subject: '初始化' },
];

// 6 条入口，只有 1 条 file 非空 → 接通率 1/6 = 16.67%，取整 16%（不是 17%）。
const REGISTRY_FILES = ['server-plugin/a.mjs', null, null, null, null, null];

function registryOf(files) {
  return {
    version: 1,
    kinds: ['read', 'predicate', 'write', 'hook', 'kernel', 'part'],
    entries: files.map((file, i) => ({ name: `e${i}`, file, vol: '卷一', sec: '§1', kind: 'read', needs: [], rules: [] })),
  };
}

// 分量 4 条；current 之和 9+4+0+2 = 15；未锁定（locked 不为 true）：c_a、c_c、c_d 共 3。
// c_d 的 locked 是字符串 "true"，严格按「不为 true」算未锁定。b0 全为 100，用来确认求和用的是 current。
const BASELINE = {
  rows: [
    { compCode: 'c_a', b0: 100, b0Source: 'counted', current: 9, lastMergeRef: 'HEAD', locked: false, rowKeys: [] },
    { compCode: 'c_b', b0: 100, b0Source: 'counted', current: 4, lastMergeRef: 'HEAD', locked: true, rowKeys: [] },
    { compCode: 'c_c', b0: 100, b0Source: 'counted', current: 0, lastMergeRef: 'HEAD', rowKeys: [] },
    { compCode: 'c_d', b0: 100, b0Source: 'counted', current: 2, lastMergeRef: 'HEAD', locked: 'true', rowKeys: [] },
  ],
};

const CARDS = [
  { card: 'zeta-card', phase: 'review', failCount: 2, nextAction: '审卡第二轮' },
  { card: 'alpha-card', phase: 'dispatched', failCount: 0, nextAction: '写码' },
  { card: 'mid-card', phase: 'ci', failCount: 1, nextAction: '修 CI' },
];

function input(over = {}) {
  return structuredClone({
    head: HEAD,
    commits: COMMITS,
    registry: registryOf(REGISTRY_FILES),
    baseline: BASELINE,
    cards: CARDS,
    ...over,
  });
}

const render = async (inp) => (await mod()).renderSnapshot(inp);

// ---------- 纯函数测试：renderSnapshot ----------

test('renderSnapshot：首行标题固定，二级标题恰为五段且顺序固定', async () => {
  const out = await render(input());
  assert.equal(lines(out)[0], HEADER);
  const h2 = lines(out).filter((l) => l.startsWith('## '));
  assert.deepEqual(h2, SECTIONS);
});

test('生成基准：一行「生成时 HEAD=<短sha>（<提交时间 ISO>）」', async () => {
  const out = await render(input());
  assert.ok(
    sectionBody(out, '## 生成基准').some((l) => l.includes('生成时 HEAD=a1b2c3d（2026-11-20T10:00:00+08:00）')),
    bodyText(out, '## 生成基准'),
  );
});

test('最近提交：每个提交一行，同行含短 sha 与主题，保持输入顺序', async () => {
  const out = sectionBody(await render(input()), '## 最近提交');
  const i1 = out.findIndex((l) => l.includes('a1b2c3d') && l.includes('第二次提交'));
  const i2 = out.findIndex((l) => l.includes('9f8e7d6') && l.includes('初始化'));
  assert.notEqual(i1, -1, out.join('\n'));
  assert.notEqual(i2, -1, out.join('\n'));
  assert.ok(i1 < i2, '提交行顺序应与输入一致');
});

test('最近提交：主题截到 60 字（70 个字符的主题只保留 60 个）', async () => {
  const long = 'a'.repeat(70);
  const out = sectionBody(await render(input({ commits: [{ sha: 'b2c3d4e', subject: long }] })), '## 最近提交');
  assert.ok(out.some((l) => l.includes('a'.repeat(60))), out.join('\n'));
  assert.ok(!out.some((l) => l.includes('a'.repeat(61))), '主题不得超过 60 字');
});

test('入口接通：总数 6、已接通 1、接通率 16%（1/6 向下取整，不得是 17%）', async () => {
  const body = bodyText(await render(input()), '## 入口接通');
  assert.ok(hasNumber(body, 6), body);
  assert.ok(hasNumber(body, 1), body);
  assert.match(body, /(^|\D)16\s*%/, body);
  assert.doesNotMatch(body, /17\s*%/, body);
});

test('入口接通：file 为空串不算已接通（3 条中仅 1 条有文件 → 33%，不是 66%）', async () => {
  const out = await render(input({ registry: registryOf(['x/y.mjs', '', null]) }));
  const body = bodyText(out, '## 入口接通');
  assert.match(body, /(^|\D)33\s*%/, body);
  assert.doesNotMatch(body, /66\s*%/, body);
});

test('门禁基线：分量总数 4、current 之和 15、未锁定 3，且不含「（缺：」', async () => {
  const body = bodyText(await render(input()), '## 门禁基线');
  assert.ok(hasNumber(body, 4), body);
  assert.ok(hasNumber(body, 15), body);
  assert.ok(hasNumber(body, 3), body);
  assert.ok(!body.includes('（缺：'), body);
});

test('在途卡：每张一行「<card> | <phase> | 失败 <n> | 下一步 <nextAction>」，按 card 名排序', async () => {
  const body = sectionBody(await render(input()), '## 在途卡');
  const a = body.findIndex((l) => l.includes('alpha-card | dispatched | 失败 0 | 下一步 写码'));
  const m = body.findIndex((l) => l.includes('mid-card | ci | 失败 1 | 下一步 修 CI'));
  const z = body.findIndex((l) => l.includes('zeta-card | review | 失败 2 | 下一步 审卡第二轮'));
  assert.notEqual(a, -1, body.join('\n'));
  assert.notEqual(m, -1, body.join('\n'));
  assert.notEqual(z, -1, body.join('\n'));
  assert.ok(a < m && m < z, '应按 card 名 alpha < mid < zeta 排序');
});

test('在途卡：输入顺序打乱后输出逐字节相同（renderSnapshot 自己排序）', async () => {
  const forward = await render(input());
  const reversed = await render(input({ cards: [...CARDS].reverse() }));
  assert.equal(reversed, forward);
});

test('在途卡：无在途卡时段内写「（无）」且没有卡行', async () => {
  const body = sectionBody(await render(input({ cards: [] })), '## 在途卡');
  assert.ok(body.some((l) => l.includes('（无）')), body.join('\n'));
  assert.ok(!body.some((l) => l.includes(' | ')), body.join('\n'));
});

test('baseline 缺失（null）：门禁基线段写「（缺：…）」，不抛错，其它段照常', async () => {
  const out = await render(input({ baseline: null }));
  assert.ok(bodyText(out, '## 门禁基线').includes('（缺：'), bodyText(out, '## 门禁基线'));
  assert.ok(bodyText(out, '## 在途卡').includes('alpha-card | dispatched | 失败 0 | 下一步 写码'));
});

test('缺字段：baseline 无 rows、registry 无 entries 时，对应段写「（缺：」，不抛错', async () => {
  const out1 = await render(input({ baseline: {} }));
  assert.ok(bodyText(out1, '## 门禁基线').includes('（缺：'));
  const out2 = await render(input({ registry: { version: 1 } }));
  assert.ok(bodyText(out2, '## 入口接通').includes('（缺：'));
});

test('registry 为 null：入口接通段写「（缺：」，不抛错', async () => {
  const out = await render(input({ registry: null }));
  assert.ok(bodyText(out, '## 入口接通').includes('（缺：'));
});

test('同一输入两次生成逐字节相同，且与墙钟时间无关（Date 被替换后结果不变）', async () => {
  const a = await render(input());
  const b = await render(input());
  assert.equal(a, b);
  const RealDate = /** @type {any} */ (Date);
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super('2099-12-31T23:59:59Z');
      else super(...args);
    }
    static now() {
      return 0;
    }
  }
  let c;
  globalThis.Date = /** @type {DateConstructor} */ (/** @type {unknown} */ (FakeDate));
  try {
    c = await render(input());
  } finally {
    globalThis.Date = RealDate;
  }
  assert.equal(c, a);
});

test('输出不超过 80 行（10 条提交、30 张在途卡）', async () => {
  const commits = Array.from({ length: 10 }, (_, i) => ({ sha: `abc${i}def`, subject: `提交 ${i}` }));
  const cards = Array.from({ length: 30 }, (_, i) => ({
    card: `card-${String(i).padStart(2, '0')}`,
    phase: 'dispatched',
    failCount: 0,
    nextAction: '写码',
  }));
  const out = await render(input({ commits, cards }));
  assert.ok(lines(out).length <= 80, `实际 ${lines(out).length} 行`);
});

// ---------- CLI 测试：临时仓库 + execFileSync ----------

const dirs = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const TEMPLATE = {
  card: '<分支名，/ 换成 ->',
  phase: 'dispatched',
  updatedAt: '<ISO 8601 UTC>',
  branches: { code: '<写码分支>', test: '<出题分支>' },
  pr: null,
  parties: {
    code: { family: '<模型族>', model: '<模型 id>', receipt: null, costUsd: null },
    test: { family: '<模型族>', model: '<模型 id>', receipt: null, costUsd: null },
    review: { family: '<模型族>', model: '<模型 id>', receipt: null, costUsd: null },
  },
  ci: { status: 'pending', runUrl: null },
  failCount: 0,
  blocker: null,
  nextAction: '<下一步一句话>',
};

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  GIT_AUTHOR_DATE: '2026-11-19T09:00:00+08:00',
  GIT_COMMITTER_DATE: '2026-11-20T10:00:00+08:00',
};

// 造一个临时仓库：tools/accept/*.json、两张 state.json、一个 _template，提交一次。
function makeRepo({ withBaseline = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snap-acc-'));
  dirs.push(dir);
  const put = (rel, data) => {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n', 'utf8');
  };
  put(join('tools', 'accept', 'entry-registry.json'), registryOf(['server-plugin/a.mjs', 'server-plugin/b.mjs', null, null]));
  if (withBaseline) put(join('tools', 'accept', 'baseline.json'), BASELINE);
  put(join('docs', '卡档案', '_template', 'state.json'), TEMPLATE);
  put(join('docs', '卡档案', 'beta-card', 'state.json'), {
    ...TEMPLATE, card: 'beta-card', phase: 'ci', failCount: 2, nextAction: '修 CI',
  });
  put(join('docs', '卡档案', 'alpha-card', 'state.json'), {
    ...TEMPLATE, card: 'alpha-card', phase: 'dispatched', failCount: 0, nextAction: '写码',
  });
  execFileSync('git', ['init', '-q'], { cwd: dir, env: GIT_ENV });
  execFileSync('git', ['add', '-A'], { cwd: dir, env: GIT_ENV });
  execFileSync('git', ['commit', '-q', '-m', 'init snapshot fixture'], { cwd: dir, env: GIT_ENV });
  return dir;
}

// 以 dir 为 cwd 运行脚本，返回退出码与 stdout；非零退出不抛出。
function run(dir, args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd: dir,
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout };
  } catch (e) {
    return { status: e.status, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') };
  }
}

const gitShortSha = (dir) =>
  execFileSync('git', ['log', '-n', '1', '--format=%h'], { cwd: dir, encoding: 'utf8' }).trim();

test('CLI 无参：写出 docs/状态快照.generated.md，覆盖旧内容，首行正确，≤80 行，退出码 0', () => {
  const dir = makeRepo();
  const target = join(dir, OUT_DEFAULT);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, 'GARBAGE 旧内容\n', 'utf8');
  const r = run(dir, []);
  assert.equal(r.status, 0, r.stderr);
  const out = readFileSync(target, 'utf8');
  assert.equal(lines(out)[0], HEADER);
  assert.ok(!out.includes('GARBAGE'), '旧内容应被覆盖');
  assert.ok(lines(out).length <= 80);
});

test('CLI --out：写到指定路径，且不写默认文件', () => {
  const dir = makeRepo();
  const outPath = join(dir, 'custom-snap.md');
  const r = run(dir, ['--out', outPath]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(outPath), '指定路径应存在');
  assert.equal(lines(readFileSync(outPath, 'utf8'))[0], HEADER);
  assert.ok(!existsSync(join(dir, OUT_DEFAULT)), '--out 时不应写默认文件');
});

test('CLI：同一仓库两次 --out 生成的文件逐字节相同', () => {
  const dir = makeRepo();
  const p1 = join(dir, 'snap-1.md');
  const p2 = join(dir, 'snap-2.md');
  assert.equal(run(dir, ['--out', p1]).status, 0);
  assert.equal(run(dir, ['--out', p2]).status, 0);
  assert.ok(readFileSync(p1).equals(readFileSync(p2)), '两次生成字节不同');
});

test('CLI 生成基准：HEAD 为真实短 sha，时间为 ISO（T 形式，取提交的 committer 时间）', () => {
  const dir = makeRepo();
  const outPath = join(dir, 'snap.md');
  assert.equal(run(dir, ['--out', outPath]).status, 0);
  const short = gitShortSha(dir);
  const body = bodyText(readFileSync(outPath, 'utf8'), '## 生成基准');
  assert.ok(body.includes(`生成时 HEAD=${short}（2026-11-20T10:00:00`), body);
});

test('CLI 最近提交：含真实提交主题与短 sha', () => {
  const dir = makeRepo();
  const outPath = join(dir, 'snap.md');
  assert.equal(run(dir, ['--out', outPath]).status, 0);
  const body = sectionBody(readFileSync(outPath, 'utf8'), '## 最近提交');
  const short = gitShortSha(dir);
  assert.ok(body.some((l) => l.includes('init snapshot fixture') && l.includes(short)), body.join('\n'));
});

test('CLI 在途卡：按 card 名排序，跳过 _template，行内容与 state.json 一致', () => {
  const dir = makeRepo();
  const outPath = join(dir, 'snap.md');
  assert.equal(run(dir, ['--out', outPath]).status, 0);
  const out = readFileSync(outPath, 'utf8');
  const body = sectionBody(out, '## 在途卡');
  const a = body.findIndex((l) => l.includes('alpha-card | dispatched | 失败 0 | 下一步 写码'));
  const b = body.findIndex((l) => l.includes('beta-card | ci | 失败 2 | 下一步 修 CI'));
  assert.notEqual(a, -1, body.join('\n'));
  assert.notEqual(b, -1, body.join('\n'));
  assert.ok(a < b, '应按 card 名排序');
  assert.ok(!out.includes('_template'), '不得包含 _template');
  assert.ok(!out.includes('<分支名'), '不得读入模板占位内容');
  assert.ok(!out.includes('<下一步一句话>'), '不得读入模板占位内容');
});

test('CLI --check：刚生成的文件校验通过，退出码 0', () => {
  const dir = makeRepo();
  assert.equal(run(dir, []).status, 0);
  const r = run(dir, ['--check']);
  assert.equal(r.status, 0, r.stderr);
});

test('CLI --check：手改「入口接通」段后退出码 1，且 --check 不改写文件', () => {
  const dir = makeRepo();
  assert.equal(run(dir, []).status, 0);
  const p = join(dir, OUT_DEFAULT);
  const tampered = insertAfterHeader(readFileSync(p, 'utf8'), '## 入口接通', '手改：入口 999 条');
  writeFileSync(p, tampered, 'utf8');
  const r = run(dir, ['--check']);
  assert.equal(r.status, 1);
  assert.equal(readFileSync(p, 'utf8'), tampered, '--check 不得覆盖写文件');
});

test('CLI --check：只手改「最近提交」段（不受检）时退出码 0', () => {
  const dir = makeRepo();
  assert.equal(run(dir, []).status, 0);
  const p = join(dir, OUT_DEFAULT);
  writeFileSync(p, insertAfterHeader(readFileSync(p, 'utf8'), '## 最近提交', '手改：假提交 0000000 伪造'), 'utf8');
  const r = run(dir, ['--check']);
  assert.equal(r.status, 0, r.stdout + (r.stderr ?? ''));
});

test('CLI --check：仓库里 state.json 变了但快照未重生成（在途卡受检）→ 退出码 1', () => {
  const dir = makeRepo();
  assert.equal(run(dir, []).status, 0);
  const p = join(dir, 'docs', '卡档案', 'beta-card', 'state.json');
  writeFileSync(p, JSON.stringify({ ...TEMPLATE, card: 'beta-card', phase: 'ci', failCount: 5, nextAction: '修 CI' }, null, 2), 'utf8');
  const r = run(dir, ['--check']);
  assert.equal(r.status, 1);
});

test('CLI：缺 baseline.json 时生成退出码 0，门禁基线段写「（缺：」', () => {
  const dir = makeRepo({ withBaseline: false });
  const outPath = join(dir, 'snap.md');
  const r = run(dir, ['--out', outPath]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(bodyText(readFileSync(outPath, 'utf8'), '## 门禁基线').includes('（缺：'));
});
