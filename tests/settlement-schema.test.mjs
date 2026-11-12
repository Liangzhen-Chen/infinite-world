// 公共仓期初粮食（publicStock.food）由运行时目标持有规律推导，登记里不再必填：schema 的完整经济形态下它是可选字段（旧数据带 food 仍合法）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import Ajv from 'ajv';
import {loadWorld} from '../tools/load-world.mjs';

const schema = JSON.parse(await fs.readFile('schemas/world.schema.json', 'utf8'));
const validate = new Ajv({strict: true, allowUnionTypes: true, allErrors: true}).compile({$ref: '#/$defs/settlementProfile', $defs: schema.$defs});
const world = await loadWorld();
const withStock = () => structuredClone(world.settlementProfiles.find(p => p.details?.economy?.publicStock));

test('完整经济形态：publicStock 没有 food 合法，带 food（旧数据）也合法；其余必填项仍必填', () => {
  const row = withStock();
  delete row.details.economy.publicStock.food;
  assert.equal(validate(row), true, JSON.stringify(validate.errors));
  row.details.economy.publicStock.food = 1;
  assert.equal(validate(row), true, JSON.stringify(validate.errors));
  // 只放宽 food：去掉别的必填项（如 seed）仍被拒绝，且不会因此落到“无经济 + reason”形态而放过。
  delete row.details.economy.publicStock.food;
  delete row.details.economy.publicStock.seed;
  assert.equal(validate(row), false);
  // food 若写了，类型仍受限（非负整数）。
  const bad = withStock();
  bad.details.economy.publicStock.food = -1;
  assert.equal(validate(bad), false);
});
