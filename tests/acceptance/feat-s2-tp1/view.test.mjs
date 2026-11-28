// S2-TP1 黑盒验收：菜单 view 的 here 带法阵与掌管者代号（验收要点第 7 条）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-tp1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-tp1/出题.md。here 里法阵字段的形状由写码方定，本测试只认键名 circle（找不到即报错）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

// 开局候选里，按归属聚落分出「有法阵」与「无法阵（人类聚落）」两组的下标。
async function candidatesByCircle() {
  const { offer } = await S.startAt(0);
  const sites = S.expectedCircleSites(S.ROOT);
  const withCircle = [];
  const without = [];
  offer.forEach((id, i) => {
    const owner = S.ownerOfPlace(S.ROOT, id);
    if (!owner || S.isMonsterPlace(S.ROOT, id)) return;
    if (sites.has(owner)) withCircle.push({ i, id, owner });
    else without.push({ i, id, owner });
  });
  return { withCircle, without };
}

test('7a. 有法阵的聚落建筑内，here 带法阵与掌管者代号：法阵字段存在，且含该聚落的掌管组织代号（坊归镇衙署，取镇）', async () => {
  const { withCircle } = await candidatesByCircle();
  assert.ok(withCircle.length > 0, '前提：开局候选里应有位于有法阵聚落内的建筑');
  const pick = withCircle[0];
  const { world, avatar } = await S.startAt(pick.i);
  const here = world.menu(avatar).here;
  const circle = S.findKey(here, 'circle');
  assert.ok(circle, `有法阵处的 here 应带法阵字段（here=${JSON.stringify(here)}）`);
  // 口径（主会话定）：所在地点归属的聚落（掌管组织）持有法阵，就带 circle {holder, host, tier}；host 为宿主建筑，不要求站在宿主建筑里。
  assert.equal(circle.holder, pick.owner, `circle.holder 应为掌管组织 ${pick.owner}`);
  const site = S.expectedCircleSites(S.ROOT).get(pick.owner);
  assert.equal(circle.host, site.host, `circle.host 应为宿主建筑 ${site.host}`);
  assert.ok(typeof circle.tier === 'string' && circle.tier.length > 0, 'circle.tier 应为阶代号');
});

test('7b. 无法阵处 here 不带法阵：人类聚落但无法阵（穷村）的建筑内，here 里没有法阵字段', async () => {
  const { without } = await candidatesByCircle();
  assert.ok(without.length > 0, '前提：开局候选里应有位于无法阵人类聚落内的建筑');
  const pick = without[0];
  const { world, avatar } = await S.startAt(pick.i);
  const here = world.menu(avatar).here;
  assert.equal(S.findKey(here, 'circle'), null, `无法阵处 here 不应带法阵字段（here=${JSON.stringify(here)}）`);
});
