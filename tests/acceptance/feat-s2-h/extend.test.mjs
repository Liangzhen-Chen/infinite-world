// S2-H（最小持有）黑盒验收，第 8 条：扩展性（只加数据，不改代码，就多出一条穿戴边）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2h。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-h/出题.md。
// 夹具只改数据：物品表加一行（克隆一件现有可穿戴物的行）、_vocab 资源族加一条指向它、资源种类表加一行、限额窗口加一行、
// 某个来历的起始物表加一件。代码一行不改；比对的是「同一来历在基线夹具里」的穿戴边数，不抄仓库基线读数。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

const NEW_ITEM = 'item_zz_s2h_fixture_wearable';
const NEW_RES = 'res_zz_s2h_fixture_wearable';
const WEARABLE = Object.keys(S.ITEM_ROWS).find((k) => S.isWearableItem(k));

// 本局化身名下挂在身上的物件数（穿戴边：holder 为化身、标的为可穿戴物实例）。
// 穿戴物判定：基线数据里的可穿戴物，加上本夹具新加的那一件（夹具物不在基线 item 表里，S.isWearableItem 认不出）。
const isWorn = (template) => S.isWearableItem(template) || template === NEW_ITEM;
function wornBy(world, avatar) {
  return S.liveEdges(world).filter((e) => e.holder === avatar
    && world.state.created[e.subject] && isWorn(world.state.created[e.subject].template)).length;
}

test('8. 扩展性：夹具只加数据（物品、资源种类、限额窗口、起始物各一行），同一来历多出一条穿戴边，代码不改', async () => {
  assert.ok(WEARABLE, '前提：数据中应有一件可穿戴物（数据推出）');
  const probe = (await S.freshWorld()).world;
  const rowId = S.rowWithWearable(probe);
  const originId = S.originIdOf(rowId);

  // 基线：同一来历、未改数据。
  const base = (await S.freshWorld()).world;
  const bb = S.snap(base);
  assert.equal(S.isOk(await S.chooseRow(base, rowId)), true, '基线选来历应成功');
  const [baseAvatar] = S.newPersons(base, bb);
  const baseCount = wornBy(base, baseAvatar);

  // 夹具：加一件可穿戴物（克隆 WEARABLE 的物品行与资源行），挂到同一来历的起始物里。
  const fx = S.copyFixture();
  const wearableRes = S.resOfItem(WEARABLE);
  S.editJson(fx, 'world/ontology/dimensions/item.json', (d) => {
    d.rows[NEW_ITEM] = JSON.parse(JSON.stringify(d.rows[WEARABLE]));
  });
  S.editJson(fx, 'world/ontology/dimensions/_vocab.json', (v) => {
    v.families.resource.entries[NEW_RES] = { item: NEW_ITEM };
    v.families.origin.entries[originId].startingItems.push({ item: NEW_ITEM, n: 1 });
  });
  S.editJson(fx, 'world/rules/tables/economy/resources.json', (d) => {
    const row = JSON.parse(JSON.stringify(d.rows.find((x) => x.key === wearableRes)));
    row.key = NEW_RES;
    row.basis = '测试夹具：克隆一件可穿戴物的资源行，仅为验证数据扩展';
    d.rows.push(row);
  });
  S.editJson(fx, 'world/rules/tables/economy/ledger.json', (d) => {
    const budget = d.rows.find((x) => x.key === 'budget').value;
    budget[NEW_RES] = JSON.parse(JSON.stringify(budget[wearableRes] ?? { src_genesis: { activeFromDay: 0, activeToDay: 0, limit: null } }));
  });

  const world = await S.bootFixture(fx);
  const before = S.snap(world);
  const r = await S.chooseRow(world, rowId);
  assert.equal(S.isOk(r), true, `夹具里选来历应成功：${JSON.stringify(r)}`);
  const [avatar] = S.newPersons(world, before);
  assert.ok(avatar, '夹具里选来历应新建化身');

  const made = Object.keys(world.state.created).filter((id) => world.state.created[id].template === NEW_ITEM);
  assert.equal(made.length, 1, '新加的起始物应建出一件实例（它是可穿戴物）');
  const edge = S.liveEdges(world).find((e) => e.subject === made[0]);
  assert.ok(edge, '新实例应有一条放置边');
  assert.equal(edge.holder, avatar, '新穿戴物的边应挂在化身身上');
  assert.equal(wornBy(world, avatar), baseCount + 1, '同一来历多出一件穿戴物，穿戴边数恰多一条');
  assert.equal(S.sumOf(S.accountsOf(world.state, avatar, NEW_RES)), 1, '新资源种类的化身余额应为 1');
  S.assertConserved(world.state, NEW_RES);
});
