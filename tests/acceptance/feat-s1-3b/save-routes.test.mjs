// S1-3b 存档四路黑盒验收（卷二:1012 存读档是 menu 路由动作；卷二:1015 导出成功发字节、失败 postReply；卷二:1016 导入同一套校验；
// 卷二:979 save_import 载荷与 saveImportMaxBytes；卷二:981 wire_body 头；卷二十七 R27-4.3 规则指纹比较）。draft-s1-3 §6 第 8、9 条。
// 出题方：Claude Haiku 5.5（haiku-orca-test-s13b）。
// 不写死表名与值：saveImportMaxBytes 从 world/rules/tables/host.json 读行，超限测试只在临时副本里把它改小。
// 存档字节格式见 tests/support/wire-host.mjs 头注释（Q5 已采纳）；规则指纹字段名按 manifest 里含 rules 与 digest 的键找，找不到即失败。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startHost, copyRepo, saveAt, loadAt, exportAt, importAt, unpack, tamperShardBytes } from '../../support/wire-host.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

// 起一个用临时根做 saveRoot 的宿主；清理由调用方的 t.after 负责。
async function fresh(t, prefix, repoDir) {
  const root = testTempRoot(prefix);
  const h = await startHost({ repoDir, saveRoot: join(root, 'save') });
  t.after(async () => { await h.close(); removeTempRoot(root); });
  return { h, root, B: h.base };
}

test('导出成功：save_export 响应头 wire_body 为 bytes，字节可解为存档包', async (t) => {
  const { B } = await fresh(t, 's13b-save-export-');
  const s = await saveAt(B, 0);
  assert.equal(s.json?.result, 'ok', `存槽 0 未 ok：${s.text}`);
  const e = await exportAt(B, 0);
  assert.equal(e.status, 200, '导出成功应 200');
  assert.equal(e.wireBody, 'bytes', '导出成功的响应头 wire_body 应为 bytes（卷二:981）');
  const pkg = unpack(e.buf);
  assert.equal(pkg.format, 'if-save-v1', '存档包 format 应为 if-save-v1（Q5）');
  assert.equal(typeof pkg.manifest.saveDigest, 'string', '清单应含 saveDigest');
});

test('导出槽位越界：走 postReply 报 E-SAVE-SLOT-INVALID，响应头为 envelope，不发字节', async (t) => {
  const { B } = await fresh(t, 's13b-save-slot-');
  const e = await exportAt(B, 1000000);
  assert.equal(e.wireBody, 'envelope', '导出失败的响应头 wire_body 应为 envelope（卷二:981）');
  assert.match(e.text, /E-SAVE-SLOT-INVALID/, '越界槽位应报 E-SAVE-SLOT-INVALID');
});

test('读空槽：读一个从未存过的槽，报 E-SAVE-EMPTY', async (t) => {
  const { B } = await fresh(t, 's13b-save-empty-');
  const l = await loadAt(B, 5);
  assert.match(l.text, /E-SAVE-EMPTY/, '空槽读档应报 E-SAVE-EMPTY');
});

test('导入合法字节后可读档：导出的字节导入到另一槽，再读档 ok', async (t) => {
  const { B } = await fresh(t, 's13b-save-roundtrip-');
  await saveAt(B, 1);
  const e = await exportAt(B, 1);
  const imp = await importAt(B, 3, e.buf);
  assert.equal(imp.json?.result, 'ok', `合法字节导入应 ok：${imp.text}`);
  const l = await loadAt(B, 3);
  assert.equal(l.json?.result, 'ok', '导入的槽应可读档');
});

test('导入超限：字节超过 saveImportMaxBytes 报 E-SAVE-IMPORT-SIZE（临时副本里把上限改为 64）', async (t) => {
  const tmp = testTempRoot('s13b-save-size-');
  t.after(() => removeTempRoot(tmp));
  const repo = copyRepo(join(tmp, 'repo'));
  const hostPath = join(repo, 'world', 'rules', 'tables', 'host.json');
  const table = JSON.parse(readFileSync(hostPath, 'utf8'));
  const row = table.rows.find((r) => r.key === 'saveImportMaxBytes');
  assert.ok(row, 'world/rules/tables/host.json 中应有 saveImportMaxBytes 行');
  row.value = 64;
  writeFileSync(hostPath, JSON.stringify(table, null, 2), 'utf8');

  const h = await startHost({ repoDir: repo, saveRoot: join(tmp, 'save') });
  t.after(() => h.close());
  await saveAt(h.base, 1);
  const e = await exportAt(h.base, 1);
  assert.ok(e.buf.length > 64, '导出字节应超过 64 字节，用于触发超限');
  const imp = await importAt(h.base, 2, e.buf);
  assert.match(imp.text, /E-SAVE-IMPORT-SIZE/, '超过 saveImportMaxBytes 应报 E-SAVE-IMPORT-SIZE');
});

test('导入改一字节：分片摘要不符报 E-SAVE-SHARD-DIGEST', async (t) => {
  const { B } = await fresh(t, 's13b-save-tamper-');
  await saveAt(B, 1);
  const e = await exportAt(B, 1);
  const imp = await importAt(B, 2, tamperShardBytes(e.buf));
  assert.match(imp.text, /E-SAVE-SHARD-DIGEST/, '改一字节的导入应报 E-SAVE-SHARD-DIGEST');
});

test('导入规则指纹不同：清单规则指纹被改即报 E-SAVE-RULES-MISMATCH', async (t) => {
  const { B } = await fresh(t, 's13b-save-rules-');
  await saveAt(B, 1);
  const e = await exportAt(B, 1);
  const pkg = unpack(e.buf);
  const key = Object.keys(pkg.manifest).find((k) => /rules/i.test(k) && /digest/i.test(k));
  assert.ok(key, '清单中应有规则指纹字段（键名含 rules 与 digest）');
  pkg.manifest[key] = 'mismatch-s13b';
  const imp = await importAt(B, 2, Buffer.from(JSON.stringify(pkg), 'utf8'));
  assert.match(imp.text, /E-SAVE-RULES-MISMATCH/, '规则指纹不同应报 E-SAVE-RULES-MISMATCH');
});

test('导入不改当前 state：导入前后即时存档的 saveDigest 相同', async (t) => {
  const { B } = await fresh(t, 's13b-save-nostate-');
  await saveAt(B, 1);
  const src = await exportAt(B, 1);
  await saveAt(B, 4);
  const before = unpack((await exportAt(B, 4)).buf).manifest.saveDigest;
  const imp = await importAt(B, 3, src.buf);
  assert.equal(imp.json?.result, 'ok', `导入应 ok：${imp.text}`);
  await saveAt(B, 5);
  const after = unpack((await exportAt(B, 5)).buf).manifest.saveDigest;
  assert.equal(after, before, '导入不应改当前 state（导入前后 saveDigest 相同）');
});
