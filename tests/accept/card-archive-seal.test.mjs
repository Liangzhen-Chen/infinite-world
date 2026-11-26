// 门禁封口卡 A（chore/gate-seal-a）：档案门禁的口子——合并提交改动集、「合并」冒用与「主会话」记账、借档、触发目录扩项、
// state.json 推送必有与派活凭证、绕过记录通知号证据、派前自检命令。规矩一律读真实 docs/派活卡头规矩.md（判据只在那里定义）。
// 临时仓库用 testTempRoot/tempRepo，本卡不删临时根（删除助手由子卡 B 补）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadRules, judgeCommit, checkArchive } from '../../tools/accept/lib/card-archive.mjs';
import { checkReceipt, buildReceipt, RECEIPT_FIELDS } from '../../tools/accept/lib/receipt.mjs';
import { prePush } from '../../tools/accept/pre-push.mjs';
import { ROOT, tempRepo } from './temp-repo.mjs';
import { testTempRoot, writeUnderTempRoot } from './temp-root.mjs';

const setEffective = (doc, v) => doc.replace(/^(- 门禁生效提交：).*?(\r?)$/m, `$1${v}$2`);
const DOC = setEffective(readFileSync(join(ROOT, 'docs/派活卡头规矩.md'), 'utf8'), '待回填');
const { rules: RULES, error: LOAD_ERROR } = loadRules(DOC);
const PASS_GATE = async () => ({ verdict: 'pass' });
const has = (reasons, ...parts) => reasons.some((r) => parts.every((p) => r.includes(p)));

const DIR = 'docs/卡档案/ds-x/';
const SRC = 'server-plugin/a.mjs';
const fakeText = (n) => Array.from({ length: n }, (_, i) => `行 ${i + 1}`).join('\n');
const receipt = (role, model, family, endpoint) => JSON.stringify({
  role, model, family, endpoint, startedAt: '2026-11-26T01:00:00.000Z', endedAt: '2026-11-26T01:05:00.000Z', exitCode: 0,
  totalCostUsd: 0.1, promptSha256: 'ab'.repeat(32), headBefore: null, headAfter: null,
});
const REC = { 写码: `${DIR}收据/写码-001.json`, 出题: `${DIR}收据/出题-001.json`, 审卡: `${DIR}收据/审卡-001.json` };
const BASE_FILES = {
  'tools/accept/run.mjs': fakeText(100),
  'docs/统一底层设计/卷十二-验收与自动扫描.md': fakeText(400),
  'docs/统一底层设计/卷二-维度表规范.md': fakeText(600),
};
const STATE = (patch = {}) => JSON.stringify({
  card: 'ds-x', phase: 'pr', updatedAt: '2026-11-26T12:00:00.000Z', branches: { code: 'ds/x', test: 'test/x' }, pr: null,
  parties: {
    code: { family: 'deepseek', model: 'deepseek-flash', receipt: REC.写码, costUsd: null },
    test: { family: 'claude-haiku', model: 'claude-haiku-5-5', receipt: REC.出题, costUsd: null },
    review: [{ family: 'claude-opus', model: 'claude-opus-5-5', receipt: REC.审卡, costUsd: null }],
  },
  ci: { status: 'pending', runUrl: null }, failCount: 0, blocker: null, nextAction: '等审卡结果后开 PR',
  ...patch,
}, null, 2);
const ITEM3 = (n) => `- 抽查条目：偏离 ${n}；对照：tools/accept/run.mjs:30；结论：属实，与代码一致`;
const ARCH = {
  '派卡.md': [
    '## 派卡人与模型', '主会话 Opus 派卡', '',
    '## 三方标识',
    '- 角色：写码；模型：DeepSeek flash；标识：agent-w1',
    '- 角色：出题；模型：Claude Haiku 5.5；标识：agent-t1',
    '- 角色：审卡；模型：Claude Opus 5.5；标识：agent-r1', '',
    '## 设计依据', '- 卷十二:163 提交关口', '',
    '## 依赖核查', '- tools/accept/run.mjs:1 存在', '',
    '## 拆分理由', '一张卡完成门禁与规矩改动', '',
  ].join('\n'),
  '开发.md': [
    '## 改动清单',
    '- 位置：tools/accept/run.mjs:10；做了什么：新增检查；依据：卷十二:163；公共部件：firstTable（tools/accept/run.mjs）',
    '## 交DeepSeek小卡', '无，本会话自己写全部改动', '',
  ].join('\n'),
  '反思.md': [
    '## 是否合理完成', '是；`node --test tests/accept/x.test.mjs` 末行：# pass 20', '',
    '## 偏离逐项',
    '- 代码位置：tools/accept/run.mjs:30；设计原文：卷十二:163；偏成：分支名取当前分支；理由：裁定 Q-12，提交钩子看不到提交说明', '',
  ].join('\n'),
  '出题.md': ['## 出题人与模型', 'Haiku 5.5 另一会话', '', '## 依据与测试', '- 依据：卷十二:163；测的是什么：缺文件被拒；测试位置：tools/accept/run.mjs:5', ''].join('\n'),
  '审查.md': [
    '## 审查人与模型轮次', 'Opus 5.5 第 1 轮', '', '## 逐项审查', '- tools/accept/run.mjs:1 读过', '',
    '## 发现与处理', '无阻塞问题，已全部处理', '', '## 抽查自我反思', ITEM3(1), ITEM3(2), ITEM3(3), '',
  ].join('\n'),
  'state.json': STATE(),
  '收据/写码-001.json': receipt('写码', 'deepseek-flash', 'deepseek', 'deepseek'),
  '收据/出题-001.json': receipt('出题', 'claude-haiku-5-5', 'claude-haiku', 'anthropic'),
  '收据/审卡-001.json': receipt('审卡', 'claude-opus-5-5', 'claude-opus', 'anthropic'),
};
const inDir = (a) => Object.fromEntries(Object.entries(a).map(([f, t]) => [`${DIR}${f}`, t]));
const memOf = (arch) => {
  const all = { ...BASE_FILES, ...inDir(arch) };
  return { read: (p) => (p in all ? all[p] : null), list: (d) => Object.keys(all).filter((k) => k.startsWith(d)).map((k) => k.slice(d.length)) };
};
const msg = (role, id, branch = 'ds/x') => `卡分支：${branch}\n角色：${role}\n标识：${id}`;
// 推送阶段纯函数判定：默认写码提交、本卡档案齐、推送范围含档案目录。
const judgePush = (o = {}) => {
  const arch = { ...ARCH, ...(o.arch || {}) };
  for (const [k, v] of Object.entries(o.arch || {})) if (v === null) delete arch[k];
  const { arch: _a, ...rest } = o;
  return judgeCommit(RULES, {
    files: [SRC], branch: null, message: msg('写码', 'agent-w1'), isMerge: false, stage: '推送',
    repo: memOf(arch), rangeFiles: [SRC, `${DIR}开发.md`], headBranch: null, history: null,
    readFile: (d, f) => (d === DIR && f in arch ? arch[f] : null), ...rest,
  });
};

test('规矩第五节新键可解析：触发目录扩项、交接文件阶段与角色键、主会话角色、证据示例、通知号证据', () => {
  assert.equal(LOAD_ERROR, undefined);
  for (const t of ['tests/', '.github/', '.githooks/', 'docs/世界设计/', 'package.json', 'package-lock.json', 'jsconfig.json', 'docs/派活卡头规矩.md']) assert.ok(RULES.triggers.includes(t), t);
  assert.ok(RULES.handoffPhases.length > 0);
  assert.deepEqual(Object.keys(RULES.handoffRoleKeys).sort(), [...RULES.party.roles].sort());
  assert.ok(RULES.party.mainRole && RULES.party.mainId && RULES.party.mainFiles.length);
  assert.ok(RULES.kinds['通知号']);
  assert.ok(RULES.examples['卷文行']);
});

test('基线：合格的写码提交在推送阶段放行', () => {
  assert.deepEqual(judgePush(), []);
});

// 验收要点 2：「角色：合并」只认真合并提交；主会话记账角色只许改登记路径、标识须是登记的主会话标识。
test('非合并提交写「角色：合并」拒，碰验收目录同样拒；真合并提交放行', () => {
  const fake = judgePush({ message: msg('合并', 'main-session-opus55') });
  assert.ok(has(fake, '不是合并提交'));
  const fakeAcc = judgePush({ files: [`${RULES.party.acceptDir}ds-x/a.test.mjs`], message: msg('合并', 'main-session-opus55') });
  assert.ok(has(fakeAcc, '不是合并提交'));
  assert.ok(has(fakeAcc, '验收目录'));
  // 不触发的提交写了也拒（冒用本身就拒）
  assert.ok(has(judgePush({ files: ['docs/PLAN.md'], message: msg('合并', 'x-1') }), '不是合并提交'));
  assert.deepEqual(judgePush({ isMerge: true, ownFiles: [], message: msg('合并', 'main-session-opus55') }), []);
});

test('主会话角色：只改登记路径且标识对放行；标识不对拒；改了登记外文件拒', () => {
  const id = RULES.party.mainId;
  const ok = ['docs/卡档案/ds-x/state.json', 'docs/卡档案/ds-x/派卡.md', 'docs/PLAN.md', 'docs/状态快照.generated.md'];
  assert.deepEqual(judgePush({ files: ok, message: msg(RULES.party.mainRole, id) }), []);
  assert.ok(has(judgePush({ files: ['docs/PLAN.md'], message: msg(RULES.party.mainRole, 'someone-else') }), '主会话标识'));
  for (const f of ['tools/x.mjs', `${RULES.party.acceptDir}ds-x/a.test.mjs`, 'docs/卡档案/ds-x/开发.md', 'docs/其它.md']) {
    assert.ok(has(judgePush({ files: [f], message: msg(RULES.party.mainRole, id) }), '只许改', f), f);
  }
});

// 验收要点 3：借档。
test('借档：推送范围没改该卡档案目录拒；branches 不含卡分支拒；CI 头分支不在 branches 拒', () => {
  assert.ok(has(judgePush({ rangeFiles: [SRC] }), '不能借用'));
  assert.ok(has(judgePush({ rangeFiles: null }), '推送范围'));
  assert.ok(has(judgePush({ arch: { 'state.json': STATE({ branches: { code: 'old/y', test: 'test/y' } }) } }), 'branches 不含卡分支「ds/x」'));
  assert.ok(has(judgePush({ headBranch: 'other/z' }), '头分支「other/z」'));
  assert.deepEqual(judgePush({ headBranch: 'test/x' }), []);
});

// 验收要点 4：触发目录扩项。
test('触发目录扩项：只改 tests/accept 或 .github 的提交要档案与角色行；只改 docs/PLAN.md 不触发', () => {
  for (const f of ['tests/accept/x.test.mjs', '.github/workflows/ci.yml', 'package.json', 'docs/派活卡头规矩.md']) {
    const r = judgePush({ files: [f], message: '改一点', readFile: () => null });
    assert.ok(has(r, '角色'), f);
    assert.ok(has(r, '卡档案目录') || has(r, '缺文件'), f);
  }
  assert.deepEqual(judgePush({ files: ['docs/PLAN.md'], message: '记进度' }), []);
});

// 验收要点 5：交接文件推送必有与值核对。
test('state.json：推送阶段缺即拒（提交阶段不拒）；nextAction 空话、phase 未登记、updatedAt、failCount、blocker 不合格拒', () => {
  assert.ok(has(judgePush({ arch: { 'state.json': null } }), '缺文件 state.json'));
  const commitStage = checkArchive(RULES, (f) => (f === 'state.json' ? null : ARCH[f]), null, '提交', memOf(ARCH), { dir: DIR });
  assert.ok(!has(commitStage, 'state.json'));
  assert.ok(has(judgePush({ arch: { 'state.json': STATE({ nextAction: '无' }) } }), 'nextAction'));
  assert.ok(has(judgePush({ arch: { 'state.json': STATE({ nextAction: '' }) } }), 'nextAction'));
  assert.ok(has(judgePush({ arch: { 'state.json': STATE({ phase: 'whatever' }) } }), 'phase「whatever」'));
  assert.ok(has(judgePush({ arch: { 'state.json': STATE({ updatedAt: '昨天' }) } }), 'updatedAt'));
  assert.ok(has(judgePush({ arch: { 'state.json': STATE({ failCount: -1 }) } }), 'failCount'));
  assert.ok(has(judgePush({ arch: { 'state.json': STATE({ blocker: '  ' }) } }), 'blocker'));
});

// 验收要点 6：派活凭证。
test('收据凭证：缺字段拒；模型族与三方标识不一致拒；角色不符拒；收据在别卡目录拒；没有凭证拒', () => {
  const broken = JSON.parse(ARCH['收据/写码-001.json']); delete broken.promptSha256;
  assert.ok(has(judgePush({ arch: { '收据/写码-001.json': JSON.stringify(broken) } }), '收据缺字段「promptSha256」'));
  assert.ok(has(judgePush({ arch: { '收据/写码-001.json': receipt('写码', 'claude-sonnet-5-5', 'claude-sonnet', 'anthropic') } }), '模型族'));
  assert.ok(has(judgePush({ arch: { '收据/写码-001.json': receipt('出题', 'deepseek-flash', 'deepseek', 'deepseek') } }), '不是「写码」'));
  const parties = JSON.parse(STATE()).parties;
  assert.ok(has(judgePush({ arch: { 'state.json': STATE({ parties: { ...parties, code: { ...parties.code, receipt: 'docs/卡档案/old-y/收据/写码-001.json' } } }) } }), '本卡档案目录'));
  assert.ok(has(judgePush({ arch: { 'state.json': STATE({ parties: { ...parties, test: { ...parties.test, receipt: null } } }) } }), '没有派活凭证'));
  assert.ok(has(judgePush({ arch: { 'state.json': STATE({ parties: { ...parties, code: [parties.code] } }) } }), '只许一条'));
});

test('orca 凭证：提交不在推送历史拒；提交角色行不符拒；齐全放行', () => {
  const parties = JSON.parse(STATE()).parties;
  const orca = (commits) => STATE({ parties: { ...parties, code: { ...parties.code, receipt: null, orca: { worktree: 'F:/wt/x', session: 'orca-1', commits } } } });
  const history = { reachable: (s) => s !== 'dead0000', message: (s) => (s === 'abc1234' ? msg('写码', 'agent-w1') : msg('出题', 'agent-t1')) };
  assert.deepEqual(judgePush({ history, arch: { 'state.json': orca(['abc1234']) } }), []);
  assert.ok(has(judgePush({ history, arch: { 'state.json': orca(['dead0000']) } }), '不能从推送头到达'));
  assert.ok(has(judgePush({ history, arch: { 'state.json': orca(['bbb1234']) } }), '不是「写码」'));
  assert.ok(has(judgePush({ history, arch: { 'state.json': orca([]) } }), 'orca.commits'));
  assert.ok(has(judgePush({ history: null, arch: { 'state.json': orca(['abc1234']) } }), '提交历史'));
});

// 审卡第 1 轮必须改 2：orca 提交还要是本卡该角色的标识，别卡同角色提交不能顶替；审卡数组按轮次对第几个审卡标识。
test('orca 凭证：别卡同角色提交（标识不是本卡登记的）拒；审卡数组多出的一轮没有登记标识拒', () => {
  const parties = JSON.parse(STATE()).parties;
  const history = { reachable: () => true, message: (s) => (s === 'a0d1234' ? msg('写码', 'old-card-writer', 'old/y') : s === 'abc1234' ? msg('写码', 'AGENT-W1') : msg('审卡', 'agent-r1')) };
  const code = (commits) => ({ ...parties.code, receipt: null, orca: { worktree: 'F:/wt/x', session: 'orca-1', commits } });
  assert.ok(has(judgePush({ history, arch: { 'state.json': STATE({ parties: { ...parties, code: code(['a0d1234']) } }) } }), '不是本卡三方标识里「写码」'));
  assert.deepEqual(judgePush({ history, arch: { 'state.json': STATE({ parties: { ...parties, code: code(['abc1234']) } }) } }), []);
  const round = (sha) => ({ ...parties.review[0], receipt: null, orca: { worktree: 'F:/wt/r', session: 'orca-r', commits: [sha] } });
  assert.deepEqual(judgePush({ history, arch: { 'state.json': STATE({ parties: { ...parties, review: [round('dd01234')] } }) } }), []);
  assert.ok(has(judgePush({ history, arch: { 'state.json': STATE({ parties: { ...parties, review: [round('dd01234'), round('dd05678')] } }) } }), 'review[1]', '第 2 条'));
});

test('收据格式：buildReceipt 与 checkReceipt 同一判据', () => {
  const ok = JSON.parse(ARCH['收据/写码-001.json']);
  assert.deepEqual(checkReceipt(ok), []);
  assert.deepEqual(Object.keys(buildReceipt(ok)), RECEIPT_FIELDS);
  assert.ok(checkReceipt({ ...ok, endpoint: 'x' }).length);
  assert.throws(() => buildReceipt({ ...ok, endpoint: 'x' }), /endpoint/);
});

// 验收要点 7：绕过记录通知号。
test('绕过记录：通知号写「已通知」拒；写 msg_ 十六进制号放行', () => {
  const dev = (n) => `${ARCH['开发.md']}\n## 绕过记录\n- 谁：主会话 Opus 会话；为什么：门禁脚本本身故障需紧急修复；通知号：${n}\n`;
  const bypassMsg = `${msg('写码', 'agent-w1')}\n绕过门禁：门禁脚本故障`;
  assert.ok(has(judgePush({ message: bypassMsg, arch: { '开发.md': dev('已通知李白') } }), '通知号'));
  assert.deepEqual(judgePush({ message: bypassMsg, arch: { '开发.md': dev('msg_d0e590ac17f8') } }), []);
});

// ---- git 夹具 ----
function git(dir, args) {
  return execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'core.hooksPath=', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function commit(dir, files, lines) {
  for (const [rel, text] of Object.entries(files)) writeUnderTempRoot(dir, rel, text);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', ...lines.flatMap((m) => ['-m', m])]);
  return git(dir, ['rev-parse', 'HEAD']).trim();
}
function repo() {
  const dir = testTempRoot('card-archive-seal-');
  git(dir, ['init', '-q', '-b', 'master']);
  commit(dir, { 'docs/派活卡头规矩.md': DOC, ...BASE_FILES }, ['base']);
  return dir;
}
const pushRange = (dir, head, base) => prePush(dir, `refs/heads/x ${head} refs/heads/master ${base}\n`, { runGate: PASS_GATE });

// 验收要点 1：合并提交改动集对第一父求差。
test('合并提交：改动集取对第一父的差——只带进非触发文件放行（主线一侧的触发改动不算）；带进触发文件且缺卡分支行拒、写全三行放行', async () => {
  const dir = repo();
  // 主线一侧先有一个触发改动（已在远端），卡分支只改文档。
  git(dir, ['checkout', '-q', '-b', 'side']);
  commit(dir, { 'docs/a.md': '文档\n' }, ['只改文档']);
  git(dir, ['checkout', '-q', 'master']);
  const m1 = commit(dir, { 'server-plugin/m.mjs': 'export const m = 1;\n', ...inDir(ARCH) }, ['主线', msg('写码', 'agent-w1')]);
  git(dir, ['merge', '-q', '--no-ff', 'side', '-m', '合并文档']);
  const merge1 = git(dir, ['rev-parse', 'HEAD']).trim();
  assert.deepEqual(git(dir, ['diff-tree', '--no-commit-id', '--name-only', '-r', `${merge1}^1`, merge1]).trim().split('\n'), ['docs/a.md']);
  assert.deepEqual(await pushRange(dir, merge1, m1), { ok: true, reasons: [] });

  // 卡分支带进触发文件：合并说明缺卡分支行 → 拒；写全三行 → 放行。
  git(dir, ['checkout', '-q', '-b', 'ds/x']);
  commit(dir, { [SRC]: 'export const a = 1;\n', [`${DIR}开发.md`]: `${ARCH['开发.md']}\n` }, ['写码', msg('写码', 'agent-w1')]);
  git(dir, ['checkout', '-q', 'master']);
  commit(dir, { 'docs/b.md': '主线文档\n' }, ['主线另一改动']);
  const base2 = git(dir, ['rev-parse', 'HEAD']).trim();
  git(dir, ['merge', '-q', '--no-ff', 'ds/x', '-m', '合入 ds/x', '-m', '角色：合并\n标识：main-session-opus55']);
  const bad = await pushRange(dir, git(dir, ['rev-parse', 'HEAD']).trim(), base2);
  assert.equal(bad.ok, false);
  assert.ok(has(bad.reasons, '卡分支'));
  git(dir, ['reset', '-q', '--hard', base2]);
  git(dir, ['merge', '-q', '--no-ff', 'ds/x', '-m', '合入 ds/x', '-m', msg('合并', 'main-session-opus55')]);
  assert.deepEqual(await pushRange(dir, git(dir, ['rev-parse', 'HEAD']).trim(), base2), { ok: true, reasons: [] });
});

test('pre-push 真仓库：orca 凭证的提交在推送历史里且角色行一致放行；指向推送头够不着的提交拒', async () => {
  const dir = repo();
  const base = git(dir, ['rev-parse', 'HEAD']).trim();
  git(dir, ['checkout', '-q', '-b', 'ds/x']);
  const noState = { ...ARCH }; delete noState['state.json'];
  const c1 = commit(dir, { [SRC]: 'export const a = 1;\n', ...inDir(noState) }, ['写码', msg('写码', 'agent-w1')]);
  const parties = JSON.parse(STATE()).parties;
  const withOrca = (sha) => STATE({ parties: { ...parties, code: { ...parties.code, receipt: null, orca: { worktree: 'F:/wt/x', session: 'orca-1', commits: [sha] } } } });
  const head = commit(dir, { [`${DIR}state.json`]: withOrca(c1) }, ['记 state']);
  assert.deepEqual(await pushRange(dir, head, base), { ok: true, reasons: [] });
  // 另一条分支上的提交：推送头够不着。
  git(dir, ['checkout', '-q', '-b', 'stray', base]);
  const stray = commit(dir, { 'docs/s.md': 's\n' }, ['游离', msg('写码', 'agent-w1')]);
  git(dir, ['checkout', '-q', 'ds/x']);
  const head2 = commit(dir, { [`${DIR}state.json`]: withOrca(stray) }, ['改 state']);
  const r = await pushRange(dir, head2, base);
  assert.equal(r.ok, false);
  assert.ok(has(r.reasons, '不能从推送头到达'));
});

// 审卡第 1 轮必须改 1：合并提交的角色与验收目录按合并自身引入的改动（diff-tree --cc）核，要不要档案仍按第一父差集。
test('合并自身改动：卡分支同步主线带进别卡验收文件放行；合并里夹带改验收目录或 server-plugin，按角色拒', async () => {
  const dir = repo();
  git(dir, ['checkout', '-q', '-b', 'ds/x']);
  commit(dir, { [SRC]: 'export const a = 1;\n', ...inDir(ARCH) }, ['写码', msg('写码', 'agent-w1')]);
  git(dir, ['checkout', '-q', 'master']);
  const mainTip = commit(dir, { 'tests/acceptance/other-y/t.test.mjs': '// 别卡出题\n' }, ['别卡出题']);
  // 正例：卡分支同步主线，主线带来别卡验收文件；合并自身没有改动。
  git(dir, ['checkout', '-q', 'ds/x']);
  git(dir, ['merge', '-q', '--no-ff', 'master', '-m', '同步主线', '-m', msg('写码', 'agent-w1')]);
  const sync = git(dir, ['rev-parse', 'HEAD']).trim();
  assert.deepEqual(await pushRange(dir, sync, mainTip), { ok: true, reasons: [] });
  // 反例 1：写码同步主线时在合并里夹带改验收目录 → 按写码角色拒。
  git(dir, ['reset', '-q', '--hard', 'HEAD^1']);
  git(dir, ['merge', '-q', '--no-ff', '--no-commit', 'master']);
  writeUnderTempRoot(dir, 'tests/acceptance/ds-x/evil.test.mjs', '// 写码夹带\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', '同步主线', '-m', msg('写码', 'agent-w1')]);
  const r1 = await pushRange(dir, git(dir, ['rev-parse', 'HEAD']).trim(), mainTip);
  assert.equal(r1.ok, false);
  assert.ok(has(r1.reasons, '写码的提交改动了验收目录'));
  // 反例 2：「角色：合并」的真合并夹带改验收目录与 server-plugin → 拒。
  git(dir, ['reset', '-q', '--hard', 'HEAD^1']);
  git(dir, ['checkout', '-q', 'master']);
  git(dir, ['merge', '-q', '--no-ff', '--no-commit', 'ds/x']);
  writeUnderTempRoot(dir, 'tests/acceptance/ds-x/evil.test.mjs', '// 合并者夹带\n');
  writeUnderTempRoot(dir, 'server-plugin/evil.mjs', 'export const evil = 1;\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', '合入 ds/x', '-m', msg('合并', 'main-session-opus55')]);
  const r2 = await pushRange(dir, git(dir, ['rev-parse', 'HEAD']).trim(), mainTip);
  assert.equal(r2.ok, false);
  assert.ok(has(r2.reasons, '合并提交自身改动了', 'tests/acceptance/ds-x/evil.test.mjs', 'server-plugin/evil.mjs'));
  // 同一合并不夹带 → 放行。
  git(dir, ['reset', '-q', '--hard', mainTip]);
  git(dir, ['merge', '-q', '--no-ff', 'ds/x', '-m', '合入 ds/x', '-m', msg('合并', 'main-session-opus55')]);
  assert.deepEqual(await pushRange(dir, git(dir, ['rev-parse', 'HEAD']).trim(), mainTip), { ok: true, reasons: [] });
});

// 验收要点 8：派前自检命令。临时仓库用 tempRepo（带整套门禁脚本），只读工作区磁盘上的派卡.md，不读其它档案文件。
test('派前自检：--stage 提交 --only 派卡.md 对缺行号的设计依据非零退出并带示例；合格放行且不读开发.md', () => {
  const dir = tempRepo();
  git(dir, ['init', '-q', '-b', 'master']);
  for (const [rel, text] of Object.entries({ 'docs/派活卡头规矩.md': DOC, 'docs/统一底层设计/卷十二-验收与自动扫描.md': BASE_FILES['docs/统一底层设计/卷十二-验收与自动扫描.md'] })) writeUnderTempRoot(dir, rel, text);
  git(dir, ['add', 'docs']);
  git(dir, ['commit', '-q', '-m', 'base']);
  git(dir, ['update-ref', 'refs/remotes/origin/master', 'HEAD']);
  const run = () => spawnSync(process.execPath, [join(ROOT, 'tools/accept/check-push-archive.mjs'), dir, 'ds/x', '--stage', '提交', '--only', '派卡.md'], { encoding: 'utf8' });
  writeUnderTempRoot(dir, `${DIR}派卡.md`, ARCH['派卡.md'].replace('卷十二:163 提交关口', '卷二 §2.7 没写行号'));
  writeUnderTempRoot(dir, `${DIR}开发.md`, '乱写\n');
  const bad = run();
  assert.notEqual(bad.status, 0);
  assert.ok(bad.stdout.includes('设计依据'), bad.stdout);
  assert.ok(bad.stdout.includes(`例：${RULES.examples['卷文行']}`), bad.stdout);
  assert.ok(!bad.stdout.includes('开发.md'), bad.stdout);
  writeUnderTempRoot(dir, `${DIR}派卡.md`, ARCH['派卡.md'].replace('- tools/accept/run.mjs:1 存在', '- tools/accept/run.mjs:1 存在（工作区里的执行器）'));
  const good = run();
  assert.equal(good.status, 0, good.stdout + good.stderr);
});
