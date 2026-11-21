// 格子迁移 G11：布局模板族与分片角色族的加载期校验（kernel/layout.mjs checkLayoutTemplates）。
// 对照表 docs/迁移体检/格子G6-G11-规矩检查对照.md 第 70、74 行；卷十九 §2.4（layout、zrole 族条目字段）、§4.6 规则 1、3、4 与 A19-6.1–6.3。
// 期望值按卷文规则手算：份额之和为 1（定点，0.5 + 0.3 + 0.2 恰为 1）、adjacent 引用的角色在本模板内、模板里不写设施数量（键集封闭）。夹具的代号只出现在本测试文件。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { checkLayoutTemplates } from '../../server-plugin/kernel/layout.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT); // 装配定点常数
assert.ok(W.ok, W.text);
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const zone = (role, share, adjacent = []) => ({ role, share, adjacent });
const GOOD = () => ({ zones: [zone('zrole_a', 0.5, ['zrole_b']), zone('zrole_b', 0.3, ['zrole_a', 'zrole_c']), zone('zrole_c', 0.2, ['zrole_b'])], applies: 'known(waterAccess)' });
const index = (extra = {}) => new Map(Object.entries({
  zrole_a: { family: 'zrole', entry: { typeAffinity: {} } },
  zrole_b: { family: 'zrole', entry: { typeAffinity: {} } },
  zrole_c: { family: 'zrole', entry: { typeAffinity: {} } },
  layout_x: { family: 'layout', entry: GOOD() },
  ...extra,
}));
const codes = (errors) => errors.map((e) => e.split(' ')[0]);

test('合格模板与角色：份额 0.5 + 0.3 + 0.2 恰为 1、adjacent 都在本模板内，无错', () => {
  assert.deepEqual(checkLayoutTemplates(index()), []);
});

test('只加数据：再加一条模板条目（另一组角色、另一种份额）同样被核，不改代码；有错的那条只报它自己', () => {
  const more = { layout_y: { family: 'layout', entry: { zones: [zone('zrole_a', 0.6, ['zrole_c']), zone('zrole_c', 0.5, ['zrole_a'])], applies: 'known(waterAccess)' } } };
  const errs = checkLayoutTemplates(index(more));
  assert.deepEqual(codes(errs), ['E-DIM-DOMAIN-RANGE']); // 0.6 + 0.5 = 1.1 ≠ 1
  assert.match(errs[0], /layout_y/);
  assert.doesNotMatch(errs[0], /layout_x/);
});

test('份额之和不为 1（差 0.0001 也拒）、单项份额越出 [0, 1]、非数', () => {
  const a = GOOD(); a.zones[2].share = 0.2001; // 和 = 1.0001
  assert.deepEqual(codes(checkLayoutTemplates(index({ layout_x: { family: 'layout', entry: a } }))), ['E-DIM-DOMAIN-RANGE']);
  const b = GOOD(); b.zones[0].share = 1.5;
  assert.ok(codes(checkLayoutTemplates(index({ layout_x: { family: 'layout', entry: b } }))).includes('E-DIM-DOMAIN-RANGE'));
  const c = GOOD(); c.zones[0].share = '0.5';
  assert.ok(codes(checkLayoutTemplates(index({ layout_x: { family: 'layout', entry: c } }))).includes('E-DIM-DOMAIN-RANGE'));
});

test('adjacent 引用的角色须在本模板内；角色须是 zrole 族条目；同一角色不重复；角色不与自己相邻', () => {
  const a = GOOD(); a.zones[0].adjacent = ['zrole_zz'];
  assert.deepEqual(codes(checkLayoutTemplates(index({ layout_x: { family: 'layout', entry: a } }))), ['E-DIM-REF-MISSING']);
  const b = GOOD(); b.zones[1].role = 'zrole_nope';
  assert.ok(codes(checkLayoutTemplates(index({ layout_x: { family: 'layout', entry: b } }))).includes('E-DIM-REF-MISSING'));
  const c = GOOD(); c.zones[2].role = 'zrole_a'; // 重复角色
  assert.ok(codes(checkLayoutTemplates(index({ layout_x: { family: 'layout', entry: c } }))).includes('E-DIM-DUPLICATE-KEY'));
  const d = GOOD(); d.zones[0].adjacent = ['zrole_a'];
  assert.ok(codes(checkLayoutTemplates(index({ layout_x: { family: 'layout', entry: d } }))).includes('E-DIM-DOMAIN-RANGE'));
});

test('模板里不写设施数量：条目与分片项的键集封闭，多出任何键（如 count、facilities）都拒；zones 与 applies 必写', () => {
  const a = GOOD(); a.facilityCount = 12;
  assert.deepEqual(codes(checkLayoutTemplates(index({ layout_x: { family: 'layout', entry: a } }))), ['E-DIM-STRUCT-FIELD']);
  const b = GOOD(); b.zones[0].count = 3;
  assert.deepEqual(codes(checkLayoutTemplates(index({ layout_x: { family: 'layout', entry: b } }))), ['E-DIM-STRUCT-FIELD']);
  assert.deepEqual(codes(checkLayoutTemplates(index({ layout_x: { family: 'layout', entry: { applies: 'known(waterAccess)' } } }))), ['E-DIM-REQUIRED-MISSING']);
  assert.deepEqual(codes(checkLayoutTemplates(index({ layout_x: { family: 'layout', entry: { zones: [], applies: 'known(waterAccess)' } } }))), ['E-DIM-REQUIRED-MISSING']); // 空表不放过
  const c = GOOD(); delete c.applies;
  assert.deepEqual(codes(checkLayoutTemplates(index({ layout_x: { family: 'layout', entry: c } }))), ['E-DIM-REQUIRED-MISSING']);
  const d = GOOD(); d.applies = '';
  assert.deepEqual(codes(checkLayoutTemplates(index({ layout_x: { family: 'layout', entry: d } }))), ['E-DIM-REQUIRED-MISSING']);
});

test('分片角色：typeAffinity 必写（可为空表）；键须是 facility_type 族条目、值 [0, 1]；没有设施类型表时非空亲和度拒（不放过）', () => {
  // 空表：卷十九 §4.6 规则 3 + 卷十 R10-7.5"模板里没有任何角色对它有亲和度时归份额最大的角色"。
  assert.deepEqual(checkLayoutTemplates(index()), []);
  const noKey = { zrole_a: { family: 'zrole', entry: {} } };
  assert.ok(codes(checkLayoutTemplates(index(noKey))).includes('E-DIM-REQUIRED-MISSING'));
  const unknownType = { zrole_a: { family: 'zrole', entry: { typeAffinity: { facility_type_inn: 0.5 } } } };
  assert.deepEqual(codes(checkLayoutTemplates(index(unknownType))), ['E-DIM-REF-MISSING']);
  const withType = { facility_type_inn: { family: 'facility_type', entry: {} }, zrole_a: { family: 'zrole', entry: { typeAffinity: { facility_type_inn: 0.5 } } } };
  assert.deepEqual(checkLayoutTemplates(index(withType)), []);
  const tooBig = { facility_type_inn: { family: 'facility_type', entry: {} }, zrole_a: { family: 'zrole', entry: { typeAffinity: { facility_type_inn: 1.5 } } } };
  assert.deepEqual(codes(checkLayoutTemplates(index(tooBig))), ['E-DIM-DOMAIN-RANGE']);
  const extra = { zrole_a: { family: 'zrole', entry: { typeAffinity: {}, count: 1 } } };
  assert.deepEqual(codes(checkLayoutTemplates(index(extra))), ['E-DIM-STRUCT-FIELD']);
});
