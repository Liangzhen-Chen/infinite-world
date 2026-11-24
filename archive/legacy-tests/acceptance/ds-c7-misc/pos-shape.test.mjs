// 验收测试（出题方 haiku-test-c7，不参与写码与审卡）。
// 依据：卷二:253（struct:pos = {w, x, y, z: integer:count, coarse: boolean}，五键恰为此集）；卷二:190（struct 校验递归，违者 E-DIM-STRUCT-FIELD）。
//   多余键拒收：卷文没有一句明说 struct:pos，按 struct 的字段表即键集推出（出题方记为推出，见出题.md）。
// 测什么：经感知公开入口 perceive 与视线公开入口 losView 传入 pos 形状的五类值（合法、缺字段、整数类型错、布尔类型错、多余键），
//   接受或拒绝结论照卷二:253；两入口结论与 kernel named-structs.mjs 的 isPosValue 结论一致。
//   判据：入口在读引擎之前以 E-DIM-STRUCT-FIELD 拒收，才算形状拒收（传入的 engine、state 是读即抛 ENGINE_TOUCHED 的陷阱对象）；
// 为什么修前会失败：修前 perceive.mjs:43 手写 isPos，只查四个整数与 coarse 布尔，不核多余键，
//   带 tag 的多余键值在入口即被放行、读引擎（抛 ENGINE_TOUCHED），perceive 多余键测试在修前为红。
//   sight.mjs:43 的 losView 同样手写 isPos、不核多余键，但其 losView 多余键测试在修前为绿：入口之后 regionOf 调 place.mjs requirePos，
//   经 isPosValue 以 E-DIM-STRUCT-FIELD 拒收，入口对外行为已照卷文；这是 R8 违例的结构问题（入口不自核），测试不因结构问题而红，留作对照（见出题.md）。
//   其余四类在修前已与卷文一致，为绿（对照）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../../server-plugin/kernel/load/world.mjs';
import { E } from '../../../server-plugin/kernel/handles/generated.mjs';
import { isPosValue } from '../../../server-plugin/kernel/named-structs.mjs';
import { perceive } from '../../../server-plugin/perceive.mjs';
import { losView } from '../../../server-plugin/sight.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);

// 期望值按卷二:253 手算成字面量，不读仓库当前读数。
const CASES = [
  { name: '合法五键', pos: { w: 0, x: 1, y: 2, z: 3, coarse: true }, accept: true },
  { name: '缺 coarse', pos: { w: 0, x: 1, y: 2, z: 3 }, accept: false },
  { name: 'z 为小数 3.5（integer 不合）', pos: { w: 0, x: 1, y: 2, z: 3.5, coarse: true }, accept: false },
  { name: 'coarse 为字串（boolean 不合）', pos: { w: 0, x: 1, y: 2, z: 3, coarse: 'yes' }, accept: false },
  { name: '多余键 tag', pos: { w: 0, x: 1, y: 2, z: 3, coarse: true, tag: 4 }, accept: false },
];

// 引擎陷阱：入口若在形状核对之前读引擎，就抛 ENGINE_TOUCHED；入口自己的形状核对必须先于读引擎。
const ENGINE_TOUCHED = 'ENGINE_TOUCHED';
const trap = () => new Proxy({}, { get() { throw new Error(ENGINE_TOUCHED); }, has() { throw new Error(ENGINE_TOUCHED); } });

// 形状拒收：入口在读引擎之前抛出 E-DIM-STRUCT-FIELD 即为真（不借下游 place 层的核对来拒收）。
function shapeRejected(fn) {
  try {
    fn();
  } catch (e) {
    return e.code === E.E_DIM_STRUCT_FIELD && !String(e.message).includes(ENGINE_TOUCHED);
  }
  return false;
}

assert.equal(typeof E.E_DIM_STRUCT_FIELD, 'string');

for (const c of CASES) {
  test(`位置值形状 perceive 入口：${c.name} 照卷二:253 ${c.accept ? '接受' : '拒收'}`, () => {
    const rejected = shapeRejected(() => perceive(trap(), trap(), 'obs', { channel: 'sight', sourcePos: c.pos }));
    assert.equal(rejected, !c.accept);
  });

  test(`位置值形状 losView 入口：${c.name} 照卷二:253 ${c.accept ? '接受' : '拒收'}`, () => {
    const rejected = shapeRejected(() => losView(trap(), trap(), c.pos, c.pos));
    assert.equal(rejected, !c.accept);
  });

  test(`位置值形状 isPosValue 与两入口一致：${c.name}`, () => {
    assert.equal(isPosValue(c.pos), c.accept);
  });
}
