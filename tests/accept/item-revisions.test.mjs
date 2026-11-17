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

test('登记的非扫描式条目共 42 条（卷一 14、卷十二 28），每条 rev 为 1、带首条修订记录', () => {
  const rows = nonScan();
  assert.equal(rows.length, 42);
  assert.equal(rows.filter((r) => r.volume === 'vol1').length, 14);
  assert.equal(rows.filter((r) => r.volume === 'vol12').length, 28);
  for (const r of rows) {
    assert.equal(r.rev, 1, r.itemKey);
    assert.equal(r.revisions.length, 1, r.itemKey);
    assert.equal(r.revisions[0].rev, 1, r.itemKey);
    assert.equal(r.state, 'registered', r.itemKey);
  }
});

test('S12-16：42 条非扫描式条目首次登记零报错，门禁不报降级', async () => {
  const dir = tempRepo();
  try {
    const rows = nonScan().map(({ print, ...r }) => r);
    const path = join(dir, 'tools/accept/items.json');
    const all = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ rows: all.rows.filter((r) => r.scanClass) }));
    const res = register(dir, { items: rows });
    assert.deepEqual(res.errors, []);
    const stored = readRegistry(dir, 'items').filter((r) => !r.scanClass);
    assert.equal(stored.length, 42);
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
    writeFileSync(path, JSON.stringify(all));
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
    writeFileSync(path, JSON.stringify({ rows: keep }));
    const rowsOf = async () => (await accRun('pre_commit', 'S12-3', null, { root: dir })).rows.filter((r) => r.itemKey === 'vol12.S12-3' && (r.symbolPath === 'vol1' || r.symbolPath.startsWith('vol1.')));
    assert.deepEqual((await rowsOf()).map((r) => `${r.symbolPath}|${r.errorCode}`), []);
    // 拿掉 V-1.b：原条目 V-1 缺 b 部分，按未登记；卷一计数按原条目少一条，也报。
    writeFileSync(path, JSON.stringify({ rows: keep.filter((r) => r.itemKey !== 'vol1.V-1.b') }));
    assert.deepEqual((await rowsOf()).map((r) => `${r.symbolPath}|${r.errorCode}`).sort(), ['vol1.V-1|E-ACC-ITEM-UNREGISTERED', 'vol1|E-ACC-ITEM-COUNT'].sort());
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
