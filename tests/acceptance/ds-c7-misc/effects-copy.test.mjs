// 验收测试（出题方 haiku-test-c7，不参与写码与审卡）。
// 依据：卷二 §2.9 第 1 条"专用项"（卷二:1080）：深拷贝只经 kernelApi clone（kernel/clone.mjs，structuredClone），其余文件不自抄深拷贝；
//   卷二:1482（§3.9 effects 输出"声明字段原样 + RX 求值"）。
// 测什么：经效果公开入口 effects（kernel/effects.mjs 导出）返回的输出，与加载结果里的原值互不影响：
//   改副本的嵌套对象与数组，原族行不变；返回的输出与声明字段逐项相等。
// 为什么修前会失败：这两条修前代码已绿。修前 effects.mjs:15 的 copy 用 JSON.parse(JSON.stringify)，对 JSON 数据是真深拷贝，
//   卷文对 undefined、BigInt 等在深拷贝中的取法没有规定（出题方查过卷二 §2.9，未找到），故本卡不为它造红测试，只留作对照。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effects } from '../../../server-plugin/kernel/effects.mjs';

const FAM = 'fam_probe';

// 手造最小效果族：一个无参数、一个输出、输出声明字段含嵌套对象与数组（非 RX 键）。
function makeEngine() {
  const row = {
    params: {},
    outputs: [{ kind: 'probe', meta: { a: { b: [1, 2] }, list: [{ n: 1 }] } }],
  };
  const trees = { nsRefs: new Set(), magnitude: undefined, outputs: [{ values: {} }] };
  return { row, engine: { effects: { rows: new Map([[FAM, row]]), rx: new Map([[FAM, trees]]) } } };
}

test('效果输出：声明字段原样返回（嵌套对象与数组，期望按声明手算）', () => {
  const { engine } = makeEngine();
  const out = effects(engine, null, FAM, {});
  assert.deepEqual(out, [{ kind: 'probe', meta: { a: { b: [1, 2] }, list: [{ n: 1 }] } }]);
});

test('效果输出：改返回副本的嵌套对象与数组，不改加载结果里的原值', () => {
  const { row, engine } = makeEngine();
  const out = effects(engine, null, FAM, {});
  assert.notEqual(out[0].meta, row.outputs[0].meta);
  out[0].meta.a.b.push(9);
  out[0].meta.list[0].n = 7;
  assert.deepEqual(row.outputs[0].meta, { a: { b: [1, 2] }, list: [{ n: 1 }] });
  // 再求一次仍是原值（原值未被副本污染）。
  const again = effects(engine, null, FAM, {});
  assert.deepEqual(again, [{ kind: 'probe', meta: { a: { b: [1, 2] }, list: [{ n: 1 }] } }]);
});
