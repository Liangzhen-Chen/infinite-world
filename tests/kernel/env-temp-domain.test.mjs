// 补值卡 B（李白 11-19 18:1x ②）：环境温度域取真实极值——全局域 WMO 官方记录，各气候原型取实测极值；物态读法按它读出。
// 期望值按卷三乙 T-13 :1469 的区间公式对真实材料行的温度点手算，不读仓库当前计数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, engineOf } from './item-world.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { materialView, matterStatesOf } from '../../server-plugin/kernel/item.mjs';

const W = loadWorld(ROOT);
assert.ok(W.ok, JSON.stringify(W.errors));
const ENG = engineOf(W);

test('全局域 = WMO 记录页原文极值（Vostok −89.2、Furnace Creek 56.7）；已不在 unbuilt；每个气候原型的实测极值落在全局域内且 min < max', () => {
  assert.deepEqual(W.rules.climate.envTempDomain, { min: -89.2, max: 56.7 });
  assert.equal(W.rules.climate.unbuilt.includes('envTempDomain'), false);
  const protos = Object.entries(W.rules.climateProto);
  assert.ok(protos.length >= 1);
  for (const [id, p] of protos) {
    assert.ok(p.tempExtremeC.min < p.tempExtremeC.max, id);
    assert.ok(p.tempExtremeC.min >= W.rules.climate.envTempDomain.min && p.tempExtremeC.max <= W.rules.climate.envTempDomain.max, id);
  }
});

test('真实材料的可能物态集按 T-13 区间公式读出：水 [0,100] 固液；米酒 [−5,90] 固液；蜂蜡熔点 63 高于域上限只有固；橡木只有分解点则只有固；不再全读未知', () => {
  const states = (id) => {
    const d = materialView(ENG, {}, id).dims;
    return matterStatesOf({ melt: d.meltPoint, boil: d.boilPoint, decompose: d.decomposePoint }, W.rules.climate.envTempDomain);
  };
  const SOLID = 'matter_solid', LIQUID = 'matter_liquid';
  assert.deepEqual(states('mat_water'), [SOLID, LIQUID]);
  assert.deepEqual(states('mat_rice_wine'), [SOLID, LIQUID]);
  assert.deepEqual(states('mat_beeswax'), [SOLID]);
  assert.deepEqual(states('mat_oak'), [SOLID]);
  assert.deepEqual(states('mat_cast_iron'), [SOLID]);
});
