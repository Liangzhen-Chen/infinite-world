// 只读入口登记完整性与静态扫描（日常层，秒级，不运行任何入口）。
// 在仓库临时副本上实跑入口、比较文件哈希的部分是全量层：tests/readonly-entries-run-{1..4}.test.mjs（已列入 tools/smoke-tests.json 的 nightlyOnly）。
//   1. tools/ 与 world/design（含子目录）下每个脚本里出现的每个 --xxx 形态字样（含注释、拼接、不带引号写法），都必须在 tools/cli-flags.mjs 归类；没登记的失败。
//   2. 凡出现“只读”类开关（ro）的脚本，READONLY_ENTRIES 里必须有带该开关的入口（按脚本逐条核对；同名开关在该脚本里另有归类的走 FILE_FLAG_OVERRIDES）。
//   3. 登记表不许过期：每个登记的开关、每个入口脚本都要还在；入口里的每个 --开关 都必须真的出现在该脚本源码里（被脚本解析）。
//   4. 写类开关必须写明写哪些文件；全量层的分组数与文件数一致，且每组最坏耗时 < 3600 秒。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {FLAGS, FILE_FLAG_OVERRIDES, FLAG_PATTERN, checkOptArgs} from '../tools/cli-flags.mjs';
import {READONLY_ENTRIES, RUN_GROUPS, ENTRY_TIMEOUT_MS, COPY_ALLOWANCE_MS, SLOW_ENTRY_TIMEOUT_MS} from '../tools/readonly-entries.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SELF = new Set(['tools/cli-flags.mjs', 'tools/readonly-entries.mjs']);
function scripts(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), {withFileTypes: true})) {
    if (e.name === 'node_modules') continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) scripts(rel, out);
    else if (/\.(mjs|js|cjs)$/.test(e.name) && !SELF.has(rel)) out.push(rel);
  }
  return out;
}
const files = ['world/design', 'tools'].flatMap(d => scripts(d));
const texts = new Map(files.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
const flagsIn = text => [...new Set(text.match(FLAG_PATTERN) ?? [])];
// 开关可能由脚本直接导入的共享模块解析（如级联批脚本导入 runRevision 来处理 --verify）：入口开关在脚本自身或它直接 import 的本地模块源码里出现即算被解析。
const localImports = (file, text) => [...text.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+\.(?:mjs|js|cjs))['"]/g)]
  .map(m => path.posix.join(path.posix.dirname(file), m[1])).filter(f => texts.has(f));
// 去掉 // 与 /* */ 注释（字符串与模板字面量里的内容保留；不处理正则字面量里的引号，够用于判断“开关是否出现在代码里”）。
export function stripComments(text) {
  let out = '', i = 0, quote = null;
  while (i < text.length) {
    const c = text[i], d = text[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += d ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
    } else if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; }
    else if (c === '/' && d === '/') { while (i < text.length && text[i] !== '\n') i++; }
    else if (c === '/' && d === '*') { const end = text.indexOf('*/', i + 2); out += ' '; i = end < 0 ? text.length : end + 2; }
    else { out += c; i++; }
  }
  return out;
}
const codes = new Map(files.map(f => [f, stripComments(texts.get(f))]));
// 开关必须出现在代码里（注释不算被解析）：脚本自身或它直接导入的本地模块。
const parsesFlag = (file, flag) => codes.get(file).includes(flag) || localImports(file, texts.get(file)).some(f => codes.get(f).includes(flag));

const kindOf = (file, flag) => (FILE_FLAG_OVERRIDES[`${file} ${flag}`] ?? FLAGS[flag])?.kind;

test('命令行开关登记完整：脚本里出现的每个 --xxx 都已归类（只读 / 写 / 修饰 / 非开关）', () => {
  const missing = [];
  for (const [file, text] of texts) for (const flag of flagsIn(text)) if (!kindOf(file, flag)) missing.push(`${file} ${flag}`);
  assert.deepEqual(missing, [], '新增或改名的开关须登记到 tools/cli-flags.mjs，并归类为 ro / write / opt / nonflag');
});

test('只读开关都有实跑入口登记：脚本里出现的每个 ro 开关，READONLY_ENTRIES 里必须有带它的入口', () => {
  const missing = [];
  for (const [file, text] of texts) for (const flag of flagsIn(text)) {
    if (kindOf(file, flag) !== 'ro') continue;
    if (!READONLY_ENTRIES.some(([f, ...args]) => f === file && args.includes(flag))) missing.push(`${file} ${flag}`);
  }
  assert.deepEqual(missing, [], '只读开关须登记到 tools/readonly-entries.mjs 才会被全量层实跑覆盖；确实不是本脚本的开关，改在 FILE_FLAG_OVERRIDES 里归为 nonflag 并写明原因');
});

test('登记表不过期：开关、入口脚本都还在，入口里的 --开关 真的出现在该脚本源码里，写类开关写明写哪些文件', () => {
  const seen = new Set([...texts.values()].flatMap(flagsIn));
  assert.deepEqual(Object.keys(FLAGS).filter(f => !seen.has(f)), [], '登记了但任何脚本里都没有的开关');
  for (const [key, v] of Object.entries(FILE_FLAG_OVERRIDES)) {
    const [file, flag] = key.split(' ');
    assert.ok(texts.get(file)?.includes(flag), `覆盖项对应的脚本里没有该开关 ${key}`);
    assert.ok(v.note?.trim(), `覆盖项须写原因 ${key}`);
  }
  for (const [flag, v] of Object.entries(FLAGS)) {
    assert.ok(['ro', 'write', 'opt', 'nonflag'].includes(v.kind), `未知类别 ${flag}`);
    if (v.kind === 'write' || v.kind === 'nonflag') assert.ok(v.note?.trim(), `${v.kind} 开关须写明写哪些文件 / 是什么参数 ${flag}`);
  }
  for (const [file, ...args] of READONLY_ENTRIES) {
    const text = texts.get(file);
    assert.ok(text, `登记的入口不存在 ${file}`);
    const flags = args.filter(x => x.startsWith('--'));
    assert.ok(flags.length, `入口至少带一个开关 ${file}`);
    for (const a of flags) {
      assert.ok(parsesFlag(file, a), `入口 ${file} ${a}：脚本源码（含它直接导入的本地模块）里没有这个开关`);
      // 写类开关只允许和 --dry-run 同用（演练不落盘，正是要验证这一点）
      const ok = ['ro', 'opt'].includes(kindOf(file, a)) || (kindOf(file, a) === 'write' && args.includes('--dry-run'));
      assert.ok(ok, `入口只能带只读或修饰开关（写类开关须同带 --dry-run）：${file} ${a} → ${kindOf(file, a)}`);
    }
    assert.deepEqual(checkOptArgs(args, ROOT), [], `入口修饰参数的值不符声明类型，或路径越出仓库：${file} ${args.join(' ')}`);
  }
});

test('全量层分组：测试文件数等于 RUN_GROUPS，每组最坏耗时（单条超时之和 + 复制余量）小于 3600 秒，且已列入 nightlyOnly', () => {
  const runFiles = fs.readdirSync(path.join(ROOT, 'tests')).filter(f => /^readonly-entries-run-\d+\.test\.mjs$/.test(f));
  assert.equal(runFiles.length, RUN_GROUPS, '全量层测试文件数应等于 RUN_GROUPS');
  for (let g = 0; g < RUN_GROUPS; g++) {
    const worst = READONLY_ENTRIES.filter((_, i) => i % RUN_GROUPS === g).reduce((n, [f]) => n + (SLOW_ENTRY_TIMEOUT_MS[f] ?? ENTRY_TIMEOUT_MS), COPY_ALLOWANCE_MS);
    assert.ok(worst < 3_500_000, `第 ${g + 1} 组最坏耗时 ${worst / 1000} 秒，超出预算`);
    assert.match(fs.readFileSync(path.join(ROOT, 'tests', `readonly-entries-run-${g + 1}.test.mjs`), 'utf8'), new RegExp(`runGroup\\(${g}\\)`), `第 ${g + 1} 个文件应跑第 ${g} 组`);
  }
  const heavy = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/smoke-tests.json'), 'utf8')).nightlyOnly;
  for (const f of runFiles) assert.ok(heavy.includes(`tests/${f}`), `${f} 应列入 smoke-tests.json 的 nightlyOnly（合并层推迟到全量）`);
});

test('修饰参数（opt）都声明了值的类型；url 类不得出现在只读入口，类型有效', () => {
  const valid = t => ['flag', 'path', 'number', 'id', 'name', 'list', 'url'].includes(t) || /^enum:[\w|-]+$/.test(t);
  for (const [f, m] of Object.entries(FLAGS)) if (m.kind === 'opt') assert.ok(valid(m.type), `${f} 的值类型未声明或无效：${m.type}`);
  for (const [file, ...args] of READONLY_ENTRIES) for (const a of args) if (FLAGS[a]?.kind === 'opt') assert.notEqual(FLAGS[a].type, 'url', `${file} ${a}`);
});

test('checkOptArgs：路径越界、类型不符、缺值都判违规，合规的不报', () => {
  assert.deepEqual(checkOptArgs(['--corpus', 'tests/fixtures/x.json', '--summary'], ROOT), []);
  assert.deepEqual(checkOptArgs(['--fast', '--card', 'condiment'], ROOT), []);
  assert.equal(checkOptArgs(['--root', '../outside'], ROOT).length, 1);
  assert.equal(checkOptArgs(['--run-dir', path.resolve(ROOT, '..', 'elsewhere')], ROOT).length, 1);
  assert.equal(checkOptArgs(['--years', 'abc'], ROOT).length, 1);
  assert.equal(checkOptArgs(['--tier', 'weekly'], ROOT).length, 1);
  assert.equal(checkOptArgs(['--card'], ROOT).length, 1);
  assert.equal(checkOptArgs(['--origin', 'http://x'], ROOT).length, 1);
});

test('stripComments：注释里的开关不算被解析，代码与字符串里的算', () => {
  const text = "// --only-in-comment\n/* --block\n --block2 */\nconst a = '--in-string'; const u = 'http://x'; // tail --tail\nconst b = `--in-template`; if (argv.includes('--real')) {}\n";
  const code = stripComments(text);
  for (const flag of ['--only-in-comment', '--block', '--block2', '--tail']) assert.ok(!code.includes(flag), flag);
  for (const flag of ['--in-string', 'http://x', '--in-template', '--real']) assert.ok(code.includes(flag), flag);
});
