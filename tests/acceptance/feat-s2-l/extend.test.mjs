// S2-L（最小账本）黑盒验收，第 9 条：扩展性（A6-1.3 :403）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2l。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-l/出题.md。
// 夹具只改数据：资源种类表加一行（克隆钱的行）、_vocab 资源族加一条、物品表加一行（资源须指向物品）、出身钱改指新资源。代码一行不改。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

const NEW_RES = 'res_zz_fixture_coin';
const NEW_ITEM = 'item_zz_fixture_coin';

function newKindFixture(transferable) {
  const fx = S.copyFixture();
  S.editJson(fx, 'world/ontology/dimensions/item.json', (d) => {
    d.rows[NEW_ITEM] = JSON.parse(JSON.stringify(d.rows[S.COIN_ITEM]));
  });
  S.editJson(fx, 'world/ontology/dimensions/_vocab.json', (v) => {
    v.families.resource.entries[NEW_RES] = { item: NEW_ITEM };
    S.pinAllOriginCoins(v, NEW_RES);
  });
  // 新资源种类须有限额通道窗口行（ledger.json budget，同钱资源的登记方式；加载期核对出身钱的窗口）。
  S.editJson(fx, 'world/rules/tables/economy/ledger.json', (d) => {
    d.rows.find((x) => x.key === 'budget').value[NEW_RES] = { src_genesis: { activeFromDay: 0, activeToDay: 0, limit: null } };
  });
  S.editJson(fx, 'world/rules/tables/economy/resources.json', (d) => {
    const row = JSON.parse(JSON.stringify(d.rows.find((x) => x.key === S.COIN_RES)));
    row.key = NEW_RES;
    row.value.transferable = transferable;
    row.basis = '测试夹具：克隆钱的行，仅为验证数据扩展';
    d.rows.push(row);
  });
  return fx;
}

test('9a. 夹具加一行资源种类（纯数据）：开局照常给出该种钱，且不改代码就能转移', async () => {
  const world = await S.bootFixture(newKindFixture('tr_free'));
  const { avatar, other, rowId } = await S.setupTwo(world);
  const money = S.originOf(rowId).startingMoney;
  assert.equal(S.balance(world.state, avatar, NEW_RES), money, '新资源种类的户应按出身入账');
  const qty = Math.min(5, money);
  const r = await world.submitProposal({ effects: [{
    op: 'transfer',
    from: S.acctKey(world.state, avatar, NEW_RES),
    to: S.acctKey(world.state, other, NEW_RES),
    qty,
  }] });
  assert.equal(S.isOk(r), true, `新资源种类的转移应成功：${JSON.stringify(r)}`);
  assert.equal(S.balance(world.state, other, NEW_RES), money + qty, '收方应收到 qty');
  S.assertConserved(world.state, NEW_RES);
});

test('9b. 夹具把新资源种类标为 tr_bound：同样的数据扩展下，转给别人照样被拒（受限转让由数据生效）', async () => {
  const world = await S.bootFixture(newKindFixture('tr_bound'));
  const { avatar, other } = await S.setupTwo(world);
  const before = S.snap(world);
  const r = await world.submitProposal({ effects: [{
    op: 'transfer',
    from: S.acctKey(world.state, avatar, NEW_RES),
    to: S.acctKey(world.state, other, NEW_RES),
    qty: 1,
  }] });
  S.assertRejected(world, before, r, 'E-LEDGER-TRANSFER-RESTRICTED');
});
