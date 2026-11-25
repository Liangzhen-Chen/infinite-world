// 验收：卡 chore/step1-tooling（阶段 0A Step 1 防回潮工具）。出题方：Claude Haiku 5.5（API），标识 haiku-api-test-step1；未参与写码与审卡。
// 依据：卷十二:545（E-ACC-CARD-ARCHIVE：卡档案与三方检查）；docs/gemini/rewrite-guide-1124.md:207（archive_ref 检查）、:208（三方模型族硬校验）、:209（dispatch.mjs 统一派卡）、:378（防回潮机械锁）；CLAUDE.md 第 1 节（卡尾）、第 3 节（API 唯一入口、模型族、单次预算 0.65、本机只跑纯函数）。
// 测什么：
//   A 卡尾去掉（compose-card.mjs）；
//   B buildInvocation 白名单、预算、环境（dispatch.mjs）；
//   C 三方模型族违规样例与合法对照（card-archive.mjs，经 checkArchive）；
//   D archive_ref 挂 pre_commit（accRun，对比注入前后新增的失败条目，不写死条目名）；
//   E 三个入库文件、.gitignore、config.local.json 未入库。
// 为什么修前失败：A 的真实规矩用例、B 全部（dispatch.mjs 尚不存在）、C 的模型族违规拒绝、D 的注入拒绝、E 的文件存在两条修前都会红；
//   合法对照、同族审卡轮间可同族、缺键放行、D 的豁免目录、E 的 .gitignore 与未入库 修前即绿（它们是对照，不是实现证据）。
// buildInvocation 形状约定（卷文未定，出题方在此写明，写码方按此导出）：buildInvocation(opts, env) 返回 { command, args, env }；
//   env 是来源环境，输出的 env 只由它推出，不与 process.env 合并；claude-* 的预算取 opts.budget，缺省 0.65；路径读 tools/dispatch/paths.json，本测试不传 paths；
//   opts.prompt 必填，非空（空卡文应被拒，不起子进程）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { composeCard } from '../../../tools/dispatch/compose-card.mjs';
import { loadRules, checkArchive } from '../../../tools/accept/lib/card-archive.mjs';
import { accRun } from '../../../tools/accept/run.mjs';
import { ROOT } from '../../accept/temp-root.mjs';

const DOC = readFileSync(join(ROOT, 'docs/派活卡头规矩.md'), 'utf8');
const DELIM = '===== 以下为本卡卡文 =====';
const TAIL_MARKS = ['docs/卡回报/', 'E-ACC-CARD-SELFCHECK', '===== 卡尾'];
const CARD = '## 目标\n把派卡程序挪进仓库。\n';

// ---------- A：卡尾 ----------

test('A 卡尾（合成规矩）：拼出的卡文不含 docs/卡回报/、E-ACC-CARD-SELFCHECK、===== 卡尾；卡头与分隔照旧', () => {
  const SYN = '# 派活卡头硬规矩\n\n测试用规矩正文，与真实规矩无关。';
  const out = composeCard(SYN, CARD, 'ds/dispatch');
  assert.ok(out.startsWith(SYN), '卡头原样在最前');
  assert.ok(out.includes(`\n\n${DELIM}\n\n`), '分隔照旧');
  assert.ok(out.includes(CARD.trimEnd()), '卡文居中');
  for (const m of TAIL_MARKS) assert.ok(!out.includes(m), `拼出的卡文不得含「${m}」`);
});

test('A 卡尾（真实规矩）：分隔之后的卡文部分不含卡尾字样（规矩正文自身的字样不在此约束内）', () => {
  const out = composeCard(DOC, CARD, 'ds/dispatch');
  const at = out.indexOf(DELIM);
  assert.ok(at >= 0, '分隔存在');
  const body = out.slice(at);
  assert.ok(body.includes(CARD.trimEnd()), '卡文在分隔之后');
  for (const m of TAIL_MARKS) assert.ok(!body.includes(m), `分隔之后不得含「${m}」`);
});

// ---------- B：buildInvocation ----------

const dispatchMod = () => import('../../../tools/dispatch/dispatch.mjs');
const OPT = { wd: ROOT, card: 'docs/卡档案/chore-step1-tooling/派卡.md', effort: 'high', purpose: 'code', prompt: 'PROMPT' };
const CLAUDE_ENV = { ANTHROPIC_API_KEY: 'test-key' };
const budgetArg = (r) => {
  const i = r.args.indexOf('--max-budget-usd');
  return i < 0 ? undefined : Number(r.args[i + 1]);
};

test('B 模型白名单：白名单外的模型名（v4-pro、fable、空）一律拒', async () => {
  const { buildInvocation } = await dispatchMod();
  for (const model of ['deepseek-v4-pro', 'claude-fable', 'claude-fable-5-2', 'gpt-4o', '']) {
    assert.throws(() => buildInvocation({ ...OPT, model, budget: 0.65 }, { DEEPSEEK_API_KEY: 'ds-test', ...CLAUDE_ENV }), /./, `模型「${model}」应拒`);
  }
});

test('B 空卡文：opts.prompt 为空串时 buildInvocation 抛错（不起子进程）', async () => {
  const { buildInvocation } = await dispatchMod();
  assert.throws(() => buildInvocation({ ...OPT, prompt: '', model: 'claude-haiku-5-5' }, CLAUDE_ENV), /./, '空卡文应拒');
});

test('B 模型白名单：四个白名单模型都能起（返回命令、参数数组、环境）', async () => {
  const { buildInvocation } = await dispatchMod();
  const env = { DEEPSEEK_API_KEY: 'ds-test', ...CLAUDE_ENV };
  for (const model of ['deepseek-flash', 'claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']) {
    const r = buildInvocation({ ...OPT, model }, env);
    assert.equal(typeof r.command, 'string', model);
    assert.ok(Array.isArray(r.args), model);
    assert.equal(typeof r.env, 'object', model);
  }
});

test('B 预算：claude-* 的 0.66、0、负数、"abc" 拒（单次上限 0.65，见 CLAUDE.md 第 3 节）', async () => {
  const { buildInvocation } = await dispatchMod();
  for (const budget of [0.66, 0, -0.1, 'abc']) {
    assert.throws(() => buildInvocation({ ...OPT, model: 'claude-haiku-5-5', budget }, CLAUDE_ENV), /./, `预算 ${budget} 应拒`);
  }
});

test('B 预算：0.65 通过且参数含 --max-budget-usd 0.65；缺省同样为 0.65', async () => {
  const { buildInvocation } = await dispatchMod();
  for (const model of ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']) {
    assert.equal(budgetArg(buildInvocation({ ...OPT, model, budget: 0.65 }, CLAUDE_ENV)), 0.65, `${model} 显式 0.65`);
    assert.equal(budgetArg(buildInvocation({ ...OPT, model }, CLAUDE_ENV)), 0.65, `${model} 缺省`);
  }
});

test('B deepseek-flash：环境指向 DeepSeek，模型名全为 deepseek-flash，环境里不含 ANTHROPIC_API_KEY（即便来源环境里有）', async () => {
  const { buildInvocation } = await dispatchMod();
  const r = buildInvocation({ ...OPT, model: 'deepseek-flash' }, { DEEPSEEK_API_KEY: 'ds-test', ANTHROPIC_API_KEY: 'test-key' });
  assert.match(String(r.env.ANTHROPIC_BASE_URL), /deepseek/i);
  const names = Object.entries(r.env).filter(([k]) => /MODEL/i.test(k)).map(([, v]) => v);
  const i = r.args.indexOf('--model');
  if (i >= 0) names.push(r.args[i + 1]);
  assert.ok(names.length > 0, '模型名要出现在环境的 MODEL 键或 --model 参数里');
  for (const n of names) assert.equal(n, 'deepseek-flash');
  assert.equal(r.env.ANTHROPIC_API_KEY, undefined, 'deepseek 不走 ANTHROPIC_API_KEY');
});

test('B claude-*：ANTHROPIC_API_KEY 取自 ANTHROPIC_API_KEY，缺时取 CLAUDE_API_KEY，两者都有以 ANTHROPIC_API_KEY 为准；不指向 DeepSeek', async () => {
  const { buildInvocation } = await dispatchMod();
  const m = 'claude-opus-5-5';
  const key = (env) => buildInvocation({ ...OPT, model: m }, env).env.ANTHROPIC_API_KEY;
  assert.equal(key({ ANTHROPIC_API_KEY: 'test-key' }), 'test-key');
  assert.equal(key({ CLAUDE_API_KEY: 'alt-key' }), 'alt-key');
  assert.equal(key({ ANTHROPIC_API_KEY: 'test-key', CLAUDE_API_KEY: 'alt-key' }), 'test-key');
  assert.doesNotMatch(String(buildInvocation({ ...OPT, model: m }, CLAUDE_ENV).env.ANTHROPIC_BASE_URL ?? ''), /deepseek/i);
});

// ---------- C：三方模型族 ----------

// 规矩两版：带「三方模型字段：模型」键（新规矩）与不带该键（缺键不核）。两版都从真实规矩派生，不依赖真实规矩当前是否已带该键。
const DOC_NOKEY = DOC.replace(/^- 三方模型字段：.*\r?\n/m, '');
const DOC_KEY = DOC_NOKEY.replace(/^(- 三方标识字段：标识)/m, '$1\n- 三方模型字段：模型');
const K = loadRules(DOC_KEY);
const N = loadRules(DOC_NOKEY);
const QUESTIONS = K.questions;

// 造档案内存版（照 tests/accept/card-archive.test.mjs 的夹具写法）。
const fake = (n) => Array.from({ length: n }, (_, i) => `行 ${i + 1}`).join('\n');
const MEMF = {
  'tools/accept/run.mjs': fake(100),
  'tests/acceptance/chore-step1-tooling/step1.test.mjs': fake(300),
  'docs/统一底层设计/卷十二-验收与自动扫描.md': fake(600),
};
const MEM = {
  read: (p) => (p in MEMF ? MEMF[p] : null),
  list: (dir) => Object.keys(MEMF).filter((k) => k.startsWith(dir)).map((k) => k.slice(dir.length)),
};
const ROW = (role, model, id) => `- 角色：${role}；模型：${model}；标识：${id}`;
const selfcheck = () => {
  const rows = QUESTIONS.map((q) => `| ${q.n} | ${q.q} | 是 | tools/accept/run.mjs:1${String(q.n) === '6' ? '；diff 共 12 行' : ''} |`);
  return ['| # | 问题 | 是/否 | 证据 |', '|---|---|---|---|', ...rows].join('\n');
};
const ITEM3 = (n) => `- 抽查条目：偏离 ${n}；对照：tools/accept/run.mjs:${n}；结论：属实，与代码一致`;
const archiveWith = (rows) => ({
  '派卡.md': [
    '## 派卡人与模型', '主会话派卡', '',
    '## 三方标识', ...rows, '',
    '## 设计依据', '- 卷十二:545 E-ACC-CARD-ARCHIVE', '',
    '## 依赖核查', '- tools/accept/run.mjs:1 存在', '',
    '## 拆分理由', '一张卡完成模型族核与违规样例', '',
  ].join('\n'),
  '开发.md': '## 改动清单\n- 位置：tools/accept/run.mjs:1；做了什么：新增模型族核；依据：卷十二:545；公共部件：accRun（tools/accept/run.mjs）\n## 交DeepSeek小卡\n无小卡派出，写码方自写。\n',
  '反思.md': `${selfcheck()}\n\n## 是否合理完成\n是；tools/accept/run.mjs:1 存在\n\n## 偏离逐项\n无偏离。核过：卷十二:545、卷十二:546、卷十二:543\n`,
  '出题.md': '## 出题人与模型\nClaude Haiku 5.5 API\n\n## 依据与测试\n- 依据：卷十二:545；测的是什么：三方模型族拒与合法放行；测试位置：tests/acceptance/chore-step1-tooling/step1.test.mjs:1\n',
  '审查.md': `## 审查人与模型轮次\nClaude Opus 5.5 第 1 轮\n\n## 逐项审查\n- tools/accept/run.mjs:1 读过\n\n## 发现与处理\n无阻塞问题\n\n## 抽查自我反思\n${ITEM3(1)}\n${ITEM3(2)}\n${ITEM3(3)}\n`,
});
const runCheck = (parsed, rows) => {
  const files = archiveWith(rows);
  return checkArchive(parsed.rules, QUESTIONS, (f) => (f in files ? files[f] : null), null, '推送', MEM);
};
const has = (reasons, part) => reasons.some((r) => r.includes(part));

test('C 规矩两版可解析（带键、不带键）', () => {
  assert.equal(K.error, undefined);
  assert.equal(N.error, undefined);
  assert.ok(QUESTIONS.length >= 9, '自查表九项可读出');
});

test('C 同族拒：写码 DeepSeek flash 对出题 "deepseek-flash（API）"，拒，理由含「模型族」', () => {
  const r = runCheck(K, [ROW('写码', 'DeepSeek flash', 'agent-w1'), ROW('出题', 'deepseek-flash（API）', 'agent-t1'), ROW('审卡', 'Claude Opus 5.5', 'agent-r1')]);
  assert.ok(has(r, '模型族'), r.join(' | '));
});

test('C 同族拒：出题 "Claude Sonnet 5.5（子代理）" 对审卡 "claude-sonnet-5-5"，拒，理由含「模型族」', () => {
  const r = runCheck(K, [ROW('写码', 'DeepSeek flash', 'agent-w1'), ROW('出题', 'Claude Sonnet 5.5（子代理）', 'agent-t1'), ROW('审卡', 'claude-sonnet-5-5', 'agent-r1')]);
  assert.ok(has(r, '模型族'), r.join(' | '));
});

test('C 同族拒：写码行 "DeepSeek flash 写、Claude Haiku 5.5 统筹" 对出题 Haiku，拒，理由含「模型族」', () => {
  const r = runCheck(K, [ROW('写码', 'DeepSeek flash 写、Claude Haiku 5.5 统筹', 'agent-w1'), ROW('出题', 'Claude Haiku 5.5（API）', 'agent-t1'), ROW('审卡', 'Claude Opus 5.5', 'agent-r1')]);
  assert.ok(has(r, '模型族'), r.join(' | '));
});

test('C 同族拒：审卡与写码同族（DeepSeek 审 DeepSeek 写的卡），拒，理由含「模型族」', () => {
  const r = runCheck(K, [ROW('写码', 'DeepSeek flash', 'agent-w1'), ROW('出题', 'Claude Haiku 5.5', 'agent-t1'), ROW('审卡', 'deepseek-flash', 'agent-r1')]);
  assert.ok(has(r, '模型族'), r.join(' | '));
});

test('C 合法对照：DeepSeek 写、Haiku 出、Opus 与 Sonnet 两轮审，放行', () => {
  const r = runCheck(K, [
    ROW('写码', 'DeepSeek flash（API）', 'agent-w1'),
    ROW('出题', 'Claude Haiku 5.5（API）', 'agent-t1'),
    ROW('审卡', 'Claude Opus 5.5（API）第 1 轮', 'agent-r1'),
    ROW('审卡', 'Claude Sonnet 5.5（API）第 2 轮', 'agent-r2'),
  ]);
  assert.deepEqual(r, []);
});

test('C 合法对照：审卡两轮同为 Opus（轮间可同族），放行', () => {
  const r = runCheck(K, [
    ROW('写码', 'DeepSeek flash（API）', 'agent-w1'),
    ROW('出题', 'Claude Haiku 5.5（API）', 'agent-t1'),
    ROW('审卡', 'Claude Opus 5.5 第 1 轮', 'agent-r1'),
    ROW('审卡', 'Claude Opus 5.5 第 2 轮', 'agent-r2'),
  ]);
  assert.deepEqual(r, []);
});

test('C 规矩缺「三方模型字段」键：同族也不因模型族拒（缺键不核）', () => {
  const r = runCheck(N, [ROW('写码', 'DeepSeek flash', 'agent-w1'), ROW('出题', 'deepseek-flash（API）', 'agent-t1'), ROW('审卡', 'Claude Opus 5.5', 'agent-r1')]);
  assert.deepEqual(r, []);
});

// ---------- D：archive_ref 挂 pre_commit ----------

// 基线运行只做一次；注入后只看「新增的失败条目」，不写死条目名（条目名由派卡方在登记表定）。
let BASE;
const baselineRun = () => (BASE ??= accRun('pre_commit', '', null, { root: ROOT }));
const failedKeys = (report) => report.items.failed.map((f) => f.itemKey);
const newFailsWith = async (overrides) => {
  const b = await baselineRun();
  const i = await accRun('pre_commit', '', null, { root: ROOT, overrides });
  const before = new Set(failedKeys(b.report));
  return failedKeys(i.report).filter((k) => !before.has(k));
};

test('D 新增 server-plugin 代码含 "archive/legacy-server/x.mjs" 的注入：pre_commit 新增失败', async () => {
  const added = await newFailsWith({ 'server-plugin/x.mjs': 'export const x = "archive/legacy-server/x.mjs";\n' });
  assert.ok(added.length > 0, '注入后应有新增失败条目');
});

test('D 新增文档含 "docs/卡回报/a.md" 的注入：pre_commit 新增失败', async () => {
  const added = await newFailsWith({ 'docs/新.md': '本文档引用 docs/卡回报/a.md。\n' });
  assert.ok(added.length > 0, '注入后应有新增失败条目');
});

test('D 豁免目录（archive/、docs/gemini/、docs/卡档案/）里出现旧路径字样：不新增失败', async () => {
  const added = await newFailsWith({
    'docs/gemini/y.md': '历史材料：docs/卡回报/a.md、archive/x.mjs\n',
    'docs/卡档案/x-note.md': '历史材料：docs/卡回报/a.md\n',
  });
  assert.deepEqual(added, []);
});

// ---------- E：入库文件与 .gitignore ----------

test('E 三个文件入库路径存在：tools/accept/check-push-archive.mjs、tools/notify/notify.py、tools/notify/enqueue.py', () => {
  for (const f of ['tools/accept/check-push-archive.mjs', 'tools/notify/notify.py', 'tools/notify/enqueue.py']) {
    assert.ok(existsSync(join(ROOT, f)), f);
  }
});

test('E .gitignore 含 tools/notify/config.local.json', () => {
  const lines = readFileSync(join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((s) => s.trim());
  assert.ok(lines.some((l) => l === 'tools/notify/config.local.json' || l === '/tools/notify/config.local.json'));
});

test('E tools/notify/config.local.json 未入库（git ls-files 不列出）', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/);
  assert.ok(!files.includes('tools/notify/config.local.json'));
});
