// 块 2-1 只核遗留：错误码机读登记 kernel/error-codes.mjs，及句柄 E、errorCodeOf 读它（卷二 §1.9 :282、§4.2 :1506、§4.3；卷十二 R12-5.7 :792）。
// 条数、成员名与值、出处全是按卷文手写的字面量，不用被测函数算期望值。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES, REGISTERED_CODES } from '../../server-plugin/kernel/error-codes.mjs';
import { isErrorCode } from '../../server-plugin/kernel/validate/types.mjs';
import { installHandles, buildE, E } from '../../server-plugin/kernel/handles/generated.mjs';
import { errorCodeOf, CODE_RE } from '../../server-plugin/kernel/handles/vocab-handle.mjs';
import { CODE_RE as TYPES_CODE_RE } from '../../server-plugin/kernel/validate/types.mjs';

const rejects = (fn, code) => assert.throws(fn, (e) => e.code === code && e.message.startsWith(code));
const codes = ERROR_CODES.map((e) => e.code);

test('码表条数：E 与 W 各为手数的字面量', () => {
  // 块 4-2 加 E-CLOCK-REACTION-LIMIT（李白 11-18 03:22 裁定①）：577 → 578、E 560 → 561。
  // 块 3-2 加卷六账本六码（勘误 1118k7 码表）：E 五码、W 一码；578 → 584、E 561 → 566、W 17 → 18。
  // 块 3-2 续加 E-LEDGER-USEDBYDAY-ORDER、E-LEDGER-HOLDER-NOT-SUBJECT（勘误 1118k8 码表）：584 → 586、E 566 → 568。
  // 块 3-2 续加 E-LEDGER-STAGING-SPONSOR（勘误 1118k9 码表）：586 → 587、E 568 → 569。
  // 门禁卡加卷十二 §2.12 两码 E-ACC-TEST-FAIL、E-ACC-REQUIRED-NOT-RUN（勘误 1118k14；李白 11-18 06:41）：587 → 589、E 569 → 571。
  // 块 3-3b 加卷十二 §2.12 一码 E-ACC-INSTANCE-NAME（勘误 1118k15；李白 11-18 07:27 裁定①）：589 → 590、E 571 → 572。
  // 块 3-3b 续加卷十二 §2.12 一码 E-ACC-CONST-LITERAL（勘误 1118k16）：590 → 591、E 572 → 573。
  // 块 3 第 3-3c 张加卷六账本一码 E-LEDGER-CAPPED-DIRECT（勘误 1118k13 续、李白 11-18 07:02 选丙）：591 → 592、E 573 → 574。
  // B2-W1 加卷十二 §2.12 两码 E-ACC-PROMISE-UNREACHABLE、E-ACC-PARAM-UNCONSUMED（勘误 1118k18；李白 11-18 08:20 裁定①）：592 → 594、E 574 → 576。
  // 卡头自查卡加卷十二 §2.12 一码 E-ACC-CARD-SELFCHECK（李白 11-18 17:45）：594 → 595、E 576 → 577。
  // B5-0 加卷九 §2.8 一码 E-ACT-WRITER-NOT-READY（勘误 1118k25；李白 11-18 22:10 丙9）：595 → 596、E 577 → 578。
  // 格子迁移 G3 登卷二 §4.3 勘误 1121k1 的六个 E-GRID 加载码（FOOTPRINT-OUTSIDE-PARENT、SIBLING-OVERLAP、SEED-SAME-CELL、WATERWAY-NO-CHANNEL、VOLUME-TOP-EXPOSED、CELL-NO-TERRAIN）：596 → 602、E 578 → 584。
  // 寻路方向与超限小卡加 E-GRID-PATH-OVER-CAP（卷五 :471 勘误 1121k12，李白 11-21 15:29；告警级、E- 开头照 E-GRID 先例）：602 → 603、E 584 → 585。
  // 格子迁移 G6 加 E-GRID-STOCK-OVER-CAP（卷五 §4.7 规则 12 :910 "超出即加载或结算报错，不截"，对照表待定 10 已定：超限码随 G6 由卷二勘误补一码）：603 → 604、E 585 → 586。
  // 卷十生成补缺加 W-GEN-DOWNHILL-PROJECTED（高低次序投影日志，李白 11-21 裁定甲）：604 → 605、W 18 → 19。
  // 卷二 §2.7 dated 按日生效写者加 E-DATED-FROMDAY、E-DATED-WRITER 两码（G9 前置内核子卡，拒写码由本卡命名）：605 → 607、E 586 → 588。
  // 卷十勘误 1121k16–k19 写码加三码（卷十 §2.7 E-GEN-ORDER-CONFLICT、E-GEN-WATER-FOOTPRINT；卷二 1121k19 E-GRID-WATER-BAND）：607 → 610、E 588 → 591。
  assert.equal(codes.length, 610);
  assert.equal(codes.filter((c) => c[0] === 'E').length, 591);
  assert.equal(codes.filter((c) => c[0] === 'W').length, 19);
  assert.equal(REGISTERED_CODES.size, codes.length);
});

test('码表冻结、按 code 排序、无重复、每码合 §4.2 文法、每项都有出处', () => {
  assert.ok(Object.isFrozen(ERROR_CODES));
  for (const e of ERROR_CODES) {
    assert.ok(Object.isFrozen(e) && Object.isFrozen(e.sources), e.code);
    assert.ok(isErrorCode(e.code), e.code);
    assert.ok(e.sources.length >= 1 && e.sources.every((s) => typeof s === 'string' && /^vol\d/.test(s)), e.code);
    assert.equal(new Set(e.sources).size, e.sources.length, e.code);
    assert.deepEqual(Object.keys(e), ['code', 'sources']);
  }
  assert.deepEqual(codes, [...codes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  assert.equal(new Set(codes).size, codes.length);
  assert.throws(() => { ERROR_CODES.push({}); }, TypeError);
});

test('错误码文法 E-/W- 两段及以上（原 patterns.test.mjs 搬入，定义在 validate/types.mjs）', () => {
  assert.equal(isErrorCode('E-DIM-ID-FORMAT'), true);
  assert.equal(isErrorCode('W-DIM-GAP'), true);
  assert.equal(isErrorCode('E-X'), false);
  assert.equal(isErrorCode('e-x-y'), false);
  assert.equal(isErrorCode('E-a-b'), false);
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
  assert.deepEqual(src('E-WRITER-DUPLICATE'), ['vol2.s4.3']);
  assert.deepEqual(src('E-PHASE-DUPLICATE'), ['vol2.s4.3']);
  assert.deepEqual(src('E-PHASE-HOOK-DUPLICATE'), ['vol2.s4.3']);
  assert.deepEqual(src('E-ACC-REQUIRED-TEST'), ['vol2.s4.3', 'vol12.s2.12']);
  assert.deepEqual(src('E-CBT-ROUND'), ['vol13.s2.9']);
  assert.deepEqual(src('E-FAITH-LAYER'), ['vol7.s2.8']);
  assert.deepEqual(src('E-SAVE-TORN'), ['vol2.s4.3', 'vol27.appendix.codes']);
  // 勘误 1118b24（李白 11-18 块 2-4 三件裁定 b）：E-SAVE-EMPTY 由卷二 §4.3 定义，卷二十七附表引用。
  assert.deepEqual(src('E-SAVE-EMPTY'), ['vol2.s4.3', 'vol27.appendix.codes']);
  // 勘误 1117ec20、1117ec2、1117ec12：卷二十自己的码表；卷三甲七码与 W-DIM-GAP 登在卷二 §4.3；卷十二两个新码同登卷二。
  assert.deepEqual(src('E-ENV-TARGET'), ['vol20.appendix.codes']);
  assert.deepEqual(src('E-SEED-KEY'), ['vol2.s4.3', 'vol20.appendix.codes']);
  assert.deepEqual(src('W-CAL-DRIFT'), ['vol20.appendix.codes']);
  // 勘误 1118k7：卷六自己的码表，账本六码。
  assert.deepEqual(src('E-LEDGER-UNBALANCED'), ['vol6.appendix.codes']);
  assert.deepEqual(src('W-LEDGER-ALERT'), ['vol6.appendix.codes']);
  // 勘误 1118k8：卷六码表补两码。
  assert.deepEqual(src('E-LEDGER-USEDBYDAY-ORDER'), ['vol6.appendix.codes']);
  assert.deepEqual(src('E-LEDGER-HOLDER-NOT-SUBJECT'), ['vol6.appendix.codes']);
  // 勘误 1118k9：卷六码表补一码。
  assert.deepEqual(src('E-LEDGER-STAGING-SPONSOR'), ['vol6.appendix.codes']);
  // 勘误 1118k13 续（李白 11-18 07:02 选丙）：卷六码表补 E-LEDGER-CAPPED-DIRECT。
  assert.deepEqual(src('E-LEDGER-CAPPED-DIRECT'), ['vol6.appendix.codes']);
  assert.deepEqual(src('E-MAT-GRADE-KEYS'), ['vol2.s4.3']);
  assert.deepEqual(src('W-DIM-GAP'), ['vol2.s4.3']);
  assert.deepEqual(src('E-ACC-REGISTRY-WRITE'), ['vol2.s4.3', 'vol12.s2.12']);
  assert.deepEqual(src('E-ACC-TEST-FAIL'), ['vol12.s2.12']);
  assert.deepEqual(src('E-ACC-REQUIRED-NOT-RUN'), ['vol12.s2.12']);
  assert.deepEqual(src('E-ACC-CARD-SELFCHECK'), ['vol12.s2.12']);
  // 勘误 1118k25（李白 11-18 22:10 丙9）：卷九 §2.8 定义，卷二 §4.3 只登记。
  assert.deepEqual(src('E-ACT-WRITER-NOT-READY'), ['vol2.s4.3', 'vol9.s2.8']);
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
