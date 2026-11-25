// 验收：卡 chore/new-skeleton（L-15 新骨架空仓 + L-16 旧验收目录归档）。
// 出题方：Claude Haiku 5.5（API），标识 haiku-api-test-skel；未参与写码与审卡。
// 依据：docs/gemini/rewrite-guide-1124.md:268–:279（Step 5：kernel 白名单、rules 空目录、gate/output-gate/textcore 归位、入口桩、基线、烟测红灯桩）；
//       docs/gemini/kickoff-1125.md:494（L-15）、:495（L-16：tests/acceptance/ 清空仅留新骨架卡）；
//       Gemini 裁定 msg_82485b7f7ab7；卷二:763（总登记表：入口与内核边界，server-plugin 下只许 kernel 与 rules 承载内核与规则）。
// 运行：node --test tests/acceptance/chore-new-skeleton/skeleton.test.mjs
// 期望值全部按上列原文写成字面量，不从实现反推。实现未落地前本文件应为红，这是预期。
// 注意：本文件只读仓库，不写任何文件；不 mock，不引用 archive/ 内的代码。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const abs = (r) => join(ROOT, ...r.split('/'));
const rel = (p) => relative(ROOT, p).split(sep).join('/');

// 仓库内相对路径（posix 风格）的递归文件列表（只列文件，不列目录），排序。
function walk(dirAbs) {
  const out = [];
  if (!existsSync(dirAbs)) return out;
  for (const e of readdirSync(dirAbs, { withFileTypes: true })) {
    const p = join(dirAbs, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(rel(p));
  }
  return out.sort();
}

// 去掉注释（粗略：块注释与行注释），让注释里的示例路径不算引用。
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

// 静态 import、export ... from、动态 import('...') 与裸 import '...' 的说明符。
const SPEC_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g;
const specifiersOf = (code) => [...code.matchAll(SPEC_RE)].map((m) => m[2]);

const codeFilesUnder = (dirRel) => walk(abs(dirRel)).filter((p) => p.endsWith('.mjs'));

// 设计原文 Step 5 与 L-15 指定的 L0 内核白名单（kernel/files.json 必须恰为此 14 个路径，均带 server-plugin/kernel/ 前缀）。
const KERNEL_FILES = [
  'server-plugin/kernel/bytes.mjs',
  'server-plugin/kernel/clone.mjs',
  'server-plugin/kernel/det-math.mjs',
  'server-plugin/kernel/error-codes.mjs',
  'server-plugin/kernel/errors.mjs',
  'server-plugin/kernel/handles/markers.mjs',
  'server-plugin/kernel/handles/patterns.mjs',
  'server-plugin/kernel/handles/vocab-handle.mjs',
  'server-plugin/kernel/named-struct-match.mjs',
  'server-plugin/kernel/named-structs.mjs',
  'server-plugin/kernel/report.mjs',
  'server-plugin/kernel/rx.mjs',
  'server-plugin/kernel/types.d.ts',
  'server-plugin/kernel/validate/types.mjs',
];

// ---------- L-15：kernel 白名单 ----------

test('kernel/files.json 是数组、条数 ≤15、恰为 14 个白名单路径，且每个路径都存在', () => {
  const list = JSON.parse(readFileSync(abs('server-plugin/kernel/files.json'), 'utf8'));
  assert.ok(Array.isArray(list), 'files.json 必须是数组');
  assert.ok(list.length <= 15, `条数 ${list.length} 超过 15`);
  assert.deepEqual([...list].sort(), [...KERNEL_FILES].sort());
  for (const p of KERNEL_FILES) assert.ok(existsSync(abs(p)), `${p} 不存在`);
});

test('server-plugin/kernel/ 下实际文件集合 = files.json 列表 ∪ {files.json}', () => {
  const actual = walk(abs('server-plugin/kernel'));
  const expected = [...KERNEL_FILES, 'server-plugin/kernel/files.json'].sort();
  assert.deepEqual(actual, expected);
});

// ---------- L-15：server-plugin 顶层与 rules 空目录 ----------

test('server-plugin/ 顶层只有 index.mjs、systems.mjs、kernel/、rules/', () => {
  assert.deepEqual(readdirSync(abs('server-plugin')).sort(), ['index.mjs', 'kernel', 'rules', 'systems.mjs']);
  assert.ok(statSync(abs('server-plugin/index.mjs')).isFile(), 'index.mjs 应为文件');
  assert.ok(statSync(abs('server-plugin/systems.mjs')).isFile(), 'systems.mjs 应为文件');
  assert.ok(statSync(abs('server-plugin/kernel')).isDirectory(), 'kernel 应为目录');
  assert.ok(statSync(abs('server-plugin/rules')).isDirectory(), 'rules 应为目录');
});

test('server-plugin/rules/ 下除 .gitkeep 外无任何文件（空领域包目录）', () => {
  assert.ok(existsSync(abs('server-plugin/rules')), 'rules 目录不存在');
  const files = walk(abs('server-plugin/rules')).filter((p) => p !== 'server-plugin/rules/.gitkeep');
  assert.deepEqual(files, []);
});

// ---------- L-15：新骨架入口桩 ----------

test('import server-plugin/index.mjs：init 调用抛错，错误信息含「未实现」', async () => {
  const mod = await import(pathToFileURL(abs('server-plugin/index.mjs')).href);
  assert.equal(typeof mod.init, 'function', 'index.mjs 必须导出 init 函数');
  let err = null;
  try {
    await mod.init();
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'init 调用必须抛错（骨架桩，未实现）');
  assert.match(String(err && err.message), /未实现/);
});

// ---------- L-15：旧代码与旧资料的迁出 ----------

test('旧泥球三目录已进 archive/legacy-server/；server-plugin/ 下 gate、output-gate、textcore 不存在', () => {
  for (const d of ['archive/legacy-server/gate', 'archive/legacy-server/output-gate', 'archive/legacy-server/textcore']) {
    assert.ok(existsSync(abs(d)), `${d} 不存在`);
  }
  for (const d of ['server-plugin/gate', 'server-plugin/output-gate', 'server-plugin/textcore']) {
    assert.ok(!existsSync(abs(d)), `${d} 不应存在`);
  }
});

test('world/meta、world/design 不存在；迁出的资料在 archive/ 下存在', () => {
  assert.ok(!existsSync(abs('world/meta')), 'world/meta 不应存在');
  assert.ok(!existsSync(abs('world/design')), 'world/design 不应存在');
  assert.ok(existsSync(abs('archive/legacy-world-data/opening-polity-hw.json')), 'opening-polity-hw.json 未迁入 archive');
  assert.ok(existsSync(abs('archive/docs-reviews/6-22-材料候选清单.md')), '6-22-材料候选清单.md 未迁入 archive');
  assert.ok(existsSync(abs('archive/legacy-sillytavern/启动酒馆.cmd')), '启动酒馆.cmd 未迁入 archive');
  assert.ok(!existsSync(abs('启动酒馆.cmd')), '仓库根不应再有 启动酒馆.cmd');
});

// ---------- L-16：旧验收目录归档 ----------

test('旧验收目录 chore-workspace-cleanup、chore-step1-tooling 已在 archive/legacy-tests/acceptance/ 下同名存在，且已不在 tests/acceptance/', () => {
  for (const n of ['chore-workspace-cleanup', 'chore-step1-tooling']) {
    assert.ok(existsSync(abs(`archive/legacy-tests/acceptance/${n}`)), `${n} 未归档`);
    assert.ok(!existsSync(abs(`tests/acceptance/${n}`)), `${n} 仍在 tests/acceptance/`);
  }
});

// ---------- 隔离：生产与工具代码不引归档，工具只碰 14 个 L0 文件 ----------

test('生产与工具代码不引归档：server-plugin/、tools/ 下 .mjs（去注释后）不含 archive/', () => {
  const bad = [];
  for (const f of [...codeFilesUnder('server-plugin'), ...codeFilesUnder('tools')]) {
    if (stripComments(readFileSync(abs(f), 'utf8')).includes('archive/')) bad.push(f);
  }
  assert.deepEqual(bad, []);
});

test('tools/ 下 .mjs 只 import server-plugin/kernel/ 中那 14 个文件', () => {
  const bad = [];
  for (const f of codeFilesUnder('tools')) {
    const specs = specifiersOf(stripComments(readFileSync(abs(f), 'utf8')));
    for (const s of specs) {
      if (!s.startsWith('.')) continue;
      const target = rel(resolve(dirname(abs(f)), s));
      if (target.startsWith('server-plugin/kernel/') && !KERNEL_FILES.includes(target)) bad.push(`${f} -> ${s}`);
    }
  }
  assert.deepEqual(bad, []);
});

// ---------- 隔离：tests/kernel 的相对 import 全部可解析 ----------

test('tests/kernel/ 下每个 .mjs 的相对 import 都解析到存在的文件，且不指向 archive/', () => {
  const bad = [];
  for (const f of codeFilesUnder('tests/kernel')) {
    const specs = specifiersOf(stripComments(readFileSync(abs(f), 'utf8')));
    for (const s of specs) {
      if (!s.startsWith('.')) continue;
      const target = resolve(dirname(abs(f)), s);
      if (!existsSync(target) || rel(target).startsWith('archive/')) bad.push(`${f} -> ${s}`);
    }
  }
  assert.deepEqual(bad, []);
});

// ---------- L-18 前置：门禁入口能跑 ----------

test('门禁能跑：node tools/accept/run.mjs pre_commit 标准输出是合法 JSON，且不含 ERR_MODULE_NOT_FOUND（不断言 verdict）', { timeout: 600000 }, () => {
  const r = spawnSync(process.execPath, [abs('tools/accept/run.mjs'), 'pre_commit'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 540000,
    maxBuffer: 256 * 1024 * 1024,
  });
  const out = String(r.stdout ?? '');
  assert.ok(!out.includes('ERR_MODULE_NOT_FOUND'), '标准输出含 ERR_MODULE_NOT_FOUND');
  let parsed = null;
  assert.doesNotThrow(
    () => { parsed = JSON.parse(out); },
    `标准输出不是合法 JSON（退出码 ${r.status}，spawn 错误 ${r.error ? r.error.message : '无'}）`,
  );
  assert.ok(parsed !== null && typeof parsed === 'object', '解析结果必须是对象');
});
