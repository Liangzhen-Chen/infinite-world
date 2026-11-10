// 只读入口全量检查的共用实现：把仓库复制到临时目录，运行 READONLY_ENTRIES 里属于本组的入口，比较运行前后文件，一个字节都不许变。
// 内容变了算改写；内容没变但文件被重写（mtime 变）也算——只读入口不该碰文件。
// 运行进程（含入口再起的子进程，经 NODE_OPTIONS 继承）带 no-network 预加载，任何联网尝试直接报错；入口的退出码不断言（内容校验可以失败），只断言没有任何文件被改。
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

export function runGroup(group) {
  const entries = entriesOfGroup(group);
  assert.ok(entries.length > 0, `第 ${group + 1} 组没有入口`);
  const dest = fs.mkdtempSync(path.join(tmpRoot(), `readonly-entries-${group}-`));
  try {
    const skip = new Set(['.git', 'node_modules', '.tmp', '测试报告']);
    fs.cpSync(ROOT, dest, {recursive: true, filter: src => !skip.has(path.basename(src)) && !path.resolve(src).startsWith(path.resolve(tmpRoot()))});
    // 依赖包只读借用：副本里放一个指向真实 node_modules 的链接（walk 与哈希都跳过它）
    const nm = path.dirname(path.dirname(createRequire(import.meta.url).resolve('ajv/package.json')));
    fs.symlinkSync(nm, path.join(dest, 'node_modules'), 'junction');
    let snap = walk(dest);
    const base = new Map([...snap.keys()].map(p => [p, hashOf(p)]));
    const preload = pathToFileURL(path.join(ROOT, 'tests/fixtures/no-network-preload.mjs')).href;
    const env = {...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${preload}`.trim()};
    for (const k of Object.keys(env)) if (/KEY|TOKEN|SECRET/i.test(k)) delete env[k];
    const changed = [];
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
      assert.ok(!r.error || r.error.code !== 'ETIMEDOUT', `只读入口超时 ${file} ${args.join(' ')}`);
      if (diff.length) changed.push(`${file} ${args.join(' ')} → ${diff.slice(0, 5).join('；')}${diff.length > 5 ? `…共${diff.length}` : ''}`);
      snap = now;
    }
    assert.deepEqual(changed, [], '只读入口不得写盘：写入应移到显式写命令（--review / --l4 / --publish / --write-summary），或输出到 stdout');
  } finally { fs.rmSync(dest, {recursive: true, force: true}); }
}
