// 餐口按物种代谢推导：公开聚落资料的最小 reader 与 WorldEngine 用同一份实体表；非人类聚落的餐口期望手推。
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {worldEntityRows} from '../server-plugin/world-entities.mjs';
import {settlementMouths,mealMouthsOf,farmTargetDays} from '../server-plugin/settlement-mouths.mjs';
import {settlementMouths as viaBody} from '../server-plugin/primitives-body.mjs';

test('实体表：worldEntityRows 与 WorldEngine.byId 是同一份（物种表不残缺）', async () => {
  const engine = new WorldEngine(structuredClone(await loadWorld()));
  assert.deepEqual([...new Set(worldEntityRows(engine.world).map(e => e.id))].sort(), [...engine.byId.keys()].sort());
  assert.ok((engine.world.monsters ?? []).length === 0 || worldEntityRows(engine.world).some(e => e.id === engine.world.monsters[0].id));
});

test('非人类聚落：餐口 = 人口 × 物种代谢加权（混合构成按人口占比），期望手推', () => {
  // 手推：聚落 10 人，全部是代谢系数 0.5 的物种（nature.metabolism.satiety = 0.5）→ 10 × 0.5 = 5 个餐口。
  // 混合：6 人系数 0.5、4 人系数 1 → 占比加权 (6×0.5 + 4×1) ÷ 10 = 0.7，10 人 → 7 个餐口。
  const world = {monsters: [{id: 'sp_slow', nature: {metabolism: {satiety: 0.5}}}, {id: 'sp_plain'}], npcs: [], locations: [], items: [], professions: [], skills: [], spells: [],
    settlementProfiles: [{id: 'all_slow', pendingSpeciesStructure: {sp_slow: {population: 10}}}, {id: 'mixed', pendingSpeciesStructure: {sp_slow: {population: 6}, sp_plain: {population: 4}}}, {id: 'human'}]};
  const engine = {world, rules: {}, byId: new Map(worldEntityRows(world).map(e => [e.id, e]))};
  assert.equal(settlementMouths(engine, {}, 'all_slow', 10), 5);
  assert.equal(settlementMouths(engine, {}, 'mixed', 10), 7);
  assert.equal(settlementMouths(engine, {}, 'human', 10), 10);   // 没有非 1 物种：餐口即人口
  assert.equal(mealMouthsOf(engine, {}, 'all_slow', 10, {levy: 4}), 5 * 6 / 10);   // 征走 4 人，剩 6 人按同一构成：5 × 6 ÷ 10 = 3
  // 若 reader 的 byId 缺物种表（旧的残缺写法），代谢系数全按 1，餐口算成 10：这正是要避免的差错。
  const crippled = {...engine, byId: new Map()};
  assert.equal(settlementMouths(crippled, {}, 'all_slow', 10), 10);
});

test('primitives-body 重新导出同一函数，farmTargetDays 距收获天数 + reserveDays 手推', () => {
  assert.equal(viaBody, settlementMouths);
  // 开局日 0：作物收获日 = sowDays[1] + growthDays = 25 + 180 = 205，距下次收获 205 天；reserveDays 90 → 295。第 205 日恰为收获日：0 + 90。
  const engine = {rules: {agriculture: {crop: {sowDays: [10, 25], growthDays: 180}}}};
  assert.equal(farmTargetDays(engine, 0, {reserveDays: 90}), 295);
  assert.equal(farmTargetDays(engine, 205 * 1440, {reserveDays: 90}), 90);
  assert.equal(farmTargetDays(engine, 206 * 1440, {reserveDays: 90}), 359 + 90);
});
