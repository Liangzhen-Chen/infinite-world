// 零 mock 端到端烟测（S1-3b；卷二 wire 路由与存档四路 :972–:1016；draft-s1-3 §3.2 六步；李白 11-26 条件：第 6 步必须是存槽→读档→验 saveDigest 逐字节一致）。
// 出题方：Claude Haiku 5.5（haiku-orca-test-s13b）。改写依据与逐项理由见 docs/卡档案/feat-s1-3b/出题.md。
// 全程经真 express 宿主路由 + fetch；结果只从 ReplyResult JSON 与 save_export 字节读，不读内存 state；不 mock、不 skip、不 todo。
// 每步失败报「停在第 N/6 步」，tests/e2e/wire-cuts.json 与 tools/accept/e2e-wire-cut.mjs 依赖这串文字判定拔线停在哪一步。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as plugin from '../../server-plugin/index.mjs';
import { startHost, view, act, saveAt, loadAt, exportAt, importAt, unpack, findInShards, tamperShardBytes } from '../support/wire-host.mjs';
import { testTempRoot, removeTempRoot } from '../accept/temp-root.mjs';

test('零 mock 端到端烟测：宿主路由 6 步闭环（存读档经 menu 路由，replay 验 saveDigest）', async (t) => {
  const root = testTempRoot('s13b-smoke-');
  let h = null;
  let B = '';
  t.after(async () => { if (h) await h.close(); removeTempRoot(root); });
  const ctx = {};

  // 每步包一层「停在第 N/6 步」外壳，断言失败与宿主报错都落在具体一步上。
  const step = async (n, name, fn) => {
    try {
      await fn();
    } catch (e) {
      throw new Error(`[E2E 未实现] 停在第 ${n}/6 步「${name}」：${e.message}`);
    }
  };

  await step(1, '开局（视图、菜单投影、开局快照）', async () => {
    h = await startHost({ plugin, saveRoot: root });
    B = h.base;
    const v = await view(B);
    assert.equal(v.json?.result, 'ok', `界面命令 view 未返回 ok：${v.text}`);
    const menuRows = v.json.menu ?? [];
    const origin = menuRows.find((m) => m.act === 'act_choose_origin');
    const wait = menuRows.find((m) => m.act === 'act_wait');
    assert.ok(origin && !origin.blocked, '菜单缺未受阻的 act_choose_origin（开局尚无化身）');
    assert.ok(!wait || wait.blocked, '菜单中 act_wait 若列出则须带 blocked（尚无化身；不列出亦可，S1-3a 合同）');
    const s0 = await saveAt(B, 0);
    assert.equal(s0.json?.result, 'ok', `存槽 0 未 ok：${s0.text}`);
    const e0 = await exportAt(B, 0);
    assert.equal(e0.wireBody, 'bytes', '导出成功的响应头 wire_body 应为 bytes');
    ctx.clock0 = unpack(e0.buf).manifest.clockMinute;
    ctx.bytes0 = e0.buf;
    assert.equal(typeof ctx.clock0, 'number', '存档清单缺 clockMinute');
  });

  await step(2, 'state.created 新建化身并写另一实体 ref（真实菜单动作）', async () => {
    const r = await act(B, 'act_choose_origin', { origin: 0, place: 0 });
    assert.equal(r.json?.result, 'ok', `act_choose_origin 未 ok：${r.text}`);
    assert.ok(r.json.events && r.json.events.to >= r.json.events.from, '结果缺事件序号区间 events');
    ctx.seqAfterOrigin = r.json.events.to;
  });

  await step(3, '真实菜单动作经 submitProposal 落事务与 LogBook（等待 30 分）', async () => {
    const r = await act(B, 'act_wait', {}, { minutes: 30 });
    assert.equal(r.json?.result, 'ok', `act_wait 30 未 ok：${r.text}`);
    assert.equal(r.json.advancedMinutes, 30, 'advancedMinutes 应为 30');
    assert.equal(r.json.events.to, ctx.seqAfterOrigin + 1, '事件序号应比上一步 +1');
  });

  await step(4, '推进时间：越界分钟数拒收，时钟不动（时钟在第 5 步导出包核）', async () => {
    const r = await act(B, 'act_wait', {}, { minutes: 0 });
    assert.equal(r.json?.result, 'rejected', `minutes=0 应 rejected：${r.text}`);
  });

  await step(5, '存槽与导出：清单时钟 = 开局 + 30；新建化身 birthplace 为地点 id', async () => {
    const s1 = await saveAt(B, 1);
    assert.equal(s1.json?.result, 'ok', `存槽 1 未 ok：${s1.text}`);
    assert.equal(s1.json.save?.slot, 1, '存档结果应回显槽位 1');
    const e1 = await exportAt(B, 1);
    assert.equal(e1.wireBody, 'bytes', '导出成功的响应头 wire_body 应为 bytes');
    const pkg = unpack(e1.buf);
    assert.equal(pkg.manifest.clockMinute, ctx.clock0 + 30, '清单 clockMinute 应为开局 + 30（越界那次不推进）');
    const persons = findInShards(pkg, (o) => o.kind === 'person' && (o.birthplace ?? o.props?.birthplace) != null);
    assert.ok(persons.length >= 1, '导出 doc_state 中应有 kind:person 且带 birthplace 的化身');
    ctx.d1 = pkg.manifest.saveDigest;
    ctx.bytes1 = e1.buf;
    assert.equal(typeof ctx.d1, 'string', '存档清单缺 saveDigest');
  });

  await step(6, '读档后 replay_apply 验 saveDigest 逐字节一致；续玩时钟连续；导入与篡改', async () => {
    // 读档前先改状态：读档若是空操作，这 7 分钟会留在状态里，槽 2 摘要就不等于 D1（审卡必须改 ③）。
    const pre = await act(B, 'act_wait', {}, { minutes: 7 });
    assert.equal(pre.json?.result, 'ok', `读档前 act_wait 7 未 ok：${pre.text}`);
    const l1 = await loadAt(B, 1);
    assert.equal(l1.json?.result, 'ok', `读档 slot 1 未 ok（读档内部复演校验 saveDigest）：${l1.text}`);
    const s2 = await saveAt(B, 2);
    assert.equal(s2.json?.result, 'ok', `读档后存槽 2 未 ok：${s2.text}`);
    const e2 = await exportAt(B, 2);
    assert.equal(unpack(e2.buf).manifest.saveDigest, ctx.d1, '读档后立即再存的 saveDigest 应与读档前存档逐字节相同');

    const w = await act(B, 'act_wait', {}, { minutes: 10 });
    assert.equal(w.json?.result, 'ok', `读档后 act_wait 10 未 ok（续玩）：${w.text}`);
    assert.equal(w.json.advancedMinutes, 10, '读档后 advancedMinutes 应为 10');
    const s5 = await saveAt(B, 5);
    assert.equal(s5.json?.result, 'ok', `续玩后存槽 5 未 ok：${s5.text}`);
    const e5 = await exportAt(B, 5);
    assert.equal(unpack(e5.buf).manifest.clockMinute, ctx.clock0 + 40, '续玩后时钟应连续为开局 + 40');

    const imp = await importAt(B, 3, ctx.bytes0);
    assert.equal(imp.json?.result, 'ok', `导入合法字节 slot 3 未 ok：${imp.text}`);
    const l3 = await loadAt(B, 3);
    assert.equal(l3.json?.result, 'ok', '导入后的槽 3 应可读档');

    const bad = await importAt(B, 4, tamperShardBytes(ctx.bytes0));
    assert.match(bad.text, /E-SAVE-SHARD-DIGEST/, '改一字节的导入应报 E-SAVE-SHARD-DIGEST');
  });
});
