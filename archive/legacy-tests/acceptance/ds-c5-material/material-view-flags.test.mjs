// 验收测试（出题方：Claude Haiku 5.5，标识 haiku-test-c5；未参与写码与审卡）。
// 依据：卷三乙 :541（格材料标志 opaque、blocksSky、bearsLoad、airtight 只按格的材料逐格读，按格的当时物态取 solid、liquid、gas 栏，经 materialView 取有效值）；
//       卷三甲 :128–:131（四个标志都是 struct:byState<boolean>，三栏 always 必填；水的液栏为假、固栏（冰）为真；空气气栏四项皆假）；
//       卷三乙 :429（materialView 接受材料 id 等，返回值给材料 id 时为卷三甲手填维度）；卷五 :1307 请求②、卷二十 §4.7.3 第 8 条（读格标志的别卷）。
// 测什么（经公开入口 materialView 与格读口 gridView、视线读口 losView，不 import 内部函数）：
//   ① 同一材料三栏齐全：materialView 读到的 blocksSky、bearsLoad 对水各栏为固真、液假（卷三甲 :129–:130）；空气四项的气栏皆假。
//   ④ 一致性：格的 bearsLoad、losView 的挡点，与 materialView 读到的同一材料对应物态栏一致（花岗岩固栏真、空气的气栏假）。
// 诚实的缺口（记入出题.md）：卷三乙 :429 只规定 materialView 对实例与批次按当时物态取栏，对材料 id 返回整个三栏结构；
//   所以 ① 只断言三栏结构原样、各栏取值；"按物态取栏"的读数只能经格读口（④）检验，液态格的取栏卷文未给出可用的夹具格，本卷不造。
// 修前结果（实测，node --test）：①、④ 全部绿，作对照。本文件只读真实世界的材料行与格，修前已能读到这些值。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE, pos, fresh } from '../../kernel/perceive-world.mjs';
import { losView, LAYER } from '../../../server-plugin/sight.mjs';
import { gridView } from '../../../server-plugin/kernel/place.mjs';
import { materialView } from '../../../server-plugin/kernel/item.mjs';

// 与 sight.test.mjs 同一个夹具：南墙 (22,120,1) 是花岗岩实心墙，门洞 (23,120,1) 与屋内是空气。
const state = () => fresh({ npc_p: { pos: pos(50, 150), species: 'species_test_a' } }, 'npc_p');
const cellOf = (s, x, y, z) => gridView(ENGINE, s, { w: 0, cells: { x0: x, y0: y, z0: z, x1: x, y1: y, z1: z } }).cells[0];

test('① 三栏齐全：materialView 读水的 blocksSky、bearsLoad 为固真、液假（卷三甲 :129–:130 水的液栏为假、固栏（冰）为真）', () => {
  const s = state();
  const water = materialView(ENGINE, s, 'mat_water').dims;
  for (const dim of ['blocksSky', 'bearsLoad']) {
    assert.equal(water[dim].value.solid, true, `${dim}.solid`);
    assert.equal(water[dim].value.liquid, false, `${dim}.liquid`);
  }
});

test('① 三栏齐全：空气（气态）的四个标志气栏皆假（卷三甲 :128–:131 "空气为假"），且四项都有 solid、liquid、gas 三栏', () => {
  const s = state();
  const air = materialView(ENGINE, s, 'mat_air').dims;
  for (const dim of ['opaque', 'blocksSky', 'bearsLoad', 'airtight']) {
    assert.equal(air[dim].value.gas, false, `${dim}.gas`);
    assert.deepEqual(Object.keys(air[dim].value).sort(), ['gas', 'liquid', 'solid'], dim);
  }
});

test('④ 一致性（花岗岩墙）：格 (22,120,1) 的材料是花岗岩，其 bearsLoad 与 materialView(mat_granite) 的固栏一致（都为真）；视线经过它时挡住，且挡点就是这一格', () => {
  const s = state();
  const cell = cellOf(s, 22, 120, 1);
  assert.equal(cell.material, 'mat_granite');
  assert.equal(materialView(ENGINE, s, 'mat_granite').dims.bearsLoad.value.solid, true);
  assert.equal(cell.bearsLoad, true);
  assert.deepEqual(losView(ENGINE, s, pos(22, 122), pos(22, 117)), { clear: false, layer: LAYER.near, blockedAt: { w: 0, x: 22, y: 120, z: 1, coarse: false } });
});

test('④ 一致性（门洞空气）：格 (23,120,1) 是空气，其 bearsLoad 与 materialView(mat_air) 的气栏一致（都为假）；视线经门洞穿过时不挡', () => {
  const s = state();
  const cell = cellOf(s, 23, 120, 1);
  assert.equal(cell.material, 'mat_air');
  assert.equal(materialView(ENGINE, s, 'mat_air').dims.bearsLoad.value.gas, false);
  assert.equal(cell.bearsLoad, false);
  assert.deepEqual(losView(ENGINE, s, pos(23, 122), pos(23, 117)), { clear: true, layer: LAYER.near, blockedAt: null });
});
