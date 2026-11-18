// B2-W4g 门禁自测（卷二 §7 S13 (d)，:2412 ④ 原句、:2413 上下文白名单；李白 11-18 13:05 裁定第 2 条）。
// 四类极性：typeof 结果比较不计（只认操作数本身）；markers.mjs 的 GRAMMAR_TOKENS 文法记号不计（协议标记裸写照计）；未定义串仍计；`'x' in obj` 不计。
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

test('S13 (d) 只豁免 markers.mjs 的文法记号定义源；协议标记裸写照计', () => {
  // 文法记号定义源 GRAMMAR_TOKENS 的成员不计：通配、路径分隔符、join 分隔串、JSON 文法记号。
  assert.equal(count("const b = s === '*';"), 0);
  assert.equal(count("const b = ['*', '.', '|'].includes(s);"), 0);
  assert.equal(count("const b = c === '\"' || c === '\\\\';"), 0);
  // TYPES 等协议标记不是文法记号，裸写仍计（这里曾是放宽的错误用例）。
  assert.equal(count("const b = x === 'number';"), 1);
  assert.equal(count("const b = x !== 'eq';"), 1);
  assert.equal(count("const b = ['number', 'string'].includes(x);"), 2); // 数组元素各计一条
});

test('S13 (d) typeof 只认操作数本身是 typeof 表达式', () => {
  assert.equal(count("const b = typeof x === 'undefined';"), 0);
  assert.equal(count("const b = 'undefined' === typeof x;"), 0);
  assert.equal(count("const b = (typeof x) === 'object';"), 0);
  assert.equal(count("const b = typeof x !== 'number';"), 0);
  // 操作数里别处出现 typeof 不算：下标、条件表达式不是 typeof 结果比较。
  assert.equal(count("const b = a[typeof x] === 'zzz_not_marker';"), 1);
  assert.equal(count("if (typeof x) y === 'zzz_not_marker';"), 1);
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
