// 整键写者登记（S2-L 主会话裁定【1】甲，李白附加条件 1）：stateKeys.<键>.writers 的空串键 '' 表示该顶层键整键（卷二:252 ledgerTotals「整键的值，无 * 段」）。
// 行为测试只用内存里的虚拟文件，不读写仓库登记：登记了整键写者的写入不报；没登记（或只登 '*'）的整键写入照报 E-VIEW-UNDECLARED-WRITE；别的文件写同一整键照报。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext } from '../../tools/accept/read.mjs';
import { detect as pathDetect } from '../../tools/accept/detectors/path_access.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctxOf = (files) => loadContext(ROOT, { files: [...files.keys()].sort(), read: (p) => files.get(p) });
const params = { access: 'write', codes: ['E-VIEW-UNDECLARED-WRITE', 'E-VIEW-BYPASS'], groups: ['rules'] };
const cls = { writeEntries: ['kernel/storage.mjs#writePath'] };
const code = '/** @param {State} s @returns {void} */\nexport function f(s, tx) { writePath(s, P.totals(), { a: 1 }, tx); }\n';
const run = (writers, file = 'server-plugin/__case__/whole.mjs') => {
  const decl = JSON.stringify({ stateKeys: { totals: { writers } }, pathTypes: { totals: 'map<string,number>' } });
  return pathDetect(ctxOf(new Map([['world/ontology/state-owners.json', decl], [file, code]])), params, cls);
};
const writer = { create: ['__case__/whole.mjs'], rewrite: '__case__/whole.mjs', viaRelocate: false };

test('整键写者：writers 空串键登记了本文件，整键写入不报', () => {
  assert.equal(run({ '': writer }).length, 0);
});

test('整键写者：没登记空串键（无写者，或只有 * 段写者）时整键写入照报 E-VIEW-UNDECLARED-WRITE', () => {
  assert.ok(run({}).some((h) => h.code === 'E-VIEW-UNDECLARED-WRITE'));
  assert.ok(run({ '*': writer }).some((h) => h.code === 'E-VIEW-UNDECLARED-WRITE'));
});

test('整键写者：登记的是别的文件时，本文件整键写入照报 E-VIEW-UNDECLARED-WRITE', () => {
  assert.ok(run({ '': { ...writer, create: ['__case__/other.mjs'], rewrite: '__case__/other.mjs' } }).some((h) => h.code === 'E-VIEW-UNDECLARED-WRITE'));
});
