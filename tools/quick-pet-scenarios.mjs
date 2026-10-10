import assert from 'node:assert/strict';
import { WorldEngine } from '../server-plugin/engine.mjs';
import { withPetRules } from '../world/design/pet-foundation.mjs';
import { spellBlueprints } from '../world/design/spell-blueprints.mjs';
import { applyPatches } from '../server-plugin/storage.mjs';

export function petScenarios(sourceEngine) {
    const world = withPetRules(sourceEngine.world), spell = spellBlueprints().find(row => row.mechanism === 'servant');
    world.monsters.push({ id: 'monster_quick_dog', name: '夹具岸犬', aliases: [], template: 0, levelRange: [1, 4],
        habitatTags: ['村旁'], grouping: '独居', diet: '杂食', drops: [], taming: { possible: true, conditions: ['持续接触'] }, intelligence: 1,
        tamingRule: { category: 'support', minimumSkill: 100, minimumPlayerLevel: 1, trustThreshold: 20, minutes: 60, difficulty: 10,
            food: [{ item: 'item_ration', hungerRelief: 50, trustGain: 5 }], skills: ['跟随训练'], rideable: false, riderWeightKg: 60, carryKg: 20 } });
    world.spells.push(spell); world.skills.push({ id: spell.skill, name: spell.name, attribute: '精神', profession: 'profession_summoner' });
    const engine = new WorldEngine(world), fixtureScope = '隔离规则夹具：已有动物归属和已知召唤法术，不代表正式目录或正常取得已完成';
    const preparePet = c => {
        const care = { version: 1, hunger: 80, fatigue: 0, mood: 60, loyalty: 50, sickness: false, sickHours: 0, neglectHours: 0,
            nextTick: c.state.minute + 60, bond: 30, contactDay: -1, feedDay: -1, groomDay: -1, trainDay: -1, skills: {}, experience: 0 };
        c.state.creatures = { monster_quick_dog: { name: '夹具岸犬', location: c.state.location, hp: 30, maxHp: 30, level: 1, status: '正常', owner: 'player', care } };
        c.state.pets.monster_quick_dog = { petFormat: 1, creature: 'monster_quick_dog', category: 'support', status: '活跃', following: true, acquired: c.state.minute, source: 'isolated-fixture' };
        return c;
    };
    return [
        { id: 'PetFeeding', engine, fixtureScope, input: '只拿背包里的一份干粮喂我这只岸犬，不做别的。', setup: preparePet,
            context: '动物monster_quick_dog已是自有宠物，饥饿80；登记食物为item_ration干粮。用world_pet feed实际消耗一份、5分钟，不能用world_health或关系工具额外改忠诚。整回合只计实际5分钟。',
            assert: (c, { initial, startMinute }) => {
                assert.equal(c.state.inventory.item_ration.quantity, initial.state.inventory.item_ration.quantity - 1);
                assert.equal(c.state.creatures.monster_quick_dog.care.hunger, 30); assert.equal(c.state.creatures.monster_quick_dog.care.loyalty, 50);
                assert.equal(c.state.minute, startMinute + 5); assert.equal(c.state.creatures.monster_quick_dog.owner, 'player');
            } },
        { id: 'PetRelease', engine, fixtureScope, input: '我决定解除这只岸犬的归属，让它自由离开。', setup: preparePet,
            context: '解除归属用world_pet release，不删除历史，不赠给未指定的NPC；即时操作，不自行安排喂食、训练或地点移动。',
            assert: (c, { initial, startMinute,reply }) => {
                assert.equal(c.state.pets.monster_quick_dog.status, '释放'); assert.equal(c.state.creatures.monster_quick_dog.owner, null);
                assert.equal(c.state.creatures.monster_quick_dog.hp, 30); assert.equal(c.state.creatures.monster_quick_dog.location, initial.state.location);
                assert.equal(c.state.minute, startMinute);
                assert.ok(!/窜出|跑远|消失在|离开了(?:酒馆|小镇|村庄)/.test(reply),'解除归属没有结算迁徙，不应写成已经跑远');
            } },
        { id: 'SummonCarry', engine, fixtureScope, input: '让我的水盏役灵从取水池搬250毫升水到公用水盏，只搬一次。',
            setup: async c => {
                c.state.location = 'loc_hw_dock'; c.state.player.mp = 50; c.state.player.maxMp = 50;
                c.state.spells[spell.id] = { source: { type: 'isolated-fixture' } };
                c.state.skills[spell.skill] = { proficiency: 120, daily: {}, breakthroughs: [] };
                for (let i = 0; i < 100; i++) {
                    const out = await engine.reduce(c, { tool: 'world_cast', args: { spell: spell.id, target: 'player' }, eventId: `prepare_summon_${i}` });
                    if (out.result.success) return applyPatches(c, out.patches);
                }
                throw new Error('隔离场景初始化没有成功召唤样本');
            },
            context: '役灵已按真实world_cast成功创建，world_summon inspect可查返回的契约编号。使用world_summon carry_water，source feature_hw_pool、destination feature_hw_cup、millilitres 250。5分钟消耗维持1魔力，水未净化，整回合5分钟，不重新施法或提前dismiss。',
            assert: (c, { initial, startMinute }) => {
                const pool = c.state.records['physical_feature:feature_hw_pool'].state, cup = c.state.records['physical_feature:feature_hw_cup'].state;
                assert.equal(pool.waterMl, 29750); assert.equal(cup.waterMl, 250); assert.equal(pool.saltMg + cup.saltMg, 6000);
                assert.equal(cup.turbidity, 70); assert.equal(cup.pathogenRisk, 35);
                assert.equal(c.state.player.mp, initial.state.player.mp - 1); assert.equal(c.state.minute, startMinute + 5);
                assert.equal(Object.values(c.state.effects).filter(e => e.kind === 'summon').length, 1); assert.deepEqual(c.state.pets, initial.state.pets);
            } },
    ];
}
