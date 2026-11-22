// 世界创建步骤表（规则表 rules.gen.createSteps，李白 11-22 18:36 P-29）在真实世界规则上的核对：表里的步骤都有默认模块，依赖检查通过；
// 把资产挪到统治之前（读者排在写者前）被依赖检查拦下，不靠测试里另写一份次序。不跑生成（真实世界整段跑见 tests/cloud/world-create-hw.test.mjs）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { checkCreateSteps, fillChannels, DEFAULT_MODULES } from '../../server-plugin/world-create.mjs';
import { ROOT } from './polity-world.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { installEventLog } from '../../server-plugin/kernel/events.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { installHoldingEngine } from '../../server-plugin/kernel/holdings.mjs';
import { balance } from '../../server-plugin/kernel/ledger.mjs';
import { applyGovernorCalls } from '../../server-plugin/kernel/gen/holdcalls.mjs';
import { VIA } from '../../server-plugin/kernel/gen/holdings-open.mjs';

useReportSink(() => {});
const W = loadWorld(ROOT);
assert.equal(W.ok, true, W.text);
installVocab({ vocab: W.vocab, idIndex: W.idIndex, tables: W.tables });
const ENGINE = { vocab: W.vocab, rules: W.rules, units: W.env.units, tables: W.tables, template: { seed: 'create_rules_seed' } };
const CTX = { node: 'test_world_create_rules', file: 'tests/kernel/world-create-rules.test.mjs' };
const HW = JSON.parse(readFileSync(join(ROOT, 'world/design/opening-polity-hw.json'), 'utf8')).governs.find((g) => g.place === 'loc_hw'); // 河湾村站点归河湾村村社
const STEPS = W.rules.gen.createSteps;
const EXTERNAL = ['world', 'geo', 'genViews', 'roster'];

test('真实规则表：四步按 fill、governors、assets、people 排，每步都有默认模块，依赖检查通过', () => {
  assert.deepEqual(STEPS.map((s) => s.step), ['fill', 'governors', 'assets', 'people']);
  assert.deepEqual(checkCreateSteps(STEPS, EXTERNAL, DEFAULT_MODULES), STEPS);
});

test('真实规则表：把资产挪到统治之前被拦下（E-GEN-STAGE-CYCLE）；把统治挪到 fill 之前也被拦下；人物独立，可排到最前', () => {
  const by = Object.fromEntries(STEPS.map((s) => [s.step, s]));
  assert.throws(() => checkCreateSteps([by.fill, by.assets, by.governors, by.people], EXTERNAL, DEFAULT_MODULES), (e) => e.code === 'E-GEN-STAGE-CYCLE' && e.message.includes('assets reads edge.governor'));
  assert.throws(() => checkCreateSteps([by.governors, by.fill, by.assets, by.people], EXTERNAL, DEFAULT_MODULES), (e) => e.code === 'E-GEN-STAGE-CYCLE' && e.message.includes('governors reads fill.calls'));
  assert.deepEqual(checkCreateSteps([by.people, by.fill, by.governors, by.assets], EXTERNAL, DEFAULT_MODULES).map((s) => s.step), ['people', 'fill', 'governors', 'assets']);
});

test('fill 一步不丢产出：generateFill 交出的每一项都是步骤表里 fill 声明的 writes 通道，值原样（同一引用）', () => {
  // generateFill 返回的键（worldgen.mjs 末行）：plan、generated、created、calls、assets、assetGaps、pending、deferred、report。
  const r = { plan: [], generated: { a: 1 }, created: { org: {} }, calls: [1], assets: [2], assetGaps: [3], pending: [4], deferred: [5], report: { changed: 0 } };
  const out = fillChannels(r);
  assert.deepEqual(Object.keys(out).sort(), [...STEPS[0].writes].sort());
  for (const k of Object.keys(r)) assert.equal(out[`fill.${k}`], r[k], k);
});

// 资产一步真读统治的结果，按地点判（真实世界规则与真实地点表）：状态里只有 loc_hw 一条统治边（河湾村村社）。
// 归属经 authorPlaceGovernor（作者 owner 是地点）得来的建筑，其作者地点在状态里读到的统治组织必须就是推出的 owner。
const governedState = () => {
  installHoldingEngine(ENGINE);
  installEventLog({ entries: [] });
  const state = { clock: { minute: 0, seq: 0 } };
  assert.deepEqual(runTransaction(state, CTX, (s) => { assert.equal(applyGovernorCalls(ENGINE, s, [{ place: HW.place, org: HW.org, cause: HW.cause }]).skipped.length, 0); }), { ok: true });
  return state;
};
const runAssets = (state, genViews, entries, governor) => runTransaction(state, CTX, (s) => {
  DEFAULT_MODULES.assets({ engine: ENGINE, state: s, template: { worldSeed: 'x', genesisMinute: 0 }, channels: { 'fill.assets': entries, 'edge.governor': governor, genViews } });
});
const RES = { kind: 'res_building_share', key: '' };

test('资产按地点判：同一组织在 A 地（loc_hw）写下了边、在 B 地（loc_capital）被跳过，B 地的作者归属被拒、整笔回滚，账上没有', () => {
  const state = governedState();
  const governor = { written: [{ place: 'loc_hw', org: HW.org, edge: 'e' }], skipped: [{ place: 'loc_capital', org: HW.org, reason: 'ineligible' }] };
  const entries = [{ building: 'bld_hw_mill', owner: HW.org, via: VIA.authorPlaceGovernor }];
  assert.deepEqual(runAssets(state, { ownerOf: () => 'loc_capital' }, entries, governor), { ok: false, code: 'E-GEN-ROW-INVALID' });
  assert.equal(balance(ENGINE, state, HW.org, { ...RES, key: 'bld_hw_mill' }, W.rules.polity.rolesPurposes.general), 0);
  assert.deepEqual(runAssets(state, {}, entries, governor), { ok: false, code: 'E-GEN-ROW-INVALID' }); // 没交 ownerOf：认不出作者地点，同样拒，不放行
});

test('资产按地点判：作者地点自己有边（loc_hw），或沿包含树继承到同一组织（作者地点取建筑本身，其祖先 loc_hw 有边）时放行并入账；不经统治组织得来的归属（tenureCommon）不受此判', () => {
  const governor = { written: [{ place: 'loc_hw', org: HW.org, edge: 'e' }], skipped: [] };
  for (const ownerOf of [() => 'loc_hw', (b) => b]) {
    const state = governedState();
    assert.deepEqual(runAssets(state, { ownerOf }, [{ building: 'bld_hw_mill', owner: HW.org, via: VIA.authorPlaceGovernor }], governor), { ok: true });
    assert.equal(balance(ENGINE, state, HW.org, { ...RES, key: 'bld_hw_mill' }, W.rules.polity.rolesPurposes.general), 10000);
  }
  const state = governedState();
  assert.deepEqual(runAssets(state, { ownerOf: () => 'loc_capital' }, [{ building: 'bld_hw_altar', owner: HW.org, via: VIA.tenureCommon }], governor), { ok: true });
  assert.equal(balance(ENGINE, state, HW.org, { ...RES, key: 'bld_hw_altar' }, W.rules.polity.rolesPurposes.general), 10000);
});

test('真实规则表：缺外部输入 roster 时，人物一步被拦下', () => {
  assert.throws(() => checkCreateSteps(STEPS, ['world', 'geo', 'genViews'], DEFAULT_MODULES), (e) => e.code === 'E-GEN-STAGE-CYCLE' && e.message.includes('people reads roster'));
});
