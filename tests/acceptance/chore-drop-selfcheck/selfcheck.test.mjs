// 验收（chore/drop-selfcheck 出题）：删除九项文字自查表。设计依据 docs/gemini/kickoff-1125.md:478（亮圳 2026-11-25 20:01「自查表删掉」）。
// 静态部分核文件与规矩文本；行为部分在隔离副本里造探针卡档案，经 tools/accept/commit-hook.mjs --msg-file 核 commit-msg 门禁。
// 实现未到位时本文件应红（自查表文件仍在、规矩仍含自查表小节），属预期。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withIsolatedRepo } from '../../support/isolated-repo.mjs';
import { removeTempRoot, testTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const PAI_KA = `## 派卡人与模型
主会话派（Claude Opus 5.5，high），11-25。探针卡，只供门禁行为测试。

## 三方标识
- 角色：写码；模型：DeepSeek flash（deepseek-flash）；标识：zz-write-probe
- 角色：出题；模型：Claude Haiku 5.5（claude-haiku-5-5）；标识：zz-test-probe
- 角色：审卡；模型：Claude Sonnet 5.5（claude-sonnet-5-5）；标识：zz-review-probe

## 设计依据
- 卷一:1（探针依据，供门禁核引用）

## 依赖核查
- tools/accept/commit-hook.mjs:1 存在

## 拆分理由
探针卡，不派真实工作。
`;

const KAI_FA = `## 改动清单
- 位置：tools/zz-probe.mjs:1；做了什么：新增探针导出；依据：卷一:1；公共部件：无理由

## 交DeepSeek小卡
本探针卡不交 DeepSeek 小卡，改动由写码方一次完成。
`;

const REFLECTION_OK = `## 是否合理完成
是；tools/zz-probe.mjs:1 存在，探针仅供门禁行为测试。

## 偏离逐项
无偏离。核过的设计条目：卷一:1、卷一:2、卷一:3
`;

const REFLECTION_NO_DEVIATION = `## 是否合理完成
是；tools/zz-probe.mjs:1 存在，探针仅供门禁行为测试。
`;

const MSG = '探针提交说明\n卡分支：zz/probe\n角色：写码\n标识：zz-write-probe\n';

// 在隔离副本里放探针卡档案与一个 tools/ 新文件并暂存，再以副本为 cwd 跑 commit-msg 关口。
async function runProbe(reflection) {
  return withIsolatedRepo((copy) => {
    const dir = join(copy, 'docs/卡档案/zz-probe');
    mkdirSync(dir, { recursive: true });
    writeUnderTempRoot(dir, '派卡.md', PAI_KA);
    writeUnderTempRoot(dir, '开发.md', KAI_FA);
    writeUnderTempRoot(dir, '反思.md', reflection);
    writeUnderTempRoot(copy, 'tools/zz-probe.mjs', 'export const probe = 1;\n');
    execFileSync('git', ['add', '-A', '--', 'docs/卡档案/zz-probe', 'tools/zz-probe.mjs'], { cwd: copy, stdio: 'ignore' });
    const msgRoot = testTempRoot('drop-selfcheck-msg-');
    const msgFile = writeUnderTempRoot(msgRoot, 'msg.txt', MSG);
    try {
      const r = spawnSync(process.execPath, ['tools/accept/commit-hook.mjs', '--msg-file', msgFile], { cwd: copy, encoding: 'utf8' });
      return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
    } finally {
      removeTempRoot(msgRoot);
    }
  });
}

test('自查表门禁模块与其单测已删除', () => {
  assert.equal(existsSync(join(ROOT, 'tools/accept/lib/card-selfcheck.mjs')), false, 'tools/accept/lib/card-selfcheck.mjs 应已删除');
});

test('自查表单测文件已删除', () => {
  assert.equal(existsSync(join(ROOT, 'tests/accept/card-selfcheck.test.mjs')), false, 'tests/accept/card-selfcheck.test.mjs 应已删除');
});

test('派活卡头规矩不再含自查表相关的节名与键，但仍保留反思.md 两节', () => {
  const doc = readFileSync(join(ROOT, 'docs/派活卡头规矩.md'), 'utf8');
  for (const gone of ['交卷前自查', '开头自查表文件', '自查表证据种类', '自查表可填否项', '否项原因前缀']) {
    assert.ok(!doc.includes(gone), `规矩文件仍含「${gone}」`);
  }
  for (const kept of ['是否合理完成', '偏离逐项']) {
    assert.ok(doc.includes(kept), `规矩文件应保留「${kept}」`);
  }
});

test('探针卡反思.md 只有两节（无自查表）且带合格证据时，commit-msg 关口放行', async () => {
  const r = await runProbe(REFLECTION_OK);
  assert.equal(r.status, 0, `应退出 0，实际 ${r.status}：${r.out}`);
  assert.ok(r.out.includes('commit_msg pass'), `输出应含 commit_msg pass：${r.out}`);
  assert.ok(!r.out.includes('自查表'), `不应再因自查表被拒：${r.out}`);
});

test('探针卡反思.md 缺「偏离逐项」节时，commit-msg 关口拒绝', async () => {
  const r = await runProbe(REFLECTION_NO_DEVIATION);
  assert.equal(r.status, 1, `应退出 1，实际 ${r.status}：${r.out}`);
  assert.ok(r.out.includes('commit_msg rejected'), `输出应含 commit_msg rejected：${r.out}`);
  assert.ok(r.out.includes('偏离逐项'), `拒绝理由应指向「偏离逐项」：${r.out}`);
});
