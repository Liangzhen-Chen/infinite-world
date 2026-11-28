// S2-TP1 黑盒验收：开局落脚处必须属于所选出生地（同一掌管组织，统治归属判定，不看包含树；卷八:1708 勘误 1123k32、卷十:499）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-tp1。
// 期望的归属全部由数据推算（support.mjs#ownerOfPlace）。不属于的组合须报 E-ACT-SLOT，且 state 逐位不变。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('9a. 同归属的出生地与落脚处可以开局：取落脚处的归属组织，在出生地候选里能找到同归属的一项，按它开局成功', async () => {
  const { world } = await S.freshWorld();
  const offer = S.lodgeOffer(world);
  const lodge = offer[0];
  const placeIdx = S.placeIndexFor(world, lodge);
  const r = await S.chooseLodge(world, 0, placeIdx);
  assert.equal(S.isOk(r), true, `同归属配对应成功：${JSON.stringify(r)}`);
});

test('9b. 异归属拒收：落脚处与出生地归属不同，报 E-ACT-SLOT，state 逐位不变（卷八:1708 勘误：归属由辖区定，不看包含树）', async () => {
  const { world } = await S.freshWorld();
  const offer = S.lodgeOffer(world);
  const places = S.placeOffer(world);
  let pair = null;
  for (let li = 0; li < offer.length && !pair; li += 1) {
    const pi = places.findIndex((p) => typeof p === 'string' && !S.sameGovernorAs(p, offer[li]));
    if (pi >= 0) pair = { li, pi };
  }
  assert.ok(pair, '前提：应有一对异归属的落脚处与出生地');
  const before = S.canon(world.state);
  const r = await S.chooseLodge(world, pair.li, pair.pi);
  assert.equal(S.isOk(r), false, `异归属配对应被拒：${JSON.stringify(r)}`);
  assert.ok(S.codeOf(r).includes('E-ACT-SLOT'), `拒收码应为 E-ACT-SLOT，实得 ${S.codeOf(r)}`);
  assert.equal(S.canon(world.state), before, '拒收时 state 逐位不变');
});
