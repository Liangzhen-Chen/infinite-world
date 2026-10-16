import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import fc from 'fast-check';
import { loadWorld } from '../tools/load-world.mjs';
import { withPetRules } from '../world/design/pet-foundation.mjs';
import { spellBlueprints } from '../world/design/spell-blueprints.mjs';
import { WorldEngine } from '../server-plugin/engine.mjs';
import { applyPatches, CampaignStorage } from '../server-plugin/storage.mjs';
import { validateWorld } from '../tools/validate-world.mjs';

const seed = JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json', 'utf8'));
async function setup() {
    const world = withPetRules(await loadWorld()), spell = spellBlueprints().find(row => row.mechanism === 'servant');
    // The servant is already published; add the isolated definition only if absent.
    if (!world.spells.some(row => row.id === spell.id)) world.spells.push(spell);
    if (!world.skills.some(row => row.id === spell.skill)) world.skills.push({ id: spell.skill, name: spell.name, attribute: '精神', profession: 'profession_summoner' });
    const engine = new WorldEngine(world), document = engine.initialFromLegacy(seed, 'summon-rule-test');
    document.state.location = 'loc_hw_dock'; document.state.player.mp = 50; document.state.player.maxMp = 50;
    document.state.spells[spell.id] = { source: { type: 'isolated-fixture' } };
    document.state.skills[spell.skill] = { proficiency: 120, daily: {}, breakthroughs: [] };
    const run = async (c, tool, args, eventId) => { const out = await engine.reduce(c, { tool, args, eventId }); return { document: applyPatches(c, out.patches), result: out.result }; };
    return { world, engine, document, spell, run };
}
async function sample(run, c, spell, success) {
    for (let i = 0; i < 100; i++) {
        const eventId = `summon_sample_${i}`, out = await run(c, 'world_cast', { spell: spell.id, target: 'player' }, eventId);
        if (out.result.checkSuccess === success) return { ...out, eventId };
    }
    throw new Error('缺少独立的召唤检定样本');
}
const state = (c, world, id) => c.state.records[`physical_feature:${id}`]?.state ?? world.locations.flatMap(p => p.features ?? []).find(f => f.id === id).state;

test('已学召唤实际扣施法与维持魔力，期满移除投影而保留契约，不成为永久宠物', async () => {
    const { world, document, spell, run } = await setup();
    assert.equal(validateWorld(world).ok, true);
    const first = await sample(run, document, spell, true), now = first.document.state.minute;
    assert.equal(first.document.state.player.mp, 46); assert.deepEqual(first.document.state.pets, document.state.pets);
    const after = (await run(first.document, 'world_time', { minutes: 30 }, 'expiry')).document;
    assert.equal(after.state.player.mp, 41); assert.equal(after.state.effects[first.eventId], undefined);
    const contract = after.state.records[first.result.contract];
    assert.equal(contract.status, '期满'); assert.equal(contract.ended, now + 30); assert.equal(contract.paidUpkeep, 5);
    const failed = await sample(run, document, spell, false);
    assert.equal(failed.document.state.player.mp, 46); assert.equal(Object.values(failed.document.state.effects).filter(e => e.kind === 'summon').length, 0);
});

test('水盏役灵搬真实水并保留污染负荷，容量、距离、私有设施和未授权能力阻止搬运', async () => {
    const { world, document, spell, run } = await setup(), first = await sample(run, document, spell, true);
    const args = { operation: 'carry_water', summon: first.eventId, source: 'feature_hw_pool', destination: 'feature_hw_cup', millilitres: 250 };
    const out = await run(first.document, 'world_summon', args, 'carry_water');
    assert.equal(out.result.success, true); assert.equal(out.document.state.player.mp, 45);
    const pool = state(out.document, world, 'feature_hw_pool'), cup = state(out.document, world, 'feature_hw_cup');
    assert.equal(pool.waterMl, 29750); assert.equal(cup.waterMl, 250); assert.equal(pool.saltMg + cup.saltMg, 6000);
    assert.equal(cup.turbidity, 70); assert.equal(cup.pathogenRisk, 35); assert.equal(cup.saltMg, 50);
    await assert.rejects(run(out.document, 'world_summon', args, 'overfill'), /容量/);
    await assert.rejects(run(first.document, 'world_summon', { ...args, millilitres: 251 }, 'overpower'), /搬水量/);
    await assert.rejects(run(first.document, 'world_summon', { ...args, operation: 'attack' }, 'invent_attack'), /契约能力/);
    const privateWorld = structuredClone(world); privateWorld.locations.find(p => p.id === 'loc_hw_dock').features.find(f => f.id === 'feature_hw_cup').access = 'consent';
    privateWorld.locations.find(p => p.id === 'loc_hw_dock').features.find(f => f.id === 'feature_hw_cup').owner = 'npc_hw_linsui';
    const engine = new WorldEngine(privateWorld), c = structuredClone(first.document);
    await assert.rejects(engine.reduce(c, { tool: 'world_summon', args, eventId: 'no_permission' }), /授权/);
    c.state.records.permission = { category: 'authorization', subject: 'feature_hw_cup', action: 'environment_use', grantor: 'npc_hw_linsui', expires: c.state.minute + 2 };
    const expired = await engine.reduce(c, { tool: 'world_summon', args: { ...args, authorization: 'permission' }, eventId: 'expires_during_work' });
    assert.equal(expired.result.success, false); assert.match(expired.result.effectFailed, /授权/);
    assert.equal(state(applyPatches(c, expired.patches), world, 'feature_hw_pool').waterMl, 30000);
});

test('维持魔力耗尽或契约在搬运中到期，水仍在原处；主动解离不继续收费', async () => {
    const { world, document, spell, run } = await setup(), first = await sample(run, document, spell, true);
    const low = structuredClone(first.document); low.state.player.mp = 0;
    const failed = await run(low, 'world_summon', { operation: 'carry_water', summon: first.eventId, source: 'feature_hw_pool', destination: 'feature_hw_cup', millilitres: 250 }, 'no_upkeep');
    assert.equal(failed.result.success, false); assert.equal(state(failed.document, world, 'feature_hw_pool').waterMl, 30000);
    assert.equal(failed.document.state.records[first.result.contract].status, '维持魔力不足');
    const almost = (await run(first.document, 'world_time', { minutes: 26 }, 'near_expiry')).document;
    const expired = await run(almost, 'world_summon', { operation: 'carry_water', summon: first.eventId, source: 'feature_hw_pool', destination: 'feature_hw_cup', millilitres: 250 }, 'expire_during_work');
    assert.equal(expired.result.success, false); assert.equal(state(expired.document, world, 'feature_hw_cup').waterMl, 0);
    const dismissed = await run(first.document, 'world_summon', { operation: 'dismiss', summon: first.eventId }, 'dismiss');
    const waited = (await run(dismissed.document, 'world_time', { minutes: 60 }, 'after_dismiss')).document;
    assert.equal(waited.state.player.mp, 46); assert.equal(waited.state.records[first.result.contract].status, '和平解离');
});

test('多个召唤共享魔力按时间和编号稳定结算，分段等待与一次等待相同', async () => {
    const { document, spell, run } = await setup(), one = await sample(run, document, spell, true);
    let two;
    for (let i = 0; i < 100; i++) {
        const out = await run(one.document, 'world_cast', { spell: spell.id, target: 'player' }, `second_${i}`);
        if (out.result.success) { two = out.document; break; }
    }
    two.state.player.mp = 3;
    await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: 30 }), async total => {
        const full = (await run(two, 'world_time', { minutes: total }, 'full')).document;
        let split = structuredClone(two);
        for (let i = 0; i < total; i++) split = (await run(split, 'world_time', { minutes: 1 }, `part_${i}`)).document;
        assert.deepEqual(split.state.effects, full.state.effects); assert.deepEqual(split.state.records, full.state.records);
        assert.equal(split.state.player.mp, full.state.player.mp);
    }), { numRuns: 40 });
});

test('召唤名额、假目标和法术契约越界保持存档不变，失去维持能力即时结束', async () => {
    const { world, document, spell, run } = await setup();
    await assert.rejects(run(document, 'world_cast', { spell: spell.id, target: 'npc_hw_linsui' }, 'remote_spawn'), /当前位置/);
    // 按ID核对：法术目录每批追加后末项会变，召唤法术已在正式目录时不会被追加到末尾。
    const bad = structuredClone(world); bad.spells.find(row => row.id === spell.id).effectSpec.power = 251; assert.equal(validateWorld(bad).ok, false);
    const first = await sample(run, document, spell, true);
    const capped = structuredClone(first.document);
    for (let i = 0; i < 2; i++) capped.state.effects[`test_${i}`] = { ...capped.state.effects[first.eventId] };
    const before = structuredClone(capped);
    await assert.rejects(run(capped, 'world_cast', { spell: spell.id, target: 'player' }, 'over_capacity'), /名额/); assert.deepEqual(capped, before);
    const injured = await run(first.document, 'world_health', { delta: -first.document.state.player.hp }, 'unconscious');
    assert.equal(injured.document.state.records[first.result.contract].status, '失去维持能力');
    assert.equal(injured.document.state.effects[first.eventId], undefined);
});

test('召唤契约、维持费用和水量在存档重启、导入导出与删除消息回滚中守恒', async t => {
    const { engine, document, spell, run } = await setup(), sampleCast = await sample(run, document, spell, true);
    const directory = await fs.mkdtemp(path.join(tmpRoot(), 'fields-summon-test-'));
    t.after(async () => { const target = path.resolve(directory); if (!target.startsWith(path.resolve(tmpRoot()) + path.sep + 'fields-summon-test-')) throw new Error('临时目录边界错误'); await fs.rm(target, { recursive: true, force: true }); });
    const reducer = (c, input) => engine.reduce(c, input), store = new CampaignStorage(directory, { reducer });
    await store.create({ id: 'summons', worldVersion: worldVersion(engine), document });
    const request = { id: sampleCast.eventId, anchor: 'summoned', input: { tool: 'world_cast', args: { spell: spell.id, target: 'player' }, eventId: sampleCast.eventId } };
    await store.transact('summons', request, reducer);
    await store.transact('summons', { id: 'upkeep', anchor: 'waited', input: { tool: 'world_time', args: { minutes: 10 }, eventId: 'upkeep' } }, reducer);
    const view = await store.read('summons');
    assert.deepEqual((await new CampaignStorage(directory, { reducer }).read('summons')).document, view.document);
    assert.deepEqual((await store.import(await store.export('summons'), 'summons_copy')).document, view.document);
    const rewound = await store.reconcile('summons', ['summoned']); assert.deepEqual(rewound.document, sampleCast.document);
    assert.deepEqual((await store.reconcile('summons', [])).document, document);
});
function worldVersion(engine) { return engine.world.version; }

test('实际召唤唯一名称和契约编号可执行，错误编号不会被误报为没有契约', async () => {
    const { engine, world, document, spell, run } = await setup(), first = await sample(run, document, spell, true);
    assert.match(engine.scene(first.document, '役灵'), /有效召唤契约/);
    assert.ok(engine.scene(first.document, '役灵').includes(first.eventId));
    const args = { operation: 'carry_water', source: 'feature_hw_pool', destination: 'feature_hw_cup', millilitres: 250 };
    for (const summon of [spell.name, first.result.contract]) {
        const out = await run(first.document, 'world_summon', { ...args, summon }, 'named_carry');
        assert.equal(out.result.summon, first.eventId); assert.equal(state(out.document, world, 'feature_hw_cup').waterMl, 250);
    }
    const before = structuredClone(first.document);
    await assert.rejects(run(first.document, 'world_summon', { ...args, summon: '不存在的名字' }, 'bad_name'), /仍有有效契约/);
    assert.deepEqual(first.document, before);
});

test('同名多个实例不代选，过期和他人召唤不能借名称调用', async () => {
    const { document, spell, run } = await setup(), first = await sample(run, document, spell, true);
    const c = structuredClone(first.document), duplicate = 'second_summon';
    c.state.effects[duplicate] = { ...c.state.effects[first.eventId], contract: 'summon_contract:second_summon' };
    c.state.records['summon_contract:second_summon'] = { ...c.state.records[first.result.contract], effect: duplicate };
    const before = structuredClone(c);
    await assert.rejects(run(c, 'world_summon', { operation: 'dismiss', summon: spell.name }, 'ambiguous'), /不止一只/);
    assert.deepEqual(c, before);
    c.state.effects[duplicate].owner = 'npc_hw_linsui';
    const own = await run(c, 'world_summon', { operation: 'dismiss', summon: spell.name }, 'own_only');
    assert.equal(own.document.state.effects[first.eventId], undefined); assert.ok(own.document.state.effects[duplicate]);
    const expired = structuredClone(first.document); expired.state.minute = expired.state.effects[first.eventId].expires;
    await assert.rejects(run(expired, 'world_summon', { operation: 'dismiss', summon: spell.name }, 'expired'), /没有仍有效/);
});
