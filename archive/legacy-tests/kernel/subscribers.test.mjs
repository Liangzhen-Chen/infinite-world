// 块 6 第 6-19 张《装配文件与到期订阅分发》：事件订阅的登记与分发（卷九 R9-1.12 前提失效通知；卷二十 §4.1.3 第 5 条 :507 到期事件；卷二十四表 B `parent` :160；体检 K6-62）。
// 测试先写，期望值按卷文规则手算成字面量：投递顺序＝动词链（本动词先、再上位词）、同动词按订阅者文件路径升序；订阅者里再发的事件排队、同一代投完再投下一代；
// 订阅者抛错整笔回滚（已写下的事件一并撤销；订阅者经登记写者写的状态随事务整笔回滚，那一半由各订阅者所在卡的测试守）。动词是测试里造的，只进本进程注册表，不进 world/。只跑不推进世界的小检查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { installDigestCap, installDigestExclude } from '../../server-plugin/kernel/save.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { emit, installEventLog } from '../../server-plugin/kernel/events.mjs';
import { registerSubscriber, subscriptions, checkSubscribers, resetSubscribers } from '../../server-plugin/kernel/subscribers.mjs';
import { KernelError } from '../../server-plugin/kernel/errors.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);
installDigestCap(createDigestCap());
installDigestExclude([]);
useReportSink(() => {});

const ROW = Object.freeze({
  parent: null, payloadShape: {}, kindFrom: null, kindOnly: false, worthSlots: { destroyed: [], moved: [], stake: [] }, headSlot: null,
  sigBase: 0, tallies: [], perceivable: false, senses: [], visibilityAllowed: ['private', 'public', 'witnessed'], scandal: false, calendarBound: false,
});
const verb = (parent) => ({ family: 'verb', prefix: 'verb_', entry: { ...ROW, parent } });
const vocab = {
  families: W.vocab.families,
  index: new Map([...W.vocab.index,
    ['verb_test_parent', verb(null)],
    ['verb_test_child', verb('verb_test_parent')],
    ['verb_test_grand', verb('verb_test_child')],
    ['verb_test_other', verb(null)],
  ]),
};
installVocab({ vocab, idIndex: W.idIndex, tables: W.tables });
const ENGINE = { vocab, rules: W.rules, units: W.env.units, template: { seed: 'test_sub_seed' } };
const CTX = { node: 'test_sub', file: 'tests/kernel/subscribers.test.mjs' };
const codeIs = (code) => (e) => e.code === code;

let book;
let n = 0;
function fresh() {
  resetSubscribers();
  book = { entries: [] };
  installEventLog(book);
  n = 0;
  return { clock: { minute: 0, seq: 0 } };
}
// 同一分钟、同一主体的事件靠规则代号区分 id（五成分之一），每发一条换一个。
const send = (state, v, extra = {}) => emit(ENGINE, state, {
  minute: 0, verb: v, actor: null, actorAs: null, targets: [], primitives: [], cause: 'rule_test', witnesses: [], rollKey: null, visibility: 'private', payload: {}, ...extra,
}, { rule: `rule_test_${n += 1}`, subject: 'npc_a', position: 'pos.kernel' });
const inTx = (state, fn) => runTransaction(state, CTX, fn);

test('registerSubscriber：动词须是代号、文件须是 server-plugin 相对模块路径、处理函数须是函数；同 (动词, 文件) 交两次拒', () => {
  resetSubscribers();
  const f = () => {};
  assert.throws(() => registerSubscriber('', 'rules/a.mjs', f), codeIs('E-DIM-ID-FORMAT'));
  assert.throws(() => registerSubscriber('Verb_X', 'rules/a.mjs', f), codeIs('E-DIM-ID-FORMAT'));
  assert.throws(() => registerSubscriber(undefined, 'rules/a.mjs', f), codeIs('E-DIM-ID-FORMAT'));
  assert.throws(() => registerSubscriber('verb_test_parent', '', f), codeIs('E-DIM-STRUCT-FIELD'));
  assert.throws(() => registerSubscriber('verb_test_parent', '../x.mjs', f), codeIs('E-DIM-STRUCT-FIELD'));
  assert.throws(() => registerSubscriber('verb_test_parent', 'rules/a.mjs', null), codeIs('E-DIM-STRUCT-FIELD'));
  registerSubscriber('verb_test_parent', 'rules/a.mjs', f);
  assert.throws(() => registerSubscriber('verb_test_parent', 'rules/a.mjs', f), codeIs('E-WRITER-DUPLICATE'));
  registerSubscriber('verb_test_parent', 'rules/b.mjs', f);
  registerSubscriber('verb_test_child', 'rules/a.mjs', f);
  assert.deepEqual(subscriptions(), [
    { verb: 'verb_test_child', file: 'rules/a.mjs' },
    { verb: 'verb_test_parent', file: 'rules/a.mjs' },
    { verb: 'verb_test_parent', file: 'rules/b.mjs' },
  ]);
});

test('checkSubscribers：订阅的动词不是词表 verb 行即报 E-EVT-VERB（订阅一个不存在的动词永远收不到事件，不静默放过）', () => {
  resetSubscribers();
  registerSubscriber('verb_test_parent', 'rules/a.mjs', () => {});
  assert.deepEqual(checkSubscribers(ENGINE), []);
  registerSubscriber('verb_test_missing', 'rules/a.mjs', () => {});
  registerSubscriber('act_not_a_verb', 'rules/a.mjs', () => {});
  const errs = checkSubscribers(ENGINE);
  assert.equal(errs.length, 2);
  assert.ok(errs.every((e) => e.startsWith('E-EVT-VERB')));
});

test('投递：emit 写下事件后订阅者在同一事务里收到那条冻结的事件记录；没订阅的动词不触发', () => {
  const state = fresh();
  const seen = [];
  registerSubscriber('verb_test_parent', 'rules/a.mjs', (eng, st, ev) => seen.push([eng === ENGINE, st === state, ev.verb, Object.isFrozen(ev)]));
  assert.deepEqual(inTx(state, () => { send(state, 'verb_test_parent'); send(state, 'verb_test_other'); }), { ok: true });
  assert.deepEqual(seen, [[true, true, 'verb_test_parent', true]]);
  assert.equal(book.entries.length, 2);
});

test('投递顺序：动词链本动词先、再上位词逐层上去（订阅上位词即收到全部下位词）；同一动词按文件路径升序', () => {
  const state = fresh();
  const order = [];
  const tag = (name) => () => order.push(name);
  registerSubscriber('verb_test_parent', 'rules/z.mjs', tag('parent:z'));
  registerSubscriber('verb_test_parent', 'rules/a.mjs', tag('parent:a'));
  registerSubscriber('verb_test_child', 'rules/m.mjs', tag('child:m'));
  registerSubscriber('verb_test_grand', 'rules/q.mjs', tag('grand:q'));
  inTx(state, () => { send(state, 'verb_test_grand'); });
  assert.deepEqual(order, ['grand:q', 'child:m', 'parent:a', 'parent:z']);
  order.length = 0;
  inTx(state, () => { send(state, 'verb_test_child'); });
  assert.deepEqual(order, ['child:m', 'parent:a', 'parent:z']);
});

test('订阅者里再发的事件排队：先投完当前这一代（含同一事件的全部订阅者），再投下一代，不嵌套', () => {
  const state = fresh();
  const order = [];
  registerSubscriber('verb_test_parent', 'rules/a.mjs', (eng, st, ev) => {
    order.push(`a:${ev.verb}`);
    if (ev.verb === 'verb_test_parent') send(st, 'verb_test_other');
  });
  registerSubscriber('verb_test_parent', 'rules/b.mjs', (eng, st, ev) => order.push(`b:${ev.verb}`));
  registerSubscriber('verb_test_other', 'rules/c.mjs', (eng, st, ev) => order.push(`c:${ev.verb}`));
  inTx(state, () => { send(state, 'verb_test_parent'); });
  assert.deepEqual(order, ['a:verb_test_parent', 'b:verb_test_parent', 'c:verb_test_other']);
  assert.equal(book.entries.length, 2);
});

test('订阅者抛带码的错：整笔事务回滚，已写下的事件一并撤销（日志里没有）；队列清空，下一笔事务照常投递', () => {
  const state = fresh();
  let later = 0;
  registerSubscriber('verb_test_parent', 'rules/a.mjs', () => { throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'boom'); });
  registerSubscriber('verb_test_other', 'rules/b.mjs', () => { later += 1; });
  const r = inTx(state, () => { send(state, 'verb_test_parent'); });
  assert.deepEqual(r, { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.equal(book.entries.length, 0);
  assert.equal(inTx(state, () => { send(state, 'verb_test_other'); }).ok, true);
  assert.equal(later, 1);
  assert.equal(book.entries.length, 1);
});
