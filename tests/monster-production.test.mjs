// 怪物据点生产：职业、产地数据整类补齐（design-monster-production）。期望一律由世界数据推出（据点居民的职业文本 → 劳动类别 → 本聚落的产地资源），
// 再与运行时世界比对；产地的储量、再生与采集工时由栖地规律给出，不手填。
// “烟苔户盈余可卖”依赖晾干产率（需鲜蘑菇含水率属性，物品表没有），随晾干类一起移出本卡，见完整性测试里的显式缺口。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {planBossMigration} from '../server-plugin/boss-migration.mjs';
import {laborCategories} from '../server-plugin/npc-labor.mjs';
import {habitatsOf, ecologyFor} from '../tools/kc-processing.mjs';

const world = await loadWorld();
const seed = JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json', 'utf8'));
const ecology = JSON.parse(await fs.readFile('world/design/kc-site-ecology.json', 'utf8'));

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

test('怪物据点生产数据完整：居民的采集职业与本聚落产地双向对得上，产地的储量、再生、工时都是规律值，登记的产出物有来源', () => {
  const f = fixture(), e = f.engine, state = f.document.state, recipes = e.world.recipes, locations = e.world.locations;
  const handWritten = new Set(Object.values(world.mechanics.locations).flatMap(p => (p.site?.resources ?? []).map(r => r.id)));
  const gatherNoSite = [], siteNoGather = [], noSourceOrLabor = [], noProduction = [];
  for (const society of societies(e)) {
    const bodies = bodiesOf(e, society.id), labor = id => laborCategories(e, state, id);
    const owned = locations.filter(l => ownerOf(l) === society.id && l.site?.resources?.length);
    const gatherers = bodies.filter(b => labor(b.id).includes('gather'));
    // 期望：居民里有采集职业的聚落，应拥有可采的产地；拥有产地的聚落，应有人能采
    if (gatherers.length && !owned.length) gatherNoSite.push(society.id);
    if (owned.length && !gatherers.length) siteNoGather.push(society.id);
    if (!gatherers.length && !owned.length && bodies.some(b => labor(b.id).length)) noProduction.push(society.id);
    for (const place of owned) for (const r of place.site.resources) {
      // 储量与再生：栖地规律的值（覆盖层不手写 quantity）
      const eco = ecologyFor(r.item, habitatsOf(place, {[place.id]: {biome: place.biome}}, ecology), ecology);
      assert.ok(eco, `${place.id}/${r.id} 的 ${r.item} 在本栖地没有生态行`);
      assert.equal(r.quantity, eco.reserve, `${place.id}/${r.id} 储量应等于栖地规律值`);
      const change = place.site.changes?.find(c => c.kind === 'regrow' && c.resource === r.id);
      assert.ok(change, `${place.id}/${r.id} 缺再生登记`);
      assert.deepEqual([change.quantity, change.everyDays, change.max], [eco.quantity, eco.everyDays, eco.reserve]);
    }
    // 采集工时：手写的 minutes 只能取规律口径——栖地表原生条目登记了该物品就取它，否则取世界里同物品既有条目的最小值
    for (const place of owned) for (const r of place.site.resources.filter(r => handWritten.has(r.id))) {
      const native = Object.values(ecology.native).flat().find(n => n.item === r.item);
      const others = locations.filter(l => ownerOf(l) !== society.id).flatMap(l => l.site?.resources ?? []).filter(x => x.item === r.item && !x.gather).map(x => x.minutes);
      const expected = native ? native.minutes : Math.min(...others);
      assert.equal(r.minutes, expected, `${place.id}/${r.id} 采集工时应取规律口径`);
    }
    // 登记的本地产出（supplies 里按物种在某处产出的行）须有来源：本聚落产地资源，或不要工位的配方由已有来源的料做出；且该物种有带劳动类别的居民
    const items = new Set(owned.flatMap(l => l.site.resources.map(r => r.item)));
    const sourced = (item, depth = 3) => items.has(item) || depth > 0 && recipes.some(r => r.output.item === item && !r.workstation && r.materials.every(m => sourced(m.item, depth - 1)));
    for (const row of society.monsterSociety.supplies ?? []) if (row.species) {
      const labored = bodies.some(b => speciesOf(e, b.id) === row.species && labor(b.id).length);
      if (!sourced(row.item) || !labored) noSourceOrLabor.push(`${society.id}:${row.item}`);
    }
  }
  // 显式缺口，双向比对，有变化需显式更新：
  // 炭阶：菌床工有采集职业，但菌床洞的鲜蘑菇要晾成干菌片才有产出，晾干产率须由材料含水率推导，物品表没有该属性，不借他物数值；待补属性：鲜蘑菇含水率。
  assert.deepEqual(gatherNoSite, ['loc_ms_tanjie']);
  assert.deepEqual(siteNoGather, []);
  // 灰棚集：补具檐的绳索、木柄是制成品，原料无本地来源，又没有工位。
  assert.deepEqual(noProduction, ['loc_ms_huipeng']);
  // 登记产出物无来源或无劳动者：榆根里的榛、核桃、干果（待补属性：带壳榛与带壳核桃的可食仁比例及脱壳工时、浆果含水率）与木柄（缺木工工位，修具职业无只含加工的劳动类别）；
  // 裂炉的铁、铁钉、矿镐（缺炼铁类与锻工位）、木炭（本聚落无木料来源）；回汐埠的鲜鱼（fish 劳动尚无候选实现）；灰棚集的绳索、木柄（无工位）。
  assert.deepEqual(noSourceOrLabor.sort(), [
    'loc_ms_huipeng:item_flax_cord', 'loc_ms_huipeng:item_tool_handle', 'loc_ms_huixi:item_fish',
    'loc_ms_lielu:item_charcoal', 'loc_ms_lielu:item_iron', 'loc_ms_lielu:item_iron_nail', 'loc_ms_lielu:item_mining_pick',
    'loc_ms_yugen:item_dried_fruit', 'loc_ms_yugen:item_hazelnut', 'loc_ms_yugen:item_tool_handle', 'loc_ms_yugen:item_walnut']);
});

// 公共据点允许任何人进入：采集只因取走的资源归属记一条采集侵犯（受害者是产地所有人），不另记擅入。怪物聚落所有与人类派系所有的公共据点是同一规律。
async function gatherOnce(f, place, resource) {
  const doc = structuredClone(f.document); doc.state.location = place.id;
  const before = doc.state.inventory[resource.item]?.quantity ?? 0;
  const enterId = `mprod-enter-${place.id}`, gatherId = `mprod-gather-${place.id}`;
  // 采集前须先进入据点（进入公共据点本就不记违约）；整个进入加采集的流程只应记一条采集侵犯
  const entered = await f.run(doc, 'world_site', {operation: 'enter'}, enterId);
  const out = await f.run(entered.document, 'world_site', {operation: 'gather', target: resource.id}, gatherId);
  assert.equal(out.document.state.inventory[resource.item]?.quantity ?? 0, before + 1, `${place.id} 采到一份`);
  const offenses = Object.values(out.document.state.records).filter(r => r.category === 'offense' && [enterId, gatherId].includes(r.sourceEvent));
  assert.equal(offenses.length, 1, `${place.id} 进入加采集只应记一条（采集侵犯），实际 ${offenses.map(o => o.act)}`);
  assert.equal(offenses[0].act, 'gather');
  assert.equal(offenses[0].victim, ownerOf(place));
  assert.equal(offenses[0].offender, 'player');
}
const openPlain = place => (place.site?.resources ?? []).find(r => !r.gather && !r.requires?.length && !r.mechanisms?.length);

test('玩家在怪物公共产地采集：只记一条采集侵犯，受害者是产地所有人；不另记擅入', async () => {
  const f = fixture(), e = f.engine, homes = new Set(societies(e).map(s => s.id));
  const places = e.world.locations.filter(l => !l.monsterSociety && l.access?.mode === 'public' && homes.has(ownerOf(l)) && openPlain(l));
  assert.ok(places.length >= 4);
  for (const place of places) await gatherOnce(f, place, openPlain(place));
});

test('回归：人类派系所有的公共据点采集，同一口径（一条采集侵犯，受害者是所有人）', async () => {
  const f = fixture(), e = f.engine, homes = new Set(societies(e).map(s => s.id));
  const places = e.world.locations.filter(l => l.access?.mode === 'public' && ownerOf(l) && ownerOf(l) !== 'player' && !homes.has(ownerOf(l)) && !/^faction_ms_/.test(ownerOf(l)) && !(l.site?.entryMechanisms ?? []).length && openPlain(l));
  assert.ok(places.length >= 1, '世界里应有人类公共据点');
  for (const place of places) await gatherOnce(f, place, openPlain(place));
});
