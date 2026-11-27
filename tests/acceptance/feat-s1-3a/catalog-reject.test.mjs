// S1-3a（动作目录与执行）黑盒验收，第 8–10 条：进程内拒收、动作表加一行即出现在菜单并可提交、动作表加载即拒。
// 出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s13a。依据见 docs/卡档案/feat-s1-3a/出题.md。
// 「不改任何 .mjs」的做法：把 server-plugin 与 world 整棵复制进临时根，只改临时根里的 world 数据（JSON），再从临时根的 index.mjs 装配。
// 写临时根只经 writeUnderTempRoot（temp-root.mjs 登记写入口）；复制也经它逐文件写入。
import { express } from '../../support/express.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { init } from '../../../server-plugin/index.mjs';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const roots = [];
after(() => { for (const r of roots) removeTempRoot(r); });

const isInput = (e) => e.kind === 'command' || e.kind === 'advance';
const stateJson = (s) => JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
const isOk = (r) => r.ok === true || r.result === 'ok';
const codeOf = (r) => String(r?.code ?? r?.error?.code ?? '');
const affordance = (menu, act) => menu.affordances.find((a) => (a.act ?? a.id) === act);
const snap = (world) => ({ clock: world.state.clock.minute, json: stateJson(world.state), logLen: world.logBook.entries.length, created: Object.keys(world.state.created ?? {}).sort() });
const newInputs = (world, before) => world.logBook.entries.slice(before.logLen).filter(isInput);
function assertRejected(world, before, r, code) {
  assert.equal(isOk(r), false, `应被拒收：${JSON.stringify(r)}`);
  assert.ok(codeOf(r).includes(code), `拒收码应为 ${code}，实得 ${codeOf(r)}`);
  assert.equal(world.state.clock.minute, before.clock, '拒收时时钟不动');
  assert.equal(stateJson(world.state), before.json, '拒收时 state 不变');
  assert.equal(newInputs(world, before).length, 1, '拒收时日志只多一条输入条目');
  for (const e of world.logBook.entries.slice(before.logLen).filter((x) => !isInput(x))) assert.equal(e.ok, false);
}

async function fresh(root) {
  return init(express.Router(), { saveRoot: root ?? (() => { const r = testTempRoot('s13a-cat-'); roots.push(r); return r; })() });
}

// ---- 动作表文件的读写（临时根内） ----
const ACTIONS_REL = 'world/actions';
function actionFiles(base) {
  return readdirSync(join(base, ACTIONS_REL)).filter((f) => f.endsWith('.json')).sort();
}
// 行容器：{rows:[…]} | {rows:{id:…}} | {id:…}；返回 {doc, rowOf(id), set(id,row)}
function rowsOf(doc) {
  if (Array.isArray(doc.rows)) return { get: (id) => doc.rows.find((r) => r.id === id), add: (row) => doc.rows.push(row) };
  const holder = doc.rows && typeof doc.rows === 'object' ? doc.rows : doc;
  return { get: (id) => holder[id], add: (row) => { const { id, ...rest } = row; holder[id] = rest; } };
}
function findActionFile(base, id) {
  for (const f of actionFiles(base)) {
    const doc = loadJson(join(base, ACTIONS_REL, f));
    if (rowsOf(doc).get(id)) return { f, doc };
  }
  throw new Error(`动作目录中找不到 ${id}（写码须把 act_wait 放在 world/actions/*.json）`);
}
// 逐文件经 writeUnderTempRoot 复制 rel 子树（源为仓库内只读文件）。
function copyTree(root, rel) {
  for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
    const sub = join(rel, e.name);
    if (e.isDirectory()) copyTree(root, sub);
    else writeUnderTempRoot(root, sub, readFileSync(join(ROOT, sub)));
  }
}
// 行上的上限可为数字，或规则引用 rules.act.<键>.<动作类>（值在 world/rules/tables/act.json，卷九:324）。
function ruleMax(m) {
  if (typeof m === 'number') return m;
  const [, key, cls] = /^rules\.act\.(\w+)\.(\w+)$/.exec(String(m)) ?? [];
  const tbl = loadJson(join(ROOT, 'world/rules/tables/act.json')).rows.find((r) => r.key === key);
  return tbl ? tbl.value[cls] : NaN;
}
function copyWorld() {
  const root = testTempRoot('s13a-copy-');
  roots.push(root);
  copyTree(root, 'server-plugin');
  copyTree(root, 'world');
  return root;
}
const importCopy = (root) => import(pathToFileURL(join(root, 'server-plugin/index.mjs')).href);

test('8. 进程内拒收：未知动作 E-ACT-UNKNOWN；候选编号越界与负数 E-ACT-SLOT；缺槽 E-ACT-SLOT；均 state/时钟不动、日志只多输入', async () => {
  const cases = [
    [{ act: 'act_no_such_action_zz', slots: {}, numbers: {} }, 'E-ACT-UNKNOWN'],
    [{ act: 'act_choose_origin', slots: { species: 0, origin: 1e9, place: 0 } }, 'E-ACT-SLOT'],
    [{ act: 'act_choose_origin', slots: { species: 0, origin: -1, place: 0 } }, 'E-ACT-SLOT'],
    [{ act: 'act_choose_origin', slots: { species: 0, origin: 0 } }, 'E-ACT-SLOT'],
  ];
  for (const [intent, code] of cases) {
    const world = await fresh();
    const before = snap(world);
    const r = await world.act(intent);
    assertRejected(world, before, r, code);
  }
});

test('9. 动作表加一行（复制 act_wait 改 id 与上限）、不改任何 .mjs：新动作出现在菜单投影并可提交，上限随数据走', async () => {
  const root = copyWorld();
  const { f, doc } = findActionFile(root, 'act_wait');
  const wait = structuredClone(rowsOf(doc).get('act_wait'));
  const oldMax = ruleMax(wait.slots.minutes.max);
  assert.ok(Number.isFinite(oldMax), 'act_wait 的 minutes.max 应可解析为整数上限');
  const newMax = oldMax + 7;
  const probe = structuredClone(wait);
  probe.id = 'act_probe_pause';
  probe.slots.minutes.max = newMax;
  if (probe.menu && typeof probe.menu.order === 'number') probe.menu.order += 1;
  rowsOf(doc).add(probe);
  writeUnderTempRoot(root, join(ACTIONS_REL, f), JSON.stringify(doc, null, 2));

  const { init: initCopy } = await importCopy(root);
  const world = await initCopy(express.Router(), { saveRoot: root });
  const first = await world.act({ act: 'act_choose_origin', slots: { species: 0, origin: 0, place: 0 } });
  assert.equal(isOk(first), true, '前提：选来历应成功');

  const avatar = Object.keys(world.state.created).find((id) => world.state.created[id].kind === 'person');
  assert.ok(avatar, '前提：选来历后应有化身');
  const offered = affordance(world.menu(avatar), 'act_probe_pause');
  assert.ok(offered, '新动作应出现在菜单投影');
  if (offered.numbers?.minutes?.max !== undefined) assert.equal(offered.numbers.minutes.max, newMax, '菜单给出的上限应为新数据行的上限');

  const t0 = world.state.clock.minute;
  const ok = await world.act({ act: 'act_probe_pause', actor: avatar, numbers: { minutes: newMax } });
  assert.equal(isOk(ok), true, `新动作在上限处应可提交：${JSON.stringify(ok)}`);
  assert.equal(world.state.clock.minute, t0 + newMax, '新动作推进的时钟应等于所给分钟');

  const before = snap(world);
  const over = await world.act({ act: 'act_probe_pause', actor: avatar, numbers: { minutes: newMax + 1 } });
  assertRejected(world, before, over, 'E-ACT-SLOT');
});

test('10. 动作表加载即拒（不静默）：非 S1 字段非空、baseMinutes>0、效果族输出非 primitive、可达原语无处理函数 → init 抛 E-ACT-ROW', async () => {
  const NON_S1 = {
    capability: 'cap_x',
    requirement: { kind: 'x' },
    consent: [{ party: 'slot_x', scope: 'scope_x' }],
    answer: 'agree',
    check: { skill: null, abilityRows: ['ability_x'], difficultyRows: ['difficulty_x'], opposed: false },
    backlash: [{ family: 'eff_x', params: {} }],
    costRows: ['cost_x'],
    skillGain: { skill: 'skill_x', source: 'learn_x' },
    decision: { drives: {}, candidateProviders: [] },
    shapeFrom: { entry: 'entry_x', args: {} },
    stages: [{ stage: 'stage_x', atPermille: 0 }],
    workFromEdge: { slot: 'minutes', refSpeed: 'speed_x' },
  };
  const refused = (e) => /E-ACT-ROW/.test(`${e?.code ?? ''} ${e?.message ?? ''}`);

  for (const [field, value] of Object.entries(NON_S1)) {
    const root = copyWorld();
    const { f, doc } = findActionFile(root, 'act_wait');
    const row = rowsOf(doc).get('act_wait');
    row[field] = value;
    writeUnderTempRoot(root, join(ACTIONS_REL, f), JSON.stringify(doc, null, 2));
    const { init: initCopy } = await importCopy(root);
    await assert.rejects(initCopy(express.Router(), { saveRoot: root }), refused, `非 S1 字段 ${field} 非空应加载即拒 E-ACT-ROW`);
  }

  {
    const root = copyWorld();
    const { f, doc } = findActionFile(root, 'act_wait');
    rowsOf(doc).get('act_wait').baseMinutes = 5;
    writeUnderTempRoot(root, join(ACTIONS_REL, f), JSON.stringify(doc, null, 2));
    const { init: initCopy } = await importCopy(root);
    await assert.rejects(initCopy(express.Router(), { saveRoot: root }), refused, 'baseMinutes>0 应加载即拒 E-ACT-ROW（活动未实现）');
  }

  // 效果族：取 act_wait 效果里用到的族（卷九 effectCall = {family, params}），改其输出为非 primitive / 原语为无处理函数的原语。
  const famsOf = (node, out = []) => {
    if (node && typeof node === 'object') {
      if (typeof node.family === 'string') out.push(node.family);
      for (const v of Object.values(node)) famsOf(v, out);
    }
    return out;
  };
  const familyNode = (effectsDoc, fam) => {
    const hit = [];
    const walk = (n) => {
      if (n && typeof n === 'object') {
        if (Object.hasOwn(n, fam) && n[fam] && typeof n[fam] === 'object') hit.push(n[fam]);
        for (const v of Object.values(n)) walk(v);
      }
    };
    walk(effectsDoc);
    assert.ok(hit.length > 0, `效果族 ${fam} 应登记在 world/ontology/dimensions/_effects.json`);
    return hit[0];
  };
  const outputsOf = (node) => {
    const out = [];
    const walk = (n) => { if (n && typeof n === 'object') { if (n.kind === 'primitive') out.push(n); for (const v of Object.values(n)) walk(v); } };
    walk(node);
    return out;
  };
  const probeFamily = (mutate, label) => async () => {
    const root = copyWorld();
    const { doc } = findActionFile(root, 'act_wait');
    const fam = famsOf(rowsOf(doc).get('act_wait').effects)[0];
    assert.ok(fam, 'act_wait 的效果应引用一个效果族（卷九 effectCall）');
    const effPath = join(ROOT, 'world/ontology/dimensions/_effects.json');
    const effDoc = loadJson(effPath);
    const outs = outputsOf(familyNode(effDoc, fam));
    assert.ok(outs.length > 0, '效果族应有原语输出行（卷二 §3.9 eff_output）');
    mutate(outs);
    writeUnderTempRoot(root, 'world/ontology/dimensions/_effects.json', JSON.stringify(effDoc, null, 2));
    const { init: initCopy } = await importCopy(root);
    await assert.rejects(initCopy(express.Router(), { saveRoot: root }), refused, label);
  };

  await probeFamily((outs) => { outs[0].kind = 'event'; }, '效果族输出非 primitive 应加载即拒 E-ACT-ROW')();

  await probeFamily((outs) => {
    const o = outs[0];
    const key = ['op', 'primitive', 'name'].find((k) => o[k] === 'time');
    assert.ok(key, '写码的 primitive 输出行应把原语代号放在 op/primitive/name 之一（以 time 为例）');
    o[key] = 'learn';
  }, '可达原语无处理函数（learn，参数名 minutes 合契约）应加载即拒 E-ACT-ROW')();
});
