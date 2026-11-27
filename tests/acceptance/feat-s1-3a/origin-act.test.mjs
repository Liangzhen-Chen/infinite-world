// S1-3a（动作目录与执行：开局选来历、等待、进程内提交）黑盒验收，第 1–8 条。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s13a。
// 依据与每条测的是什么，见 docs/卡档案/feat-s1-3a/出题.md（卷:行 为依据）。
// 口径：只经 init 返回的产品入口（world.menu、world.act、world.save）与存档薄壳（loadSlot、replay_apply）读写；
//   state 只用于取「新建实体」与「时钟」两个读数，不用于造前提（前提全由真实动作造）。
// 不写死数字：来历行数 = 文化数（cultures.json）× 设计册 14 §3.6 的 backgroundsPerCulture；等待上限经 act_wait 行的规则引用读 rules/tables/act.json。
// 不写死 id：开关过滤的文化由 person 行的 origin 经 _vocab.json 的 origin 族 gate 字段推出（设计册 14 §4.7 步 1）。
// 主会话裁定：world.menu(null) 为开局菜单（affordances 只含 act_choose_origin，visible 只含开放地点候选）；有化身后 world.menu(化身id)。
// 写码实现：意图缺 actor 时取本局唯一化身（写码侧 ①）；本文件的等待用例仍显式带 actor，二者都应通过。
import { express } from '../../support/express.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { init, loadSlot, replay_apply } from '../../../server-plugin/index.mjs';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const CULTURES = loadJson(join(WORLD, 'lore/cultures.json'));
const PERSON_ROWS = loadJson(join(WORLD, 'ontology/dimensions/person.json')).rows;
const PLACE_ROWS = loadJson(join(WORLD, 'ontology/dimensions/place.json')).rows;
const ORIGIN_VOCAB = loadJson(join(WORLD, 'ontology/dimensions/_vocab.json')).families.origin.entries;
const DESIGN_14 = readFileSync(join(ROOT, 'docs/世界设计/14-历史传说与玩家来历.md'), 'utf8');
const PER_CULTURE = Number(/"backgroundsPerCulture":\s*(\d+)/.exec(DESIGN_14)?.[1]);

// 动作目录：world/actions/*.json，行表形状兼容 {rows:[…]}、{rows:{id:…}}、{id:…}。
function actionRows() {
  const dir = join(WORLD, 'actions');
  const out = new Map();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const doc = loadJson(join(dir, f));
    const rows = doc.rows ?? doc;
    const list = Array.isArray(rows) ? rows : Object.entries(rows).map(([id, r]) => ({ id, ...r }));
    for (const r of list) if (typeof r?.id === 'string' && r.id.startsWith('act_')) out.set(r.id, r);
  }
  return out;
}
// 等待上限：act_wait 行的 max 为规则引用 rules.act.<键>.<动作类>，值在 world/rules/tables/act.json（主会话裁定：卷九:324）。
function waitMax() {
  const m = actionRows().get('act_wait').slots.minutes.max;
  if (typeof m === 'number') return m;
  const [, key, cls] = /^rules\.act\.(\w+)\.(\w+)$/.exec(String(m)) ?? [];
  assert.ok(key && cls, 'act_wait 的 max 应为 rules.act.<键>.<动作类>');
  const tbl = loadJson(join(WORLD, 'rules/tables/act.json')).rows.find((r) => r.key === key);
  assert.ok(tbl && Number.isInteger(tbl.value[cls]), `规则表 ${key} 应给出 ${cls} 的整数上限`);
  return tbl.value[cls];
}

const roots = [];
after(() => { for (const r of roots) removeTempRoot(r); });

async function fresh() {
  const root = testTempRoot('s13a-origin-');
  roots.push(root);
  const world = await init(express.Router(), { saveRoot: root });
  return { world, root };
}

const isInput = (e) => e.kind === 'command' || e.kind === 'advance';
const stateJson = (s) => JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
const isOk = (r) => r.ok === true || r.result === 'ok';
const codeOf = (r) => String(r?.code ?? r?.error?.code ?? '');

const menuOf = (world, subject = null) => world.menu(subject);
const affordance = (menu, act) => menu.affordances.find((a) => (a.act ?? a.id) === act);
const candidatesOf = (world, act, slot) => {
  const a = affordance(menuOf(world), act);
  assert.ok(a, `开局菜单投影应含动作 ${act}`);
  const list = a.slots?.[slot];
  assert.ok(Array.isArray(list), `${act} 的槽位 ${slot} 应给出候选 id 数组`);
  return list;
};
const snap = (world) => ({
  clock: world.state.clock.minute,
  created: Object.keys(world.state.created ?? {}).sort(),
  json: stateJson(world.state),
  logLen: world.logBook.entries.length,
});
const newInputs = (world, before) => world.logBook.entries.slice(before.logLen).filter(isInput);
// 拒收：state 与时钟不动；日志恰多一条输入条目与一条拒绝事件（kind:'event', ok:false），
// 且该事件的 seq 等于结果的 seq（请求编号，卷二:545、卷二十七:742），码等于结果码。
function assertRejected(world, before, r, code) {
  assert.equal(isOk(r), false, `应被拒收：${JSON.stringify(r)}`);
  assert.ok(codeOf(r).includes(code), `拒收码应为 ${code}，实得 ${codeOf(r)}`);
  assert.equal(world.state.clock.minute, before.clock, '拒收时时钟不动');
  assert.equal(stateJson(world.state), before.json, '拒收时 state 不变');
  const added = world.logBook.entries.slice(before.logLen);
  const inputs = added.filter(isInput);
  const events = added.filter((e) => !isInput(e));
  assert.equal(inputs.length, 1, '拒收时日志恰多一条输入条目');
  assert.equal(events.length, 1, '拒收时日志恰多一条拒绝事件');
  assert.equal(events[0].kind, 'event', '拒绝记录应为事件条目');
  assert.equal(events[0].ok, false, '拒绝事件应为 ok:false');
  assert.equal(events[0].seq, r.seq, '拒绝事件的 seq 应为结果的请求编号');
  assert.equal(events[0].code, r.code, '拒绝事件的码应为结果码');
}
// 当前化身 id（state.created 中 kind 为 person 的实体）。
const avatarOf = (world) => Object.keys(world.state.created ?? {}).find((id) => world.state.created[id].kind === 'person');
// 新建的 person 实体（化身）：本次动作前后 state.created 的差集中 kind 为 person 的条目。
function newAvatars(world, before) {
  return Object.keys(world.state.created ?? {})
    .filter((id) => !before.created.includes(id) && world.state.created[id].kind === 'person');
}
// 来历行 id（person 表中带 culture 与 origin 的行）与其 gate（origin 族条目的开关名，null 为不受开关管）。
const originIds = () => Object.keys(PERSON_ROWS).filter((id) => typeof PERSON_ROWS[id].origin === 'string' && typeof PERSON_ROWS[id].culture === 'string');
const gateOf = (id) => ORIGIN_VOCAB[PERSON_ROWS[id].origin]?.gate ?? null;

test('1. 来历行齐全：菜单选来历的候选 = person 表中的来历行（每文化 PER 条，文化数 × PER，不写死 54）', async () => {
  assert.ok(Number.isInteger(PER_CULTURE) && PER_CULTURE > 0, '14 §3.6 应登记 backgroundsPerCulture 正整数');
  const ids = originIds();
  for (const c of CULTURES) {
    const n = ids.filter((id) => PERSON_ROWS[id].culture === c.id).length;
    assert.equal(n, PER_CULTURE, `文化 ${c.id} 应有 ${PER_CULTURE} 条来历行`);
  }
  assert.equal(ids.length, CULTURES.length * PER_CULTURE);

  const { world } = await fresh();
  // 数据门（S1-3c 草案 §3）：来历模板行的 species 须是物种表里的行才进候选；无物种行的来历（非人来历）被隐藏。开关开的行均照常入列。
  const SPECIES_ROWS = loadJson(join(WORLD, 'ontology/dimensions/species.json')).rows;
  const gated = ids.filter((id) => typeof PERSON_ROWS[id].species === 'string' && Object.hasOwn(SPECIES_ROWS, PERSON_ROWS[id].species));
  assert.ok(gated.length > 0, '物种门后应仍有来历候选');
  const offered = candidatesOf(world, 'act_choose_origin', 'origin');
  assert.equal(offered.length, gated.length, '来历候选数应等于通过数据门的行数');
  assert.deepEqual([...offered].sort(), [...gated].sort(), '来历候选集应与通过数据门的 person 来历行逐个相等');
});

test('2. 选来历后化身存在、birthplace 指向所选的开放地点（候选编号经 act 提交）', async () => {
  const pairs = [['last', 'mid'], ['first', 'first']];
  for (const [oWhich, pWhich] of pairs) {
    const { world } = await fresh();
    const origin = candidatesOf(world, 'act_choose_origin', 'origin');
    const place = candidatesOf(world, 'act_choose_origin', 'place');
    const oi = oWhich === 'last' ? origin.length - 1 : 0;
    const pi = pWhich === 'mid' ? Math.floor(place.length / 2) : 0;
    const before = snap(world);
    const visibleBefore = JSON.stringify(menuOf(world).visible);

    const r = await world.act({ act: 'act_choose_origin', slots: { origin: oi, place: pi } });
    assert.equal(isOk(r), true, JSON.stringify(r));
    assert.equal(newInputs(world, before).length, 1, '成功提交应记一条输入条目');

    const avatars = newAvatars(world, before);
    assert.equal(avatars.length, 1, '选来历应新建恰一个 person 实体（化身）');
    const rec = world.state.created[avatars[0]];
    assert.equal(rec.props.birthplace, place[pi], 'birthplace 应为所选的开放地点');
    assert.ok(Object.hasOwn(PLACE_ROWS, place[pi]), 'birthplace 应是地点表中的行');
    // 开局菜单 visible 只含开放地点候选（主会话裁定）：所选地点须在其中。格式不固定，按字串包含判。
    assert.ok(visibleBefore.includes(place[pi]), '所选地点应在开局菜单 visible（开放地点）中');
    if (rec.template !== undefined) assert.equal(rec.template, origin[oi], '化身模板应为所选来历行');
  }
});

test('3. 已有化身后选来历不可用：菜单不列或带 blocked，提交拒收 E-ACT-PRECONDITION，state 与时钟不动', async () => {
  const { world } = await fresh();
  const origin = candidatesOf(world, 'act_choose_origin', 'origin');
  const place = candidatesOf(world, 'act_choose_origin', 'place');
  const first = snap(world);
  assert.equal(isOk(await world.act({ act: 'act_choose_origin', slots: { origin: 0, place: 0 } })), true);
  assert.equal(newAvatars(world, first).length, 1, '前提：第一次选来历应建出化身');

  // 已有化身后 act_choose_origin 不可用：菜单可以不列出，若列出则须带 blocked（提交拒收由下面断言）。
  const listed = affordance(menuOf(world, avatarOf(world)), 'act_choose_origin');
  if (listed) assert.ok(listed.blocked, '已有化身时 act_choose_origin 若被列出，须带 blocked 拒因');

  const before = snap(world);
  const r = await world.act({ act: 'act_choose_origin', slots: { origin: origin.length - 1, place: place.length - 1 } });
  assertRejected(world, before, r, 'E-ACT-PRECONDITION');
});

test('4. 未有化身时等待不可用：开局菜单不列 act_wait，提交拒收 E-ACT-PRECONDITION，时钟不动', async () => {
  const { world } = await fresh();
  assert.equal(affordance(menuOf(world), 'act_wait'), undefined, '开局菜单 affordances 只含 act_choose_origin');
  assert.ok(affordance(menuOf(world), 'act_choose_origin'), '开局菜单应含 act_choose_origin');

  const before = snap(world);
  const r = await world.act({ act: 'act_wait', numbers: { minutes: 10 } });
  assertRejected(world, before, r, 'E-ACT-PRECONDITION');
});

test('5. 等待推进时钟 = 所给分钟；日志多一条输入；结果 advancedMinutes 等于所给分钟', async () => {
  const { world } = await fresh();
  const r0 = await world.act({ act: 'act_choose_origin', slots: { origin: 0, place: 0 } });
  assert.equal(isOk(r0), true, '前提：选来历应成功');
  const actor = avatarOf(world);
  const max = waitMax();
  assert.ok(Number.isFinite(max) && max >= 1, 'act_wait 的 minutes 上限应为数据中的正数');

  const values = [1, 17, Math.min(30, max)];
  for (const m of values) {
    const before = snap(world);
    const r = await world.act({ act: 'act_wait', actor, numbers: { minutes: m } });
    assert.equal(isOk(r), true, `等待 ${m} 分应成功：${JSON.stringify(r)}`);
    assert.equal(world.state.clock.minute, before.clock + m, `时钟应推进 ${m} 分`);
    assert.equal(r.advancedMinutes, m, '结果 advancedMinutes 应为所给分钟');
    assert.equal(newInputs(world, before).length, 1, '成功等待应记一条输入条目');
  }
});

test('6. 越界分钟被拒：0、负数、小数、字串、上限+1 → E-ACT-SLOT；时钟与 state 不动，日志只多输入', async () => {
  const { world } = await fresh();
  assert.equal(isOk(await world.act({ act: 'act_choose_origin', slots: { origin: 0, place: 0 } })), true);
  const max = waitMax();
  const actor = avatarOf(world);
  const bad = [0, -5, 1.5, '30', max + 1];
  for (const m of bad) {
    const before = snap(world);
    const r = await world.act({ act: 'act_wait', actor, numbers: { minutes: m } });
    assertRejected(world, before, r, 'E-ACT-SLOT');
  }
});

test('7. 存槽→读档→replay_apply：化身与时钟一致；已有化身后的被拒意图在复演中同处同样被拒，saveDigest 一致', async () => {
  const { world, root } = await fresh();
  assert.equal(isOk(await world.act({ act: 'act_choose_origin', slots: { origin: 0, place: 0 } })), true);
  assert.equal(isOk(await world.act({ act: 'act_wait', actor: avatarOf(world), numbers: { minutes: Math.min(45, waitMax()) } })), true);
  const avatarIds = Object.keys(world.state.created).filter((id) => world.state.created[id].kind === 'person');
  assert.equal(avatarIds.length, 1, '存前应有一个化身');

  // 已有化身再选来历：被拒的意图必须进日志（请求编号留在日志，卷二:545）。
  const before = snap(world);
  const rej = await world.act({ act: 'act_choose_origin', slots: { origin: 0, place: 0 } });
  assertRejected(world, before, rej, 'E-ACT-PRECONDITION');

  const manifest = world.save(0);
  assert.equal(typeof manifest.saveDigest, 'string', '存档清单应带 saveDigest');
  const back = replay_apply(loadSlot({ slot: 0 }, { saveRoot: root }));

  assert.equal(back.state.clock.minute, world.state.clock.minute, '读档后时钟应与存前一致');
  const again = Object.keys(back.state.created).filter((id) => back.state.created[id].kind === 'person');
  assert.deepEqual(again, avatarIds, '读档后化身应存在且为同一实体');
  for (const id of avatarIds) {
    assert.equal(back.state.created[id].props.birthplace, world.state.created[id].props.birthplace, '读档后化身 birthplace 应不变');
  }
  const ev = back.logBook.entries.find((e) => e.kind === 'event' && e.seq === rej.seq);
  assert.ok(ev, '复演后日志应在同一请求编号处有拒绝事件');
  assert.equal(ev.ok, false, '复演后的拒绝事件应为 ok:false');
  assert.equal(ev.code, rej.code, '复演后的拒绝码应与原结果一致');
  assert.ok(back.saveDigest, '复演结果应带 saveDigest');
  assert.equal(back.saveDigest, manifest.saveDigest, '复演后的 saveDigest 应与存前一致');
});

// 逐文件经 writeUnderTempRoot 复制仓库的 rel 子树到临时根（源为仓库内只读文件）。
function copyTree(root, rel) {
  for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
    const sub = join(rel, e.name);
    if (e.isDirectory()) copyTree(root, sub);
    else writeUnderTempRoot(root, sub, readFileSync(join(ROOT, sub)));
  }
}

test('8. 开关置 false：对应来历不再出现在选来历候选（受控文化由 origin 族 gate 推出，设计册 14 §4.7 步 1）', async () => {
  const ids = originIds();
  const switches = [...new Set(ids.map(gateOf).filter((g) => g !== null))];
  assert.ok(switches.length >= 1, 'origin 族应有受开关管的条目（兽裔、怪物社会）');

  const root = testTempRoot('s13a-switch-');
  roots.push(root);
  copyTree(root, 'server-plugin');
  copyTree(root, 'world');
  const rel = 'world/rules/tables/player-origins.json';
  const doc = loadJson(join(root, rel));
  for (const s of switches) assert.ok(doc.rows.some((r) => r.key === s), `playerOrigins 应登记开关 ${s}`);
  for (const row of doc.rows) if (switches.includes(row.key)) row.value = false;
  writeUnderTempRoot(root, rel, JSON.stringify(doc, null, 2));

  const { init: initCopy } = await import(pathToFileURL(join(root, 'server-plugin/index.mjs')).href);
  const world = await initCopy(express.Router(), { saveRoot: root });
  const offered = candidatesOf(world, 'act_choose_origin', 'origin');
  const expected = ids.filter((id) => gateOf(id) === null);
  assert.ok(expected.length < ids.length, '开关为 false 时应有来历被排除');
  assert.deepEqual([...offered].sort(), [...expected].sort(), '开关为 false 时候选应恰为不受开关管的来历行');
});
