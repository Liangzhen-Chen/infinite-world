// 公共仓期初粮食（publicStock.food）由运行时目标持有规律推导，手填已退役：schema 的完整经济形态里没有这个字段（publicStock 不允许额外字段），谁再手填都会被拒。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import Ajv from 'ajv';
import {loadWorld} from '../tools/load-world.mjs';

const schema = JSON.parse(await fs.readFile('schemas/world.schema.json', 'utf8'));
const validate = new Ajv({strict: true, allowUnionTypes: true, allErrors: true}).compile({$ref: '#/$defs/settlementProfile', $defs: schema.$defs});
const world = await loadWorld();
// 发布前世界里仍登记着旧初粮，发布后已无：取一行带 publicStock 的，先去掉 food 作基准（发布前后都成立）。
const base = () => { const row = structuredClone(world.settlementProfiles.find(p => p.details?.economy?.publicStock)); delete row.details.economy.publicStock.food; return row; };

test('完整经济形态：没有 food 合法；带 food（手填初粮已退役）被拒；其余必填项（seed）仍必填', () => {
  const row = base();
  assert.equal(validate(row), true, JSON.stringify(validate.errors));
  row.details.economy.publicStock.food = 1;
  assert.equal(validate(row), false);
  // 精确：有一条错误是 publicStock 不允许额外字段 food。
  assert.ok(validate.errors.some(e => e.keyword === 'additionalProperties' && e.params.additionalProperty === 'food' && e.instancePath.endsWith('/economy/publicStock')), JSON.stringify(validate.errors));
  const noSeed = base();
  delete noSeed.details.economy.publicStock.seed;
  assert.equal(validate(noSeed), false);
});
