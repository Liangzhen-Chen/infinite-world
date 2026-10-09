import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import * as core from '../extension/core.js';
const seed = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/legacy/seed.json', import.meta.url)));
const fresh = () => core.createCampaign(seed);
const action = (id, fields = {}) => ({ transaction_id: id, reason: '回归夹具', ...fields });

test('E1 战役重放使用自己的初始快照，世界种子改变不能改旧档', () => {
    const c = fresh();
    core.commit(c, action('old'), 'a');
    const changed = structuredClone(seed); changed.state.settlement.food = 100;
    const rebuilt = core.restoreToAnchors(changed, c.journal, new Set(['a']), c);
    assert.equal(rebuilt.state.settlement.food, 420);
});

async function browserRuntime(c) {
    const listeners = new Map();
    let stopped = false;
    const context = { characters: [{ name: '无限原野·世界主持人' }], characterId: 0,
        chatMetadata: { infinite_fields: c }, chat: [{ is_user: true, mes: '修改后的意图', extra: { fields_anchor: 'latest' } }],
        registerFunctionTool() {}, setExtensionPrompt() {}, saveChat: async () => {},
        stopGeneration: () => { stopped = true; },
        eventTypes: new Proxy({}, { get: (_, key) => key }), eventSource: { on: (key, fn) => listeners.set(key, fn) } };
    let source = fs.readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
    source = source.replace(/^import .*;\r?\n/gm, '').replace(/^const seed = .*;\r?\n/m, 'const seed = fixtureSeed;\n');
    const doc = { querySelector: () => ({ textContent: '', remove() {} }) };
    const window = {};
    const runner = new (Object.getPrototypeOf(async function(){}).constructor)(
        'getContext', ...Object.keys(core), 'fixtureSeed', 'document', 'window', source + '\nreturn {reconcile,onDeleted};');
    const runtime = await runner(() => context, ...Object.values(core), seed, doc, window);
    return { ...runtime, context, listeners, stopped: () => stopped };
}
test('E2 重放失败必须停止生成，不能带着旧事件继续', async () => {
    const c = fresh();
    core.commit(c, action('past', { player: { coins_delta: -170 } }), 'keep');
    c.journal[0].action.player.coins_delta = -1000;
    const runtime = await browserRuntime(c);
    runtime.context.chat.unshift({ is_user: true, extra: { fields_anchor: 'keep' } });
    await runtime.reconcile('regenerate', {}, false).catch(() => {});
    assert.equal(runtime.stopped(), true, '回放错误必须调用停止生成并进入修复状态');
});
test('E3 单次提交不能复制整个事件日志和交易历史', () => {
    const c = fresh();
    c.journal = Array.from({ length: 1000 }, (_, i) => ({ sequence: i, padding: 'x'.repeat(100) }));
    const original = globalThis.structuredClone; let copiedHistory = false;
    globalThis.structuredClone = value => { if (value?.journal === c.journal) copiedHistory = true; return original(value); };
    try { core.commit(c, action('new')); } finally { globalThis.structuredClone = original; }
    assert.equal(copiedHistory, false);
});
test('E4 有关系的 NPC 不能全部无预算注入', () => {
    const c = fresh();
    for (let i = 0; i < 40; i++) c.state.npcs[`远方居民${i}`] = { trust: 1, affection: 1, notes: '远方生活细节'.repeat(150) };
    assert.ok(core.promptFor(c, [{ is_user: true, mes: '我看看林穗' }]).length <= 16000);
});
test('E5 致命伤害钳制到零，溢出治疗钳制到上限，MP 不足原因明确', () => {
    const c = fresh();
    core.commit(c, action('damage', { player: { hp_delta: -20 } }));
    assert.equal(c.state.player.hp, 0);
    assert.ok(['濒死', '死亡'].includes(c.state.player.status));
    core.commit(c, action('heal', { player: { hp_delta: 999 } }));
    assert.equal(c.state.player.hp, c.state.player.maxHp);
    const d = fresh(); d.state.player.mp = 0;
    assert.throws(() => core.cast(d, { transaction_id: 'no-mp', spell: '照明术', target: '木杖' }), /魔力不足/);
});
test('E6 模型不能不引用来源直接登记毁城法术', () => {
    assert.throws(() => core.commit(fresh(), action('meteor', { spells: [{ name: '陨石术', mp: 1, effect: '摧毁一座城' }] })), /来源|学习|禁止|不能/);
});
test('E7 未突破熟练度停在299', () => {
    const c = fresh(); c.state.skills.照明术.proficiency = 290;
    core.commit(c, action('practice', { skills: [{ name: '照明术', gain: 100 }] }));
    assert.equal(c.state.skills.照明术.proficiency, 299);
});
test('E8 称呼解析到同一 NPC，未知称呼拒绝，不能静默新建', () => {
    const c = fresh(), count = Object.keys(c.state.npcs).length;
    core.commit(c, action('alias', { relationships: [{ name: '林穗姐', trust_delta: 5 }] }));
    assert.equal(Object.keys(c.state.npcs).length, count);
    assert.equal(c.state.npcs.林穗.trust, 5);
    assert.throws(() => core.commit(c, action('unknown', { relationships: [{ name: '不存在的路人' }] })));
});
test('E9 不允许覆盖基础人设', () => {
    const c = fresh(), before = c.state.npcs.林穗.notes;
    try { core.commit(c, action('overwrite', { relationships: [{ name: '林穗', notes: '林穗是一名刺客。' }] })); } catch {}
    assert.equal(c.state.npcs.林穗.notes, before);
});
test('E10 没有路线与耗时不能瞬移', () => {
    const c = fresh(), before = c.state.location;
    assert.throws(() => core.commit(c, action('teleport', { location: '王都' })), /路线|移动|瞬移/);
    assert.equal(c.state.location, before);
});
test('E11 普通对话即使没有显式分钟也推进时间', () => {
    const c = fresh(), before = c.state.minute;
    core.commit(c, action('conversation'));
    assert.ok(c.state.minute - before >= 5 && c.state.minute - before <= 20);
});
test('E12 多聚落分别日结，缺粮有饥饿后果而不只累计缺口', () => {
    const c = fresh();
    c.state.settlements = { loc_second: { ...structuredClone(c.state.settlement), name: '第二村', food: 0, foodPerDay: 0 } };
    core.commit(c, action('day', { minutes: 1440 }));
    assert.ok(c.state.settlements.loc_second.starvation > 0);
    assert.ok(Object.keys(c.state.buildings ?? {}).length > 0);
});
test('E13 幂等签名与对象键序无关', () => {
    const c = fresh(); core.commit(c, action('same', { player: { coins_delta: -6 } }));
    const duplicate = core.commit(c, { player: { coins_delta: -6 }, reason: '回归夹具', transaction_id: 'same' });
    assert.equal(duplicate.duplicate, true); assert.equal(c.state.player.coins, 174);
});
test('E14 检定由属性与技能计算修正，并有成功程度', () => {
    const c = fresh(); c.state.player.attributes = { 力量: 18 }; c.state.skills.木工 = { proficiency: 450 };
    const result = core.roll(c, { check_id: 'check', purpose: '木工作业', attribute: '力量', skill: '木工', difficulty: 15 }, () => 0.5);
    assert.equal(result.modifier, 7); assert.ok(result.degree);
});
test('E15 施法不生成永久记录，且增长熟练度', () => {
    const c = fresh(), before = c.state.skills.照明术.proficiency;
    core.cast(c, { transaction_id: 'light', spell: '照明术', target: '木杖' });
    assert.equal(Object.values(c.state.records).filter(v => v.category === 'world_event').length, 0);
    assert.ok(c.state.skills.照明术.proficiency > before);
});
test('E16 同一聊天再次刷新不能重新读取和切词全部原文', () => {
    const c = fresh(); let reads = 0;
    const chat = Array.from({ length: 200 }, () => ({ is_user: true, get mes() { reads++; return '我在河边散步'; } }));
    core.promptFor(c, chat); reads = 0; core.promptFor(c, chat);
    assert.ok(reads < 20, `重复读取了${reads}次消息正文`);
});
test('E17 物品别名同一编号，包含品质耐久重量', () => {
    const c = fresh();
    core.commit(c, action('bread', { items: [{ item: '面包', delta: 1 }, { item: '热面包', delta: 1 }] }));
    assert.equal(c.state.inventory.item_bread?.quantity, 2);
    assert.ok(c.state.inventory.item_bread?.quality);
    assert.ok(c.state.inventory.item_bread?.weight > 0);
    assert.ok(Number.isFinite(c.state.inventory.item_bread?.durability));
});
test('E18 职业必须在目录内并完成认证', () => {
    assert.throws(() => core.commit(fresh(), action('career', { professions: { combat: '宇宙毁灭者' } })), /职业|认证/);
    assert.throws(() => core.commit(fresh(), action('unlicensed', { professions: { combat: '法师' } })), /认证|导师|条件/);
});
test('E19 编辑玩家消息触发对账', async () => {
    const runtime = await browserRuntime(fresh());
    assert.equal(typeof runtime.listeners.get('MESSAGE_EDITED'), 'function');
});

for (const [id, query] of [['M3a', '那本账本'], ['M3b', '她的帐本'], ['M3c', '我能用灶台吗'], ['M3d', '老板娘答应过我什么']]) {
    test(`${id} 检索“${query}”找回厨房许可而不是系统用语`, () => {
        const c = fresh();
        core.addMemory(c, { subject: '林穗', key: '厨房许可', content: '第三天玩家帮林穗找回遗失的账簿，她允许玩家借用酒馆厨房', keywords: [] });
        assert.ok(core.search(c, [], query).some(v => v.text.includes('借用酒馆厨房')));
    });
}
