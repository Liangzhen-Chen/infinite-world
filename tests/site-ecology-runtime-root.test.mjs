import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {loadRuntimeWorld} from '../tools/load-world.mjs';
import {applyChainLaws} from '../tools/kc-processing.mjs';

// 据点资源表属于运行时机制数据（meta/mechanics），只含运行时目录的世界根也要派生出与完整世界一致的储量。
const sites = world => Object.fromEntries(world.locations.filter(l => l.id.startsWith('site_ms_') && Array.isArray(l.site?.resources)).map(l => [l.id, l.site.resources.map(r => [r.id, r.quantity])]));
const runtimeOnlyRoot = async t => {
  const root = await fs.mkdtemp(path.join(tmpRoot(), 'site-eco-runtime-'));
  t.after(async () => {const target = path.resolve(root); assert.ok(target.startsWith(path.resolve(tmpRoot()) + path.sep)); await fs.rm(target, {recursive: true, force: true});});
  for (const folder of ['meta', 'people', 'geo', 'lore', 'rules']) await fs.cp(path.resolve('world', folder), path.join(root, folder), {recursive: true});
  return root;
};

test('只含运行时目录的世界根（无 design/）派生出的 site_ms_* 储量与完整世界一致', async t => {
  const full = await loadRuntimeWorld(), light = await loadRuntimeWorld(await runtimeOnlyRoot(t));
  const expected = sites(full);
  assert.ok(Object.keys(expected).length > 0);
  for (const rows of Object.values(expected)) for (const [, quantity] of rows) assert.ok(Number.isSafeInteger(quantity) && quantity >= 0);
  assert.deepEqual(sites(light), expected);
});

test('推不出储量时报明确的缺项错误，不留给下游报"有限库存无效"', () => {
  const place = () => [{id: 'loc_x', terrain: '平地', site: {resources: [{id: 'res_x', item: 'item_x'}]}}];
  assert.throws(() => applyChainLaws({locations: place(), recipes: [], items: []}), /据点资源无储量：loc_x\/res_x.*site-ecology\.json/);
  const ecology = {habitatOrder: ['plain'], biomeHabitats: {}, terrainHabitats: {平地: ['plain']}, resources: {}};
  assert.throws(() => applyChainLaws({locations: place(), recipes: [], items: []}, {ecology}), /据点资源无储量：loc_x\/res_x.*栖地/);
});
