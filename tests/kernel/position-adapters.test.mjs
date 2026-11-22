// 格子迁移 G12（6-27）move、create 适配器卡内测试（对照表 #18；PLAN.md :70 ③、:82 ②）。
// 卷文依据：卷九 §4.2.1 :639–:640、:647（move、create、time 行）、R9-2.3 :658；卷十七 §3.3 :288、C17-11 :873、S17-4。夹具同 6-6（tests/kernel/person-world.mjs）：PLACE 是 300 × 100 区格小格空间的层根，
// 子行 SUB 的种子 (5050, 5050) m 落在区格 (50, 50)；没有玩家席位边，所以全部落位在泡外，写 coarse 为真的位置（卷十七 :303）。
// 范围说明：execute 现在对任何批都在写入前拒收（"no adapter for emit"，emit 适配器属 6-8，未建；块 5 的 transfer、holding 适配器同样没有 execute 成功路径的用例），
// 所以本文件分两层：① 经 execute 能走到的契约层（move 缺 subject、facing 类型、time 与别类 create 的拒收）；② 适配器调用的那条委托链本身——在登记的委托方文件（primitives-runtime.mjs）的事务里
// 经 runDelegated 调 position.mjs#placeSubject，与建人物行同事务成对写入、一并回滚。emit 适配器落地后补 execute 全链用例（见回报）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildPersonWorld, MPY, PLACE, SUB, POS } from './person-world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { runTransaction, runDelegated } from '../../server-plugin/kernel/transaction.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { zoneAt } from '../../server-plugin/kernel/place.mjs';
import { execute } from '../../server-plugin/primitives-runtime.mjs';
import { instantiatePerson } from '../../server-plugin/person.mjs';
import '../../server-plugin/position.mjs'; // 加载即登记委托函数（装配时由 systems.mjs 引入）

useReportSink(() => {});
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const { engine: ENGINE } = buildPersonWorld();
const NOW = 60 * MPY;
const state = () => ({ clock: { minute: NOW, seq: 0, dueNext: 0 }, created: {} });
const CTX = { node: 'commit', file: 'primitives-runtime.mjs' }; // 登记的委托方文件（systems.position.writeDelegations）
const EMIT = { op: 'emit', verb: 'verb_test_placed', visibility: 'public' };
const posOf = (s) => s.created.npc_new.props.pos;
const spec = { instanceId: 'npc_new', species: 'species_test_a', birthplace: PLACE, birthMinute: NOW - 20 * MPY };
// 适配器 create（person）在事务里做的两步，原样（primitives-runtime.mjs 的 CREATORS.person）。move 适配器那一步（给地点）见 position.test.mjs 的委托链用例：
// 地点落代表格要高度场，本夹具（6-6）没有控制点，landCell 读不到。
const createPerson = (st, target, facing = null) => { instantiatePerson(ENGINE, st, spec); runDelegated(st, 'position.mjs#placeSubject', ENGINE, st, 'npc_new', target, facing, 'verb_test_placed'); };
const tx = (s, fn, ctx = CTX) => runTransaction(s, ctx, fn);

test('#18 契约层（经 execute）：move 没带 subject 是契约不合 E-ACT-PRIMITIVE（行动者由 resolve() 提交段给，未建，不猜）；facing 须整数或空；time 与未登记创建例程的实体类 create 整笔拒收 E-ACT-WRITER-NOT-READY；状态不变', () => {
  const s = state();
  const before = JSON.stringify(s);
  const run = (prims) => tx(s, (st) => { execute(ENGINE, st, [...prims, EMIT], 'act_test'); });
  assert.deepEqual(run([{ op: 'move', to: SUB }]), { ok: false, code: 'E-ACT-PRIMITIVE' });
  assert.deepEqual(run([{ op: 'move', to: SUB, subject: 'npc_new', facing: 1.5 }]), { ok: false, code: 'E-ACT-PRIMITIVE' });
  assert.deepEqual(run([{ op: 'move', to: SUB, subject: 7 }]), { ok: false, code: 'E-ACT-PRIMITIVE' });
  assert.deepEqual(run([{ op: 'time', minutes: 5 }]), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  assert.deepEqual(run([{ op: 'create', kind: 'place', template: 'species_test_a', facts: {} }]), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  assert.equal(JSON.stringify(s), before);
});

test('#18 委托链：建人物行与初值位置在同一事务里成对写入（PLAN.md :82 ②）——给 pos（泡外，coarse 真，原样写目标格，zoneAt 为 PLACE）；位置落不下（目标地点不存在）时整笔回滚，行也不留；不在登记委托的节点文件里调则没有写权', () => {
  const a = state();
  assert.deepEqual(tx(a, (st) => createPerson(st, { pos: POS })), { ok: true });
  assert.deepEqual(posOf(a), { ...POS, coarse: true });
  assert.equal(zoneAt(ENGINE, a, posOf(a)), PLACE);
  const c = state();
  assert.deepEqual(tx(c, (st) => createPerson(st, { place: 'loc_nowhere' })), { ok: false, code: 'E-DIM-REF-MISSING' });
  assert.deepEqual(c.created, {});
  const d = state();
  assert.deepEqual(tx(d, (st) => createPerson(st, { pos: POS }), { node: 'x', file: 'death.mjs' }), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.deepEqual(d.created, {});
  assert.equal(SUB, 'loc_test_sub');
});
