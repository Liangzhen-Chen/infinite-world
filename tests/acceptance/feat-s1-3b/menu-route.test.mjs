// S1-3b 菜单路由黑盒验收（卷二:976 数值槽越界拒收；卷九 A9-1.3 动作表加行即出现在菜单；draft-s1-3 §6 第 4、6 条）。
// 出题方：Claude Haiku 5.5（haiku-orca-test-s13b）。
// 不写死表名、id、数值：动作行与槽位候选从菜单投影（ReplyResult.menu）读；数据改动只在临时副本上做。
// 期望码取自卷文与 kernel/errors.mjs 已登记码：E-ACT-SLOT（数值或候选越界）、E-ACT-UNKNOWN（未知动作）、E-ACT-PRECONDITION（whenRX 不过）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startHost, copyRepo, view, act, saveAt, exportAt, unpack } from '../../support/wire-host.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

// 状态快照：存一槽再导出，取 saveDigest 与时钟。存档不改状态，两次快照之间状态不变即为「不动」。
async function snapshot(base, slot) {
  const s = await saveAt(base, slot);
  assert.equal(s.json?.result, 'ok', `快照存槽 ${slot} 未 ok`);
  const e = await exportAt(base, slot);
  const m = unpack(e.buf).manifest;
  return { digest: m.saveDigest, clock: m.clockMinute };
}

// 先选来历，建出化身，使 act_wait 等依赖化身的动作可用。候选编号 0 即菜单里的第一个候选。
async function withAvatar(base) {
  const r = await act(base, 'act_choose_origin', { origin: 0, place: 0 });
  assert.equal(r.json?.result, 'ok', `选来历未 ok，无法进入有化身状态：${r.text}`);
}

test('数值槽越界：整数参数超出动作登记的 min..max 即 rejected，状态与时钟不动', async (t) => {
  const root = testTempRoot('s13b-menu-slot-');
  const h = await startHost({ saveRoot: root });
  t.after(async () => { await h.close(); removeTempRoot(root); });
  await withAvatar(h.base);
  const before = await snapshot(h.base, 0);
  for (const minutes of [0, -1, 10 ** 12]) {
    const r = await act(h.base, 'act_wait', {}, { minutes });
    assert.equal(r.json?.result, 'rejected', `minutes=${minutes} 应 rejected：${r.text}`);
    assert.equal(r.json.code, 'E-ACT-SLOT', `minutes=${minutes} 应报 E-ACT-SLOT`);
  }
  const after = await snapshot(h.base, 1);
  assert.equal(after.digest, before.digest, '越界拒收后 saveDigest 不应变（state 不变）');
  assert.equal(after.clock, before.clock, '越界拒收后时钟不应动');
});

test('候选编号越界：候选编号不在菜单候选内即 rejected，state 不变', async (t) => {
  const root = testTempRoot('s13b-menu-cand-');
  const h = await startHost({ saveRoot: root });
  t.after(async () => { await h.close(); removeTempRoot(root); });
  const before = await snapshot(h.base, 0);
  const r = await act(h.base, 'act_choose_origin', { origin: 999999, place: 0 });
  assert.equal(r.json?.result, 'rejected', `候选编号越界应 rejected：${r.text}`);
  assert.equal(r.json.code, 'E-ACT-SLOT', '候选编号越界应报 E-ACT-SLOT');
  const after = await snapshot(h.base, 1);
  assert.equal(after.digest, before.digest, '候选越界拒收后 saveDigest 不应变');
  const v = await view(h.base);
  const origin = (v.json.menu ?? []).find((m) => m.act === 'act_choose_origin');
  assert.ok(origin && !origin.blocked, '拒收后菜单仍应可选来历（化身未建）');
});

test('未知动作：动作代号不在动作表即 rejected，state 不变', async (t) => {
  const root = testTempRoot('s13b-menu-unknown-');
  const h = await startHost({ saveRoot: root });
  t.after(async () => { await h.close(); removeTempRoot(root); });
  const before = await snapshot(h.base, 0);
  const r = await act(h.base, 'act_no_such_row_s13b', {}, {});
  assert.equal(r.json?.result, 'rejected', `未知动作应 rejected：${r.text}`);
  assert.equal(r.json.code, 'E-ACT-UNKNOWN', '未知动作应报 E-ACT-UNKNOWN');
  const after = await snapshot(h.base, 1);
  assert.equal(after.digest, before.digest, '未知动作拒收后 saveDigest 不应变');
  assert.equal(after.clock, before.clock, '未知动作拒收后时钟不应动');
});

test('whenRX 不过：尚无化身时 act_wait 即 rejected（E-ACT-PRECONDITION），有化身后 act_choose_origin 同样拒收', async (t) => {
  const root = testTempRoot('s13b-menu-when-');
  const h = await startHost({ saveRoot: root });
  t.after(async () => { await h.close(); removeTempRoot(root); });
  const before = await snapshot(h.base, 0);
  const early = await act(h.base, 'act_wait', {}, { minutes: 30 });
  assert.equal(early.json?.result, 'rejected', '无化身时 act_wait 应 rejected');
  assert.equal(early.json.code, 'E-ACT-PRECONDITION', '无化身时 act_wait 应报 E-ACT-PRECONDITION');
  const mid = await snapshot(h.base, 1);
  assert.equal(mid.digest, before.digest, 'whenRX 拒收后 saveDigest 不应变');
  assert.equal(mid.clock, before.clock, 'whenRX 拒收后时钟不应动');

  await withAvatar(h.base);
  const late = await act(h.base, 'act_choose_origin', { origin: 0, place: 0 });
  assert.equal(late.json?.result, 'rejected', '已有化身时 act_choose_origin 应 rejected');
  assert.equal(late.json.code, 'E-ACT-PRECONDITION', '已有化身时 act_choose_origin 应报 E-ACT-PRECONDITION');
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
  const tmp = testTempRoot('s13b-menu-addrow-');
  t.after(() => removeTempRoot(tmp));
  const repo = copyRepo(join(tmp, 'repo'));
  const actionsPath = join(repo, 'world', 'actions', 'core.json');
  const doc = JSON.parse(readFileSync(actionsPath, 'utf8'));
  const NEW_ID = 'act_wait_s13b_copy';
  assert.ok(cloneRow(doc, 'act_wait', NEW_ID), 'world/actions/core.json 中应能找到 act_wait 行');
  writeFileSync(actionsPath, JSON.stringify(doc, null, 2), 'utf8');

  const h = await startHost({ repoDir: repo, saveRoot: join(tmp, 'save') });
  t.after(() => h.close());
  await withAvatar(h.base);
  const v = await view(h.base);
  const rows = v.json.menu ?? [];
  assert.ok(rows.some((m) => m.act === NEW_ID && !m.blocked), '新动作应出现在 menu 投影且未受阻');
  const r = await act(h.base, NEW_ID, {}, { minutes: 7 });
  assert.equal(r.json?.result, 'ok', `新动作应可提交：${r.text}`);
  assert.equal(r.json.advancedMinutes, 7, '新动作推进应为 7 分钟');
});
