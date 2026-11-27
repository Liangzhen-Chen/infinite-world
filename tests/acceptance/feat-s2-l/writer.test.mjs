// S2-L（最小账本）黑盒验收，第 8 条：R0 原语写者登记。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2l。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-l/出题.md。
// 原语目录里有、但无处理函数的原语照旧拒（E-EFF-PRIMITIVE）；同一 op 登两个写者加载期即拒（E-DIM-DUPLICATE-KEY）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

// Q5 甲（S2-H 合入后 holding.* 已有写者）：8a 改用「目录里有行、但 owners 里没有任何 primitiveWriter 声明」的原语。
// 写者声明从 world/ontology/state-owners*.json 的 primitiveWriter.ops 递归收集，不写死 op 名。
const { readdirSync } = await import('node:fs');
const { join: pjoin } = await import('node:path');
function declaredWriterOps() {
  const ops = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      if (v.primitiveWriter && Array.isArray(v.primitiveWriter.ops)) for (const o of v.primitiveWriter.ops) ops.add(o);
      Object.values(v).forEach(walk);
    }
  };
  const dir = pjoin(S.ROOT, 'world/ontology');
  for (const f of ['state-owners.json', ...readdirSync(pjoin(dir, 'state-owners.d')).map((n) => `state-owners.d/${n}`)]) walk(S.loadJson(pjoin(dir, f)));
  return ops;
}
test('8a. 未登记写者的原语照旧拒：目录里有、但无处理函数的原语，提案整笔拒 E-EFF-PRIMITIVE，state 逐位不变', async () => {
  const written = declaredWriterOps();
  // 只取必填键全为 id 型的原语（参数可直接用化身构造，不必凑数值或种类）。
  const cand = S.PRIMITIVES.find((p) => !written.has(p.op) && Object.values(p.required ?? {}).every((t) => t === 'id'));
  assert.ok(cand, '前提：目录里应有无写者声明、且必填键全为 id 的原语（如 obligation.cancel）');
  const op = cand.op;
  const { world } = await S.freshWorld();
  const { avatar } = await S.setupTwo(world);
  const before = S.snap(world);
  // 参数按目录行的 required 取（同 op 的必填键），值用一个合法的持有种类与化身。
  const params = Object.fromEntries(Object.keys(cand.required).map((k) => [k, avatar]));
  const r = await world.submitProposal({ effects: [{ op, ...params }] });
  S.assertRejected(world, before, r, 'E-EFF-PRIMITIVE');
});

test('8b. 同一 op 登两个写者：加载期拒 E-DIM-DUPLICATE-KEY；未改的副本照常加载（对照）', async () => {
  const control = S.copyFixture();
  assert.ok(await S.bootFixture(control), '对照副本应能加载');

  const fx = S.copyFixture();
  S.editJson(fx, 'world/ontology/state-owners.d/economy.json', (doc) => {
    // 复制一份已登记的原语写者系统条目，换个系统名：同一 op 由两处登记。
    const src = Object.values(doc.systems).find((s) => s && s.primitiveWriter);
    assert.ok(src, '前提：经济域分片里应登记了原语写者（systems.*.primitiveWriter）');
    doc.systems.zzDupWriter = JSON.parse(JSON.stringify(src));
  });
  await assert.rejects(S.bootFixture(fx), /E-DIM-DUPLICATE-KEY/, '同一 op 登两个写者应在加载期报 E-DIM-DUPLICATE-KEY');
});
