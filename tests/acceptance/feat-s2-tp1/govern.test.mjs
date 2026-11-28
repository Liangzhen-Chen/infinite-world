// S2-TP1 黑盒验收：开局统治边（卷八:1267 R8-18.9 ②③、卷八:773 R8-5.1）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-tp1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-tp1/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('1a. 每处聚落恰有一条统治边，标的是该聚落的 seat，持有者是该聚落组织（数据推出的聚落组织集合）', async () => {
  const { world } = await S.freshWorld();
  const orgs = S.orgsOf(S.ROOT);
  const settle = S.settlementOrgIds(S.ROOT);
  assert.ok(settle.length > 1, '前提：数据里应有多于一处聚落组织');
  const gov = S.governsEdges(world.state, S.ROOT);
  for (const id of settle) {
    const seat = orgs[id].seat;
    const mine = gov.filter((e) => e.subject === seat);
    assert.equal(mine.length, 1, `聚落 ${id} 的 seat ${seat} 应恰有一条统治边，实得 ${mine.length}`);
    assert.equal(mine[0].holder, id, `seat ${seat} 的统治边持有者应为 ${id}`);
  }
});

test('1b. 统治边排他：同一标的至多一条 hk_governs 边（卷八:773 setGovernor 唯一写入口）', async () => {
  const { world } = await S.freshWorld();
  const count = new Map();
  for (const e of S.governsEdges(world.state, S.ROOT)) count.set(e.subject, (count.get(e.subject) ?? 0) + 1);
  for (const [subject, n] of count) assert.equal(n, 1, `标的 ${subject} 的统治边应恰一条，实得 ${n}`);
});

test('1c. 坊归镇衙署：数据里 originSite 指向某聚落 seat、自身不是 seat 的地点，统治边持有者是该聚落组织（前提：这样的坊非空）', async () => {
  const { world } = await S.freshWorld();
  const places = S.placesOf(S.ROOT);
  const orgs = S.orgsOf(S.ROOT);
  const settle = S.settlementOrgIds(S.ROOT);
  const seatToOrg = new Map(settle.map((k) => [orgs[k].seat, k]));
  const fangs = Object.keys(places).filter((id) => !seatToOrg.has(id)
    && seatToOrg.has(places[id].originSite) && !S.isMonsterPlace(S.ROOT, id));
  assert.ok(fangs.length > 0, '前提：数据里应有 originSite 指向聚落 seat 的坊（含荒地）');
  const gov = S.governsEdges(world.state, S.ROOT);
  for (const id of fangs) {
    const want = seatToOrg.get(places[id].originSite);
    const mine = gov.filter((e) => e.subject === id);
    assert.equal(mine.length, 1, `坊 ${id} 应恰有一条统治边`);
    assert.equal(mine[0].holder, want, `坊 ${id} 的统治边应归 ${want}（originSite 所指聚落）`);
  }
});

test('1d. 怪物社会不挂白石镇：怪物社会地点没有归镇衙署的统治边（卷八 总纲 :26、亮圳 11-28 02:48 与李白裁定：不属白石镇）', async () => {
  const { world } = await S.freshWorld();
  const town = S.townOrgOf(S.ROOT);
  const monsters = Object.keys(S.placesOf(S.ROOT)).filter((id) => S.isMonsterPlace(S.ROOT, id));
  assert.ok(monsters.length > 0, '前提：数据里应有怪物社会地点');
  const toTown = S.governsEdges(world.state, S.ROOT).filter((e) => e.holder === town && monsters.includes(e.subject));
  assert.equal(toTown.length, 0, `怪物社会地点不应归镇衙署，实得 ${toTown.map((e) => e.subject).join(',')}`);
});
