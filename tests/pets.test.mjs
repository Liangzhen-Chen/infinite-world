import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import fc from 'fast-check';
import { loadWorld } from '../tools/load-world.mjs';
import { withPetRules } from '../world/design/pet-foundation.mjs';
import { WorldEngine } from '../server-plugin/engine.mjs';
import { CampaignStorage, applyPatches } from '../server-plugin/storage.mjs';
import { validateWorld } from '../tools/validate-world.mjs';
import { petView, checkPetCareer } from '../server-plugin/pets.mjs';
import {toolResultWithClock}from'../extension/turn.mjs';

const seed = JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json', 'utf8'));
export function animalFixture(category = 'support', id = 'monster_fixture_pack') {
    return { id, name: category === 'mount' ? '夹具驮马' : '夹具岸犬', aliases: [], template: 0, levelRange: [1, 4],
        habitatTags: ['村旁'], grouping: '独居', diet: '杂食', drops: [], taming: { possible: true, conditions: ['持续接触'] }, intelligence: 1,
        tamingRule: { category, minimumSkill: 100, minimumPlayerLevel: 1, trustThreshold: 20, minutes: 60, difficulty: 10,
            food: [{ item: 'item_ration', hungerRelief: 50, trustGain: 5 }], skills: ['跟随训练'], rideable: category === 'mount', riderWeightKg: 60, carryKg: 150 } };
}
export function careFixture(minute, values = {}) {
    return { version: 1, hunger: 20, fatigue: 0, mood: 60, loyalty: 50, sickness: false, sickHours: 0,
        neglectHours: 0, nextTick: minute + 60, bond: 30, contactDay: -1, feedDay: -1, groomDay: -1, trainDay: -1, skills: {}, experience: 0, ...values };
}
async function setup(category = 'support', owned = false) {
    const world = withPetRules(await loadWorld()); world.monsters.push(animalFixture(category));
    const engine = new WorldEngine(world), document = engine.initialFromLegacy(seed, 'pet-rule-test'), id = 'monster_fixture_pack';
    document.state.location='loc_hw';
    document.state.creatures = { [id]: { name: world.monsters.at(-1).name, location: document.state.location, hp: 30, maxHp: 30, level: 1, status: '正常', owner: owned ? 'player' : null } };
    if (owned) {
        document.state.creatures[id].care = careFixture(document.state.minute);
        document.state.pets[id] = { petFormat: 1, creature: id, category, status: '活跃', following: true, acquired: document.state.minute, source: 'isolated-fixture' };
    }
    document.state.skills.skill_life_15_core = { proficiency: 120, daily: {}, breakthroughs: [] };
    document.state.skills.skill_life_19_core = { proficiency: 120, daily: {}, breakthroughs: [] };
    document.state.inventory.item_ration.quantity = 50;
    const run = async (c, tool, args, eventId) => { const out = await engine.reduce(c, { tool, args, eventId }); return { document: applyPatches(c, out.patches), result: out.result }; };
    return { world, engine, document, id, run };
}
async function sample(run, c, args, success) {
    for (let i = 0; i < 100; i++) {
        const eventId = `pet_sample_${i}`, out = await run(c, 'world_pet', args, eventId);
        if (out.result.checkSuccess === success) return { ...out, eventId };
    }
    throw new Error('缺少独立的成功或失败检定样本');
}

test('驯养用实际食物和多日接触，未达到信任不能登记，失败也计时且降低信任', async () => {
    const { document, id, run } = await setup();
    const before = structuredClone(document);
    await assert.rejects(run(document, 'world_pet', { operation: 'tame', target: id }, 'too_early'), /信任/);
    assert.deepEqual(document, before);
    let c = (await run(document, 'world_pet', { operation: 'feed', target: id, item: 'item_ration' }, 'feed_1')).document;
    assert.equal(c.state.inventory.item_ration.quantity, 49); assert.equal(c.state.creatures[id].care.bond, 5);
    c = (await sample(run, c, { operation: 'contact', target: id }, true)).document;
    assert.equal(c.state.creatures[id].care.bond, 10);
    await assert.rejects(run(c, 'world_pet', { operation: 'contact', target: id }, 'same_day'), /今天/);
    c = (await run(c, 'world_time', { minutes: 1440 }, 'next_day')).document;
    await assert.rejects(run(c, 'world_pet', { operation: 'contact', target: id }, 'hungry_contact'), /饥病/);
    c = (await run(c, 'world_pet', { operation: 'feed', target: id, item: 'item_ration' }, 'feed_2')).document;
    c = (await sample(run, c, { operation: 'contact', target: id }, true)).document;
    assert.equal(c.state.creatures[id].care.bond, 20);
    const failed = await sample(run, c, { operation: 'tame', target: id }, false);
    assert.equal(failed.document.state.minute, c.state.minute + 60); assert.equal(failed.document.state.pets[id], undefined);
    assert.ok(failed.document.state.creatures[id].care.bond < 20);
    const good = await sample(run, c, { operation: 'tame', target: id }, true);
    assert.equal(good.document.state.pets[id].category, 'support'); assert.equal(good.document.state.creatures[id].owner, 'player');
    assert.equal(good.document.state.pets[id].hp, undefined); assert.equal(Object.keys(good.document.state.creatures).length, 1);
    await assert.rejects(run(good.document, 'world_pet', { operation: 'tame', target: id }, 'duplicate_tame'), /已经/);
});

test('他人归属、缺技能、级差和已满名额阻止驯服，元素召唤师不能带战斗宠物', async () => {
    const { engine, document, id, run } = await setup('combat');
    document.state.creatures[id].care = careFixture(document.state.minute);
    const cases = [
        [c => c.state.creatures[id].owner = 'npc_hw_linsui', /所有者/],
        [c => c.state.skills.skill_life_15_core.proficiency = 0, /技能/],
        [c => c.state.player.level = 0, /等级/],
        [c => c.state.professions.combat = 'profession_summoner', /职业/],
        [c => { for (let i = 0; i < 5; i++) c.state.pets[`old_${i}`] = { category: '战斗', status: '活跃' }; }, /名额/],
    ];
    for (const [change, message] of cases) {
        const c = structuredClone(document); change(c); const before = structuredClone(c);
        await assert.rejects(run(c, 'world_pet', { operation: 'tame', target: id }, 'invalid_tame'), message); assert.deepEqual(c, before);
    }
    document.state.pets.legacy = { name: '旧伙伴', category: '战斗', status: '活跃' };
    const d = { get: (...parts) => parts.reduce((v, k) => v?.[k], document) };
    assert.throws(() => checkPetCareer(d, engine, 'profession_summoner'), /新职业/);
});

test('宠物饥病出走和死亡按世界时钟发生，长等候与分段等候结果一致', async () => {
    const { document, id, run } = await setup('support', true);
    await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 1, max: 600 }), async (steps, part) => {
        const total = steps * part;
        let split = structuredClone(document);
        const full = (await run(document, 'world_time', { minutes: total }, 'long_wait')).document;
        for (let i = 0; i < steps; i++) split = (await run(split, 'world_time', { minutes: part }, `split_${i}`)).document;
        assert.deepEqual(split.state.creatures, full.state.creatures); assert.deepEqual(split.state.pets, full.state.pets);
    }), { numRuns: 40 });
    const neglected = structuredClone(document); neglected.state.creatures[id].care = careFixture(document.state.minute, { hunger: 76, loyalty: 11 });
    const escaped = (await run(neglected, 'world_time', { minutes: 360 }, 'escape')).document;
    assert.equal(escaped.state.pets[id].status, '出走'); assert.equal(escaped.state.creatures[id].owner, null);
    assert.ok(escaped.state.creatures[id].hp > 0);
    const starving = structuredClone(document); starving.state.creatures[id].hp = 1; starving.state.creatures[id].care.hunger = 100;
    const died = (await run(starving, 'world_time', { minutes: 60 }, 'starve')).document;
    assert.equal(died.state.creatures[id].hp, 0); assert.equal(died.state.pets[id].status, '死亡');
    await assert.rejects(run(died, 'world_pet', { operation: 'treat', target: id }, 'revive_pet'), /死亡/);
});

test('真实药材治疗病伤，不复制生命，失败耗药；训练增长限每天一次且不能自动回血', async () => {
    const { document, id, run } = await setup('support', true);
    document.state.creatures[id].hp = 10; document.state.creatures[id].care.sickness = true;
    document.state.inventory.item_herb = { quantity: 3, quality: '木', durability: 100, weight: 0.1 };
    const failed = await sample(run, document, { operation: 'treat', target: id }, false);
    assert.equal(failed.document.state.inventory.item_herb.quantity, 2); assert.equal(failed.document.state.creatures[id].hp, 10);
    const cured = await sample(run, document, { operation: 'treat', target: id }, true);
    assert.equal(cured.document.state.creatures[id].hp, 20); assert.equal(cured.document.state.creatures[id].care.sickness, false);
    cured.document.state.creatures[id].care.experience = 195;
    const trained = await sample(run, cured.document, { operation: 'train', target: id, skill: '跟随训练' }, true);
    assert.equal(trained.document.state.creatures[id].level, 2); assert.equal(trained.document.state.creatures[id].maxHp, 32);
    assert.equal(trained.document.state.creatures[id].hp, 20); assert.equal(trained.document.state.creatures[id].care.skills.跟随训练, 3);
    await assert.rejects(run(trained.document, 'world_pet', { operation: 'train', target: id, skill: '跟随训练' }, 'train_twice'), /今天/);
    await assert.rejects(run(cured.document, 'world_pet', { operation: 'train', target: id, skill: '火球' }, 'fake_skill'), /技能目录/);
});

test('坐骑实际承载并跟随路线，留守动物不瞬移，疲劳不足或没有坐骑不能骑行', async () => {
    const { document, id, run } = await setup('mount', true);
    await assert.rejects(run(document, 'world_move', { destination: 'bld_hw_qingdeng', mode: 'horse' }, 'phantom_mount'), /实际骑乘/);
    let c = (await run(document, 'world_pet', { operation: 'mount', target: id }, 'mount')).document;
    c = (await run(c, 'world_move', { destination: 'bld_hw_qingdeng', mode: 'horse' }, 'ride')).document;
    assert.equal(c.state.creatures[id].location, 'bld_hw_qingdeng'); assert.ok(c.state.creatures[id].care.fatigue > 0);
    const unconscious=await run(c,'world_health',{delta:-c.state.player.hp},'fall_unconscious');
    assert.equal(unconscious.document.state.player.mount,undefined);assert.equal(unconscious.document.state.creatures[id].location,'bld_hw_qingdeng');
    c = (await run(c, 'world_pet', { operation: 'dismount', target: id }, 'dismount')).document;
    c = (await run(c, 'world_pet', { operation: 'stay', target: id }, 'stay')).document;
    c = (await run(c, 'world_move', { destination: 'loc_hw', mode: 'walk' }, 'walk_away')).document;
    assert.equal(c.state.creatures[id].location, 'bld_hw_qingdeng');
    await assert.rejects(run(c, 'world_pet', { operation: 'feed', target: id, item: 'item_ration' }, 'remote_feed'), /不在场/);
    const tired = structuredClone(document); tired.state.creatures[id].care.fatigue = 100;
    await assert.rejects(run(tired, 'world_pet', { operation: 'mount', target: id }, 'tired_mount'), /状态/);
});

test('首领需要确切特殊条件，条件在长驯服结束前到期则仅消耗时间', async () => {
    const { world, document, id } = await setup();
    const species = world.monsters.at(-1), boss = { id: 'boss_fixture', name: '夹具岸兽首领', monster: id, tier: 1, level: 1,
        lair: 'loc_hw', territory: '村旁', tactics: ['避让'], weakness: '有限耐心', drops: [], taming: '有条件', intelligence: 1,
        tamingRule: { ...species.tamingRule, bossCondition: 'condition_patient_contact' } };
    world.bosses.push(boss); document.state.creatures[boss.id] = { ...document.state.creatures[id], care: careFixture(document.state.minute) };
    const engine = new WorldEngine(world), run = async (c, tool, args, eventId) => { const out = await engine.reduce(c, { tool, args, eventId }); return { document: applyPatches(c, out.patches), result: out.result }; };
    await assert.rejects(run(document, 'world_pet', { operation: 'tame', target: boss.id }, 'no_condition'), /特殊/);
    document.state.records.boss_permission = { category: 'boss_taming', subject: boss.id, condition: boss.tamingRule.bossCondition, expires: document.state.minute + 30 };
    const out = await sample(run, document, { operation: 'tame', target: boss.id, authorization: 'boss_permission' }, true);
    assert.equal(out.result.success, false); assert.match(out.result.effectFailed, /失效/); assert.equal(out.document.state.pets[boss.id], undefined);
});

test('查看宠物保持只读，旧宠物记录不补造，规则坏引用与非法坐骑条件阻止构建', async () => {
    const { world, engine, document } = await setup('mount', true);
    document.state.pets.old = { name: '旧记录', category: '辅助', status: '活跃' };
    const before = structuredClone(document), view = petView(engine, document);
    view.pets[0].care.hunger = 999; view.presentAnimals[0].tamingRule.food[0].trustGain = 999;
    assert.deepEqual(document, before); assert.equal(validateWorld(world).ok, true);
    for (const mutate of [w => w.rules.petCare.tamingSkill = 'skill_missing', w => w.rules.petCare.hungerPerHour = 101,
        w => w.monsters.at(-1).tamingRule.category = 'combat', w => w.monsters.at(-1).tamingRule.food[0].item = 'item_missing']) {
        const bad = structuredClone(world); mutate(bad); assert.equal(validateWorld(bad).ok, false);
    }
    const elapsed = await engine.reduce(document, { tool: 'world_time', args: { minutes: 60 }, eventId: 'old_preserved' });
    assert.deepEqual(applyPatches(document, elapsed.patches).state.pets.old, before.state.pets.old);
});

test('宠物归属、照料和世界时钟在重启、导入导出及删除回合重放中保持一致', async t => {
    const { engine, document, id } = await setup('support', true), directory = await fs.mkdtemp(path.join(tmpRoot(), 'fields-pet-test-'));
    t.after(async () => { const target = path.resolve(directory); if (!target.startsWith(path.resolve(tmpRoot()) + path.sep + 'fields-pet-test-')) throw new Error('临时目录边界错误'); await fs.rm(target, { recursive: true, force: true }); });
    const reducer = (c, input) => engine.reduce(c, input), store = new CampaignStorage(directory, { reducer });
    await store.create({ id: 'pets', worldVersion: engine.world.version, document });
    await store.transact('pets', { id: 'feed_event', anchor: 'feeding', input: { tool: 'world_pet', args: { operation: 'feed', target: id, item: 'item_ration' }, eventId: 'feed_event' } }, reducer);
    const view = await store.read('pets');
    assert.deepEqual((await new CampaignStorage(directory, { reducer }).read('pets')).document, view.document);
    assert.deepEqual((await store.import(await store.export('pets'), 'pets_copy')).document, view.document);
    assert.deepEqual((await store.reconcile('pets', [])).document, document);
});

test('释放只是解除归属且明确即时，已释放动物可以再次经实际检定驯服',async()=>{
    const{document,id,run}=await setup('support',true),out=await run(document,'world_pet',{operation:'release',target:id},'release');
    assert.equal(out.document.state.creatures[id].location,document.state.location);
    const clock=toolResultWithClock(out.result,{startMinute:document.state.minute,minute:out.document.state.minute});
    assert.equal(clock.turnClock.elapsedMinutes,0);assert.equal(clock.actionScope.locationChanged,false);
    assert.equal(toolResultWithClock({ok:true},{startMinute:540,minute:540}).turnClock.elapsedMinutes,0);
    const retamed=await sample(run,out.document,{operation:'tame',target:id},true);
    assert.equal(retamed.document.state.creatures[id].owner,'player');assert.equal(retamed.document.state.pets[id].status,'活跃');
});

test('骑上以后新增货物仍需检查负重，不能用先骑后买绕过载荷',async()=>{
    const{document,id,run}=await setup('mount',true),mounted=(await run(document,'world_pet',{operation:'mount',target:id},'mount_before_load')).document;
    mounted.state.inventory.item_ration.quantity=10000;const before=structuredClone(mounted);
    await assert.rejects(run(mounted,'world_move',{destination:'bld_hw_qingdeng',mode:'horse'},'overloaded_ride'),/负重/);assert.deepEqual(mounted,before);
});
