// S1-3b 界面命令黑盒验收（卷二十九:319 界面命令纯读、不提交事务、不记日志；R29-3.14 subject 只收观察者可见集；卷二:1033 无关）。draft-s1-3 §6 第 10 条。
// 出题方：Claude Haiku 5.5（haiku-orca-test-s13b）。
// 「不进 logBook」用「saveDigest 不变」间接验（存档随 state 与日志变化）。
// 「存在但不可见的 id」从世界数据里取：找带 tissues 与 bodyPlan 两维度的物种表（同 feat-s1-2b 的识别口径），取其第一行 id。
// 不写死表名、id。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHost, view, saveAt, exportAt, unpack } from '../../support/wire-host.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

const WORLD = fileURLToPath(new URL('../../../world/', import.meta.url));
const DIM_DIR = join(WORLD, 'ontology', 'dimensions');

// 物种表：维度里同时有 tissues 与 bodyPlan。取第一行 id（rows 为按 id 键索引的对象）。
function someExistingNonVisibleId() {
  const docs = readdirSync(DIM_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => JSON.parse(readFileSync(join(DIM_DIR, f), 'utf8')));
  const species = docs.find((d) => d.dimensions && 'tissues' in d.dimensions && 'bodyPlan' in d.dimensions);
  assert.ok(species, '维度表中应有物种表（含 tissues 与 bodyPlan）');
  const ids = Object.keys(species.rows);
  assert.ok(ids.length > 0, '物种表应有行');
  return ids[0];
}

const MISSING_ID = 'no-such-entity-s13b';

test('界面命令 view 纯读：多次 view 后 saveDigest 与时钟不变（不进 logBook、不改 state）', async (t) => {
  const root = testTempRoot('s13b-view-pure-');
  const h = await startHost({ saveRoot: root });
  t.after(async () => { await h.close(); removeTempRoot(root); });
  await saveAt(h.base, 0);
  const before = unpack((await exportAt(h.base, 0)).buf).manifest.saveDigest;
  for (let i = 0; i < 3; i += 1) {
    const v = await view(h.base);
    assert.equal(v.json?.result, 'ok', `view 第 ${i + 1} 次应 ok：${v.text}`);
  }
  await saveAt(h.base, 1);
  const after = unpack((await exportAt(h.base, 1)).buf).manifest.saveDigest;
  assert.equal(after, before, 'view 之后 saveDigest 应不变（界面命令不进日志、不改状态）');
});

test('subject 不在可见集：存在与不存在的 id 都报 E-DISPLAY-SUBJECT，且两次回应同形', async (t) => {
  const root = testTempRoot('s13b-view-subject-');
  const h = await startHost({ saveRoot: root });
  t.after(async () => { await h.close(); removeTempRoot(root); });
  const existing = someExistingNonVisibleId();

  const missing = await view(h.base, MISSING_ID);
  assert.match(missing.text, /E-DISPLAY-SUBJECT/, '不存在的 subject 应报 E-DISPLAY-SUBJECT');

  const hidden = await view(h.base, existing);
  assert.match(hidden.text, /E-DISPLAY-SUBJECT/, '存在但不可见的 subject 应报 E-DISPLAY-SUBJECT');

  const norm = (text, id) => text.split(id).join('<SUBJECT>');
  assert.equal(
    norm(hidden.text, existing),
    norm(missing.text, MISSING_ID),
    '存在与不存在两种 subject 的回应除 id 外应同形（不泄露存在性）',
  );
});
