// 验收：chore/gate-fill（门禁补齐）
// 出题方：Claude Haiku 5.5（API），照 docs/gemini/kickoff-1125.md:477（L-06 ⑤⑥）、:490（L-14）与 docs/gemini/daily/2026-11-25-audit.md:116–:120 单独写。
// 写码方的实现不在本分支可见；本文件只按卡文约定的导出名与形状调用，不 mock，不依赖仓库当前数字。
// 纯函数用内存数据调用；真实数据只读仓库文件。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');

// 导出名缺失时各用例单独报红，而不是整个文件加载失败。
const D = await import(new URL('tools/dispatch/dispatch.mjs', ROOT).href);
const need = (name) => {
  assert.equal(typeof D[name], 'function', `tools/dispatch/dispatch.mjs 未导出函数 ${name}`);
  return D[name];
};

// 造一份派卡.md 的「三方标识」小节（格式同 docs/卡档案/chore-gate-fill/派卡.md）。
// parties：{ 写码: [{ model, id }], 出题: [...], 审卡: [...] }，审卡可多条。
function archiveText(parties) {
  const lines = ['# 派卡', '', '## 三方标识'];
  for (const role of ['写码', '出题', '审卡']) {
    for (const p of parties[role] || []) {
      lines.push(`- 角色：${role}；模型：${p.model}；标识：${p.id}`);
    }
  }
  return lines.join('\n') + '\n';
}

const WRITE_DS = { model: 'DeepSeek flash（deepseek-flash，V4.1 Flash）', id: 'ds-write-gate' };
const TEST_HAIKU = { model: 'Claude Haiku 5.5（claude -p，API，claude-haiku-5-5）', id: 'haiku-api-test-gate' };
const REVIEW_OPUS = { model: 'Claude Opus 5.5（claude -p，API，claude-opus-5-5）', id: 'opus-api-review-gate' };
const REVIEW_SONNET = { model: 'Claude Sonnet 5.5（claude -p，API，claude-sonnet-5-5）', id: 'sonnet-api-review-gate' };

// 注册表：entries 每条 { name, file, needs }；needs 为条目名数组（假设：卡文「沿条目的 needs 字段做传递闭包」，键即 name）。
const reg = (entries) => ({ version: 1, entries });

// 行键口径：卷二:764「行键是 `file#name`」；file 为 null 或空串时行键为 `#<name>`。
test('checkNeeds：闭包内有 file 为 null 的条目，返回含该键', () => {
  const checkNeeds = need('checkNeeds');
  const r = reg([{ name: 'A', file: 'kernel/a.mjs', needs: [] }, { name: 'X', file: null, needs: [] }]);
  const bad = checkNeeds(r, ['#X']);
  assert.ok(Array.isArray(bad));
  assert.ok(bad.includes('#X'), `应报 #X，实际 ${JSON.stringify(bad)}`);
});

test('checkNeeds：file 为空字符串同样算悬空', () => {
  const checkNeeds = need('checkNeeds');
  const r = reg([{ name: 'E', file: '', needs: [] }]);
  assert.ok(checkNeeds(r, ['#E']).includes('#E'));
});

test('checkNeeds：键不存在，返回含该键', () => {
  const checkNeeds = need('checkNeeds');
  const r = reg([{ name: 'A', file: 'kernel/a.mjs', needs: [] }]);
  const bad = checkNeeds(r, ['NoSuchEntry']);
  assert.ok(bad.includes('NoSuchEntry'), `应报 NoSuchEntry，实际 ${JSON.stringify(bad)}`);
});

test('checkNeeds：全部接通时返回空数组', () => {
  const checkNeeds = need('checkNeeds');
  const r = reg([
    { name: 'A', file: 'kernel/a.mjs', needs: ['B'] },
    { name: 'B', file: 'kernel/b.mjs', needs: [] },
  ]);
  assert.deepEqual(checkNeeds(r, ['A']), []);
});

test('checkNeeds：传递闭包——A needs B，B 的 file 为 null，报 #B', () => {
  const checkNeeds = need('checkNeeds');
  const r = reg([
    { name: 'A', file: 'kernel/a.mjs', needs: ['#B'] },
    { name: 'B', file: null, needs: [] },
  ]);
  const bad = checkNeeds(r, ['kernel/a.mjs#A']);
  assert.ok(bad.includes('#B'), `传递闭包应报 #B，实际 ${JSON.stringify(bad)}`);
});

test('checkNeeds：传递闭包——A→B→C，C 不存在，报 C', () => {
  const checkNeeds = need('checkNeeds');
  const r = reg([
    { name: 'A', file: 'kernel/a.mjs', needs: ['B'] },
    { name: 'B', file: 'kernel/b.mjs', needs: ['C'] },
  ]);
  assert.ok(checkNeeds(r, ['A']).includes('C'));
});

test('checkRoleModel：写码与出题同族（都是 deepseek）→ 有违规', () => {
  const checkRoleModel = need('checkRoleModel');
  const text = archiveText({
    写码: [{ model: 'DeepSeek flash（deepseek-flash）', id: 'ds-write-x' }],
    出题: [{ model: 'DeepSeek flash（deepseek-flash）', id: 'ds-test-y' }],
    审卡: [REVIEW_OPUS],
  });
  const reasons = checkRoleModel(text, '出题', 'deepseek-flash');
  assert.ok(Array.isArray(reasons) && reasons.length > 0, '写码与出题同族必须报违规');
});

test('checkRoleModel：审卡族与写码同族（审卡也是 deepseek）→ 有违规', () => {
  const checkRoleModel = need('checkRoleModel');
  const text = archiveText({
    写码: [WRITE_DS],
    出题: [TEST_HAIKU],
    审卡: [{ model: 'DeepSeek flash（deepseek-flash）', id: 'ds-review-z' }],
  });
  const reasons = checkRoleModel(text, '审卡', 'deepseek-flash');
  assert.ok(Array.isArray(reasons) && reasons.length > 0, '审卡与写码同族必须报违规');
});

test('checkRoleModel：审卡族与出题同族（审卡是 haiku）→ 有违规', () => {
  const checkRoleModel = need('checkRoleModel');
  const text = archiveText({
    写码: [WRITE_DS],
    出题: [TEST_HAIKU],
    审卡: [{ model: 'Claude Haiku 5.5（claude-haiku-5-5）', id: 'haiku-review-z' }],
  });
  const reasons = checkRoleModel(text, '审卡', 'claude-haiku-5-5');
  assert.ok(Array.isArray(reasons) && reasons.length > 0, '审卡与出题同族必须报违规');
});

test('checkRoleModel：三族互异且 --model 与该角色登记族一致 → 空数组', () => {
  const checkRoleModel = need('checkRoleModel');
  const text = archiveText({
    写码: [WRITE_DS],
    出题: [TEST_HAIKU],
    审卡: [REVIEW_OPUS],
  });
  assert.deepEqual(checkRoleModel(text, '写码', 'deepseek-flash'), []);
  assert.deepEqual(checkRoleModel(text, '出题', 'claude-haiku-5-5'), []);
  assert.deepEqual(checkRoleModel(text, '审卡', 'claude-opus-5-5'), []);
});

test('checkRoleModel：三族互异但 --model 族与该角色登记族不符 → 有违规', () => {
  const checkRoleModel = need('checkRoleModel');
  const text = archiveText({
    写码: [WRITE_DS],
    出题: [TEST_HAIKU],
    审卡: [REVIEW_OPUS],
  });
  // 出题登记的是 haiku，却用 opus 去派。
  const reasons = checkRoleModel(text, '出题', 'claude-opus-5-5');
  assert.ok(Array.isArray(reasons) && reasons.length > 0, '--model 族与登记族不符必须报违规');
  // 写码登记 deepseek，却用 sonnet 去派。
  assert.ok(checkRoleModel(text, '写码', 'claude-sonnet-5-5').length > 0);
});

test('checkRoleModel：审卡多轮可同族，且每轮各与写码、出题族互异 → 空数组', () => {
  const checkRoleModel = need('checkRoleModel');
  const text = archiveText({
    写码: [WRITE_DS],
    出题: [TEST_HAIKU],
    审卡: [REVIEW_OPUS, { model: 'Claude Opus 5.5（claude-opus-5-5，第二轮）', id: 'opus-api-review-gate-2' }],
  });
  assert.deepEqual(checkRoleModel(text, '审卡', 'claude-opus-5-5'), []);
});

test('buildReceipt：字段齐全 → 返回对象含全部必填字段', () => {
  const buildReceipt = need('buildReceipt');
  const fields = {
    role: '写码',
    model: 'deepseek-flash',
    family: 'deepseek',
    endpoint: 'deepseek',
    startedAt: '2026-11-25T10:00:00.000Z',
    endedAt: '2026-11-25T10:05:00.000Z',
    exitCode: 0,
    totalCostUsd: 0.0123,
    promptSha256: 'a'.repeat(64),
    headBefore: 'b'.repeat(40),
    headAfter: 'c'.repeat(40),
  };
  const r = buildReceipt(fields);
  assert.equal(typeof r, 'object');
  for (const k of Object.keys(fields)) {
    assert.ok(k in r, `收据缺字段 ${k}`);
    assert.deepEqual(r[k], fields[k], `收据字段 ${k} 值不对`);
  }
});

test('buildReceipt：total_cost_usd 取不到时写 null，不抛错', () => {
  const buildReceipt = need('buildReceipt');
  const r = buildReceipt({
    role: '出题',
    model: 'claude-haiku-5-5',
    family: 'claude-haiku',
    endpoint: 'anthropic',
    startedAt: '2026-11-25T10:00:00.000Z',
    endedAt: '2026-11-25T10:01:00.000Z',
    exitCode: 0,
    totalCostUsd: null,
    promptSha256: 'd'.repeat(64),
    headBefore: 'e'.repeat(40),
    headAfter: 'f'.repeat(40),
  });
  assert.equal(r.totalCostUsd, null);
});

test('buildReceipt：缺任一必填字段即抛错', () => {
  const buildReceipt = need('buildReceipt');
  const full = () => ({
    role: '审卡',
    model: 'claude-opus-5-5',
    family: 'claude-opus',
    endpoint: 'anthropic',
    startedAt: '2026-11-25T10:00:00.000Z',
    endedAt: '2026-11-25T10:02:00.000Z',
    exitCode: 0,
    totalCostUsd: 0.2,
    promptSha256: '1'.repeat(64),
    headBefore: '2'.repeat(40),
    headAfter: '3'.repeat(40),
  });
  const required = ['role', 'model', 'family', 'endpoint', 'startedAt', 'endedAt', 'exitCode', 'promptSha256', 'headBefore', 'headAfter'];
  for (const k of required) {
    const f = full();
    delete f[k];
    assert.throws(() => buildReceipt(f), Error, `缺 ${k} 应抛错`);
  }
});

test('真实数据：dispatch-config.json 的 clearDeepseek 含 CLAUDE_CODE_OAUTH_TOKEN', () => {
  const cfg = JSON.parse(read('tools/dispatch/dispatch-config.json'));
  assert.ok(Array.isArray(cfg.clearDeepseek));
  assert.ok(cfg.clearDeepseek.includes('CLAUDE_CODE_OAUTH_TOKEN'));
});

test('真实数据：派活卡头规矩第五节「合并提交免查」为「否」', () => {
  const doc = read('tools/accept/card-rules.md');
  const sec = doc.slice(doc.indexOf('## 五、'));
  assert.ok(/^- 合并提交免查：否\s*$/m.test(sec), '第五节应有「- 合并提交免查：否」');
  assert.ok(!/^- 合并提交免查：是\s*$/m.test(sec), '第五节不应再有「合并提交免查：是」');
});

test('真实数据：派活卡头规矩第五节含交接文件必填键，列出九个键', () => {
  const doc = read('tools/accept/card-rules.md');
  const sec = doc.slice(doc.indexOf('## 五、'));
  const line = sec.split('\n').find((l) => l.includes('交接文件必填键：'));
  assert.ok(line, '第五节应有「交接文件必填键：」行');
  for (const k of ['card', 'phase', 'updatedAt', 'branches', 'parties', 'ci', 'failCount', 'blocker', 'nextAction']) {
    assert.ok(line.includes(k), `「交接文件必填键」行缺 ${k}`);
  }
});

test('真实数据：派活卡头规矩不再含「门禁暂只核标识互异」', () => {
  assert.ok(!read('tools/accept/card-rules.md').includes('门禁暂只核标识互异'));
});

test('真实数据：ci.yml 主 job 在 test:all 之前有一步调用 pre-push.mjs 或 check-push-archive.mjs', () => {
  const yml = read('.github/workflows/ci.yml');
  const mainStart = yml.indexOf('\n  main:');
  assert.ok(mainStart >= 0, 'ci.yml 应有 main job');
  const rest = yml.slice(mainStart);
  const end = rest.indexOf('\n  e2e-observe:');
  const mainJob = end >= 0 ? rest.slice(0, end) : rest;
  const archiveAt = Math.min(
    ...['tools/accept/pre-push.mjs', 'tools/accept/check-push-archive.mjs']
      .map((s) => mainJob.indexOf(s))
      .filter((i) => i >= 0),
  );
  const testAllAt = mainJob.indexOf('test:all');
  assert.ok(Number.isFinite(archiveAt), '主 job 应调用 pre-push.mjs 或 check-push-archive.mjs');
  assert.ok(testAllAt >= 0, '主 job 应有 test:all');
  assert.ok(archiveAt < testAllAt, '档案步骤必须在 test:all 之前');
});
