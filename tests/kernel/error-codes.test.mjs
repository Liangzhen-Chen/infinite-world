// 块 2-1 只核遗留：错误码机读登记 kernel/error-codes.mjs，及句柄 E、errorCodeOf 读它（卷二 §1.9 :282、§4.2 :1506、§4.3；卷十二 R12-5.7 :792）。
// 条数、成员名与值、出处全是按卷文手写的字面量，不用被测函数算期望值。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES, REGISTERED_CODES, ERROR_CODE_RE } from '../../server-plugin/kernel/error-codes.mjs';
import { installHandles, buildE, E } from '../../server-plugin/kernel/handles/generated.mjs';
import { errorCodeOf, CODE_RE } from '../../server-plugin/kernel/handles/vocab-handle.mjs';
import { CODE_RE as TYPES_CODE_RE } from '../../server-plugin/kernel/validate/types.mjs';

const rejects = (fn, code) => assert.throws(fn, (e) => e.code === code && e.message.startsWith(code));
const codes = ERROR_CODES.map((e) => e.code);

test('码表条数：E 与 W 各为手数的字面量', () => {
  assert.equal(codes.length, 572);
  assert.equal(codes.filter((c) => c[0] === 'E').length, 555);
  assert.equal(codes.filter((c) => c[0] === 'W').length, 17);
  assert.equal(REGISTERED_CODES.size, codes.length);
});

test('码表冻结、按 code 排序、无重复、每码合 §4.2 文法、每项都有出处', () => {
  assert.ok(Object.isFrozen(ERROR_CODES));
  for (const e of ERROR_CODES) {
    assert.ok(Object.isFrozen(e) && Object.isFrozen(e.sources), e.code);
    assert.ok(ERROR_CODE_RE.test(e.code), e.code);
    assert.ok(e.sources.length >= 1 && e.sources.every((s) => typeof s === 'string' && s.startsWith('卷')), e.code);
    assert.equal(new Set(e.sources).size, e.sources.length, e.code);
    assert.deepEqual(Object.keys(e), ['code', 'sources']);
  }
  assert.deepEqual(codes, [...codes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  assert.equal(new Set(codes).size, codes.length);
  assert.throws(() => { ERROR_CODES.push({}); }, TypeError);
});

test('抽 6 个跨卷码：E 成员名与值、出处', () => {
  installHandles({ vocab: { families: new Map(), index: new Map() }, decl: {} });
  assert.equal(E.E_WRITER_DUPLICATE, 'E-WRITER-DUPLICATE');
  assert.equal(E.E_PHASE_DUPLICATE, 'E-PHASE-DUPLICATE');
  assert.equal(E.E_ACC_REQUIRED_TEST, 'E-ACC-REQUIRED-TEST');
  assert.equal(E.E_CBT_ROUND, 'E-CBT-ROUND');
  assert.equal(E.E_FAITH_LAYER, 'E-FAITH-LAYER');
  assert.equal(E.E_SAVE_TORN, 'E-SAVE-TORN');
  const src = (c) => ERROR_CODES.find((e) => e.code === c).sources;
  assert.deepEqual(src('E-WRITER-DUPLICATE'), ['卷二 §4.3']);
  assert.deepEqual(src('E-PHASE-DUPLICATE'), ['卷二 §4.3']);
  assert.deepEqual(src('E-ACC-REQUIRED-TEST'), ['卷二 §4.3', '卷十二 §2.12']);
  assert.deepEqual(src('E-CBT-ROUND'), ['卷十三 §2.9']);
  assert.deepEqual(src('E-FAITH-LAYER'), ['卷七 §2.8']);
  assert.deepEqual(src('E-SAVE-TORN'), ['卷二 §4.3', '卷二十七 附·本卷新增错误码']);
  // 勘误 1117ec20、1117ec2、1117ec12：卷二十自己的码表；卷三甲七码与 W-DIM-GAP 登在卷二 §4.3；卷十二两个新码同登卷二。
  assert.deepEqual(src('E-ENV-TARGET'), ['卷二十 附·本卷错误码表']);
  assert.deepEqual(src('E-SEED-KEY'), ['卷二 §4.3', '卷二十 附·本卷错误码表']);
  assert.deepEqual(src('W-CAL-DRIFT'), ['卷二十 附·本卷错误码表']);
  assert.deepEqual(src('E-MAT-GRADE-KEYS'), ['卷二 §4.3']);
  assert.deepEqual(src('W-DIM-GAP'), ['卷二 §4.3']);
  assert.deepEqual(src('E-ACC-REGISTRY-WRITE'), ['卷二 §4.3', '卷十二 §2.12']);
});

test('E 的成员与码表一一对应：条数相等、冻结、成员名把连字符换成下划线', () => {
  installHandles({ vocab: { families: new Map(), index: new Map() }, decl: {} });
  assert.equal(Object.keys(E).length, codes.length);
  assert.ok(Object.isFrozen(E));
  for (const c of codes) assert.equal(E[c.split('-').join('_')], c);
  assert.equal(E.E_DIM_DOMAIN_RANGE, 'E-DIM-DOMAIN-RANGE');
});

test('未登记码拒收：形合文法而不在表内 E-DIM-REF-MISSING；不合文法 E-DIM-ID-FORMAT；作废的 E-MIG-* 不在表内', () => {
  rejects(() => errorCodeOf('E-NO-SUCH-CODE'), 'E-DIM-REF-MISSING');
  rejects(() => errorCodeOf('E-MIG-ROW-ORPHAN'), 'E-DIM-REF-MISSING');
  rejects(() => errorCodeOf('E-DIM-DOMAIN-RANGES'), 'E-DIM-REF-MISSING');
  rejects(() => errorCodeOf('E-dim-domain-range'), 'E-DIM-ID-FORMAT');
  rejects(() => errorCodeOf('E_DIM_DOMAIN_RANGE'), 'E-DIM-ID-FORMAT');
  rejects(() => errorCodeOf(42), 'E-DIM-ID-FORMAT');
  rejects(() => buildE(['E-DIM-DOMAIN-RANGE', 'E-NO-SUCH-CODE']), 'E-DIM-REF-MISSING');
  assert.equal(REGISTERED_CODES.has('E-MIG-ROW-ORPHAN'), false);
  assert.equal(errorCodeOf('W-DIM-UNIT-DIM'), 'W-DIM-UNIT-DIM');
});

test('代号正则只有一份：vocab-handle 转出的就是 validate/types.mjs 的那份', () => {
  assert.equal(CODE_RE, TYPES_CODE_RE);
});
