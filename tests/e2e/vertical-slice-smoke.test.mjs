// 零 mock 端到端烟测（S1-3b；卷二 wire 路由与存档四路 :972–:1016；draft-s1-3 §3.2 六步；李白 11-26 条件：第 6 步必须是存槽→读档→验 saveDigest 逐字节一致）。
// 出题方：Claude Haiku 5.5（haiku-orca-test-s13b）。改写依据与逐项理由见 docs/卡档案/feat-s1-3b/出题.md。
// 全程经真 express 宿主路由 + fetch；结果只从 ReplyResult JSON 与 save_export 字节读，不读内存 state；不 mock、不 skip、不 todo。
// 每步失败报「停在第 N/6 步」，tests/e2e/wire-cuts.json 与 tools/accept/e2e-wire-cut.mjs 依赖这串文字判定拔线停在哪一步。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as plugin from '../../server-plugin/index.mjs';
import { express } from '../support/express.mjs';
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
    assert.ok((origin.slots?.species ?? []).length > 0, '开局菜单 act_choose_origin 缺种族槽候选（S1-3d 步 0 选种族）');
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
    const r = await act(B, 'act_choose_origin', { species: 0, origin: 0, place: 0, lodge: 0 });
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
    // S2-L（草案 §6）：选来历经账本真实入账——化身名下钱账户余额 = 所选来历出身条目的起始钱，ledgerTotals 该钱种开局来源累计同数；期望值取导出包自带的世界数据副本 doc_data。
    const [st] = findInShards(pkg, (o) => o.accounts !== undefined && o.ledgerTotals !== undefined && typeof o.clock?.minute === 'number');
    const [dd] = findInShards(pkg, (o) => o.vocabDoc !== undefined && o.tableDocs !== undefined && o.dimensionDocs !== undefined);
    assert.ok(st && dd, '导出包应有带账本键的 doc_state 与 doc_data');
    const endow = dd.tableDocs.economyLedger.rows.find((r) => r.key === 'endowment').value;
    const holders = Object.keys(st.accounts);
    assert.equal(holders.length, 1, '开局选来历后账本应只有化身一个持有人');
    const rec = st.created[holders[0]];
    const table = dd.dimensionDocs.find((d) => d.kind === rec.kind);
    const ent = dd.vocabDoc.families[table.dimensions[endow.originDimension].vocab].entries[table.rows[rec.template][endow.originDimension]];
    const coin = ent[endow.coinField];
    const bal = Object.values(st.accounts[holders[0]][endow.purpose][coin]).reduce((s, v) => s + v, 0);
    assert.equal(bal, ent[endow.moneyField], '化身钱账户余额应等于所选来历出身条目的起始钱');
    assert.equal(st.ledgerTotals[coin][endow.source].cumulative, ent[endow.moneyField], 'ledgerTotals 开局来源累计应等于起始钱');
    // S2-H（草案 §6）：选来历同一提案开玩家席位边、起始物逐件建实例入账并放置、散货按批次入账；期望值取导出包 doc_data。
    const rowOf = (code, key) => dd.tableDocs[code].rows.find((r) => r.key === key).value;
    const seatKind = rowOf('control', 'seatKind');
    const outfit = rowOf('social', 'outfit');
    const lotPrefix = rowOf('economyLedger', 'account').instanceLotPrefix;
    const avatar = holders[0];
    const edges = Object.values(st.holdings ?? {}).flatMap((book) => Object.values(book));
    const seats = edges.filter((e) => e.kind === seatKind);
    assert.equal(seats.length, 1, '应恰有一条玩家席位边');
    assert.ok(seats[0].holder === avatar && seats[0].subject === avatar, '席位边的持有者与标的都应是化身');
    const instanced = rowOf('items', 'instancedComponents');
    const itemRows = dd.dimensionDocs.find((d) => d.kind === 'item').rows;
    const isInst = (id) => (itemRows[id].classes ?? []).some((c) => instanced.includes(c));
    const items = ent[outfit.itemsField];
    const instLots = Object.values(st.accounts[avatar]).flatMap((byRes) => Object.values(byRes).flatMap((byKey) => Object.keys(byKey))).filter((k) => k.startsWith(lotPrefix));
    assert.equal(instLots.length, items.filter((x) => isInst(x.item)).reduce((s, x) => s + x.n, 0), '逐件起始物件数应等于化身名下实例批次账户数');
    assert.deepEqual(edges.filter((e) => e.kind !== seatKind).map((e) => e.subject).sort(), instLots.map((k) => k.slice(lotPrefix.length)).sort(), '每件实例应恰有一条放置边');
    const resources = dd.vocabDoc.families.resource.entries;
    for (const x of items.filter((y) => !isInst(y.item))) {
      const res = Object.keys(resources).find((k) => resources[k][outfit.resourceItemField] === x.item);
      assert.equal(Object.values(st.accounts[avatar][outfit.purpose][res]).reduce((s, v) => s + v, 0), x.n, `散货 ${x.item} 余额应等于 n`);
    }
    // S2-P（草案 §5）：选来历同一提案落位——化身 pos 为泡外代表格（coarse 真），facing 在 [0, grid.facingDirections)；
    // 界面命令 view 的 here 给「我在哪」：here.place 是挂建筑组件类（rules.gen.roleFacility）的地点行，chain 自它起、含出生地。期望值取导出包 doc_data。
    const me = rec.props ?? rec;
    assert.equal(me.pos?.coarse, true, '化身 pos 应为泡外代表格（coarse 真）');
    assert.ok(Number.isInteger(me.facing) && me.facing >= 0 && me.facing < rowOf('grid', 'facingDirections'), '化身 facing 应在八向序号内');
    const v = await view(B);
    assert.equal(v.json?.result, 'ok', `选来历后 view 未 ok：${v.text}`);
    const placeRows = dd.dimensionDocs.find((d) => d.kind === 'place').rows;
    assert.ok((placeRows[v.json.here?.place]?.classes ?? []).includes(rowOf('gen', 'roleFacility')), 'view.here.place 应是建筑地点行');
    assert.equal(v.json.here.chain[0], v.json.here.place, 'here.chain 应自所在地点起');
    assert.ok(v.json.here.chain.includes(me.birthplace), 'here.chain 应含化身出生地');
    // S2-T1（草案 §5，主会话 Q9 甲）：view 的此刻 now 只给数与代号——minute 是存档时钟，day、minuteOfDay 按单位表手算，季节与节气是词表条目；不断言具体日期与天气。
    const now = v.json.now;
    const unitSi = (id) => dd.unitsDoc.units.find((u) => u.id === id).si;
    const perDay = unitSi('day') / unitSi('minute');
    assert.equal(now?.minute, pkg.manifest.clockMinute, 'view.now.minute 应等于存档时钟');
    assert.deepEqual([now.day, now.minuteOfDay], [Math.floor(now.minute / perDay), now.minute % perDay], 'now.day、minuteOfDay 应按一日分钟手算');
    assert.ok(Object.hasOwn(dd.vocabDoc.families.season.entries, now.season?.id), 'now.season.id 应是词表族 season 的条目');
    assert.ok(Object.hasOwn(dd.vocabDoc.families.solar_term.entries, now.solarTerm), 'now.solarTerm 应是词表族 solar_term 的条目');
    assert.ok(Array.isArray(now.gaps), 'now.gaps 应是缺口代号表');
    // S2-T2（草案 §4，主会话 Q4 甲）：now.weather.state 是词表族 weather 条目；数值项为数或 null，有 null 时 gaps 非空（不当 0、不兜底）。
    assert.ok(Object.hasOwn(dd.vocabDoc.families.weather.entries, now.weather?.state), 'now.weather.state 应是词表族 weather 的条目');
    assert.ok(['precipMm', 'windMps', 'windDirDeg', 'cloud', 'humidity'].every((k) => typeof now.weather[k] === 'number' || (now.weather[k] === null && now.gaps.length > 0)), 'now.weather 数值项应为数，或为 null 且 gaps 非空');
    ctx.now1 = now;
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
    // S2-T1：此刻是纯派生，复演回到同一时刻后 view.now 与存档前逐字节相同。
    const vr = await view(B);
    assert.equal(JSON.stringify(vr.json?.now), JSON.stringify(ctx.now1), '读档复演后 view.now 应与存档前逐字节相同');

    const w = await act(B, 'act_wait', {}, { minutes: 10 });
    assert.equal(w.json?.result, 'ok', `读档后 act_wait 10 未 ok（续玩）：${w.text}`);
    assert.equal(w.json.advancedMinutes, 10, '读档后 advancedMinutes 应为 10');
    const vw = await view(B);
    assert.equal(vw.json?.now?.minute, ctx.now1.minute + 10, '等待 10 分钟后 view.now.minute 应加 10');
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

// S2-0c1（NPC 死后财物分流）零 mock 补充：线协议只有菜单动作、没有提案路由，所以 create 与 destroy 经真实 init 的 submitProposal 走。
// 不并入上面六步（wire-cuts.json 依赖「第 N/6 步」）。依据见 docs/卡档案/feat-s2-0c1/出题.md。
test('零 mock 补充：开局 → 以来历建 NPC → destroy → 每种资源世界总量不变，死者零残留', async (t) => {
  const root = testTempRoot('s2-0c1-e2e-');
  t.after(() => removeTempRoot(root));
  const world = await plugin.init(express.Router(), { saveRoot: root });
  const isOk = (r) => r?.ok === true || r?.result === 'ok';
  const menuOrigin = world.menu(null).affordances.find((x) => (x.act ?? x.id) === 'act_choose_origin');
  assert.ok(menuOrigin, '开局菜单应含 act_choose_origin');
  const rowId = menuOrigin.slots.origin[0];
  const opened = await world.act({ act: 'act_choose_origin', slots: { species: 0, origin: 0, place: 0, lodge: 0 } });
  assert.equal(isOk(opened), true, `开局选来历应成功：${JSON.stringify(opened)}`);
  // 有心智物种：物种表里 classes 含 comp_sapient 的首行（数据取，不写 id）。
  const sapient = JSON.parse(readFileSync(new URL('../../world/ontology/dimensions/species.json', import.meta.url), 'utf8')).rows;
  const species = Object.keys(sapient).find((k) => sapient[k].classes.includes('comp_sapient'));
  const persons = () => Object.keys(world.state.created).filter((k) => world.state.created[k].kind === 'person');
  const beforePersons = persons();
  const made = world.submitProposal({ effects: [{ op: 'create', kind: 'person', template: rowId, facts: { species } }] });
  assert.equal(isOk(made), true, `以来历行建 person 应成功：${JSON.stringify(made)}`);
  const [npc] = persons().filter((k) => !beforePersons.includes(k));
  assert.ok(npc, 'create 应新增一个 person');
  const totals = () => {
    const out = {};
    for (const byPurpose of Object.values(world.state.accounts ?? {})) {
      for (const byRes of Object.values(byPurpose ?? {})) {
        for (const [res, byKey] of Object.entries(byRes ?? {})) {
          out[res] = (out[res] ?? 0) + Object.values(byKey ?? {}).reduce((s, v) => s + v, 0);
        }
      }
    }
    return out;
  };
  const before = totals();
  assert.ok(Object.values(before).some((v) => v > 0), '前提：带来历 NPC 应有非零余额');
  const gone = world.submitProposal({ effects: [{ op: 'destroy', entity: npc }] });
  assert.equal(isOk(gone), true, `destroy 应成功：${JSON.stringify(gone)}`);
  const afterTotals = totals();
  for (const res of new Set([...Object.keys(before), ...Object.keys(afterTotals)])) {
    assert.equal(afterTotals[res] ?? 0, before[res] ?? 0, `资源 ${res} 的世界总量 destroy 前后应相同`);
  }
  const npcAccounts = Object.values(world.state.accounts?.[npc] ?? {}).flatMap((byRes) => Object.values(byRes).flatMap((byKey) => Object.values(byKey)));
  assert.ok(npcAccounts.every((v) => v === 0), '死者名下账户应全为零或无');
  const liveHolds = [...world.logBook.entries.reduce((m, e) => {
    if (e.kind !== 'event' || e.ok !== true || e.verb !== 'verb_holding_changed') return m;
    const p = e.payload ?? {};
    if (p.change === 'ended') m.delete(p.edge);
    else m.set(p.edge, p);
    return m;
  }, new Map()).values()];
  assert.deepEqual(liveHolds.filter((p) => p.holder === npc || p.subject === npc), [], '死者不应是任何现役边的持有者或标的');
});
