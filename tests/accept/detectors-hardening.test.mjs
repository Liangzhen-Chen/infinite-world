// L-09 检测器加固的行为测试（docs/gemini/kickoff-1125.md 的 L-09 行）：专门测没有独立扫描条目的两项
// （decl_cmp 去 UNIMPLEMENTED 桩、path_access 的 dated 静态拒写），以及三条 ast 规则与内核白名单冻结的直判。
// 绕法用例回归仍走 tools/accept/cases.json；这里只用内存里的虚拟文件，不读写仓库登记。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, readRegistry } from '../../tools/accept/read.mjs';
import { detect as declDetect } from '../../tools/accept/detectors/decl_cmp.mjs';
import { detect as pathDetect } from '../../tools/accept/detectors/path_access.mjs';
import { detect as litDetect } from '../../tools/accept/detectors/lit_scope.mjs';
import { detect as kernelDetect } from '../../tools/accept/detectors/kernel_files.mjs';
import { detect as hygieneDetect } from '../../tools/accept/detectors/hygiene.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctxOf = (files) => loadContext(ROOT, { files: [...files.keys()].sort(), read: (p) => files.get(p) });

test('decl_cmp 没有 UNIMPLEMENTED 桩；未知 check 报 E-ACC-ITEM-PARAM，不静默通过', () => {
  const src = readFileSync(join(ROOT, 'tools/accept/detectors/decl_cmp.mjs'), 'utf8');
  assert.ok(!src.includes('E-ACC-ITEM-UNIMPLEMENTED'), '源码里不应再有 UNIMPLEMENTED');
  assert.throws(() => declDetect(ctxOf(new Map()), { checks: ['inputs'] }, {}), /E-ACC-ITEM-PARAM check=inputs/);
});

test('path_access：writePath 直接写 dated 改写者模式即拒；同一写者去掉 dated 即放行', () => {
  const file = 'server-plugin/__case__/dated.mjs';
  const code = '/** @param {State} s @param {EntityId} id @returns {void} */\nexport function f(s, id) { writePath(s, P.things_value(id), { value: 1 }); }\n';
  const decl = (dated) => JSON.stringify({ stateKeys: { things: { writers: { '*.value': { rewrite: '__case__/dated.mjs', dated } } } }, pathTypes: { 'things.*.value': 'map<number,number>' } });
  const params = { access: 'write', codes: ['E-VIEW-UNDECLARED-WRITE', 'E-VIEW-BYPASS'], groups: ['rules'] };
  const cls = { writeEntries: ['kernel/storage.mjs#writePath'] };
  const yes = pathDetect(ctxOf(new Map([['world/ontology/state-owners.json', decl(true)], [file, code]])), params, cls);
  assert.ok(yes.some((h) => h.code === 'E-VIEW-UNDECLARED-WRITE'), 'dated 为真时应拒 writePath');
  const no = pathDetect(ctxOf(new Map([['world/ontology/state-owners.json', decl(false)], [file, code]])), params, cls);
  assert.equal(no.length, 0, 'dated 为假时是正常改写写者，不该报');
});

test('ast-rules 三条：顶层 Map/WeakMap、.idIndex.get、installVocab 各计一条，函数内局部与裸读不计', () => {
  const cls = readRegistry(ROOT, 'scanclasses').find((r) => r.scanClass === 'pp_module_state');
  const params = { literal: 'astRule', code: 'E-VIEW-BYPASS', groups: ['rules'] };
  const run = (src) => litDetect(ctxOf(new Map([['server-plugin/__case__/x.mjs', src]])), params, cls);
  assert.equal(run('export const cache = new Map();').length, 1);
  assert.equal(run('export const cache = new WeakMap();').length, 1);
  assert.equal(run('export function f(r, k) { return r.idIndex.get(k); }').length, 1);
  assert.equal(run('export function f(v) { return installVocab(v); }').length, 1);
  assert.equal(run('export function f() { const m = new Map(); return m.size; }').length, 0);
  assert.equal(run('export const x = (r) => r.idIndex;').length, 0);
  assert.equal(run("export const s = 'installVocab 只由加载器调用';").length, 0);
});

test('kernel_files：实际内核文件未被 files.json 登记即命中；一致且不超上限即通过', () => {
  const cls = readRegistry(ROOT, 'scanclasses').find((r) => r.scanClass === 'kernel_freeze');
  const params = { code: 'E-FILE-UNASSIGNED' };
  const pass = ctxOf(new Map([
    ['server-plugin/kernel/files.json', '["server-plugin/kernel/a.mjs"]'],
    ['server-plugin/kernel/a.mjs', 'export const a = 1;'],
  ]));
  assert.equal(kernelDetect(pass, params, cls).length, 0);
  const fail = ctxOf(new Map([
    ['server-plugin/kernel/files.json', '["server-plugin/kernel/a.mjs"]'],
    ['server-plugin/kernel/a.mjs', 'export const a = 1;'],
    ['server-plugin/kernel/b.mjs', 'export const b = 2;'],
  ]));
  assert.deepEqual(kernelDetect(fail, params, cls).map((h) => h.file), ['server-plugin/kernel/b.mjs']);
});

test('特殊值不可绕过：上限 0/非数、空范围、空模式、缺豁免理由一律报 E-ACC-ITEM-PARAM', () => {
  const files = new Map([
    ['docs/x.md', '# x'],
    ['server-plugin/kernel/files.json', '[]'],
    ['server-plugin/kernel/a.mjs', 'export const a = 1;'],
  ]);
  const ctx = ctxOf(files);
  const kcls = readRegistry(ROOT, 'scanclasses').find((r) => r.scanClass === 'kernel_freeze');
  for (const limit of [0, -1, 'x', 1.5]) assert.equal(kernelDetect(ctx, {}, { ...kcls, limit })[0].code, 'E-ACC-ITEM-PARAM', String(limit));
  const ip = readRegistry(ROOT, 'scanclasses').find((r) => r.scanClass === 'ip_literal');
  assert.equal(hygieneDetect(ctx, { code: 'E-X' }, { ...ip, scope: { roots: [] } })[0].code, 'E-ACC-ITEM-PARAM');
  assert.equal(hygieneDetect(ctx, { code: 'E-X' }, { ...ip, exemptions: [{ path: 'docs/x.md', reason: '' }] })[0].code, 'E-ACC-ITEM-PARAM');
  const sec = readRegistry(ROOT, 'scanclasses').find((r) => r.scanClass === 'secret_literal');
  assert.equal(hygieneDetect(ctx, { code: 'E-X' }, { ...sec, patterns: [] })[0].code, 'E-ACC-ITEM-PARAM');
  const big = readRegistry(ROOT, 'scanclasses').find((r) => r.scanClass === 'big_md');
  assert.equal(hygieneDetect(ctx, { code: 'E-X' }, { ...big, maxBytes: 0 })[0].code, 'E-ACC-ITEM-PARAM');
  const doc = readRegistry(ROOT, 'scanclasses').find((r) => r.scanClass === 'claude_doc');
  assert.equal(hygieneDetect(ctx, { code: 'E-X' }, { ...doc, files: [] })[0].code, 'E-ACC-ITEM-PARAM');
});
