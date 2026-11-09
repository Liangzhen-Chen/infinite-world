// 怪物据点生产：职业、产地与加工配方整类补齐（design-monster-production），产出从材料属性与职业技能推导，不为单点塞数据。
// 数据完整性：由世界数据遍历推出每个据点的产地、劳动者与加工链，不写死名单。
// “烟苔户盈余可卖”依赖晾干产率（需鲜蘑菇含水率属性，物品表没有），随晾干类一起移出本卡，见下方显式缺口。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {planBossMigration} from '../server-plugin/boss-migration.mjs';
import {laborCategories, processingCategories} from '../server-plugin/npc-labor.mjs';
import {ids} from '../world/design/monster-society-1.mjs';

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

test('怪物据点生产数据完整：每个据点的产地由本聚落拥有且有再生，登记的产出物种有劳动者，产地的原料有人能采、有人会加工', () => {
  const f = fixture(), e = f.engine, state = f.document.state, recipes = e.world.recipes;
  // 覆盖层里手写的生产资源（据点行里本没有）；规律另加的本栖地原生资源不在此列
  const authored = new Set(Object.values(world.mechanics.locations).flatMap(p => (p.site?.resources ?? []).map(r => r.id)));
  assert.ok(authored.size >= 5);
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
  // 显式缺口（没有手写产地的据点），有变化需显式更新：
  // 灰棚集：补具檐的绳索、木柄都是制成品，原料没有本地来源，又没有工位。
  // 炭阶：菌床洞的鲜蘑菇要晾成干菌片才有产出，晾干产率须由材料含水率（可食/干物比例）推导，物品表没有该属性，不借他物数值；待补属性：鲜蘑菇含水率。
  // 另缺同类属性而移出本卡：苔灯与榆根里的浆果晾干（浆果含水率）、榆根里榛与核桃脱壳（带壳榛、带壳核桃的可食仁比例与脱壳工时）。
  assert.deepEqual(uncovered, ['loc_ms_huipeng', 'loc_ms_tanjie']);
});
