// 4-3 补：加载入口装配骰值键限定成分个数上限（卷二 S10 :2404；卷二十七 R27-8.5 :728）。
// 本文件不在模块顶层预装 installSampleConstants：先证未装配时 diceKeyOf 报缺常数，再经 loadWorld 装配后可用，
// 最后证规则表缺该键时加载入口按现有常数装配的同一方式拒（E-DIM-STRUCT-FIELD）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { diceKeyOf } from '../../server-plugin/kernel/sample.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('未装配骰值键上限时 diceKeyOf 报加载顺序错，不给缺省', () => {
  assert.throws(
    () => diceKeyOf('seed_ab12', 'clock_draw', ['place_a', 'field_b'], 5, 'draw_weather'),
    /rules\.kernelConstants\.diceKeyMaxQualifiers missing \(load order\)/,
  );
});

test('经 loadWorld 装配后 diceKeyOf 可用，限定成分上限为卷二十七 :728 的一到两个', () => {
  const r = loadWorld(ROOT);
  assert.ok(r.ok, r.text);
  // 主体 id 后接两个限定成分（上限值）放行；接三个按上限拒（R27-8.5 :728）。
  assert.equal(
    diceKeyOf('seed_ab12', 'clock_draw', ['place_a', 'field_b'], 5, 'draw_weather'),
    'seed_ab12|clock_draw|place_a|field_b|5|draw_weather',
  );
  assert.throws(
    () => diceKeyOf('seed_ab12', 'clock_draw', ['place_a', 'field_b', 2, 3], 5, 'draw_weather'),
    (e) => e.code === 'E-SEED-COMPONENT',
  );
});

test('规则表缺 diceKeyMaxQualifiers 时 loadWorld 按常数装配的报错方式拒', () => {
  const tmp = testTempRoot('sample-const-');
  try {
    const real = (f) => readFileSync(join(ROOT, 'world/rules', f), 'utf8');
    const row = JSON.parse(real('registry.json')).rows.find((x) => x.code === 'kernelConstants');
    const doc = JSON.parse(real(row.file));
    doc.rows = doc.rows.filter((x) => x.key !== 'diceKeyMaxQualifiers');
    writeUnderTempRoot(tmp, 'registry.json', JSON.stringify({ rows: [row] }));
    writeUnderTempRoot(tmp, row.file, JSON.stringify(doc));
    assert.throws(
      () => loadWorld(ROOT, { rulesDir: tmp }),
      /E-DIM-STRUCT-FIELD rules\.kernelConstants: diceKeyMaxQualifiers missing/,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
