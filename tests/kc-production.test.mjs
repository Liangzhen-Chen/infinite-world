// 卡 C：通用初加工链。数据侧的规律（再生只许自然物、工具都有配方、配方链追到自然来源、生成部分与数据一致），
// 加一条真实动作的抄书：买原本、纸、墨、笔，向教师学识字，照原本抄出一本，账本守恒。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productionCheck} from '../tools/kc-production-check.mjs';
import {generate, regrowPlan} from '../tools/kc-processing.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';

const J = rel => JSON.parse(fs.readFileSync(rel, 'utf8'));

test('据点只再生自然物，世界里每种工具都有配方，初加工与工具配方的投入都追得到自然来源', () => {
  const rep = productionCheck(process.cwd());
  assert.equal(rep.counts['regrow-not-natural'], 0, JSON.stringify(rep.findings.filter(f => f.rule === 'regrow-not-natural')));
  assert.equal(rep.counts['tool-no-recipe'], 0, JSON.stringify(rep.findings.filter(f => f.rule === 'tool-no-recipe')));
  const broken = new Set(rep.findings.filter(f => f.rule === 'chain-not-natural').map(f => f.id));
  const recipes = J('world/meta/recipes.json').filter(r => r.processing && r.processing !== 'copy');
  assert.ok(recipes.length > 60);
  // 已知缺口：世界里没有披羊毛的牲畜（畜牧物种只有山羊毛、禽羽），羊毛没有持续来源，擀毡一条只能用存量羊毛；交给畜牧补物种
  const gaps = recipes.filter(r => broken.has(r.id)).map(r => [r.id, rep.findings.find(f => f.id === r.id).broken]);
  assert.deepEqual(gaps, [['recipe_kc_felt_wool_wool_felt_sheet', ['item_wool']]]);
});

test('生成部分与数据表一致：重跑生成器不改变配方与据点（以后改参数只重跑命令，不手改）', () => {
  const g = generate(process.cwd());
  const inFile = J('world/meta/recipes.json').filter(r => r.id.startsWith('recipe_kc_'));
  assert.deepEqual(inFile, g.recipes);
  const items = new Map(J('world/meta/items.json').map(i => [i.id, i]));
  const plan = regrowPlan(J('world/geo/locations.json'), J('world/meta/recipes.json'), items, J('world/geo/biomes.json').locations);
  assert.deepEqual(plan.locations, J('world/geo/locations.json'));
});

test('真实动作：买原本与纸墨笔，学识字，照原本抄写；书多一本、纸墨按实耗、账本守恒', {timeout: 280000}, async () => {
  const world = await loadWorld(), engine = new WorldEngine(structuredClone(world));
  const seed = J('tests/fixtures/legacy/seed.json');
  let doc = engine.createCharacter(seed, {}, 'kc'), n = 0;
  const act = async (action, slots) => {
    let out;
    try {out = await engine.reduce(doc, {tool: 'world_act', args: {action, slots}, eventId: `kc-${++n}`});} catch (e) {return {ok: false, reason: e.message};}
    const receipt = out.result?.receipt ?? out.receipt ?? {};
    if (out.patches?.length) doc = applyPatches(doc, out.patches);
    return {ok: receipt.status !== 'rejected' && out.result?.ok !== false, reason: receipt.reason, result: out.result};
  };
  const qty = item => doc.state.inventory?.[item]?.quantity ?? doc.state.inventory?.[item] ?? 0;
  const goTo = async npc => {const at = doc.state.npcs[npc].location; if (doc.state.location !== at) await act('core:move', {destination: at});};
  // 对方不接待时真等一个时辰再去
  const withService = async (npc, fn) => {let r; for (let i = 0; i < 20; i++) {await goTo(npc); r = await fn(); if (r.ok || !/此刻不提供|不在场|不在此|剩余服务时间不足/.test(r.reason ?? '')) return r; await act('core:time', {minutes: 60});} return r;};
  const buy = (seller, item) => withService(seller, () => act('core:trade.buy', {seller, item, quantity: 1}));
  const book = 'item_book_mill_oats', teacher = 'npc_hw_luqing';
  assert.ok((await buy(teacher, book)).ok);
  for (let i = 0; i < 3; i++) {assert.ok((await buy(teacher, 'item_parchment')).ok); assert.ok((await buy('npc_hw_yanzhe', 'item_lampblack')).ok);}
  assert.ok((await buy(teacher, 'item_reed_pen')).ok);
  const lessons = [];
  for (let i = 0; i < 8 && !doc.state.skills?.skill_literacy; i++) lessons.push((await withService(teacher, () => act('core:learn', {kind: 'skill', entity: 'skill_literacy', source: teacher, mode: 'acquire'}))).reason);
  assert.ok(doc.state.skills?.skill_literacy, `学会识字：${lessons.join(' | ')}`);
  const before = {book: qty(book), paper: qty('item_parchment'), ink: qty('item_lampblack')};
  let tries = 0;
  while (qty(book) === before.book && qty('item_parchment') > 0) {tries++; const m = await act('core:craft.manufacture', {recipe: 'recipe_kc_copy_book_mill_oats_lampblack'}); assert.ok(m.ok, m.reason);}
  assert.equal(qty(book), before.book + 1, '抄出一本');
  assert.equal(qty('item_parchment'), before.paper - tries);
  assert.equal(qty('item_lampblack'), before.ink - tries);
  assert.deepEqual(auditLedger(doc.ledger), []);
});
