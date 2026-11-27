// 门禁封口子卡 A（chore/gate-seal-a）黑盒验收：档案门禁封口九条规则。出题方 haiku-orca-test-gsa，照卷十二:545 / 583 / 1010 与 docs/卡档案/chore-gate-seal-a/派卡.md 出题。
// 只经公开入口测行为：judgeCommit / checkArchive（卡档案判据）、prePush（临时 git 仓库实跑）、check-push-archive.mjs（CLI）。
// 规矩一律从 docs/派活卡头规矩.md 第五节读（loadRules）；档案目录名、小节名取自规矩，测试不写死规矩里的取值。
// 每条规则的正例与反例分开成独立用例，便于看出哪一侧未落地。写码方的实现不在本文件里。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadRules, checkArchive, judgeCommit, archiveDirOf } from '../../../tools/accept/lib/card-archive.mjs';
import { prePush } from '../../../tools/accept/pre-push.mjs';
import { tempRepo } from '../../accept/temp-repo.mjs';
import { ROOT, writeUnderTempRoot } from '../../accept/temp-root.mjs';

const CLI = join(ROOT, 'tools/accept/check-push-archive.mjs');
const DOC = readFileSync(join(ROOT, 'tools/accept/card-rules.md'), 'utf8');
const VOL12 = readFileSync(join(ROOT, 'docs/统一底层设计/卷十二-验收与自动扫描.md'), 'utf8');
const RULES = loadRules(DOC).rules;
const PASS_GATE = async () => ({ verdict: 'pass' });

// 仓库只读视图：卷文引用核实用真实卷文件（只读，不写仓库）。
const REPO = {
  read: (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null),
  list: (d) => (existsSync(join(ROOT, d)) ? readdirSync(join(ROOT, d)) : []),
};

const CARD = 'feat/x';
const WRITER = 'sonnet-orca-write-gsa';
const TESTER = 'haiku-orca-test-gsa';
const REVIEWER = 'opus-orca-review-gsa';
const MAIN = 'main-session-opus55';
const dirOf = (branch) => archiveDirOf(RULES, branch);
const msg = (...lines) => `${lines.join('\n')}\n`;
const WRITE_MSG = msg(`卡分支：${CARD}`, '角色：写码', `标识：${WRITER}`);
const MERGE_MSG = msg(`卡分支：${CARD}`, '角色：合并', `标识：${MAIN}`);
const MAIN_MSG = msg(`卡分支：${CARD}`, '角色：主会话', `标识：${MAIN}`);

// ---- 档案夹具（引用只指向临时仓库里也有的文件：tools/accept/*、卷十二） ----
const ITEM3 = (n) => `- 抽查条目：偏离 ${n}；对照：tools/accept/commit-hook.mjs:30；结论：属实，与代码一致`;
const RECEIPT = (role, model, family) => ({ role, model, family, endpoint: 'anthropic', startedAt: '2026-11-26T01:00:00Z', endedAt: '2026-11-26T01:10:00Z', exitCode: 0, totalCostUsd: null, promptSha256: 'a'.repeat(64), headBefore: null, headAfter: null });
const baseState = (branch) => ({
  card: branch,
  phase: 'dispatched',
  updatedAt: '2026-11-26T02:00:00Z',
  branches: { code: branch, test: branch.replace(/^feat\//, 'test/') },
  pr: null,
  parties: {
    code: { family: 'claude-sonnet', model: 'claude-sonnet-5-5', receipt: `${dirOf(branch)}收据-写码.json`, costUsd: null },
    test: { family: 'claude-haiku', model: 'claude-haiku-5-5', receipt: `${dirOf(branch)}收据-出题.json`, costUsd: null },
    review: { family: 'claude-opus', model: 'claude-opus-5-5', receipt: `${dirOf(branch)}收据-审卡.json`, costUsd: null },
  },
  ci: { status: 'pending', runUrl: null },
  failCount: 0,
  blocker: null,
  nextAction: '等待审卡',
});
const stateOf = (branch, patch = {}) => JSON.stringify({ ...baseState(branch), ...patch }, null, 2);

// 档案文件名 → 文本（over 里值为 null 表示该文件不存在）。返回值标成「任意档案」，让 {} 这类部分档案能过类型检查。
/** @returns {Record<string, string>} */
function archiveFiles(branch = CARD, over = {}) {
  const files = {
    '派卡.md': [
      '## 派卡人与模型', '主会话派，Claude Opus 5.5。', '',
      '## 三方标识',
      `- 角色：写码；模型：Claude Sonnet 5.5（Orca 会员会话）；标识：${WRITER}`,
      `- 角色：出题；模型：Claude Haiku 5.5（Orca 会员会话）；标识：${TESTER}`,
      `- 角色：审卡；模型：Claude Opus 5.5（Orca 会员会话）；标识：${REVIEWER}`, '',
      '## 设计依据', '- 卷十二:545 E-ACC-CARD-ARCHIVE 提交或推送时档案不合格的处置', '',
      '## 依赖核查', '- tools/accept/lib/card-archive.mjs:1 存在', '',
      '## 拆分理由', '门禁封口一张卡完成，约 300 行。', '',
    ].join('\n'),
    '开发.md': ['## 改动清单', '- 位置：tools/accept/lib/card-archive.mjs:10；做了什么：收紧合并角色判定；依据：卷十二:545；公共部件：judgeCommit', '', '## 交DeepSeek小卡', '无，本卡由 Sonnet 写', ''].join('\n'),
    '反思.md': ['## 是否合理完成', '是。`node --test tests/acceptance/chore-gate-seal-a/archive-seal.test.mjs` 末行：# pass 22', '', '## 偏离逐项', '无偏离。核过：卷十二:545、卷十二:583、卷十二:1010', ''].join('\n'),
    '出题.md': ['## 出题人与模型', `Claude Haiku 5.5（Orca 会员会话），标识 ${TESTER}`, '', '## 依据与测试', '- 依据：卷十二:545；测的是什么：缺文件被拒；测试位置：tools/accept/commit-hook.mjs:1', ''].join('\n'),
    '审查.md': ['## 审查人与模型轮次', `Claude Opus 5.5（Orca 会员会话）第 1 轮，标识 ${REVIEWER}`, '', '## 逐项审查', '- tools/accept/lib/card-archive.mjs:1 读过', '', '## 发现与处理', '无阻塞问题，已全部处理', '', '## 抽查自我反思', ITEM3(1), ITEM3(2), ITEM3(3), ''].join('\n'),
    'state.json': stateOf(branch),
    '收据-写码.json': JSON.stringify(RECEIPT('写码', 'claude-sonnet-5-5', 'claude-sonnet'), null, 2),
    '收据-出题.json': JSON.stringify(RECEIPT('出题', 'claude-haiku-5-5', 'claude-haiku'), null, 2),
    '收据-审卡.json': JSON.stringify(RECEIPT('审卡', 'claude-opus-5-5', 'claude-opus'), null, 2),
  };
  for (const [k, v] of Object.entries(over)) { if (v === null) delete files[k]; else files[k] = v; }
  return files;
}

// 按卡分支读档案（judgeCommit 的 readFile(目录, 文件名)）。
const readArchive = (files, branch = CARD) => (dir, f) => (dir === dirOf(branch) && files[f] != null ? files[f] : null);
// 单目录版（checkArchive 的 readFile(文件名)）。
const single = (files) => (f) => (files[f] != null ? files[f] : null);
// 推送范围须含本卡档案目录的改动（借档核对），这里取「本提交改动 + 档案审查.md」当范围。
// 收据经 repo.read 读（门禁在提交树上读），所以仓库视图要把档案目录映射到夹具档案。
const repoOf = (files, branch = CARD) => {
  const dir = dirOf(branch);
  return { read: (p) => (p.startsWith(dir) && files[p.slice(dir.length)] != null ? files[p.slice(dir.length)] : REPO.read(p)), list: REPO.list };
};
const judge = (files, message, arch = archiveFiles(), extra = {}) => judgeCommit(RULES, {
  files, branch: null, message, readFile: readArchive(arch), isMerge: false, repo: repoOf(arch), stage: '推送', rangeFiles: [...files, `${dirOf(CARD)}审查.md`], ...extra,
});
const check = (files, stage = '推送') => checkArchive(RULES, single(files), null, stage, repoOf(files), { dir: dirOf(CARD) });
const prefixed = (branch, files) => Object.fromEntries(Object.entries(files).map(([k, v]) => [dirOf(branch) + k, v]));

// ---- 临时 git 仓库：tempRepo() 建临时根（带整套门禁脚本），再 git init（不清理） ----
const GIT = ['-c', 'user.name=gsa-test', '-c', 'user.email=gsa-test@example.invalid', '-c', 'commit.gpgsign=false'];
const git = (cwd, args) => execFileSync('git', [...GIT, ...args], { cwd, encoding: 'utf8' }).trim();
function commitWith(dir, files, message) {
  for (const [f, t] of Object.entries(files)) writeUnderTempRoot(dir, f, t);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '--no-verify', '-m', message]);
  return git(dir, ['rev-parse', 'HEAD']);
}
// 新仓库：master 上一个基线提交（带真实规矩与卷十二），并把它当作远端 origin/master。
function newRepo(files = {}) {
  const dir = tempRepo();
  git(dir, ['init', '-q', '-b', 'master']);
  commitWith(dir, { 'docs/派活卡头规矩.md': DOC, 'docs/统一底层设计/卷十二-验收与自动扫描.md': VOL12, ...files }, 'base');
  git(dir, ['update-ref', 'refs/remotes/origin/master', 'HEAD']);
  return dir;
}
// 推送：本地 localSha 推到 master，远端原来在 remoteSha。
const pushOf = (dir, remoteSha, localSha) => prePush(dir, `refs/heads/master ${localSha} refs/heads/master ${remoteSha}\n`, { runGate: PASS_GATE });

// ---- 规则 1：合并提交看第一父的差集；触发目录改动须档案齐全 ----
function mergeRepo(sideFiles, mergeMessage) {
  const dir = newRepo();
  git(dir, ['checkout', '-q', '-b', 'side']);
  const side = commitWith(dir, sideFiles, 'side work');
  git(dir, ['checkout', '-q', 'master']);
  commitWith(dir, { 'docs/main.md': 'main work\n' }, 'main work');
  git(dir, ['merge', '--no-ff', '--no-verify', '-q', '-m', mergeMessage, 'side']);
  return { dir, side, merge: git(dir, ['rev-parse', 'HEAD']) };
}

test('规则1 合并提交反例：合并进来的改动含触发目录文件，且无卡分支行，推送即拒', async () => {
  const { dir, side, merge } = mergeRepo({ 'tools/side.mjs': 'export const s = 1;\n' }, '合并 side');
  const r = await pushOf(dir, side, merge);
  assert.equal(r.ok, false, `应拒，实际放行；reasons=${JSON.stringify(r.reasons)}`);
});

test('规则1 合并提交正例：合并进来的改动都不在触发目录，无档案也放行', async () => {
  const { dir, side, merge } = mergeRepo({ 'docs/side.md': 'side\n' }, '合并 side');
  const r = await pushOf(dir, side, merge);
  assert.equal(r.ok, true, `应放行；reasons=${JSON.stringify(r.reasons)}`);
});

test('规则1 合并提交反例（判档）：触发目录改动的合并提交，档案不齐即拒', () => {
  assert.ok(judge(['tools/side.mjs'], MERGE_MSG, {}, { isMerge: true, ownFiles: [] }).length > 0);
});

test('规则1 合并提交正例（判档）：同样改动，档案齐全即放行', () => {
  assert.deepEqual(judge(['tools/side.mjs'], MERGE_MSG, archiveFiles(), { isMerge: true, ownFiles: [] }), []);
});

// ---- 规则 2：非合并提交写「角色：合并」即拒；合并提交的合并角色放行 ----
test('规则2 反例：非合并提交写「角色：合并」即拒，无论改了什么（这里只改非触发文件）', () => {
  assert.ok(judge(['docs/side.md'], MERGE_MSG, archiveFiles(), { isMerge: false }).length > 0);
});

test('规则2 反例：非合并提交同时改 tests/acceptance/ 且角色合并即拒', () => {
  assert.ok(judge(['tests/acceptance/feat-x/a.test.mjs'], MERGE_MSG, archiveFiles(), { isMerge: false }).length > 0);
});

test('规则2 正例：合并提交的合并角色可改验收目录，放行', () => {
  assert.deepEqual(judge(['tests/acceptance/feat-x/a.test.mjs'], MERGE_MSG, archiveFiles(), { isMerge: true, ownFiles: [] }), []);
});

// ---- 规则 3：主会话角色只许改四类文件，标识须为登记的主会话标识 ----
test('规则3 正例：主会话只改 state.json、派卡.md、PLAN.md、状态快照，放行', () => {
  const files = [`${dirOf(CARD)}state.json`, `${dirOf(CARD)}派卡.md`, 'docs/PLAN.md', 'docs/状态快照.generated.md'];
  assert.deepEqual(judge(files, MAIN_MSG), []);
});

test('规则3 反例：主会话改了四类以外的文件（tools、server-plugin）即拒', () => {
  assert.ok(judge(['tools/x.mjs', `${dirOf(CARD)}state.json`], MAIN_MSG).length > 0);
  assert.ok(judge(['server-plugin/rules/x.mjs'], MAIN_MSG).length > 0);
});

test('规则3 反例：主会话标识不是登记的主会话标识即拒', () => {
  assert.ok(judge([`${dirOf(CARD)}state.json`], msg(`卡分支：${CARD}`, '角色：主会话', '标识：not-a-registered-id')).length > 0);
});

// ---- 规则 4：借档拒（推送范围须改到那张卡的档案）；head 分支须在 state.json.branches 里 ----
test('规则4 反例（借档）：推送范围里没改老卡的档案目录，只写码提交即拒', async () => {
  const dir = newRepo({ 'tools/x.mjs': 'export const x = 1;\n', ...prefixed(CARD, archiveFiles()) });
  const base = git(dir, ['rev-parse', 'HEAD']);
  const c2 = commitWith(dir, { 'tools/x.mjs': 'export const x = 2;\n' }, WRITE_MSG);
  const r = await pushOf(dir, base, c2);
  assert.equal(r.ok, false, `借档应拒；reasons=${JSON.stringify(r.reasons)}`);
});

test('规则4 正例（借档）：推送范围里同时改了那张卡的档案目录，写码提交放行', async () => {
  const dir = newRepo({ 'tools/x.mjs': 'export const x = 1;\n', ...prefixed(CARD, archiveFiles()) });
  const base = git(dir, ['rev-parse', 'HEAD']);
  const c2 = commitWith(dir, { 'tools/x.mjs': 'export const x = 2;\n', [`${dirOf(CARD)}审查.md`]: `${archiveFiles()['审查.md']}\n` }, WRITE_MSG);
  const r = await pushOf(dir, base, c2);
  assert.equal(r.ok, true, `应放行；reasons=${JSON.stringify(r.reasons)}`);
});

const MERGE_Y = msg('卡分支：feat/y', '角色：合并', `标识：${MAIN}`);
const runY = (arch) => judgeCommit(RULES, { files: ['tools/x.mjs'], branch: null, message: MERGE_Y, readFile: readArchive(arch, 'feat/y'), isMerge: true, ownFiles: [], repo: repoOf(arch, 'feat/y'), stage: '推送', rangeFiles: ['tools/x.mjs', `${dirOf('feat/y')}审查.md`] });

test('规则4 反例：head 分支不在 state.json.branches 里即拒', () => {
  const notListed = archiveFiles('feat/y', { 'state.json': stateOf('feat/y', { branches: { code: 'feat/x', test: 'test/x' } }) });
  assert.ok(runY(notListed).length > 0);
});

test('规则4 正例：head 分支在 state.json.branches 里则放行', () => {
  assert.deepEqual(runY(archiveFiles('feat/y')), []);
});

// ---- 规则 5：触发目录扩项 / PLAN.md 不触发 ----
const EXPANDED = ['tests/accept/x.test.mjs', '.github/workflows/ci.yml', 'package.json', 'docs/派活卡头规矩.md'];

test('规则5 反例：只改 tests/accept/x.test.mjs、ci.yml、package.json、派活卡头规矩.md，无档案即拒', () => {
  for (const f of EXPANDED) assert.ok(judge([f], WRITE_MSG, {}).length > 0, `${f} 无档案应拒`);
});

test('规则5 正例：同上几类文件，档案与角色行齐全即放行', () => {
  for (const f of EXPANDED) assert.deepEqual(judge([f], WRITE_MSG, archiveFiles()), [], `${f} 档案齐全应放行`);
});

test('规则5 正例：只改 docs/PLAN.md（不以主会话角色）不触发档案检查', () => {
  assert.deepEqual(judge(['docs/PLAN.md'], msg(`卡分支：${CARD}`), {}), []);
});

// ---- 规则 6：推送阶段 state.json 必须在，nextAction 不空不「无」，phase 在登记内 ----
test('规则6 反例：推送阶段档案目录缺 state.json 即拒', () => {
  assert.ok(check(archiveFiles(CARD, { 'state.json': null }), '推送').length > 0);
});

test('规则6 正例：推送阶段档案齐全（含 state.json）即放行', () => {
  assert.deepEqual(check(archiveFiles(), '推送'), []);
});

test('规则6 反例：nextAction 为空串或「无」即拒', () => {
  for (const v of ['', '无']) {
    assert.ok(check(archiveFiles(CARD, { 'state.json': stateOf(CARD, { nextAction: v }) }), '推送').length > 0, `nextAction=${JSON.stringify(v)}`);
  }
});

test('规则6 正例：nextAction 写了一句话即放行', () => {
  assert.deepEqual(check(archiveFiles(CARD, { 'state.json': stateOf(CARD, { nextAction: '等待审卡结果' }) }), '推送'), []);
});

test('规则6 反例：phase 不在规矩登记取值内即拒（bogus-phase）', () => {
  assert.ok(check(archiveFiles(CARD, { 'state.json': stateOf(CARD, { phase: 'bogus-phase' }) }), '推送').length > 0);
});

test('规则6 正例：phase 为规矩登记取值（dispatched）即放行', () => {
  assert.deepEqual(check(archiveFiles(CARD, { 'state.json': stateOf(CARD, { phase: 'dispatched' }) }), '推送'), []);
});

// ---- 规则 7：三方每个角色须有收据（文件存在、字段齐、model 与三方标识一致）或 orca 凭证 ----
test('规则7 反例：写码收据文件缺失即拒', () => {
  assert.ok(judge(['tools/x.mjs'], WRITE_MSG, archiveFiles(CARD, { '收据-写码.json': null })).length > 0);
});

test('规则7 反例：收据缺字段（promptSha256）即拒', () => {
  const noField = { ...RECEIPT('写码', 'claude-sonnet-5-5', 'claude-sonnet') };
  delete noField.promptSha256;
  assert.ok(judge(['tools/x.mjs'], WRITE_MSG, archiveFiles(CARD, { '收据-写码.json': JSON.stringify(noField) })).length > 0);
});

test('规则7 反例：收据模型与三方标识的模型族不一致即拒', () => {
  const wrongModel = JSON.stringify(RECEIPT('写码', 'claude-opus-5-5', 'claude-opus'));
  assert.ok(judge(['tools/x.mjs'], WRITE_MSG, archiveFiles(CARD, { '收据-写码.json': wrongModel })).length > 0);
});

test('规则7 正例：收据文件存在、字段齐、模型一致即放行', () => {
  assert.deepEqual(judge(['tools/x.mjs'], WRITE_MSG, archiveFiles()), []);
});

test('规则7 反例：orca 凭证 commits 为空（且无收据）即拒', () => {
  const party = { family: 'claude-sonnet', model: 'claude-sonnet-5-5', receipt: null, costUsd: null, orca: { worktree: 'F:/dnd-worktrees/dnd/ts-gsa', session: 'orca_session_id:x', commits: [] } };
  const arch = archiveFiles(CARD, { '收据-写码.json': null, 'state.json': stateOf(CARD, { parties: { ...baseState(CARD).parties, code: party } }) });
  assert.ok(judge(['tools/x.mjs'], WRITE_MSG, arch).length > 0);
});

// orca 凭证的 commits 须能从推送头到达（真 git 实跑，经 pre-push）：到达且角色行一致放行，不可达即拒。
const orcaParty = (commits) => ({ family: 'claude-sonnet', model: 'claude-sonnet-5-5', receipt: null, costUsd: null, orca: { worktree: 'F:/dnd-worktrees/dnd/ts-gsa', session: 'orca_session_id:gsa-test', commits } });
const WRITE_TRAILER = (text) => msg(text, '角色：写码', `标识：${WRITER}`);

test('规则7 正例（orca 可达性）：commits 从推送头可达且角色行是写码，推送放行', async () => {
  const dir = newRepo();
  const base = git(dir, ['rev-parse', 'HEAD']);
  const w = commitWith(dir, { 'docs/w.md': 'w\n' }, WRITE_TRAILER('写码提交'));
  commitWith(dir, prefixed(CARD, archiveFiles(CARD, { 'state.json': stateOf(CARD, { parties: { ...baseState(CARD).parties, code: orcaParty([w]) } }), '收据-写码.json': null })), 'archive');
  const c2 = commitWith(dir, { 'tools/x.mjs': 'export const x = 2;\n' }, WRITE_MSG);
  const r = await pushOf(dir, base, c2);
  assert.equal(r.ok, true, `应放行；reasons=${JSON.stringify(r.reasons)}`);
});

test('规则7 反例（orca 可达性）：commits 不能从推送头到达（侧分支未合入）即拒', async () => {
  const dir = newRepo();
  git(dir, ['checkout', '-q', '-b', 'side']);
  const u = commitWith(dir, { 'docs/u.md': 'u\n' }, WRITE_TRAILER('侧分支写码提交'));
  git(dir, ['checkout', '-q', 'master']);
  const base = git(dir, ['rev-parse', 'HEAD']);
  commitWith(dir, prefixed(CARD, archiveFiles(CARD, { 'state.json': stateOf(CARD, { parties: { ...baseState(CARD).parties, code: orcaParty([u]) } }), '收据-写码.json': null })), 'archive');
  const c2 = commitWith(dir, { 'tools/x.mjs': 'export const x = 2;\n' }, WRITE_MSG);
  const r = await pushOf(dir, base, c2);
  assert.equal(r.ok, false, `不可达应拒；reasons=${JSON.stringify(r.reasons)}`);
});

// ---- 规则 8：绕过记录的通知号：「已通知」拒；msg_ 开头十六进制号放行 ----
const BYPASS_MSG = msg(`卡分支：${CARD}`, '绕过门禁：李白裁定');
const bypassDev = (notice) => ['## 绕过记录', `- 谁：主会话 ${MAIN}；为什么：门禁误判卡住合入；通知号：${notice}`, ''].join('\n');

test('规则8 反例：绕过记录通知号写「已通知」即拒', () => {
  assert.ok(judge(['docs/readme.md'], BYPASS_MSG, archiveFiles(CARD, { '开发.md': bypassDev('已通知') })).length > 0);
});

test('规则8 正例：绕过记录通知号写 msg_ 开头十六进制号即放行', () => {
  assert.deepEqual(judge(['docs/readme.md'], BYPASS_MSG, archiveFiles(CARD, { '开发.md': bypassDev('msg_9f3a2c71be04') })), []);
});

// ---- 规则 9：派前自检 check-push-archive --stage 提交 --only 派卡.md ----
// 临时仓库：origin/master 为基线，卡分支上提交档案文件。
function cardBranchRepo(files) {
  const dir = newRepo();
  git(dir, ['checkout', '-q', '-b', CARD]);
  commitWith(dir, prefixed(CARD, files), WRITE_MSG);
  return dir;
}
const runSelfCheck = (dir) => spawnSync(process.execPath, [CLI, dir, CARD, '--stage', '提交', '--only', '派卡.md'], { encoding: 'utf8' });
// 规矩给的卷文行示例：第五节「证据示例 卷文行：<示例>」行（设计依据要卷文行，报错里应带它）。
const EXAMPLE_LINE = (DOC.split(/\r?\n/).find((x) => x.startsWith('- 证据示例 卷文行：')) || '').slice('- 证据示例 卷文行：'.length).trim();

test('规则9 反例：派卡.md 设计依据缺卷文行，自检退出码非 0', () => {
  const bad = archiveFiles(CARD)['派卡.md'].replace('- 卷十二:545 E-ACC-CARD-ARCHIVE 提交或推送时档案不合格的处置', '- 依据：门禁设计');
  const r = runSelfCheck(cardBranchRepo({ '派卡.md': bad, '开发.md': '不是档案的乱文\n' }));
  assert.notEqual(r.status, 0, `应非 0 退出；stdout=${r.stdout} stderr=${r.stderr}`);
});

test('规则9 反例（报错内容）：上面那次自检的报错带规矩给的示例文字，且不读开发.md', () => {
  const bad = archiveFiles(CARD)['派卡.md'].replace('- 卷十二:545 E-ACC-CARD-ARCHIVE 提交或推送时档案不合格的处置', '- 依据：门禁设计');
  const r = runSelfCheck(cardBranchRepo({ '派卡.md': bad, '开发.md': '不是档案的乱文\n' }));
  const out = `${r.stdout}${r.stderr}`;
  assert.ok(EXAMPLE_LINE, '规矩第五节应登记「证据示例 卷文行」');
  assert.ok(out.includes(EXAMPLE_LINE), '报错应带规矩给的示例文字');
  assert.ok(!out.includes('开发.md'), '派前自检不应读开发.md');
});

test('规则9 正例：合格派卡.md（开发.md 乱文不读）自检退出码 0', () => {
  const r = runSelfCheck(cardBranchRepo({ '派卡.md': archiveFiles(CARD)['派卡.md'], '开发.md': '不是档案的乱文\n' }));
  assert.equal(r.status, 0, `应 0 退出；stdout=${r.stdout} stderr=${r.stderr}`);
});
