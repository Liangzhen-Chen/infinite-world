// 格子迁移 G4《地形步进系数与路况系数的加载校验》卡内测试：place.mjs checkPaceTables 的取值域校验
// （卷五 §4.10.1 :1058–:1059：terrain 条目 paceFactor 与规则表 terrainModifiers.slopeCurve 严格大于 0；
//  §4.1 规则 5 :471：grid.json.roadPaceFactor 不大于全部地形的 paceFactor；对照表 38 行）。
// 前提都在测试里造：真实维度表目录或规则表目录拷到仓库外临时目录，只改一处，经 loadWorld 加载，看报哪个码。
// 只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../accept/temp-root.mjs';
import { createHash } from 'node:crypto';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const DIMS = 'world/ontology/dimensions';
const realText = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
const codes = (r) => r.errors.map((e) => e.code);

// 真实维度表目录拷到临时目录，其中 _vocab.json 经 patch(vocabObject) 改后写入；临时目录用完即删。
function loadVocabPatched(patch) {
  const tmp = testTempRoot('pace-vocab-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, realText(f));
    const v = JSON.parse(realText('_vocab.json'));
    patch(v);
    writeUnderTempRoot(tmp, '_vocab.json', JSON.stringify(v));
    return loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// 真实规则表目录拷到临时目录，patch(rel, text) 改文本（rel 如 'tables/grid.json'）；临时目录用完即删。
function rulesTree(dir, base, tmp, patch) {
  for (const ent of readdirSync(join(dir, base), { withFileTypes: true })) {
    const rel = `${base}/${ent.name}`.replace(/^\//, '');
    if (ent.isDirectory()) rulesTree(dir, rel, tmp, patch);
    else writeUnderTempRoot(tmp, `rules/${rel}`, patch(rel, readFileSync(join(dir, rel), 'utf8')));
  }
}

function loadRulesPatched(patch) {
  const tmp = testTempRoot('pace-rules-');
  try {
    rulesTree(join(ROOT, 'world/rules'), '', tmp, patch);
    return loadWorld(ROOT, { rulesDir: join(tmp, 'rules') });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

test('真实世界加载通过：terrain 十条都有 paceFactor 且 > 0，roadPaceFactor 0.8 不大于最小 paceFactor 1，slopeCurve 各点 > 0', () => {
  const r = loadWorld(ROOT);
  assert.equal(r.ok, true, r.text);
});

test('terrain 条目缺 paceFactor：加载拒收（E-DIM-REQUIRED-MISSING）', () => {
  const r = loadVocabPatched((v) => { delete v.families.terrain.entries.terrain_plain.paceFactor; });
  assert.equal(r.ok, false, r.text);
  assert.ok(codes(r).includes('E-DIM-REQUIRED-MISSING'), r.text);
});

test('terrain 的 paceFactor 写成 0、负数、字符串、null：加载拒收（E-DIM-DOMAIN-RANGE）', () => {
  for (const bad of [0, -1, 'fast', null]) {
    const r = loadVocabPatched((v) => { v.families.terrain.entries.terrain_plain.paceFactor = bad; });
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(codes(r).includes('E-DIM-DOMAIN-RANGE'), `${JSON.stringify(bad)}: ${r.text}`);
  }
});

test('roadPaceFactor 大于某地形 paceFactor：加载拒收；恰等于最小 paceFactor 1：放行', () => {
  const tooSlow = loadRulesPatched((rel, text) => (rel === 'tables/grid.json' ? text.replace('"value": 0.8,', '"value": 1.2,') : text));
  assert.equal(tooSlow.ok, false, tooSlow.text);
  assert.ok(codes(tooSlow).includes('E-DIM-DOMAIN-RANGE'), tooSlow.text);
  const equal = loadRulesPatched((rel, text) => (rel === 'tables/grid.json' ? text.replace('"value": 0.8,', '"value": 1,') : text));
  assert.equal(equal.ok, true, equal.text);
});

test('roadPaceFactor 为 0：加载拒收（E-DIM-DOMAIN-RANGE；登记域允许 0，但路不会比任何地形慢）', () => {
  const r = loadRulesPatched((rel, text) => (rel === 'tables/grid.json' ? text.replace('"value": 0.8,', '"value": 0,') : text));
  assert.equal(r.ok, false, r.text);
  assert.ok(codes(r).includes('E-DIM-DOMAIN-RANGE'), r.text);
});

test('slopeCurve 有点不大于 0：加载拒收；各点 > 0：放行；末尾真实世界仍加载通过', () => {
  const zero = loadRulesPatched((rel, text) => (rel === 'tables/terrain-modifiers.json' ? text.replace('[[0, 1], [0.1, 1.25], [0.3, 2], [0.6, 4], [1, 8]]', '[[0, 0], [1, 8]]') : text));
  assert.equal(zero.ok, false, zero.text);
  assert.ok(codes(zero).includes('E-DIM-DOMAIN-RANGE'), zero.text);
  const positive = loadRulesPatched((rel, text) => (rel === 'tables/terrain-modifiers.json' ? text.replace('[[0, 1], [0.1, 1.25], [0.3, 2], [0.6, 4], [1, 8]]', '[[0, 1], [1, 8]]') : text));
  assert.equal(positive.ok, true, positive.text);
  assert.equal(loadWorld(ROOT).ok, true);
});
