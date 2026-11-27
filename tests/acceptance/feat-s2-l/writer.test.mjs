// S2-L（最小账本）黑盒验收，第 8 条：R0 原语写者登记。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2l。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-l/出题.md。
// 原语目录里有、但无处理函数的原语照旧拒（E-EFF-PRIMITIVE）；同一 op 登两个写者加载期即拒（E-DIM-DUPLICATE-KEY）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('8a. 未登记写者的原语照旧拒：holding.open 在原语目录里、无处理函数，提案整笔拒 E-EFF-PRIMITIVE，state 逐位不变', async () => {
  assert.ok(S.PRIMITIVES.some((p) => p.op === 'holding.open'), '前提：holding.open 在原语目录里');
  const { world } = await S.freshWorld();
  const { avatar } = await S.setupTwo(world);
  const before = S.snap(world);
  const r = await world.submitProposal({ effects: [{ op: 'holding.open', holdingKind: 'hk_resides', holder: avatar, subject: avatar }] });
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
