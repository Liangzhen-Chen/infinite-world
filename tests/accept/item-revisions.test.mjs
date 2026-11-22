// S12-16 非扫描式条目的修订记录（李白 11-17 S12-16 裁定）：记在条目行自身，首次登记不算降级，已登记条目有改动须 rev 加一并补记录。
// 写临时仓库只用 tempRepo() 拿到的目录加常量相对路径（S12-2）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { accRun } from '../../tools/accept/run.mjs';
import { register } from '../../tools/accept/register.mjs';
import { readRegistry } from '../../tools/accept/read.mjs';
import { ROOT, tempRepo } from './temp-repo.mjs';

const failedOf = (report) => Object.fromEntries(report.items.failed.map((f) => [f.itemKey, f.codes]));
const nonScan = () => readRegistry(ROOT, 'items').filter((it) => !it.scanClass);
const V5 = 'vol1.V-5';

// 块 3 第 3-3 张登卷六 4 条（A6-1.2 a/b/c、A6-1.3）。B2-W1 起 vol12.A12-4.5 转扫描式（不再是非扫描条目，48 → 47）；
// vol12.A12-4.4 改了 source（挂 B5-ACT），按 R12-11.11 已 rev 2 并补修订记录。块 6 第 6-20 张登卷二十七 1 条（A27-4.3，对到模板 det_save_load）：47 → 48。
// G1 位置类型登卷二十七 1 条（A27-4.9 格基底不存档，state registered）：48 → 49。
// G2 高度场与区格派生登卷二十七 1 条（A27-5.6 格派生的确定性，state registered）：49 → 50。
// G10 第一步登卷二十七 1 条（A27-1.12 泡由状态算出，指向 tests/kernel/sim-tiers.test.mjs，state implemented）：50 → 51。
// G9 登卷二十七 1 条（A27-1.14 离屏不写差分拒写侧，指向 tests/kernel/grid-diff.test.mjs，state registered）：51 → 52；A27-4.9 升 implemented（指向 tests/kernel/save.test.mjs）。
// G10 余下登卷二十七 2 条（A27-1.13 展开收起切分无关、A27-1.15 扩展性，指向 tests/kernel/bubble.test.mjs、bubble-scale.test.mjs，state registered）：52 → 54。
// G13（6-8）登卷九 1 条（A9-2.1 emit 适配器文件扫描，指向 tests/kernel/emit-adapter.test.mjs，state registered）：54 → 55。
test('登记的非扫描式条目共 55 条（卷一 14、卷十二 29、卷六 4、卷二十七 7、卷九 1），除 A12-4.4 外每条 rev 为 1、带首条修订记录', () => {
  const rows = nonScan();
  assert.equal(rows.length, 55);
  assert.equal(rows.filter((r) => r.volume === 'vol1').length, 14);
  assert.equal(rows.filter((r) => r.volume === 'vol12').length, 29);
  assert.equal(rows.filter((r) => r.volume === 'vol6').length, 4);
  assert.equal(rows.filter((r) => r.volume === 'vol27').length, 7);
  assert.equal(rows.filter((r) => r.volume === 'vol9').length, 1);
  // vol27.A27-4.3 在 6-20 修改轮改了 detector、method、runsOn（Opus 只核 ⑥），按 R12-11.11 已 rev 2 并补修订记录。
  const revised = (k) => k === 'vol12.A12-4.4' || k === 'vol27.A27-4.3';
  for (const r of rows) {
    assert.equal(r.rev, revised(r.itemKey) ? 2 : 1, r.itemKey);
    assert.equal(r.revisions.length, revised(r.itemKey) ? 2 : 1, r.itemKey);
    assert.equal(r.revisions[0].rev, 1, r.itemKey);
  }
  // 状态：门禁设施卡（api-gatecore）把 A6-1.2 a、b 经执行器真跑测试文件为 pass 后流转进必过集合（R12-11.7），其余仍 registered。
  assert.deepEqual(rows.filter((r) => r.state !== 'registered').map((r) => [r.itemKey, r.state]), [['vol27.A27-1.12', 'implemented'], ['vol27.A27-4.9', 'implemented'], ['vol6.A6-1.2.a', 'in_core'], ['vol6.A6-1.2.b', 'in_core']]);
});

test('S12-16：55 条非扫描式条目首次登记零报错，门禁不报降级', async () => {
  const dir = tempRepo();
  try {
    // 首次登记一律从 registered 起（R12-11.7），已流转的条目按首次登记的样子交行；已有修订记录的条目（A12-4.4）不走首次登记。
    const rows = nonScan().filter((r) => r.rev === 1).map(({ print, impl, ...r }) => ({ ...r, state: 'registered' }));
    const path = join(dir, 'tools/accept/items.json');
    const all = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(join(dir, 'tools/accept/items.json'), JSON.stringify({ rows: all.rows.filter((r) => r.scanClass) }));
    const res = register(dir, { items: rows });
    assert.deepEqual(res.errors, []);
    const stored = readRegistry(dir, 'items').filter((r) => !r.scanClass);
    // 临时仓库的初版只留扫描式条目，这里再登 53 条首登（A12-4.4、A27-4.3 已有修订记录，不在首登输入里）。
    assert.equal(stored.length, 53);
    assert.ok(stored.every((r) => typeof r.print === 'string' && r.print.length === 64));
    const failed = failedOf((await accRun('pre_commit', 'S12-16', null, { root: dir })).report);
    assert.equal(failed['vol12.S12-16'], undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('S12-16：已登记条目被改弱而没有修订记录，登记器与门禁都报 E-ACC-ITEM-DOWNGRADE', async () => {
  const dir = tempRepo();
  try {
    const cur = readRegistry(dir, 'items').find((r) => r.itemKey === V5);
    const weaker = { ...cur, stage: 3, gates: ['seal'] };
    const res = register(dir, { items: [weaker] });
    assert.match(res.errors.join('\n'), /E-ACC-ITEM-DOWNGRADE vol1\.V-5/);
    const path = join(dir, 'tools/accept/items.json');
    const all = JSON.parse(readFileSync(path, 'utf8'));
    Object.assign(all.rows.find((r) => r.itemKey === V5), { stage: 3, gates: ['seal'] });
    writeFileSync(join(dir, 'tools/accept/items.json'), JSON.stringify(all));
    const failed = failedOf((await accRun('pre_commit', 'S12-16', null, { root: dir })).report);
    assert.deepEqual(failed['vol12.S12-16'], ['E-ACC-ITEM-DOWNGRADE']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('S12-16：有修订记录的合规改动不报；rev 跳号、删旧记录、只加记录不改内容都拒', async () => {
  const dir = tempRepo();
  try {
    const cur = readRegistry(dir, 'items').find((r) => r.itemKey === V5);
    const rec = { rev: 2, date: '2026-11-18', summary: '期望值由 all_pass 改 zero', card: 'fx' };
    const good = { ...cur, expect: 'zero', rev: 2, revisions: [...cur.revisions, rec] };
    assert.match(register(dir, { items: [{ ...good, rev: 3 }] }).errors.join('\n'), /E-ACC-ITEM-DOWNGRADE vol1\.V-5/);
    assert.match(register(dir, { items: [{ ...good, revisions: [rec] }] }).errors.join('\n'), /E-ACC-ITEM-DOWNGRADE vol1\.V-5/);
    assert.match(register(dir, { items: [{ ...cur, rev: 2, revisions: [...cur.revisions, rec] }] }).errors.join('\n'), /E-ACC-ITEM-FORM vol1\.V-5/);
    assert.deepEqual(register(dir, { items: [good] }).errors, []);
    const after = readRegistry(dir, 'items').find((r) => r.itemKey === V5);
    assert.equal(after.rev, 2);
    assert.equal(after.revisions.length, 2);
    const failed = failedOf((await accRun('pre_commit', 'S12-16', null, { root: dir })).report);
    assert.equal(failed['vol12.S12-16'], undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('S12-3：拆 a/b 的原条目按一个原条目计，缺一部分按未登记；作废条不计', async () => {
  const dir = tempRepo();
  try {
    const path = join(dir, 'tools/accept/items.json');
    const all = JSON.parse(readFileSync(path, 'utf8'));
    const v1 = all.rows.filter((r) => r.volume === 'vol1' && r.localNo === 'V-1');
    assert.equal(v1.length, 2);
    // 卷一定义处只放 V-1（a、b 两行同属它）与已登记的 V-11、一条作废条 V-2（删除线起首，不计）。
    mkdirSync(join(dir, 'docs/统一底层设计'), { recursive: true });
    writeFileSync(join(dir, 'docs/统一底层设计/卷一-总纲与分层.md'), '| V-1 | 夹具 |\n| V-11 | 夹具 |\n- ~~**V-2** 作废，不计~~\n');
    const keep = all.rows.filter((r) => (['V-1', 'V-11'].includes(r.localNo) && r.volume === 'vol1') || r.itemKey === 'vol12.S12-3');
    writeFileSync(join(dir, 'tools/accept/items.json'), JSON.stringify({ rows: keep }));
    const rowsOf = async () => (await accRun('pre_commit', 'S12-3', null, { root: dir })).rows.filter((r) => r.itemKey === 'vol12.S12-3' && (r.symbolPath === 'vol1' || r.symbolPath.startsWith('vol1.')));
    assert.deepEqual((await rowsOf()).map((r) => `${r.symbolPath}|${r.errorCode}`), []);
    // 拿掉 V-1.b：原条目 V-1 缺 b 部分，按未登记；卷一计数按原条目少一条，也报。
    writeFileSync(join(dir, 'tools/accept/items.json'), JSON.stringify({ rows: keep.filter((r) => r.itemKey !== 'vol1.V-1.b') }));
    assert.deepEqual((await rowsOf()).map((r) => `${r.symbolPath}|${r.errorCode}`).sort(), ['vol1.V-1|E-ACC-ITEM-UNREGISTERED', 'vol1|E-ACC-ITEM-COUNT'].sort());
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
