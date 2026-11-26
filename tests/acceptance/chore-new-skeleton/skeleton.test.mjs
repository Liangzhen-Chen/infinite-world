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

// L0 内核白名单以 server-plugin/kernel/files.json 为唯一登记处（设计卷 S1-1 会增删内核文件，故不在测试里写死清单）。
const readKernelList = () => JSON.parse(readFileSync(abs('server-plugin/kernel/files.json'), 'utf8'));

// ---------- L-15：kernel 白名单 ----------

test('kernel/files.json 是数组、条数 ≤15、无重复，每项是 server-plugin/kernel/ 下存在的文件', () => {
  const list = readKernelList();
  assert.ok(Array.isArray(list), 'files.json 必须是数组');
  assert.ok(list.length <= 15, `条数 ${list.length} 超过 15`);
  assert.equal(new Set(list).size, list.length, 'files.json 有重复路径');
  for (const p of list) {
    assert.equal(typeof p, 'string', 'files.json 的每项必须是字符串');
    assert.ok(p.startsWith('server-plugin/kernel/') && !p.split('/').includes('..'), `${p} 不在 server-plugin/kernel/ 下`);
    assert.ok(existsSync(abs(p)) && statSync(abs(p)).isFile(), `${p} 不存在或不是文件`);
  }
});

test('server-plugin/kernel/ 下实际文件集合 = files.json 列表 ∪ {files.json}', () => {
  const actual = walk(abs('server-plugin/kernel'));
  const expected = [...readKernelList(), 'server-plugin/kernel/files.json'].sort();
  assert.deepEqual(actual, expected);
});

// ---------- L-15：server-plugin 顶层与 rules 空目录 ----------

test('server-plugin/ 顶层只有 index.mjs、systems.mjs、kernel/、rules/、textcore/', () => {
  assert.deepEqual(readdirSync(abs('server-plugin')).sort(), ['index.mjs', 'kernel', 'rules', 'systems.mjs', 'textcore']);
  assert.ok(statSync(abs('server-plugin/index.mjs')).isFile(), 'index.mjs 应为文件');
  assert.ok(statSync(abs('server-plugin/systems.mjs')).isFile(), 'systems.mjs 应为文件');
  assert.ok(statSync(abs('server-plugin/kernel')).isDirectory(), 'kernel 应为目录');
  assert.ok(statSync(abs('server-plugin/rules')).isDirectory(), 'rules 应为目录');
});

test('server-plugin/kernel/ 下源文件（去注释后）的相对 import 都不指向 server-plugin/rules/（L0 不依赖 L2 规则层）', () => {
  const bad = [];
  const srcs = walk(abs('server-plugin/kernel')).filter((p) => /\.(mjs|js|ts)$/.test(p));
  for (const f of srcs) {
    const specs = specifiersOf(stripComments(readFileSync(abs(f), 'utf8')));
    for (const s of specs) {
      if (!s.startsWith('.')) continue;
      const target = rel(resolve(dirname(abs(f)), s));
      if (target.startsWith('server-plugin/rules/')) bad.push(`${f} -> ${s}`);
    }
  }
  assert.deepEqual(bad, []);
});

// ---------- L-15：新骨架入口桩 ----------

test('import server-plugin/index.mjs：init 是函数，await init() 返回对象，含 engine 与 state，state.created 为对象，engine.P 为冻结对象', async () => {
  const mod = await import(pathToFileURL(abs('server-plugin/index.mjs')).href);
  assert.equal(typeof mod.init, 'function', 'index.mjs 必须导出 init 函数');
  const ret = await mod.init();
  assert.ok(ret && typeof ret === 'object', 'init 必须返回对象');
  assert.ok(ret.engine, 'init 返回值必须含 engine');
  assert.ok(ret.state, 'init 返回值必须含 state');
  assert.ok(ret.state.created && typeof ret.state.created === 'object', 'state.created 必须为对象');
  assert.ok(Object.isFrozen(ret.engine.P), 'engine.P 必须为冻结对象');
});

// ---------- L-15：旧代码与旧资料的迁出 ----------

test('旧泥球三目录已进 archive/legacy-server/；server-plugin/ 下 gate、output-gate 不存在', () => {
  for (const d of ['archive/legacy-server/gate', 'archive/legacy-server/output-gate', 'archive/legacy-server/textcore']) {
    assert.ok(existsSync(abs(d)), `${d} 不存在`);
  }
  for (const d of ['server-plugin/gate', 'server-plugin/output-gate']) {
    assert.ok(!existsSync(abs(d)), `${d} 不应存在`);
  }
});

// textcore 迁回（卷二:1054/:1060；Gemini 裁定 msg_82485b7f7ab7 定 S1-3 迁回，B2 先迁 digest.mjs）：目录下每个源文件都须经 state-owners.json 登记。
test('server-plugin/textcore/ 下每个文件都经 state-owners.json 登记（importMatrix.rows.textcore 或 assembly.files）', () => {
  const owners = JSON.parse(readFileSync(abs('world/ontology/state-owners.json'), 'utf8'));
  const PREFIX = 'server-plugin/textcore/';
  const strings = (v) =>
    typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];
  const registered = new Set(
    [...strings(owners.importMatrix.rows.textcore), ...strings(owners.assembly.files)].filter((p) => p.startsWith(PREFIX)),
  );
  const present = walk(abs('server-plugin/textcore'));
  assert.deepEqual(present.filter((f) => !registered.has(f)), []);
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

test('tools/ 下 .mjs 只 import server-plugin/kernel/ 中 files.json 登记的文件', () => {
  const bad = [];
  const registered = new Set(readKernelList());
  for (const f of codeFilesUnder('tools')) {
    const specs = specifiersOf(stripComments(readFileSync(abs(f), 'utf8')));
    for (const s of specs) {
      if (!s.startsWith('.')) continue;
      const target = rel(resolve(dirname(abs(f)), s));
      if (target.startsWith('server-plugin/kernel/') && !registered.has(target)) bad.push(`${f} -> ${s}`);
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
