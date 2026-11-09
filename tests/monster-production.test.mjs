// 怪物据点生产：职业、产地与加工配方整类补齐（design-monster-production），产出从材料属性与职业技能推导，不为单点塞数据。
// 1) 数据完整性：由世界数据遍历推出每个据点的产地、劳动者与加工链，不写死名单。
// 2) 盈余可卖：烟苔一户开局被口粮预留拒卖；玩家只等待，推进天数由规律推导（日产能、产地储量、家户预留），到时有可售存量并成交。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {planBossMigration} from '../server-plugin/boss-migration.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {laborCategories, processingCategories} from '../server-plugin/npc-labor.mjs';
import {saleableStock} from '../server-plugin/market.mjs';
import {personHousehold} from '../server-plugin/entity-view.mjs';
import {nextNpcService} from '../server-plugin/npc-schedule.mjs';
import {ids} from '../world/design/monster-society-1.mjs';

const DAY = 1440, ITEM = 'item_dry_mushroom';
const world = await loadWorld();
const seed = JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json', 'utf8'));

function fixture() {
  const engine = new WorldEngine(structuredClone(world));
  let document = engine.createCharacter(seed, {}, 'monster-production');
  document = applyPatches(document, planBossMigration(document, world.rules, world.bosses, world));
  Object.assign(document.state.player, {coins: 1000, hp: 500, maxHp: 500});
  const run = async (doc, tool, args, eventId) => {const out = await engine.reduce(doc, {tool, args, eventId}); return {document: applyPatches(doc, out.patches), result: out.result};};
  return {engine, document, run};
}
const ownerOf = place => place.site?.owner ?? place.owner ?? null;
const societies = engine => engine.world.locations.filter(l => l.monsterSociety);
const bodiesOf = (engine, society) => [...engine.world.npcs, ...engine.world.residents ?? []].filter(n => n.society === society);
const speciesOf = (engine, id) => engine.byId.get(id)?.species;
const stockOf = (d, id, item) => {const x = d.state.npcs[id].inventory?.[item]; return typeof x === 'number' ? x : x?.quantity ?? 0;};
const quantityOf = (d, item) => d.state.inventory[item]?.quantity ?? d.state.inventory[item] ?? 0;

test('怪物据点生产数据完整：每个据点的产地由本聚落拥有且有再生，登记的产出物种有劳动者，产地的原料有人能采、有人会加工', () => {
  const f = fixture(), e = f.engine, state = f.document.state, recipes = e.world.recipes;
  // 覆盖层里手写的生产资源（据点行里本没有）；规律另加的本栖地原生资源不在此列
  const authored = new Set(Object.values(world.mechanics.locations).flatMap(p => (p.site?.resources ?? []).map(r => r.id)));
  assert.ok(authored.size >= 8);
  const uncovered = [];
  for (const society of societies(e)) {
    const bodies = bodiesOf(e, society.id), labor = id => laborCategories(e, state, id);
    // 本聚落拥有的生产地点：据点资源的所有人是这个聚落（数据里读出，不写名单）
    const owned = e.world.locations.filter(l => ownerOf(l) === society.id && l.site?.resources?.length);
    if (!owned.some(l => l.site.resources.some(r => authored.has(r.id)))) uncovered.push(society.id);
    const gatherers = bodies.filter(b => labor(b.id).includes('gather'));
    const crafts = new Set(bodies.flatMap(b => [...processingCategories(e, state, b.id)]));
    for (const place of owned) for (const r of place.site.resources.filter(r => authored.has(r.id))) {
      assert.ok(e.byId.has(r.item), `${place.id}/${r.id} 物品未登记`);
      assert.ok(place.site.changes?.some(c => c.kind === 'regrow' && c.resource === r.id && c.max <= r.quantity), `${place.id}/${r.id} 缺再生登记（应由栖地表派生）`);
      assert.ok(gatherers.length, `${society.id} 有产地 ${place.id} 却没有任何居民的职业带采集`);
      // 产地原料的加工：凡有不要工位的初加工配方以它为料，聚落里要有人的手艺含这类加工（逐类，不逐配方点名）
      for (const category of new Set(recipes.filter(x => x.processing && !x.workstation && x.materials.some(m => m.item === r.item)).map(x => x.processing)))
        assert.ok(crafts.has(category), `${society.id} 产地 ${place.id} 的 ${r.item} 可做「${category}」加工，聚落里没有人会`);
    }
    // 登记的本地产出（supplies 里按物种在某处产出的行）：该物种在本聚落里要有带劳动类别的居民
    for (const row of society.monsterSociety.supplies ?? []) if (row.species) {
      const members = bodies.filter(b => speciesOf(e, b.id) === row.species);
      assert.ok(members.some(b => labor(b.id).length), `${society.id} 登记 ${row.item} 由 ${row.species} 在 ${row.place} 产出，但该物种居民没有任何劳动类别`);
    }
  }
  // 没有手写产地的据点：灰棚集——补具檐的绳索、木柄都是制成品，原料没有本地来源，又没有工位。有变化需显式更新。
  assert.deepEqual(uncovered, ['loc_ms_huipeng']);
});

test('新增鲜料的产地只在怪物聚落，别人采不到；烟苔的职业文本经别名得到采集与晾干', () => {
  const f = fixture(), e = f.engine, state = f.document.state;
  const fresh = new Set(e.world.recipes.filter(r => ['dry', 'shell'].includes(r.processing)).flatMap(r => r.materials.map(m => m.item)));
  assert.ok(fresh.size >= 4);
  const homes = new Set(societies(e).map(s => s.id));
  for (const place of e.world.locations) for (const r of place.site?.resources ?? []) if (fresh.has(r.item)) assert.ok(homes.has(ownerOf(place)), `${place.id}/${r.id} 的 ${r.item} 产地不属怪物聚落`);
  assert.ok(laborCategories(e, state, ids.P.yantai).includes('gather'));
  assert.ok(processingCategories(e, state, ids.P.yantai).has('dry'));
});

// 盈余可卖：玩家只等待。推进天数完全由规律推导：日产能 = 产出者数 × 每批产量 × 日工时 ÷ 每批总工时（采集 + 加工）；
// 缺口 = 开局家户预留 + 1 − 库存；产地储量须够供这些批次；天数 = ⌈缺口 ÷ 日产能⌉，再留一个空转周期与一个预留漂移余量，设硬上限。
test('烟苔户盈余可卖：开局被口粮预留拒卖，只等待真实时间，产出累积到有可售存量，玩家买到一份，钱物守恒', {timeout: 3600000}, async () => {
  const SELLER = ids.P.yantai, f = fixture(), e = f.engine;
  let doc = f.document;
  const read = d => saleableStock(e.primitiveDraft(d), e, SELLER, ITEM);
  const start = read(doc);
  assert.equal(start.available, 0, `开局应被预留拒卖：库存${start.stock} 预留${start.retained}`);
  // ---- 由数据推导 ----
  const state = doc.state, household = personHousehold(e, state, SELLER).value, settlement = household.settlement;
  const cats = processingCategories(e, state, SELLER);
  const recipe = e.world.recipes.find(r => r.output.item === ITEM && !r.workstation && cats.has(r.processing));
  assert.ok(recipe, '烟苔的手艺应有以干蘑菇为产物的不要工位的加工配方');
  const [input] = recipe.materials;
  const source = e.world.locations.flatMap(l => (l.site?.resources ?? []).filter(r => r.item === input.item && ownerOf(l) === settlement).map(r => ({place: l, r, change: l.site.changes.find(c => c.resource === r.id)})))[0];
  assert.ok(source, `聚落 ${settlement} 应拥有 ${input.item} 的产地`);
  const trip = e.rules.npcLabor.tripMinutes;
  const producers = household.members.filter(id => state.npcs[id] && laborCategories(e, state, id).includes('gather') && processingCategories(e, state, id).has(recipe.processing)).length;
  const workPerBatch = recipe.minutes + input.amount * source.r.minutes;
  assert.ok(producers > 0 && workPerBatch > 0);
  const dailyYield = producers * recipe.output.quantity * trip / workPerBatch;
  const gap = start.retained + 1 - start.stock;
  const days = Math.ceil(gap / dailyYield), batches = Math.ceil(gap / recipe.output.quantity);
  const supply = Math.min(source.r.quantity + Math.floor(days / source.change.everyDays) * source.change.quantity, source.r.quantity + source.change.max);
  assert.ok(supply >= batches * input.amount, `规律推导：缺口${gap}份需${batches}批、${batches * input.amount}份鲜料，产地储量加再生只有${supply}，盈余在规律上不可达`);
  const cap = Math.min(60, 2 * days + 7);
  assert.ok(days <= cap, `规律推导：需 ${days} 天，超过硬上限 ${cap} 天`);
  // ---- 真实时间推进：只等待 ----
  let waited = 0, n = 0;
  while (read(doc).available < 1) {
    assert.ok(waited < cap, `等了 ${waited} 天仍无可售存量（推导 ${days} 天，上限 ${cap} 天）：库存${read(doc).stock} 预留${read(doc).retained}`);
    doc = (await f.run(doc, 'world_time', {minutes: DAY}, `mprod-wait-${n++}`)).document; waited++;
  }
  // ---- 玩家去买：走到烟苔，等她接待 ----
  const before = {stock: stockOf(doc, SELLER, ITEM), player: quantityOf(doc, ITEM), coins: doc.state.player.coins, sellerCoins: doc.state.npcs[SELLER].coins};
  for (let i = 0; i < 20; i++) {
    const next = nextNpcService(e, SELLER, doc.state.minute + 1, 'trade', doc.state), at = doc.state.npcs[SELLER].location;
    if (doc.state.location !== at) doc = (await f.run(doc, 'world_move', {destination: at}, `mprod-go-${i}`)).document;
    if (read(doc).available < 1) break; // 走路期间她自己用掉了（预留漂移）：交由下面的断言报告
    try {doc = (await f.run(doc, 'world_trade', {seller: SELLER, item: ITEM, quantity: 1}, `mprod-buy-${i}`)).document; break;}
    catch (error) {
      if (!/不在场|不提供|不在此|剩余服务时间不足|清醒/.test(error.message)) throw error;
      if (next && next.minute > doc.state.minute) {
        if (next.location && doc.state.location !== next.location) doc = (await f.run(doc, 'world_move', {destination: next.location}, `mprod-svc-${i}`)).document;
        if (next.minute > doc.state.minute) doc = (await f.run(doc, 'world_time', {minutes: next.minute - doc.state.minute}, `mprod-wait-svc-${i}`)).document;
      } else doc = (await f.run(doc, 'world_time', {minutes: 60}, `mprod-hour-${i}`)).document;
    }
  }
  assert.equal(quantityOf(doc, ITEM), before.player + 1, '玩家买到一份');
  assert.equal(stockOf(doc, SELLER, ITEM), before.stock - 1, '烟苔库存少一份');
  const paid = before.coins - doc.state.player.coins;
  assert.ok(paid > 0);
  assert.equal(doc.state.npcs[SELLER].coins - before.sellerCoins, paid, '货款全额到烟苔手里');
  assert.deepEqual(auditLedger(doc.ledger), []);
});
