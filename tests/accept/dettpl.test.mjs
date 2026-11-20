// 确定性模板登记 dettpl（卷十二 §2.8、§2.11；块 6 第 6-20 张建）：登记器是唯一写者，行 {tplCode, compares, paramsSchema, source}；
// compares 是封闭枚举的非空不重复子集，paramsSchema 的参数键须是登记的参数键类，条目行的 tpl 须指向已登记的模板。
// 临时仓库只用 tempRepo() 拿到的目录加常量相对路径（S12-2）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { register } from '../../tools/accept/register.mjs';
import { readRegistry } from '../../tools/accept/read.mjs';
import { ROOT, tempRepo } from './temp-repo.mjs';

const ROW = { tplCode: 'det_probe', compares: ['event_stream', 'world_state_digest'], paramsSchema: {}, source: '卷十二 §2.8 确定性模板首批（测试用行，登在临时仓库）' };
const dettplRows = (dir) => JSON.parse(readFileSync(join(dir, 'tools/accept/dettpl.json'), 'utf8')).rows;

test('真实仓库登记了 det_save_load：比存档摘要；A27-4.3 条目的 detector 填它（卷十二 §2.2 :194），method 是摘要比对、在测试台上跑，没有自造字段', () => {
  assert.ok(existsSync(join(ROOT, 'tools/accept/dettpl.json')));
  assert.deepEqual(readRegistry(ROOT, 'dettpl').map((r) => r.tplCode), ['det_save_load']);
  const row = dettplRows(ROOT).find((r) => r.tplCode === 'det_save_load');
  assert.deepEqual(row.compares, ['save_digest']);
  const item = readRegistry(ROOT, 'items').find((r) => r.itemKey === 'vol27.A27-4.3');
  assert.deepEqual([item.detector, item.method, item.runsOn, item.state], ['det_save_load', 'digest_compare', 'cloud_ref', 'registered']);
  assert.equal(item.tpl, undefined);
  assert.equal(item.impl, undefined);
});

test('登记器收合规的模板行，按主键升序写入 dettpl.json，原有行保留', () => {
  const dir = tempRepo();
  try {
    const res = register(dir, { dettpl: [ROW] });
    assert.deepEqual(res.errors, []);
    assert.deepEqual(dettplRows(dir).map((r) => r.tplCode), ['det_probe', 'det_save_load']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('登记器拒收不合规的模板行且不写盘：空 compares、重复、不在枚举里、paramsSchema 空值或键类不对、缺 source、缺代号', () => {
  const dir = tempRepo();
  try {
    const before = readFileSync(join(dir, 'tools/accept/dettpl.json'), 'utf8');
    const bad = [
      { ...ROW, compares: [] },
      { ...ROW, compares: ['save_digest', 'save_digest'] },
      { ...ROW, compares: ['bytes'] },
      { ...ROW, paramsSchema: null },
      { ...ROW, paramsSchema: { tables: 'group' } },
      { ...ROW, source: '' },
      { ...ROW, tplCode: '' },
    ];
    for (const row of bad) {
      const res = register(dir, { dettpl: [row] });
      assert.ok(res.errors.length > 0, JSON.stringify(row));
      assert.equal(readFileSync(join(dir, 'tools/accept/dettpl.json'), 'utf8'), before);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('摘要比对条目的 detector 填了就必须是已登记的模板：指向没登记的拒，不写盘', () => {
  const dir = tempRepo();
  try {
    const cur = readRegistry(dir, 'items').find((r) => r.itemKey === 'vol27.A27-4.3');
    const res = register(dir, { items: [{ ...cur, detector: 'det_nope' }] });
    assert.match(res.errors.join('\n'), /E-ACC-ITEM-FORM vol27\.A27-4\.3: digest_compare item: detector det_nope is not a registered determinism template/);
    assert.equal(readRegistry(dir, 'items').find((r) => r.itemKey === 'vol27.A27-4.3').detector, 'det_save_load');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
