// S1-3c（开局化身建档派生）黑盒验收：卡文第 8 条。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s13c。
// 依据见 docs/卡档案/feat-s1-3c/出题.md（卷:行 为依据）。
// 口径：选来历（真实动作）→ 推进 60 分钟（world.advance）→ 存槽 → 读档 → replay_apply；与 S1-3a 第 7 条同形。
// 不 mock，不写死表名、id、数值。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

import { init, loadSlot, replay_apply } from '../../../server-plugin/index.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

const roots = [];
after(() => {
  for (const r of roots.splice(0)) removeTempRoot(r);
});

const avatarIds = (world) =>
  Object.keys(world.state.created ?? {}).filter((id) => world.state.created[id].kind === 'person');

test('8. 复演一致：选来历建化身 → 推进 60 分钟 → 存槽 → 读档 replay_apply，saveDigest 逐字节相同；化身 species、adultMassKg、birthMinute 逐位相同', async () => {
  const root = testTempRoot('s13c-replay-');
  roots.push(root);
  const world = await init({ saveRoot: root });

  const origin = world.menu(null).affordances.find((x) => (x.act ?? x.id) === 'act_choose_origin').slots.origin;
  const place = world.menu(null).affordances.find((x) => (x.act ?? x.id) === 'act_choose_origin').slots.place;
  const picked = await world.act({ act: 'act_choose_origin', slots: { origin: 0, place: 0 } });
  assert.equal(picked.ok === true, true, `选来历应成功：${JSON.stringify(picked)}`);
  assert.ok(origin.length > 0 && place.length > 0, '开局候选不应为空');

  const ids = avatarIds(world);
  assert.equal(ids.length, 1, '选来历后应有一个化身');
  const id = ids[0];
  const before = { ...world.state.created[id].props };
  for (const k of ['species', 'adultMassKg', 'birthMinute']) {
    assert.notEqual(before[k], undefined, `存前化身 ${k} 应已写入`);
  }

  world.advance(60);
  const manifest = world.save(0);
  assert.equal(typeof manifest.saveDigest, 'string', '存档清单应带 saveDigest');

  const back = replay_apply(loadSlot({ slot: 0 }, { saveRoot: root }));
  assert.equal(back.saveDigest, manifest.saveDigest, '复演后的 saveDigest 应与存前逐字节相同');

  assert.deepEqual(avatarIds(back), ids, '复演后化身应存在且为同一实体');
  const after2 = back.state.created[id].props;
  for (const k of ['species', 'adultMassKg', 'birthMinute']) {
    assert.ok(Object.is(after2[k], before[k]), `复演后化身 ${k} 应逐位相同：${before[k]} 对 ${after2[k]}`);
  }
});
