// S2-L（最小账本）黑盒验收，第 3、4、6 条：transfer 守恒；拒绝时 state 逐位不变；持有人限定。
// 出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2l。依据与每条测的是什么见 docs/卡档案/feat-s2-l/出题.md。
// 转移只经 world.submitProposal 的 transfer 原语（卷九:629）。前提全部由真实动作造：选来历、第 0 日以来历模板建第二个 person。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

const transfer = (world, from, to, qty) => world.submitProposal({ effects: [{ op: 'transfer', from, to, qty }] });

test('3. 转移守恒：化身 → 同币种对方户，两边一减一增，来源去处累计不变，守恒式成立，事件事由为 verb_transfer', async () => {
  const { world } = await S.freshWorld();
  const { avatar, other, rowId } = await S.setupTwo(world);
  const { startingCoin: coin, startingMoney: money } = S.originOf(rowId);
  assert.ok(money >= 1, '前提：起始钱至少 1');
  const qty = Math.min(5, money);
  const totalsBefore = S.stateJson(S.totalsOf(world.state, coin));
  const from = S.acctKey(world.state, avatar, coin);
  const to = S.acctKey(world.state, other, coin);

  const r = await transfer(world, from, to, qty);
  assert.equal(S.isOk(r), true, `转移 ${qty} 应成功：${JSON.stringify(r)}`);
  assert.equal(S.balance(world.state, avatar, coin), money - qty, '转出方余额应减少 qty');
  assert.equal(S.balance(world.state, other, coin), money + qty, '转入方余额应增加 qty');
  assert.equal(S.stateJson(S.totalsOf(world.state, coin)), totalsBefore, '转移不改来源与去处累计');
  S.assertConserved(world.state, coin);

  // 同一 seq 下先有一条无 verb 的成功推进事件；带事由的是 txEmit 发出的 post 事件（随提交记入日志簿）。
  const ev = world.logBook.entries.find((e) => e.kind === 'event' && e.ok === true && e.seq === r.seq && e.verb !== undefined);
  assert.ok(ev, '转移成功后，同一 seq 下应有一条带事由的成功事件');
  assert.equal(ev.verb, 'verb_transfer', '转移的事由应为 verb_transfer（Q6 乙）');
});

test('4. 拒绝且逐位不变：超额转出报 E-LEDGER-NEGATIVE；收方账户不存在整笔拒；tr_bound 资源转给别人报 E-LEDGER-TRANSFER-RESTRICTED', async () => {
  // 4a 超额、4b 账户不存在：用数据原样的世界。
  {
    const { world } = await S.freshWorld();
    const { avatar, other, rowId } = await S.setupTwo(world);
    const { startingCoin: coin, startingMoney: money } = S.originOf(rowId);
    const from = S.acctKey(world.state, avatar, coin);
    const to = S.acctKey(world.state, other, coin);

    const before = S.snap(world);
    const over = await transfer(world, from, to, money + 1);
    S.assertRejected(world, before, over, 'E-LEDGER-NEGATIVE');

    const before2 = S.snap(world);
    const missing = await transfer(world, from, to.replace(other, 'person_zz_missing'), 1);
    S.assertRejected(world, before2, missing);
  }

  // 4c 受限转让：夹具把钱资源改为 tr_bound（卷六 :381），出身与其余数据不变。
  {
    const fx = S.copyFixture();
    S.editJson(fx, 'world/ontology/dimensions/_vocab.json', (v) => S.pinAllOriginCoins(v, S.COIN_RES));
    S.editJson(fx, 'world/rules/tables/economy/resources.json', (d) => {
      d.rows.find((x) => x.key === S.COIN_RES).value.transferable = 'tr_bound';
    });
    const world = await S.bootFixture(fx);
    const { avatar, other } = await S.setupTwo(world);
    const coin = S.COIN_RES;
    const before = S.snap(world);
    const r = await transfer(world, S.acctKey(world.state, avatar, coin), S.acctKey(world.state, other, coin), 1);
    S.assertRejected(world, before, r, 'E-LEDGER-TRANSFER-RESTRICTED');
  }
});

test('6. 持有人限定（能拿到的部分）：转入未开户的物品、地点账户整笔拒，state 逐位不变；开户码 E-LEDGER-HOLDER-NOT-SUBJECT 与 E-ACT-WRITER-NOT-READY 仅内部开户可达，本条不断言', async () => {
  const { world } = await S.freshWorld();
  const { avatar, rowId } = await S.setupTwo(world);
  const coin = S.originOf(rowId).startingCoin;
  const from = S.acctKey(world.state, avatar, coin);
  const itemId = Object.keys(S.ITEM_ROWS)[0];
  const placeId = Object.keys(S.PLACE_ROWS)[0];
  for (const holder of [itemId, placeId]) {
    const before = S.snap(world);
    const r = await transfer(world, from, from.replace(avatar, holder), 1);
    S.assertRejected(world, before, r);
  }
});
