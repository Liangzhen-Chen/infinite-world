// S2-H（最小持有）黑盒验收，第 1 条：玩家席位与化身认定。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2h。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-h/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('1a. 开局选来历后，化身恰有一条席位边（种类为 rules.control.seatKind，持有者与标的都是化身本人）', async () => {
  const { world } = await S.freshWorld();
  const before = S.snap(world);
  const r = await S.chooseOrigin(world, 0);
  assert.equal(S.isOk(r), true, `选来历应成功：${JSON.stringify(r)}`);
  const [avatar] = S.newPersons(world, before);
  assert.ok(avatar, '选来历应新建化身');

  const seats = S.seatEdgesOf(world);
  assert.equal(seats.length, 1, '选来历后全局应恰有一条现役席位边');
  assert.equal(seats[0].holder, avatar, '席位边的持有者应为化身');
  assert.equal(seats[0].subject, avatar, '席位边的标的应为化身本人');
  const stored = S.edgesOf(world.state).filter((e) => e.rec?.kind === S.SEAT_KIND);
  assert.equal(stored.length, 1, 'state.holdings 中席位种类的边应恰有一条（卷二:721 holdings.<持有者>.<边id>）');
  assert.equal(stored[0].holder, avatar, 'state 里的席位边挂在化身名下');
  // 缺省行动者即化身：菜单按化身投影，不报错。
  assert.doesNotThrow(() => world.menu(null), '缺省菜单应按化身投影');
  assert.equal(S.thrownCode(() => world.menu(avatar)), null, '以化身为 subject 的菜单可取');
});

test('1b. 另用来历模板建的 person 不受控：menu 报 E-DISPLAY-SUBJECT，以它为 actor 的动作被拒，席位边仍只有化身一条', async () => {
  const { world } = await S.freshWorld();
  const { avatar, other } = await S.setupTwo(world);
  assert.equal(S.seatEdgesOf(world, other).length, 0, '用来历模板建的 person 不应有席位边');
  assert.equal(S.seatEdgesOf(world).length, 1, '全局席位边仍恰一条');

  const code = S.thrownCode(() => world.menu(other));
  assert.ok(code && code.includes('E-DISPLAY-SUBJECT'), `menu(非受控 person) 应报 E-DISPLAY-SUBJECT，实得 ${code}`);
  assert.equal(S.thrownCode(() => world.menu(avatar)), null, 'menu(化身) 应照常可用（对照）');

  const before = S.snap(world);
  const r = await world.act({ act: 'act_wait', actor: other, numbers: { minutes: 5 } });
  S.assertRejected(world, before, r);
});

test('1c. 同一动作以化身为 actor 照常可行（对照，证明 1b 的拒绝来自受控判定而非动作本身不可行）', async () => {
  const { world } = await S.freshWorld();
  const { avatar } = await S.setupTwo(world);
  const r = await world.act({ act: 'act_wait', actor: avatar, numbers: { minutes: 5 } });
  assert.equal(S.isOk(r), true, `以化身为 actor 的 act_wait 应成功：${JSON.stringify(r)}`);
});
