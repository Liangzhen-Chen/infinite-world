// S1-3d（开局选种族）黑盒验收：卡文第 6 条。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s13d。
// 依据与每条测什么，见 docs/卡档案/feat-s1-3d/出题.md（卷:行 为依据）。
// 口径：选种族+来历+出生地（真实动作）→ 推进 60 分钟 → 存槽 → 读档 replay_apply；saveDigest 逐字节相同，化身 species 逐位相同。
// 与 S1-3c 第 8 条同形，区别：这里 species 是菜单所选（props.species），不再经来历行读入。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

import { express } from '../../support/express.mjs';
import { init, loadSlot, replay_apply } from '../../../server-plugin/index.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

const roots = [];
after(() => {
  for (const r of roots.splice(0)) removeTempRoot(r);
});

const avatarIds = (/** @type {any} */ world) =>
  Object.keys(world.state.created ?? {}).filter((id) => world.state.created[id].kind === 'person');

test('6. 复演一致：选种族+来历建化身 → 推进 60 分钟 → 存槽 → 读档 replay_apply，saveDigest 逐字节相同；化身 species 逐位相同', async () => {
  const root = testTempRoot('s13d-replay-');
  roots.push(root);
  const world = await init(express.Router(), { saveRoot: root });

  const species = world.menu(null).affordances.find((/** @type {any} */ x) => (x.act ?? x.id) === 'act_choose_origin').slots.species;
  assert.ok(Array.isArray(species) && species.length > 0, '种族候选不应为空');
  const picked = await world.act({ act: 'act_choose_origin', slots: { species: 0, origin: 0, place: 0 } });
  assert.equal(picked.ok === true, true, `选种族+来历应成功：${JSON.stringify(picked)}`);

  const ids = avatarIds(world);
  assert.equal(ids.length, 1, '选来历后应有一个化身');
  const id = ids[0];
  const before = { species: world.state.created[id].props.species, adultMassKg: world.state.created[id].props.adultMassKg, birthMinute: world.state.created[id].props.birthMinute };
  assert.equal(before.species, species[0], '存前化身 species 应为所选种族候选');
  for (const k of ['adultMassKg', 'birthMinute']) assert.notEqual(before[k], undefined, `存前化身 ${k} 应已写入`);

  world.advance(60);
  const manifest = world.save(0);
  assert.equal(typeof manifest.saveDigest, 'string', '存档清单应带 saveDigest');

  const back = replay_apply(loadSlot({ slot: 0 }, { saveRoot: root }));
  assert.equal(back.saveDigest, manifest.saveDigest, '复演后的 saveDigest 应与存前逐字节相同');
  assert.deepEqual(avatarIds(back), ids, '复演后化身应存在且为同一实体');
  const rec = back.state.created[id].props;
  for (const k of ['species', 'adultMassKg', 'birthMinute']) {
    assert.ok(Object.is(rec[k], before[k]), `复演后化身 ${k} 应逐位相同：${before[k]} 对 ${rec[k]}`);
  }
});
