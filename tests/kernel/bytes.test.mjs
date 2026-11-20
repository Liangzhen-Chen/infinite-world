// 块 6 第 6-20 张修改轮 ⑦：kernel 自带的 base64 与 UTF-8 编解码（卷二 :1047：kernel 用自带码表逐字节查表，不用 Buffer）。
// 期望值按 RFC 4648（base64）、RFC 3629（UTF-8）的标准向量手算成字面量；常数来自规则表 kernelConstants（经 loadWorld 装入）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { base64ToBytes, utf8ToText, utf8Length, installByteConstants } from '../../server-plugin/kernel/bytes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);

test('base64ToBytes：标准向量（RFC 4648 §10 与 "hi"），填充 0、1、2 个', () => {
  assert.deepEqual(base64ToBytes(''), []);
  assert.deepEqual(base64ToBytes('TQ=='), [77]);
  assert.deepEqual(base64ToBytes('TWE='), [77, 97]);
  assert.deepEqual(base64ToBytes('TWFu'), [77, 97, 110]);
  assert.deepEqual(base64ToBytes('aGk='), [104, 105]);
  assert.deepEqual(base64ToBytes('+/+/'), [251, 255, 191]);
  assert.deepEqual(base64ToBytes('AAAA'), [0, 0, 0]);
});

test('base64ToBytes 严格：非法字符、填充个数不对、填充在中间、长度不合、末位带非零残位、空白、URL 安全字母表、非字串都拒（null）', () => {
  for (const bad of ['TQ=', 'TQ', 'T', 'TQ===', 'TWFu=', 'TQ==TQ==', 'TR==', 'TWF=', 'T!==', 'TW Fu', 'TW\nFu', '-_-_', '=', '====', 'TQ=A']) assert.equal(base64ToBytes(bad), null, JSON.stringify(bad));
  for (const bad of [null, undefined, 5, [], {}]) assert.equal(base64ToBytes(bad), null);
});

test('utf8ToText：1、2、3、4 字节序列（标准向量）与边界码点', () => {
  assert.equal(utf8ToText([]), '');
  assert.equal(utf8ToText([104, 105]), 'hi');
  assert.equal(utf8ToText([0xC3, 0xA9]), 'é');
  assert.equal(utf8ToText([0xE4, 0xB8, 0xAD]), '中');
  assert.equal(utf8ToText([0xF0, 0x9F, 0x98, 0x80]), '\u{1F600}');
  assert.equal(utf8ToText([0xC2, 0x80]), '\u0080');
  assert.equal(utf8ToText([0xDF, 0xBF]), '߿');
  assert.equal(utf8ToText([0xE0, 0xA0, 0x80]), 'ࠀ');
  assert.equal(utf8ToText([0xEF, 0xBF, 0xBF]), '￿');
  assert.equal(utf8ToText([0xF0, 0x90, 0x80, 0x80]), '\u{10000}');
  assert.equal(utf8ToText([0xF4, 0x8F, 0xBF, 0xBF]), '\u{10FFFF}');
});

test('utf8ToText 严格：过长编码、代理区、超 U+10FFFF、截断、孤立续字节、非法首字节、坏续字节都拒（null）', () => {
  const bad = [[0xC0, 0x80], [0xC1, 0xBF], [0xE0, 0x80, 0x80], [0xE0, 0x9F, 0xBF], [0xF0, 0x80, 0x80, 0x80], [0xED, 0xA0, 0x80], [0xED, 0xBF, 0xBF],
    [0xF4, 0x90, 0x80, 0x80], [0xF5, 0x80, 0x80, 0x80], [0xC3], [0xE4, 0xB8], [0xF0, 0x9F, 0x98], [0x80], [0xBF], [0xFF], [0xF8, 0x88, 0x80, 0x80, 0x80],
    [0xC3, 0x28], [0xE4, 0x28, 0xAD], [0x68, 0x80]];
  for (const b of bad) assert.equal(utf8ToText(b), null, JSON.stringify(b));
});

test('utf8Length：按 UTF-8 字节数计（1、2、3 字节与代理对 4 字节）', () => {
  assert.equal(utf8Length(''), 0);
  assert.equal(utf8Length('abc'), 3);
  assert.equal(utf8Length('é'), 2);
  assert.equal(utf8Length('中'), 3);
  assert.equal(utf8Length('\u{1F600}'), 4);
  assert.equal(utf8Length('中文a'), 7);
  assert.equal(utf8Length('߿ࠀ'), 5);
});

test('installByteConstants：缺键、非正整数、列表项不合即 E-DIM-STRUCT-FIELD', () => {
  const ok = W.rules.kernelConstants;
  const codeIs = (e) => e.code === 'E-DIM-STRUCT-FIELD';
  assert.throws(() => installByteConstants({}), codeIs);
  assert.throws(() => installByteConstants({ ...ok, byteRadix: 0 }), codeIs);
  assert.throws(() => installByteConstants({ ...ok, base64GroupChars: 1.5 }), codeIs);
  assert.throws(() => installByteConstants({ ...ok, utf8LeadBases: 'x' }), codeIs);
  assert.throws(() => installByteConstants({ ...ok, utf8MinCodePoint: [128, 0, 65536] }), codeIs);
  // 登记的进制必须等于码表长度（64）：63、65 都拒。
  assert.throws(() => installByteConstants({ ...ok, base64Radix: 63 }), codeIs);
  assert.throws(() => installByteConstants({ ...ok, base64Radix: 65 }), codeIs);
  installByteConstants(ok);
});
