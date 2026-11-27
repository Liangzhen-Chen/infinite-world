// S2-L（最小账本）黑盒验收，第 5 条：第 0 日窗口（卷六 :377 规则 6；budget 生效日窗口 [0,0]）。
// 出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2l。依据与每条测的是什么见 docs/卡档案/feat-s2-l/出题.md。
// 同一来历模板：第 0 日建人并给钱成功（对照）；推进到第 1 日后再建，src_genesis 的那一笔被拒，整笔回滚，不建人、不入账。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('5. 第 0 日窗口：第 0 日以来历模板建 person 并入账；推进到第 1 日后同样的建人被拒，整笔回滚，state 逐位不变', async () => {
  const { world } = await S.freshWorld();
  const rowId = S.offered(world)[0];
  const species = S.SAPIENT_SPECIES;
  const { startingMoney: money, startingCoin: coin } = S.originOf(rowId);

  // 对照：第 0 日建人成功，且 endow 给了钱。
  const b0 = S.snap(world);
  const c0 = await S.createPerson(world, rowId, species);
  assert.equal(S.isOk(c0), true, `第 0 日以来历模板建 person 应成功：${JSON.stringify(c0)}`);
  const [p0] = S.newPersons(world, b0);
  assert.ok(p0, '第 0 日建人应新增一个 person');
  assert.equal(S.balance(world.state, p0, coin), money, '第 0 日建的人应按出身入账 startingMoney');

  // 推进到第 1 日（推进本身不在本条断言范围内，只要求时钟过了一日）。
  const adv = await world.advance(S.DAY_MIN);
  assert.equal(S.isOk(adv), true, `推进一日应成功：${JSON.stringify(adv)}`);
  assert.ok(world.state.clock.minute >= S.DAY_MIN, '推进后时钟应至少过了一日');

  // 第 1 日起，同一模板建人：src_genesis 的入账腿被拒，整笔回滚。
  const before = S.snap(world);
  const c1 = await S.createPerson(world, rowId, species);
  S.assertRejected(world, before, c1);
  assert.equal(S.newPersons(world, before).length, 0, '被拒的建人不应留下任何 person');
});
