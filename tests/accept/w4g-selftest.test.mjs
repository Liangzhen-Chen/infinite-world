// B2-W4g 门禁自测（卷二 §7 S13 (d)，:2412 ④ 原句、:2413 上下文白名单；李白 11-18 13:05 裁定第 2 条）。
// 四类极性：typeof 结果比较不计；markers.mjs 已定义文法记号不计；未定义串仍计；`'x' in obj` 不计。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, readRegistry } from '../../tools/accept/read.mjs';
import { detect } from '../../tools/accept/detectors/typed_pos.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLS = Object.fromEntries(readRegistry(ROOT, 'scanclasses').map((r) => [r.scanClass, r]));

function count(src) {
  const files = new Map([['server-plugin/kernel/a.mjs', src]]);
  const ctx = loadContext(ROOT, { files: [...files.keys()], read: (p) => files.get(p) });
  return detect(ctx, { checks: ['bareCompare'], groups: ['kernel'] }, CLS.text_judge).length;
}

test('S13 (d) typeof 结果比较不计', () => {
  assert.equal(count("const b = typeof x === 'undefined';"), 0);
  assert.equal(count("const b = 'undefined' === typeof x;"), 0);
  assert.equal(count("const b = typeof (x.y) === 'object';"), 0);
  assert.equal(count("switch (typeof x) { case 'symbol': break; default: break; }"), 0);
  // 非 typeof 的同一字面量仍计：扫到 typeof 只豁免该操作数。
  assert.equal(count("const b = typeof x === 'undefined' && y === 'undefined';"), 1);
});

test('S13 (d) markers.mjs 已定义文法记号不计', () => {
  assert.equal(count("const b = x === 'number';"), 0); // TYPES
  assert.equal(count("const b = x !== 'eq';"), 0); // CODE_ENUMS.rx_cmp
  assert.equal(count("const b = ['number', 'string'].includes(x);"), 0); // 数组元素
});

test('S13 (d) markers.mjs 没定义的串仍计', () => {
  assert.equal(count("const b = x === 'zzz_not_marker';"), 1);
  assert.equal(count("switch (x) { case 'zzz_not_marker': break; default: break; }"), 1);
  assert.equal(count("const b = ['zzz_not_marker'].includes(x);"), 1);
});

test('S13 ④ 不含 `in`：左操作数为字面量键名的属性存在检查不计', () => {
  assert.equal(count("const r = e !== null && typeof e === 'object' && 'fields' in e;"), 0);
  assert.equal(count("if (!('code' in e)) return null;"), 0);
  // Map/Set 键与 === 仍在范围内。
  assert.equal(count("const v = m.get('zzz_not_marker');"), 1);
  assert.equal(count("const v = x === 'zzz_not_marker';"), 1);
});
