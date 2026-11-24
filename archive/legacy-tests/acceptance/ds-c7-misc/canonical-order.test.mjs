// 验收测试（出题方 haiku-test-c7，不参与写码与审卡）。
// 依据：卷一:643（摘要算法作用于排除后文档，规范序列化写在 kernel/storage.mjs，由测试钉住）；
//   storage.mjs 规范序列化规则 5：普通对象按键名 UTF-16 码元升序（这是 storage.mjs 文件内规则，卷文只引用该文件，出题方据此手算）。
// 测什么：两个键序不同、内容相同的对象，经规范序列化得到同一字串；经 primitives-runtime 公开入口 checkPrimitiveCatalog，
//   键序打乱的原语目录与原目录核对结论相同。
// 为什么修前会失败：这两条修前代码已绿（storage.mjs 与 primitives-runtime.mjs:364 的本地 canonical 都按键名排序）。
//   本卡修复的是 primitives-runtime.mjs 另抄的 canonical 并回 storage；卷文与 storage 注释没有规定它对非存档数据的行为，
//   出题方未找到可据以手算的红测试，故不造，只留作对照（见出题.md）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { canonical } from '../../../server-plugin/kernel/storage.mjs';
import { checkPrimitiveCatalog } from '../../../server-plugin/primitives-runtime.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('规范序列化：键序不同、内容相同的对象得到同一字串，且等于手算字面量', () => {
  const x = { b: 1, a: { d: 2, c: [1, { y: 0, x: -0 }] } };
  const y = { a: { c: [1, { x: 0, y: 0 }], d: 2 }, b: 1 };
  // 手算：键按升序，-0 写成 0，无空白。
  const want = '{"a":{"c":[1,{"x":0,"y":0}],"d":2},"b":1}';
  assert.equal(canonical(x), want);
  assert.equal(canonical(y), want);
});

function deepReverse(v) {
  if (Array.isArray(v)) return v.map(deepReverse);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).reverse().map((k) => [k, deepReverse(v[k])]));
  }
  return v;
}

test('原语目录核对：键序打乱的目录与原目录结论相同（经 checkPrimitiveCatalog）', () => {
  const doc = JSON.parse(readFileSync(join(ROOT, 'world', 'ontology', 'primitives.json'), 'utf8'));
  const shuffled = deepReverse(doc);
  const r1 = checkPrimitiveCatalog(doc);
  const r2 = checkPrimitiveCatalog(shuffled);
  assert.equal(r1.ok, true);
  assert.deepEqual(r2, r1);
});
