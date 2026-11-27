// S1-3b 菜单路由黑盒验收（卷二:976 数值槽越界拒收；卷九 A9-1.3 动作表加行即出现在菜单；draft-s1-3 §6 第 4、6 条）。
// 出题方：Claude Haiku 5.5（haiku-orca-test-s13b）。
// 不写死表名、id、数值：动作行与槽位候选从菜单投影（ReplyResult.menu）读；数据改动只在临时副本上做。
// 期望码取自卷文与 kernel/errors.mjs 已登记码：E-ACT-SLOT（数值或候选越界）、E-ACT-UNKNOWN（未知动作）、E-ACT-PRECONDITION（whenRX 不过）。
// 拒收口径（草案 §6 第 6 条「日志只多输入条目」，同 S1-3a 验收 origin-act.test.mjs:86–:98）：除日志外世界状态不变；
// 日志恰多一条输入条目与一条 ok:false 的拒绝事件，码与结果一致。世界对象取 init 返回值（startHost 的 world）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startHost, copyRepo, view, act } from '../../support/wire-host.mjs';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';

const stateJson = (s) => JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
const isInput = (e) => e.kind === 'command' || e.kind === 'advance';

// 提交前快照：除日志外的世界状态与日志长度（口径同 S1-3a 验收 origin-act.test.mjs:80–:82）。
function beforeOf(h) {
  return { json: stateJson(h.world.state), logLen: h.world.logBook.entries.length };
}

// 拒收断言（同 S1-3a 验收 origin-act.test.mjs:86–:98）。
function assertRejectedInLog(h, b, r, code) {
  assert.equal(r.json?.result, 'rejected', `应 rejected：${r.text}`);
  assert.equal(r.json.code, code, `拒收码应为 ${code}`);
  assert.equal(stateJson(h.world.state), b.json, '拒收时除日志外世界状态不变');
  const added = h.world.logBook.entries.slice(b.logLen);
  const inputs = added.filter(isInput);
  const events = added.filter((e) => !isInput(e));
  assert.equal(inputs.length, 1, '拒收时日志恰多一条输入条目');
  assert.equal(events.length, 1, '拒收时日志恰多一条拒绝事件');
  assert.equal(events[0].kind, 'event', '拒绝记录应为事件条目');
  assert.equal(events[0].ok, false, '拒绝事件应为 ok:false');
  assert.equal(events[0].code, code, '拒绝事件的码应与结果码一致');
}

// 先选来历，建出化身，使 act_wait 等依赖化身的动作可用。候选编号 0 即菜单里的第一个候选。
async function withAvatar(base) {
  const r = await act(base, 'act_choose_origin', { species: 0, origin: 0, place: 0, lodge: 0 });
  assert.equal(r.json?.result, 'ok', `选来历未 ok，无法进入有化身状态：${r.text}`);
}

test('数值槽越界：整数参数超出动作登记的 min..max 即 rejected，除日志外状态不变，日志只多输入与拒绝条目', async (t) => {
  const root = testTempRoot('s13b-menu-slot-');
  const h = await startHost({ saveRoot: root });
  t.after(async () => { await h.close(); removeTempRoot(root); });
  await withAvatar(h.base);
  for (const minutes of [0, -1, 10 ** 12]) {
    const b = beforeOf(h);
    const r = await act(h.base, 'act_wait', {}, { minutes });
    assertRejectedInLog(h, b, r, 'E-ACT-SLOT');
  }
});

test('候选编号越界：候选编号不在菜单候选内即 rejected，除日志外状态不变，菜单来历仍可选', async (t) => {
  const root = testTempRoot('s13b-menu-cand-');
  const h = await startHost({ saveRoot: root });
  t.after(async () => { await h.close(); removeTempRoot(root); });
  const b = beforeOf(h);
  const r = await act(h.base, 'act_choose_origin', { species: 0, origin: 999999, place: 0, lodge: 0 });
  assertRejectedInLog(h, b, r, 'E-ACT-SLOT');
  const v = await view(h.base);
  const origin = (v.json.menu ?? []).find((m) => m.act === 'act_choose_origin');
  assert.ok(origin && !origin.blocked, '拒收后菜单仍应可选来历（化身未建）');
});

test('未知动作：动作代号不在动作表即 rejected，除日志外状态不变，日志只多输入与拒绝条目', async (t) => {
  const root = testTempRoot('s13b-menu-unknown-');
  const h = await startHost({ saveRoot: root });
  t.after(async () => { await h.close(); removeTempRoot(root); });
  const b = beforeOf(h);
  const r = await act(h.base, 'act_no_such_row_s13b', {}, {});
  assertRejectedInLog(h, b, r, 'E-ACT-UNKNOWN');
});

test('whenRX 不过：尚无化身时 act_wait 即 rejected（E-ACT-PRECONDITION），有化身后 act_choose_origin 同样拒收', async (t) => {
  const root = testTempRoot('s13b-menu-when-');
  const h = await startHost({ saveRoot: root });
  t.after(async () => { await h.close(); removeTempRoot(root); });
  const b0 = beforeOf(h);
  const early = await act(h.base, 'act_wait', {}, { minutes: 30 });
  assertRejectedInLog(h, b0, early, 'E-ACT-PRECONDITION');

  await withAvatar(h.base);
  const b = beforeOf(h);
  const late = await act(h.base, 'act_choose_origin', { species: 0, origin: 0, place: 0, lodge: 0 });
  assertRejectedInLog(h, b, late, 'E-ACT-PRECONDITION');
});

// 在 JSON 树里找到 id 为 from 的动作行（数组元素或按键索引的对象），克隆一份改成 to。返回是否克隆到了。
function cloneRow(node, from, to) {
  let hit = false;
  if (!node || typeof node !== 'object') return false;
  if (!Array.isArray(node) && from in node && node[from] && typeof node[from] === 'object') {
    const row = structuredClone(node[from]);
    if ('id' in row) row.id = to;
    node[to] = row;
    hit = true;
  }
  if (Array.isArray(node)) {
    for (const el of [...node]) {
      if (el && typeof el === 'object' && el.id === from) {
        node.push({ ...structuredClone(el), id: to });
        hit = true;
      }
    }
  }
  for (const v of Object.values(node)) if (v && typeof v === 'object' && cloneRow(v, from, to)) hit = true;
  return hit;
}

test('加一行动作即出现并可提交：复制 act_wait 改 id，不改任何 .mjs，新动作进 menu 投影且可提交', async (t) => {
  const { root, repo } = copyRepo();
  t.after(() => removeTempRoot(root));
  const doc = JSON.parse(readFileSync(join(repo, 'world', 'actions', 'core.json'), 'utf8'));
  const NEW_ID = 'act_wait_s13b_copy';
  assert.ok(cloneRow(doc, 'act_wait', NEW_ID), 'world/actions/core.json 中应能找到 act_wait 行');
  writeUnderTempRoot(root, 'repo/world/actions/core.json', JSON.stringify(doc, null, 2));

  const h = await startHost({ repoDir: repo, saveRoot: join(root, 'save') });
  t.after(() => h.close());
  await withAvatar(h.base);
  const v = await view(h.base);
  const rows = v.json.menu ?? [];
  assert.ok(rows.some((m) => m.act === NEW_ID && !m.blocked), '新动作应出现在 menu 投影且未受阻');
  const r = await act(h.base, NEW_ID, {}, { minutes: 7 });
  assert.equal(r.json?.result, 'ok', `新动作应可提交：${r.text}`);
  assert.equal(r.json.advancedMinutes, 7, '新动作推进应为 7 分钟');
});
