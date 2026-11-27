// 卡档案与自我反思检查（卡头第二节第 11 条、第五节；亮圳 11-22「留档反思1122」「多层门禁1122」「卡测试换人1122」）。
// 小节名、证据判据、触发目录、例外一律从 docs/派活卡头规矩.md 读；档案正文在测试里造好再断言，不读仓库当前档案。
// 本文件是写脚本方自己的回归测试，不作验收依据（验收由独立模型另出违规样例）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chmodSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadRules, checkArchive, judgeCommit, archiveDirOf, modelFamilies, archiveRules, readRulesAt, CARD_RULES_DOC } from '../../tools/accept/lib/card-archive.mjs';
import { prePush } from '../../tools/accept/pre-push.mjs';
import { cardArchiveCheck } from '../../tools/accept/commit-hook.mjs';
import { ROOT, tempRepo } from './temp-repo.mjs';
import { testTempRoot, writeUnderTempRoot, removeTempRoot } from './temp-root.mjs';

// 门禁生效提交一行在真实规矩里会被合入后回填，测试不依赖它的现值：先统一设成「待回填」，要用具体值的用例自己再设。
const setEffective = (doc, v) => doc.replace(/^(- 门禁生效提交：).*?(\r?)$/m, `$1${v}$2`);
const DOC = setEffective(readFileSync(join(ROOT, 'tools/accept/card-rules.md'), 'utf8'), '待回填');
const { rules: RULES, error: LOAD_ERROR } = loadRules(DOC);
const PASS_GATE = async () => ({ verdict: 'pass' });

test('规矩文件第五节可解析', () => {
  assert.equal(LOAD_ERROR, undefined);
  assert.equal(archiveDirOf(RULES, 'ds/x'), 'docs/卡档案/ds-x/');
  // 合并提交不再免查（L-06）；交接文件与必填键从规矩数据里读，不在代码里写死。
  assert.equal(RULES.mergeExempt, false);
  assert.deepEqual(RULES.handoff, { file: 'state.json', keys: ['card', 'phase', 'updatedAt', 'branches', 'parties', 'ci', 'failCount', 'blocker', 'nextAction'] });
});

// 引用要落在仓库里真有的文件与行数内：内存版仓库（纯函数测试用）与写进临时 git 仓库的同一份文件（git 夹具用）。
const fakeText = (n) => Array.from({ length: n }, (_, i) => `行 ${i + 1}`).join('\n');
const FILES = {
  'tools/accept/run.mjs': fakeText(100),
  'tools/accept/lib/card-archive.mjs': fakeText(100),
  'tools/accept/commit-hook.mjs': fakeText(100),
  'tests/acceptance/ds-x/a.test.mjs': fakeText(100),
  'docs/统一底层设计/卷十二-验收与自动扫描.md': fakeText(400),
  'docs/统一底层设计/卷四-生物身体与人物.md': fakeText(400),
  'docs/统一底层设计/卷二-维度表规范.md': fakeText(400),
  'docs/统一底层设计/卷二十-时间日历.md': fakeText(50),
};
const MEM = {
  read: (p) => (p in FILES ? FILES[p] : null),
  list: (dir) => Object.keys(FILES).filter((k) => k.startsWith(dir)).map((k) => k.slice(dir.length)),
};

// 三方各一份收据（门禁封口卡 A）：收据的 model 照派卡.md 三方标识里的模型写，模型族才对得上。
function receipts(w, t, r) {
  const one = (role, model) => JSON.stringify({ role, model, family: model, endpoint: 'anthropic', startedAt: '2026-11-25T00:00:00Z', endedAt: '2026-11-25T00:05:00Z', exitCode: 0, totalCostUsd: null, promptSha256: 'ab'.repeat(32), headBefore: null, headAfter: null });
  return { '收据/写码-001.json': one('写码', w), '收据/出题-001.json': one('出题', t), '收据/审卡-001.json': one('审卡', r) };
}
const ITEM3 = (n) => `- 抽查条目：偏离 ${n}；对照：tools/accept/commit-hook.mjs:30；结论：属实，与代码一致`;
const GOOD = {
  '派卡.md': [
    '## 派卡人与模型', '主会话 Opus 派卡', '',
    '## 三方标识',
    '- 角色：写码；模型：DeepSeek flash；标识：agent-w1',
    '- 角色：出题；模型：Claude Haiku 5.5；标识：agent-t1',
    '- 角色：审卡；模型：Claude Opus 5.5；标识：agent-r1', '',
    '## 设计依据', '- 卷十二:163 提交关口', '',
    '## 依赖核查', '- tools/accept/run.mjs:1 存在', '- 某规则表 不存在→先停下回报', '',
    '## 拆分理由', '一张卡完成门禁与规矩改动', '',
  ].join('\n'),
  '开发.md': [
    '## 改动清单',
    '- 位置：tools/accept/lib/card-archive.mjs:10；做了什么：新增检查；依据：卷十二:163；公共部件：firstTable（tools/accept/lib/card-archive.mjs）',
    '## 交DeepSeek小卡', '无，DeepSeek 余额耗尽，由本会话自己写', '',
  ].join('\n'),
  '反思.md': [
    '## 是否合理完成', '是；`node --test tests/accept/card-archive.test.mjs` 末行：# pass 20', '',
    '## 偏离逐项',
    '- 代码位置：tools/accept/commit-hook.mjs:30；设计原文：卷十二:163；偏成：分支名取当前分支；理由：裁定 Q-12，提交钩子看不到提交说明',
    '',
  ].join('\n'),
  '出题.md': [
    '## 出题人与模型', 'Opus 5.5 另一会话', '',
    '## 依据与测试', '- 依据：卷十二:163；测的是什么：缺文件被拒；测试位置：tests/acceptance/ds-x/a.test.mjs:5', '',
  ].join('\n'),
  '审查.md': [
    '## 审查人与模型轮次', 'Sonnet 5.5 第 1 轮', '',
    '## 逐项审查', '- tools/accept/lib/card-archive.mjs:1 读过', '',
    '## 发现与处理', '无阻塞问题，已全部处理', '',
    '## 抽查自我反思', ITEM3(1), ITEM3(2), ITEM3(3), '',
  ].join('\n'),
  // 门禁封口卡 A：推送阶段交接文件必有、三方派活凭证必齐（收据文件在档案目录的 收据/ 下）。
  'state.json': JSON.stringify({
    card: 'ds-x', phase: 'pr', updatedAt: '2026-11-25T00:00:00Z', branches: { code: 'ds/x', test: 'test/x' }, pr: null,
    parties: {
      code: { receipt: 'docs/卡档案/ds-x/收据/写码-001.json' },
      test: { receipt: 'docs/卡档案/ds-x/收据/出题-001.json' },
      review: [{ receipt: 'docs/卡档案/ds-x/收据/审卡-001.json' }],
    },
    ci: {}, failCount: 0, blocker: null, nextAction: '等审卡结果后开 PR',
  }),
  ...receipts('DeepSeek flash', 'Claude Haiku 5.5', 'Claude Opus 5.5'),
};
const archive = (patch = {}) => ({ ...GOOD, ...patch });
const readOf = (files) => (f) => (f in files ? files[f] : null);
// 收据由仓库入口按路径读：档案目录下的读这份档案，其余读 MEM（门禁封口卡 A）。
const ADIR = 'docs/卡档案/ds-x/';
const repoOf = (files) => ({ read: (p) => (p.startsWith(ADIR) ? readOf(files)(p.slice(ADIR.length)) : MEM.read(p)), list: MEM.list });
const check = (files, stage = '推送') => checkArchive(RULES, readOf(files), null, stage, repoOf(files), { dir: ADIR });
const has = (reasons, ...parts) => reasons.some((r) => parts.every((p) => r.includes(p)));
const swap = (file, from, to) => archive({ [file]: GOOD[file].replace(from, to) });

test('合格档案放行', () => {
  assert.deepEqual(check(archive()), []);
});

test('交接文件 state.json：没有不拒；非法 JSON、非对象、缺必填键拒；齐全放行', () => {
  const state = { ...JSON.parse(GOOD['state.json']), phase: 'dispatched', ci: {}, nextAction: '继续写代码' };
  assert.deepEqual(check({ ...archive(), 'state.json': JSON.stringify(state) }), []);
  assert.ok(has(check({ ...archive(), 'state.json': '{' }), 'state.json', '不是合法 JSON'));
  assert.ok(has(check({ ...archive(), 'state.json': '[]' }), 'state.json', '须是 JSON 对象'));
  const miss = { ...state }; delete miss.phase;
  assert.ok(has(check({ ...archive(), 'state.json': JSON.stringify(miss) }), 'state.json', '缺必填键', 'phase'));
  const noState = archive(); delete noState['state.json'];
  assert.deepEqual(check(noState, '提交'), [], '没有 state.json 时提交阶段不拒（推送阶段必有，见 card-archive-seal.test.mjs）');
});

test('缺文件拒；出题.md、审查.md 提交时不要求、推送时要求', () => {
  const noReview = archive(); delete noReview['审查.md']; delete noReview['出题.md'];
  assert.deepEqual(check(noReview, '提交'), []);
  assert.ok(has(check(noReview, '推送'), '缺文件 审查.md'));
  const noDev = archive(); delete noDev['开发.md'];
  assert.ok(has(check(noDev, '提交'), '缺文件 开发.md'));
});

test('缺小节拒', () => {
  assert.ok(has(check(swap('反思.md', '## 偏离逐项', '## 别的')), '缺小节「偏离逐项」'));
});

test('只打勾、只写是否无、无证据：拒', () => {
  for (const body of ['✓', '是', '否', '无', '是，已完成', '已核']) {
    const r = check(swap('反思.md', '是；`node --test tests/accept/card-archive.test.mjs` 末行：# pass 20', body));
    assert.ok(r.some((x) => x.includes('反思.md「是否合理完成」')), body);
  }
  assert.ok(has(check(swap('派卡.md', '- 卷十二:163 提交关口', '- 已核')), '设计依据'));
  assert.ok(has(check(swap('开发.md', '位置：tools/accept/lib/card-archive.mjs:10', '位置：写在代码里')), '字段「位置」缺证据'));
});

test('偏离项：缺理由字段、理由为空、都拒；写「无理由」放行', () => {
  const dev = '- 代码位置：tools/accept/commit-hook.mjs:30；设计原文：卷十二:163；偏成：分支名取当前分支';
  assert.ok(has(check(swap('反思.md', /- 代码位置.*/.exec(GOOD['反思.md'])[0], dev)), '缺字段「理由」'));
  assert.ok(has(check(swap('反思.md', /- 代码位置.*/.exec(GOOD['反思.md'])[0], `${dev}；理由：`)), '字段「理由」为空'));
  assert.ok(has(check(swap('反思.md', /- 代码位置.*/.exec(GOOD['反思.md'])[0], `${dev}；理由：✓`)), '字段「理由」'));
  assert.deepEqual(check(swap('反思.md', /- 代码位置.*/.exec(GOOD['反思.md'])[0], `${dev}；理由：无理由`)), []);
});

test('偏离项缺设计原文的卷:行或代码位置的文件:行：拒', () => {
  const line = /- 代码位置.*/.exec(GOOD['反思.md'])[0];
  assert.ok(has(check(swap('反思.md', line, line.replace('卷十二:163', '设计里写了'))), '字段「设计原文」缺证据'));
  assert.ok(has(check(swap('反思.md', line, line.replace('tools/accept/commit-hook.mjs:30', '写在钩子的函数里面'))), '字段「代码位置」缺证据'));
});

test('没有偏离：只写「无偏离」拒；写「无偏离」并列够卷:行放行', () => {
  const line = /## 偏离逐项\n- 代码位置.*/.exec(GOOD['反思.md'])[0];
  assert.ok(has(check(swap('反思.md', line, '## 偏离逐项\n无偏离')), '须逐项列出核过的设计条目'));
  assert.ok(has(check(swap('反思.md', line, '## 偏离逐项\n无偏离。核过：卷十二:163、卷四:327')), '至少 3 条，实为 2 条'));
  assert.deepEqual(check(swap('反思.md', line, '## 偏离逐项\n无偏离。核过：卷十二:163、卷四:327、卷二:88')), []);
});

test('反思.md 无自查表、只有「是否合理完成」「偏离逐项」两节：放行；缺「偏离逐项」：拒', () => {
  const onlyTwo = '## 是否合理完成\n是；`node --test tests/accept/card-archive.test.mjs` 末行：# pass 20\n\n## 偏离逐项\n无偏离。核过：卷十二:163、卷四:327、卷二:88\n';
  assert.deepEqual(check(archive({ '反思.md': onlyTwo })), []);
  assert.ok(has(check(archive({ '反思.md': onlyTwo.replace('## 偏离逐项', '## 别的') })), '缺小节「偏离逐项」'));
});

test('审查.md 抽查少于 3 条：拒；抽查条目缺对照：拒', () => {
  assert.ok(has(check(swap('审查.md', `${ITEM3(3)}\n`, '')), '抽查自我反思', '至少 3 条'));
  assert.ok(has(check(swap('审查.md', ITEM3(1), '- 抽查条目：偏离 1；结论：属实，与代码一致')), '缺字段「对照」'));
  assert.ok(has(check(swap('审查.md', ITEM3(1), ITEM3(1).replace('tools/accept/commit-hook.mjs:30', '我看过了没问题'))), '字段「对照」缺证据'));
});

test('三方标识：缺一方、标识重复、占位词（推送时）：拒', () => {
  const two = swap('派卡.md', '- 角色：审卡；模型：Claude Opus 5.5；标识：agent-r1\n', '');
  assert.ok(has(check(two), '缺角色「审卡」'));
  assert.ok(has(check(swap('派卡.md', '标识：agent-r1', '标识：agent-w1')), '标识相同'));
  const ph = swap('派卡.md', '标识：agent-t1', '标识：待指派-出题');
  assert.deepEqual(check(ph, '提交'), []);
  assert.ok(has(check(ph, '推送'), '仍是占位'));
});

// 三方模型族（Step 1 防回潮工具；规矩键「三方模型字段」）：写码族写码∩出题=空、审卡族不在并集，审卡多轮之间可同族。
const withModels = (w, t, r) => archive({
  '派卡.md': GOOD['派卡.md'].split('\n').map((l) => (
    l.startsWith('- 角色：写码；') ? `- 角色：写码；模型：${w}；标识：agent-w1`
      : l.startsWith('- 角色：出题；') ? `- 角色：出题；模型：${t}；标识：agent-t1`
        : l.startsWith('- 角色：审卡；') ? `- 角色：审卡；模型：${r}；标识：agent-r1` : l)).join('\n'),
  ...receipts(w, t, r),
});

test('三方模型族：三族全异放行；写码与出题同族拒；审卡与写码或出题同族拒；审卡两轮同族放行', () => {
  assert.deepEqual(check(withModels('DeepSeek flash', 'Claude Haiku 5.5', 'Claude Opus 5.5')), []);
  assert.ok(has(check(withModels('DeepSeek flash', 'DeepSeek flash', 'Claude Opus 5.5')), '模型族'));
  assert.ok(has(check(withModels('DeepSeek flash', 'Claude Haiku 5.5', 'DeepSeek flash')), '审卡', '模型族'));
  assert.ok(has(check(withModels('DeepSeek flash', 'Claude Haiku 5.5', 'Claude Haiku 5.5')), '审卡', '模型族'));
  const twoReviewers = swap('派卡.md', '- 角色：审卡；模型：Claude Opus 5.5；标识：agent-r1\n', '- 角色：审卡；模型：Claude Opus 5.5；标识：agent-r1\n- 角色：审卡；模型：Claude Opus 5.5 第 2 轮；标识：agent-r2\n');
  assert.deepEqual(check(twoReviewers), []);
});

test('三方模型族：写码行列多个模型全部计入；括号里的别名不产生假族；原样小写去空白兜底', () => {
  assert.deepEqual(modelFamilies('DeepSeek flash（deepseek-flash，V4.1 Flash）'), ['deepseek']);
  assert.deepEqual(modelFamilies('DeepSeek flash、Claude Sonnet 5.5'), ['deepseek', 'claude-sonnet']);
  assert.deepEqual(modelFamilies('Some Model'), ['somemodel']);
  assert.ok(has(check(withModels('DeepSeek flash、Claude Sonnet 5.5', 'Claude Sonnet 5.5', 'Claude Opus 5.5')), '模型族'));
  assert.deepEqual(check(withModels('DeepSeek flash、Claude Sonnet 5.5', 'Claude Haiku 5.5', 'Claude Opus 5.5')), []);
  assert.deepEqual(check(withModels('Some Model', 'Another Model', 'Third Model')), []);
});

test('三方模型族：规矩没有该键（推送时读远端旧规矩）时不核模型字段', () => {
  const OLD = loadRules(DOC.replace(/^- 三方模型字段：.*\r?\n/m, ''));
  assert.equal(OLD.error, undefined);
  const same = { ...GOOD, '派卡.md': GOOD['派卡.md'].replace('模型：Claude Opus 5.5', '模型：DeepSeek flash') };
  assert.deepEqual(checkArchive(OLD.rules, readOf(same), null, '推送', repoOf(same), { dir: ADIR }), []);
});

test('回归 2：引用的文件不存在、行号超出文件、卷文件不存在或行号超出：拒；真有的放行', () => {
  const dep = (t) => swap('派卡.md', '- tools/accept/run.mjs:1 存在', `- ${t}`);
  assert.ok(has(check(dep('tools/accept/no-such.mjs:1 存在')), '依赖核查', '指向的文件不存在'));
  assert.ok(has(check(dep('tools/accept/run.mjs:101 存在')), '依赖核查', '行号超出文件范围（共 100 行）'));
  assert.ok(has(check(dep('tools/accept/run.mjs:0 存在')), '行号超出'));
  assert.deepEqual(check(dep('tools/accept/run.mjs:100 存在')), []);
  assert.ok(has(check(swap('派卡.md', '卷十二:163', '卷十二:401')), '设计依据', '行号超出文件范围（共 400 行）'));
  assert.ok(has(check(swap('派卡.md', '卷十二:163', '卷九十九:1')), '找不到对应的卷文件'));
  assert.deepEqual(check(swap('派卡.md', '卷十二:163', '卷二十:50')), [], '卷二十不是卷二，按完整卷号找文件');
  assert.ok(has(check(swap('派卡.md', '卷十二:163', '卷二十:51')), '行号超出'));
  assert.ok(has(check(swap('开发.md', 'tools/accept/lib/card-archive.mjs:10', 'tools/accept/lib/card-archive.mjs:999')), '改动清单', '行号超出'));
});

test('回归 3：三方标识只差大小写或首尾空白算同一个人：拒；提交说明的标识同样不分大小写', () => {
  assert.ok(has(check(swap('派卡.md', '标识：agent-r1', '标识：AGENT-W1 ')), '标识相同'));
  assert.ok(has(check(swap('派卡.md', '标识：agent-r1', '标识：Agent-T1')), '标识相同'));
  const ok = judgeCommit(RULES, { files: [SRC], branch: null, message: '卡分支：ds/x\n角色：写码\n标识：AGENT-W1', isMerge: false, stage: '推送', repo: repoOf(archive()), rangeFiles: [SRC, `${ADIR}开发.md`], readFile: (d, f) => readOf(archive())(f) });
  assert.deepEqual(ok, []);
});

// 判提交（内存版）。
const SRC = 'server-plugin/a.mjs';
const judge = (o) => judgeCommit(RULES, { branch: 'ds/x', message: null, isMerge: false, stage: '提交', repo: repoOf(archive()), rangeFiles: [SRC, `${ADIR}开发.md`], readFile: (d, f) => (d === 'docs/卡档案/ds-x/' ? readOf(archive())(f) : null), ...o });

test('审卡每轮一条可多条：两条审卡放行；审卡标识等于写码拒；提交用第二条放行、用未登记标识拒；写码仍只许一条', () => {
  const R1 = '- 角色：审卡；模型：Claude Opus 5.5；标识：agent-r1\n';
  const two = swap('派卡.md', R1, `${R1}- 角色：审卡；模型：Claude Opus 5.5 第 2 轮；标识：agent-r2\n`);
  assert.deepEqual(check(two), []);
  const dupWriter = swap('派卡.md', R1, `${R1}- 角色：审卡；模型：Claude Opus 5.5 第 2 轮；标识：agent-w1\n`);
  assert.ok(has(check(dupWriter), '标识相同'));
  const twoWriters = swap('派卡.md', R1, `${R1}- 角色：写码；模型：DeepSeek flash；标识：agent-w2\n`);
  assert.ok(has(check(twoWriters), '写了不止一条'));
  const read = (f) => (f === '派卡.md' ? two['派卡.md'] : null);
  const msg = (id) => `卡分支：ds/x\n角色：审卡\n标识：${id}`;
  const j = (id) => judgeCommit(RULES, { files: ['tests/acceptance/ds-x/a.test.mjs'], branch: null, message: msg(id), isMerge: false, stage: '推送', repo: MEM, readFile: (d, f) => read(f) });
  assert.ok(has(j('agent-r2'), '审卡的提交改动了验收目录'), '第二条审卡标识认得（只剩验收目录角色问题）');
  assert.ok(!has(j('agent-r2'), '不一致'));
  assert.ok(!has(j('agent-r1'), '不一致'));
  assert.ok(has(j('agent-x9'), '与三方标识里「审卡」的「agent-r1、agent-r2」不一致'));
});

test('例外提交放行：纯快照、不在触发目录的文档', () => {
  const none = { readFile: () => null };
  assert.deepEqual(judge({ ...none, files: ['docs/统一底层设计/版本快照/卷四-v1.md'] }), []);
  assert.deepEqual(judge({ ...none, files: ['docs/审查/x.md', 'docs/当前状态.md'] }), []);
});

test('合并提交不再免查：无档案拒；带合格档案与合并三行放行', () => {
  const none = { readFile: () => null };
  assert.ok(has(judge({ ...none, files: [SRC], isMerge: true, ownFiles: [] }), '缺文件 派卡.md'));
  assert.deepEqual(judge({ files: [SRC], isMerge: true, ownFiles: [], stage: '推送', message: '卡分支：ds/x\n角色：合并\n标识：main-session-1' }), []);
});

test('触发目录的提交没有档案：拒；有合格档案：放行', () => {
  for (const f of [SRC, 'world/a.json', 'tools/a.mjs', 'docs/统一底层设计/卷二-x.md']) {
    assert.ok(has(judge({ files: [f], readFile: () => null }), '缺文件 派卡.md'), f);
  }
  assert.deepEqual(judge({ files: [SRC] }), []);
});

// ---- git 夹具：临时仓库 ----
function git(dir, args, env = {}) {
  return execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
}
function repo() {
  const dir = testTempRoot('card-archive-');
  git(dir, ['init', '-q']);
  writeUnderTempRoot(dir, 'tools/accept/card-rules.md', DOC);
  for (const [rel, text] of Object.entries(FILES)) writeUnderTempRoot(dir, rel, text);
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'core.hooksPath=', 'commit', '-q', '-m', 'base']);
  git(dir, ['update-ref', 'refs/remotes/origin/master', 'HEAD']); // base 当作远端已有，不在待推范围
  return dir;
}
function commit(dir, files, msgLines, extra = []) {
  for (const [rel, text] of Object.entries(files)) writeUnderTempRoot(dir, rel, text);
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'core.hooksPath=', 'commit', '-q', ...extra, ...msgLines.flatMap((m) => ['-m', m])]);
  return git(dir, ['rev-parse', 'HEAD']).trim();
}
const archFiles = (a) => Object.fromEntries(Object.entries(a).map(([f, t]) => [`docs/卡档案/ds-x/${f}`, t]));
const push = (dir, sha) => prePush(dir, `refs/heads/ds/x ${sha} refs/heads/master ${'0'.repeat(40)}\n`, { runGate: PASS_GATE });
const roleMsg = (role, id) => [`卡分支：ds/x\n角色：${role}\n标识：${id}`];
const WRITER = roleMsg('写码', 'agent-w1');

test('pre-push：合格的卡提交放行（并重跑 pre_commit 替身）', async () => {
  const dir = repo();
  try {
    const sha = commit(dir, { 'server-plugin/a.mjs': 'export const a = 1;\n', ...archFiles(archive()) }, WRITER);
    assert.deepEqual(await push(dir, sha), { ok: true, reasons: [] });
  } finally { removeTempRoot(dir); }
});

test('故意违规 1：缺反思、偏离无理由的提交，推送被拒', async () => {
  const dir = repo();
  try {
    const noReflect = archive(); delete noReflect['反思.md'];
    const s1 = commit(dir, { 'server-plugin/a.mjs': 'export const a = 1;\n', ...archFiles(noReflect) }, WRITER);
    const r1 = await push(dir, s1);
    assert.equal(r1.ok, false);
    assert.ok(has(r1.reasons, '缺文件 反思.md'));
  } finally { removeTempRoot(dir); }
  const dir2 = repo();
  try {
    const line = /- 代码位置.*/.exec(GOOD['反思.md'])[0];
    const noReason = swap('反思.md', line, line.replace(/；理由：.*/, ''));
    const s2 = commit(dir2, { 'server-plugin/a.mjs': 'export const a = 1;\n', ...archFiles(noReason) }, WRITER);
    const r2 = await push(dir2, s2);
    assert.equal(r2.ok, false);
    assert.ok(has(r2.reasons, '缺字段「理由」'));
  } finally { removeTempRoot(dir2); }
});

test('故意违规 2：--no-verify 绕过提交钩子的提交，推送时被拦', async () => {
  const dir = repo();
  try {
    git(dir, ['config', 'core.hooksPath', join(ROOT, '.githooks')]);
    writeUnderTempRoot(dir, 'server-plugin/a.mjs', 'export const a = 1;\n');
    git(dir, ['add', '-A']);
    assert.throws(() => git(dir, ['commit', '-q', '-m', 'x']), /./, '带钩子的提交应被拦（临时仓库里钩子跑不起来或不合格）');
    git(dir, ['commit', '-q', '--no-verify', '-m', '卡分支：ds/x\n角色：写码\n标识：agent-w1']);
    const sha = git(dir, ['rev-parse', 'HEAD']).trim();
    const r = await push(dir, sha);
    assert.equal(r.ok, false);
    assert.ok(has(r.reasons, '缺文件 派卡.md'));
  } finally { removeTempRoot(dir); }
});

test('pre-push 命令行：违规退出码 1、报原因；非 master 目标不查', () => {
  const dir = repo();
  try {
    const sha = commit(dir, { 'server-plugin/a.mjs': 'export const a = 1;\n' }, WRITER);
    const bad = spawnSync(process.execPath, [join(ROOT, 'tools/accept/pre-push.mjs'), '--root', dir], { input: `refs/heads/ds/x ${sha} refs/heads/master ${'0'.repeat(40)}\n`, encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /E-ACC-CARD-ARCHIVE/);
    assert.match(bad.stderr, /pre_push rejected/);
    const other = spawnSync(process.execPath, [join(ROOT, 'tools/accept/pre-push.mjs'), '--root', dir], { input: `refs/heads/ds/x ${sha} refs/heads/ds/x ${'0'.repeat(40)}\n`, encoding: 'utf8' });
    assert.equal(other.status, 0, other.stderr);
  } finally { removeTempRoot(dir); }
});

test('绕过标记：没有绕过记录拒；带合格的绕过记录放行', async () => {
  const dir = repo();
  try {
    const base = { 'server-plugin/a.mjs': 'export const a = 1;\n', ...archFiles({ '派卡.md': GOOD['派卡.md'] }) };
    const msg = [`卡分支：ds/x\n角色：写码\n标识：agent-w1\n绕过门禁：钩子临时故障`];
    const s1 = commit(dir, base, msg);
    const r1 = await push(dir, s1);
    assert.equal(r1.ok, false);
    assert.ok(has(r1.reasons, '绕过登记不合格', '缺文件 开发.md'));
    const dev = '## 绕过记录\n- 谁：写码会话 agent-w1；为什么：钩子在该机器上故障；通知号：msg_0042abcdef\n';
    const s2 = commit(dir, archFiles({ '开发.md': dev }), msg);
    assert.deepEqual(await push(dir, s2), { ok: true, reasons: [] });
    const s3 = commit(dir, archFiles({ '开发.md': '## 绕过记录\n- 谁：写码会话；为什么：钩子故障' }), msg);
    const r3 = await push(dir, s3);
    assert.equal(r3.ok, false);
    assert.ok(has(r3.reasons, '缺字段「通知号」'));
  } finally { removeTempRoot(dir); }
});

test('角色标记：写码方改验收目录拒；出题方改放行；缺角色行拒；标识与三方标识不符拒', async () => {
  const dir = repo();
  try {
    commit(dir, archFiles(archive()), ['派卡']);
    const t = 'tests/acceptance/ds-x/a.test.mjs';
    const sW = commit(dir, { [t]: '// 写码方偷改\n' }, WRITER);
    const rW = await push(dir, sW);
    assert.equal(rW.ok, false);
    assert.ok(has(rW.reasons, '写码的提交改动了验收目录'));
    const sT = commit(dir, { [t]: '// 出题\n' }, roleMsg('出题', 'agent-t1'));
    assert.deepEqual((await push(dir, sT)).ok, false, '含前一个违规提交，整体仍拒');
    const dir2 = repo();
    try {
      commit(dir2, archFiles(archive()), ['派卡']);
      const ok = commit(dir2, { [t]: `${fakeText(100)}\n// 出题\n` }, roleMsg('出题', 'agent-t1'));
      assert.deepEqual(await push(dir2, ok), { ok: true, reasons: [] });
      const noRole = commit(dir2, { [t]: '// 再改\n' }, ['卡分支：ds/x']);
      assert.ok(has((await push(dir2, noRole)).reasons, '缺「角色：<角色>」'));
      const wrongId = commit(dir2, { [t]: '// 再改2\n' }, roleMsg('出题', 'agent-w1'));
      assert.ok(has((await push(dir2, wrongId)).reasons, '与三方标识里「出题」的「agent-t1」不一致'));
    } finally { removeTempRoot(dir2); }
  } finally { removeTempRoot(dir); }
});

test('提交钩子：暂存区改了触发目录、没有档案即拒；带档案放行；非 git 目录不查', () => {
  const plain = testTempRoot('card-archive-plain-');
  try { assert.deepEqual(cardArchiveCheck(plain), { ok: true, code: null, reasons: [] }); } finally { removeTempRoot(plain); }
  const dir = repo();
  try {
    git(dir, ['checkout', '-q', '-b', 'ds/x']);
    writeUnderTempRoot(dir, 'server-plugin/a.mjs', 'export const a = 1;\n');
    git(dir, ['add', '-A']);
    const bad = cardArchiveCheck(dir);
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'E-ACC-CARD-ARCHIVE');
    for (const [rel, text] of Object.entries(archFiles(archive()))) writeUnderTempRoot(dir, rel, text);
    git(dir, ['add', '-A']);
    assert.deepEqual(cardArchiveCheck(dir), { ok: true, code: null, reasons: [] });
  } finally { removeTempRoot(dir); }
});

test('回归 4：档案在盘上但没进暂存区，提交钩子照拒（读的是暂存版本）；部分暂存也拒', () => {
  const dir = repo();
  try {
    git(dir, ['checkout', '-q', '-b', 'ds/x']);
    writeUnderTempRoot(dir, 'server-plugin/a.mjs', 'export const a = 1;\n');
    for (const [rel, text] of Object.entries(archFiles(archive()))) writeUnderTempRoot(dir, rel, text);
    git(dir, ['add', '--', 'server-plugin/a.mjs']);
    const none = cardArchiveCheck(dir);
    assert.equal(none.ok, false);
    assert.ok(has(none.reasons, '缺文件 派卡.md'));
    git(dir, ['add', '--', 'docs/卡档案/ds-x/派卡.md', 'docs/卡档案/ds-x/开发.md']);
    const part = cardArchiveCheck(dir);
    assert.equal(part.ok, false);
    assert.ok(has(part.reasons, '缺文件 反思.md'));
    git(dir, ['add', '-A']);
    assert.deepEqual(cardArchiveCheck(dir), { ok: true, code: null, reasons: [] });
  } finally { removeTempRoot(dir); }
});

test('回归 5：门禁生效线——生效提交及其祖先不查，之后的新提交照查；没回填时全查', async () => {
  const dir = repo();
  try {
    const c1 = commit(dir, { 'server-plugin/a.mjs': 'export const a = 1;\n' }, ['生效线之前的提交，没有任何卡行']);
    const c2 = commit(dir, { 'server-plugin/b.mjs': 'export const b = 1;\n' }, ['生效线之后的提交，没有任何卡行']);
    const before = await push(dir, c2);
    assert.equal(before.ok, false);
    assert.ok(before.reasons.some((x) => x.includes(c1.slice(0, 9))), '没回填：祖先提交也查');
    writeUnderTempRoot(dir, 'tools/accept/card-rules.md', setEffective(DOC, c1));
    const after = await push(dir, c2);
    assert.equal(after.ok, false);
    assert.ok(after.reasons.every((x) => !x.includes(c1.slice(0, 9))), '生效提交本身不查');
    assert.ok(after.reasons.some((x) => x.includes(c2.slice(0, 9))), '之后的新提交照查');
    assert.deepEqual(await push(dir, c1), { ok: true, reasons: [] });
  } finally { removeTempRoot(dir); }
});

// 门禁封口卡 A（Q1）：「角色：合并」只认真合并提交，squash 改为 PR 真合并（--no-ff）——卡分支上按角色提交，回主线合并，合并说明写三行。
function mergeIn(dir, br, steps, mergeLines) {
  const main = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  git(dir, ['checkout', '-q', '-b', br]);
  for (const [files, lines] of steps) commit(dir, files, lines);
  git(dir, ['checkout', '-q', main]);
  git(dir, ['-c', 'core.hooksPath=', 'merge', '-q', '--no-ff', br, ...mergeLines.flatMap((m) => ['-m', m])]);
  return git(dir, ['rev-parse', 'HEAD']).trim();
}

test('回归 6：PR 真合并写「卡分支/角色：合并/标识」放行；缺分支行或档案不全拒；非触发目录的文档提交放行', async () => {
  const dir = repo();
  try {
    const t = 'tests/acceptance/ds-x/a.test.mjs';
    const merge = ['卡分支：ds/x\n角色：合并\n标识：main-session-1'];
    const ok = mergeIn(dir, 'ds/x', [
      [{ 'server-plugin/a.mjs': 'export const a = 1;\n', ...archFiles(archive()) }, WRITER],
      [{ [t]: `${fakeText(100)}\n// 出题方写的\n` }, roleMsg('出题', 'agent-t1')],
    ], merge);
    assert.deepEqual(await push(dir, ok), { ok: true, reasons: [] });
    const noBranch = mergeIn(dir, 'ds/x-b', [[{ 'server-plugin/b.mjs': 'export const b = 1;\n' }, WRITER]], ['角色：合并\n标识：main-session-1']);
    assert.ok(has((await push(dir, noBranch)).reasons, '卡分支'));
    const noRefl = archive(); delete noRefl['反思.md'];
    const dir2 = repo();
    try {
      const bad = mergeIn(dir2, 'ds/x', [[{ 'server-plugin/a.mjs': 'export const a = 1;\n', ...archFiles(noRefl) }, WRITER]], merge);
      assert.ok(has((await push(dir2, bad)).reasons, '缺文件 反思.md'));
    } finally { removeTempRoot(dir2); }
    const doc = commit(dir, { 'docs/裁定/x.md': '裁定正文\n', 'docs/交接-x.md': '交接\n' }, ['主会话直提文档']);
    assert.deepEqual(await push(dir, doc).then((r) => r.reasons.filter((x) => x.includes(doc.slice(0, 9)))), []);
  } finally { removeTempRoot(dir); }
});

// 回归 7：提交阶段真装 commit-msg 钩子（core.hooksPath 指向临时仓库自己的 .githooks）。临时仓库用现有 tempRepo（带整套门禁脚本）加 git init；
// 只装 commit-msg（卡档案检查所在），pre-commit 的 pre_commit 门禁在临时仓库里本来就跑不过（缺内核与世界数据，见 temp-repo.mjs），不在本回归范围。
function hookRepo() {
  const dir = tempRepo();
  git(dir, ['init', '-q']);
  writeUnderTempRoot(dir, 'tools/accept/card-rules.md', DOC);
  for (const [rel, text] of Object.entries(FILES)) if (!rel.startsWith('tools/')) writeUnderTempRoot(dir, rel, text);
  // 钩子必须有执行位：Linux 上 git 会跳过不可执行的钩子（Windows 不看执行位，本机才通过）。
  chmodSync(writeUnderTempRoot(dir, '.githooks/commit-msg', readFileSync(join(ROOT, '.githooks/commit-msg'))), 0o755);
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'core.hooksPath=', 'commit', '-q', '-m', 'base']);
  git(dir, ['checkout', '-q', '-b', 'main-s']);
  git(dir, ['config', 'core.hooksPath', '.githooks']);
  return dir;
}
const stageAll = (dir, files) => { for (const [rel, text] of Object.entries(files)) writeUnderTempRoot(dir, rel, text); git(dir, ['add', '-A']); };
const rejectedWith = (part) => (e) => String(e.stderr).includes('commit_msg rejected') && String(e.stderr).includes(part);

test('回归 7：真钩子走提交——主会话真合并带三行放行；缺卡分支行拒；卡分支上档案缺反思拒', () => {
  const dir = hookRepo();
  try {
    const MERGE = ['合并 ds/x', '卡分支：ds/x\n角色：合并\n标识：main-session-1'];
    // 卡分支上写码提交：档案缺反思.md，提交被 commit-msg 钩子拒（档案目录取自说明里的「卡分支：」行）
    git(dir, ['checkout', '-q', '-b', 'ds/x']);
    const noRefl = archive(); delete noRefl['反思.md'];
    stageAll(dir, { 'server-plugin/a.mjs': 'export const a = 1;\n', ...archFiles(noRefl) });
    assert.throws(() => git(dir, ['commit', '-q', '-m', '写码', '-m', '卡分支：ds/x\n角色：写码\n标识：agent-w1']), rejectedWith('缺文件 反思.md'));
    // 补全后写码提交放行（说明里角色标识与三方标识一致）
    stageAll(dir, archFiles(archive()));
    git(dir, ['commit', '-q', '-m', '写码', '-m', '卡分支：ds/x\n角色：写码\n标识：agent-w1']);
    // 回主会话分支真合并（门禁封口卡 A：不再 squash）：说明缺卡分支行 → 拒（当前分支 main-s 没有档案目录）；带三行 → 放行
    git(dir, ['checkout', '-q', 'main-s']);
    git(dir, ['merge', '--no-ff', '--no-commit', 'ds/x']);
    assert.throws(() => git(dir, ['commit', '-q', '-m', '合并 ds/x', '-m', '角色：合并\n标识：main-session-1']), rejectedWith('缺文件 派卡.md'));
    git(dir, ['commit', '-q', ...MERGE.flatMap((m) => ['-m', m])]);
    assert.equal(git(dir, ['log', '-1', '--format=%s']).trim(), '合并 ds/x');
  } finally { removeTempRoot(dir); }
});

// S2-GOV Q1：机读规矩原样迁到 tools/accept/card-rules.md，解析结果与迁移前（6413e8a47 的 docs/派活卡头规矩.md 第五节）逐字相等。
const rulesJson = (r) => JSON.stringify(r, (_k, v) => (v instanceof Set ? [...v] : v));
test('规矩迁移等价：新文件解析结果与 6413e8a47 旧文件第五节逐字相等', () => {
  const before = execFileSync('git', ['show', '6413e8a47:docs/派活卡头规矩.md'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  const after = readFileSync(join(ROOT, CARD_RULES_DOC), 'utf8');
  const a = archiveRules(before);
  const b = archiveRules(after);
  assert.equal(a.error, undefined, a.error);
  assert.equal(rulesJson(b), rulesJson(a));
});

test('readRulesAt：ref 上有新文件读新文件，没有退回旧人读文件第五节，两处都没有抛错', () => {
  const NEW = '## 五、x\n- 推送目标：new\n';
  const OLD = '## 五、x\n- 推送目标：old\n';
  const seen = [];
  const store = (files) => (spec) => { seen.push(spec); if (spec in files) return files[spec]; throw new Error(`no ${spec}`); };
  const fakeLoad = (files) => { try { return readRulesAt('R', store(files)); } catch (e) { return { thrown: e.message }; } };
  // 只比读到的是哪份：两份都缺其它必填键，错误信息里带不出差别，所以换成看 show 被问了哪些路径。
  fakeLoad({ [`R:${CARD_RULES_DOC}`]: NEW, 'R:docs/派活卡头规矩.md': OLD });
  assert.deepEqual(seen.splice(0), [`R:${CARD_RULES_DOC}`]);
  fakeLoad({ 'R:docs/派活卡头规矩.md': OLD });
  assert.deepEqual(seen.splice(0), [`R:${CARD_RULES_DOC}`, 'R:docs/派活卡头规矩.md']);
  assert.ok(fakeLoad({}).thrown);
  // 真实规矩：旧路径上放迁移前全文，经退路读出的规则与新文件相同。
  const before = execFileSync('git', ['show', '6413e8a47:docs/派活卡头规矩.md'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  const viaLegacy = readRulesAt('R', store({ 'R:docs/派活卡头规矩.md': before }));
  assert.equal(rulesJson(viaLegacy.rules), rulesJson(loadRules(readFileSync(join(ROOT, CARD_RULES_DOC), 'utf8')).rules));
});
