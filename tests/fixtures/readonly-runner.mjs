// 只读入口全量检查的共用实现：把仓库复制到临时目录，运行 READONLY_ENTRIES 里属于本组的入口，比较运行前后文件，一个字节都不许变。
// 内容变了算改写；内容没变但文件被重写（mtime 变）也算——只读入口不该碰文件。
// 运行进程（含入口再起的子进程，经 NODE_OPTIONS 继承）带 no-network 预加载，任何联网尝试直接报错；入口退出码非 0 不直接判失败（内容校验可以失败，会打印诊断供建基线），但崩溃（缺文件/未捕获异常/信号/超时）判失败；并断言没有任何文件被改。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {tmpRoot} from '../../tools/tmp-root.mjs';
import {checkOptArgs} from '../../tools/cli-flags.mjs';
import {READONLY_ENTRIES, RUN_GROUPS, ENTRY_TIMEOUT_MS, SLOW_ENTRY_TIMEOUT_MS} from '../../tools/readonly-entries.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const hashOf = p => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
function walk(dir, out = new Map()) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else { const s = fs.statSync(p); out.set(p, {size: s.size, mtime: s.mtimeMs}); }
  }
  return out;
}
export const entriesOfGroup = group => READONLY_ENTRIES.filter((_, i) => i % RUN_GROUPS === group);
export const timeoutOf = file => SLOW_ENTRY_TIMEOUT_MS[file] ?? ENTRY_TIMEOUT_MS;

// 判断一次入口运行是否"崩溃"。判定不依赖 Node 版本的崩溃尾行格式（不看 "Node.js v.." 结尾行），只看退出码、文件缺失特征和"错误类型名 + 堆栈帧"。
//   超时、被信号终止、无法启动：崩溃。
//   退出码 0：一律不算崩溃，不扫描文本（正常输出里出现 ENOENT 字样不是崩溃）。
//   退出码非 0：输出含 ENOENT / MODULE_NOT_FOUND / ERR_MODULE_NOT_FOUND，或有未捕获异常（错误类型名 + 堆栈帧）才算崩溃；
//     另：非 0 退出且输出含 UnhandledPromiseRejection / unhandled rejection 字样，不管有没有堆栈都算崩溃；
//     只有 AssertionError 是检查命令的正常失败，不算崩溃；但输出里除断言外还有别的带栈异常则算崩溃。
//     其余非 0 退出（如自己打印后 exit(1)/exit(2)、无异常栈）是入口主动报告的失败，只记基线诊断。
// 返回崩溃原因字符串，没崩溃返回 null。纯函数，入参形如 spawnSync 的返回值。
const MISSING_RE = /ENOENT|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/;
const UNHANDLED_RE = /UnhandledPromiseRejection|ERR_UNHANDLED_REJECTION|unhandled(?:\s+promise)?\s+rejection/i; // 未处理的 Promise 拒绝（reason 不是 Error 时没有堆栈，也要抓）
const STACK_RE = /^\s+at .+:\d+:\d+\)?\s*$/m; // 带堆栈帧
const ERR_LINE_RE = /^(?:Uncaught )?([A-Z][\w$]*)(?: \[[A-Z_]+\])?: /; // "TypeError: msg" / "AssertionError [ERR_ASSERTION]: msg"；类名首字母大写，排除 "actual: 1" 之类的属性行
// 输出里每一段堆栈对应的错误类型（按出现顺序，去重）：堆栈帧归属于它上面最近的 "类型名: " 行。
function uncaughtErrorTypes(text) {
  const types = [];
  let last = null;
  for (const l of text.split(/\r?\n/)) {
    const m = ERR_LINE_RE.exec(l);
    if (m) last = m[1];
    else if (STACK_RE.test(l) && last && !types.includes(last)) types.push(last);
  }
  return types;
}
export function crashReason(r) {
  if (r.error?.code === 'ETIMEDOUT') return '超时';
  if (r.error) return `无法启动：${r.error.code ?? r.error.message}`;
  if (r.signal) return `被信号终止 ${r.signal}`;
  if (r.status === 0) return null;
  const text = outText(r);
  const missing = MISSING_RE.exec(text);
  if (missing) return `输出含缺文件特征（${missing[0]}）`;
  const unhandled = UNHANDLED_RE.exec(text);
  if (unhandled) return `未处理的 Promise 拒绝（${unhandled[0]}）`;
  // 除断言外还有异常：先出 AssertionError、后面又有别的带栈异常，也算崩溃。
  const other = uncaughtErrorTypes(text).find(t => t !== 'AssertionError');
  if (other) return `未捕获异常（${other}）`;
  // 其余非 0 退出不算崩溃，包括 exit(2)/exit(1) 并自己打印错误信息、无异常栈：这是入口主动报告的失败（内容校验不过），
  // 只记基线诊断（runGroup 打印首行）。
  return null;
}
const outText = r => [r.stderr, r.stdout].filter(Boolean).join('\n');
export const firstLine = r => (outText(r).split('\n').find(l => l.trim()) ?? '').slice(0, 160);

export function runGroup(group) {
  const entries = entriesOfGroup(group);
  assert.ok(entries.length > 0, `第 ${group + 1} 组没有入口`);
  const dest = fs.mkdtempSync(path.join(tmpRoot(), `readonly-entries-${group}-`));
  try {
    // 只复制只读入口会读的部分（按登记表逐个入口的 import 闭包与路径引用核对）：
    //   顶层：world、tools、server-plugin、schemas、extension、prompt、tests、docs、package.json、package-lock.json
    //   排除：.git、node_modules（改用链接）、.tmp、docs/测试报告（体积大、入口不读）、world/drafts/w1（260MB，入口不读）、assets、dist、logs、跑团资料
    // 复制范围内的每个文件都进后面的哈希快照，哈希比对范围 = 复制进去的全部文件。
    const top = new Set(['world', 'tools', 'server-plugin', 'schemas', 'extension', 'prompt', 'tests', 'docs', 'package.json', 'package-lock.json']);
    const skipRel = new Set(['docs/测试报告', 'world/drafts/w1']);
    const tmp = path.resolve(tmpRoot());
    fs.cpSync(ROOT, dest, {recursive: true, filter: src => {
      const rel = path.relative(ROOT, src).split(path.sep).join('/');
      if (rel === '') return true;
      if (!top.has(rel.split('/')[0]) || skipRel.has(rel)) return false;
      const base = path.basename(src);
      return base !== '.git' && base !== 'node_modules' && base !== '.tmp' && !path.resolve(src).startsWith(tmp);
    }});
    // 依赖包只读借用：副本里放一个指向真实 node_modules 的链接（walk 与哈希都跳过它）
    const nm = path.dirname(path.dirname(createRequire(import.meta.url).resolve('ajv/package.json')));
    fs.symlinkSync(nm, path.join(dest, 'node_modules'), 'junction');
    let snap = walk(dest);
    const base = new Map([...snap.keys()].map(p => [p, hashOf(p)]));
    const preload = pathToFileURL(path.join(ROOT, 'tests/fixtures/no-network-preload.mjs')).href;
    const env = {...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${preload}`.trim()};
    for (const k of Object.keys(env)) if (/KEY|TOKEN|SECRET/i.test(k)) delete env[k];
    const changed = [];
    const crashed = [];
    for (const [file, ...args] of entries) {
      // 修饰参数按声明的类型校验；路径类只能指向副本内部，越界直接判失败（不运行）
      assert.deepEqual(checkOptArgs(args, dest), [], `只读入口参数越界或类型不符 ${file} ${args.join(' ')}`);
      const r = spawnSync(process.execPath, [file, ...args], {cwd: dest, env, encoding: 'utf8', timeout: timeoutOf(file), maxBuffer: 1 << 26});
      const now = walk(dest);
      const diff = [];
      for (const [p, s] of now) {
        const o = snap.get(p);
        if (!o) { diff.push(`新增 ${path.relative(dest, p)}`); base.set(p, hashOf(p)); }
        else if (o.size !== s.size || o.mtime !== s.mtime) { const h = hashOf(p); diff.push(`${h !== base.get(p) ? '改写' : '原样重写'} ${path.relative(dest, p)}`); base.set(p, h); }
      }
      for (const p of snap.keys()) if (!now.has(p)) diff.push(`删除 ${path.relative(dest, p)}`);
      const crash = crashReason(r);
      if (crash) crashed.push(`${file} ${args.join(' ')} → 退出码 ${r.status} ${crash}；首行：${firstLine(r)}`);
      else if (r.status !== 0) console.log(`[只读入口诊断] ${file} ${args.join(' ')} 退出码 ${r.status} 首行：${firstLine(r)}`);
      if (diff.length) changed.push(`${file} ${args.join(' ')} → ${diff.slice(0, 5).join('；')}${diff.length > 5 ? `…共${diff.length}` : ''}`);
      snap = now;
    }
    assert.deepEqual(crashed, [], '只读入口崩溃（缺文件/未捕获异常/信号/超时）不能算"没写盘、通过"');
    assert.deepEqual(changed, [], '只读入口不得写盘：写入应移到显式写命令（--review / --l4 / --publish / --write-summary），或输出到 stdout');
  } finally { fs.rmSync(dest, {recursive: true, force: true}); }
}
