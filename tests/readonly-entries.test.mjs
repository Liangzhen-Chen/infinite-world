// 只读入口一律不准写盘（审批 / 发布 / 内容工具里的 --verify、--check、--l1、--list、--summary、--dry-run、--dry-publish、--show）。
// 做法：把仓库复制到临时目录，逐个运行 tools/readonly-entries.mjs 登记的入口，比较运行前后的文件哈希，一个字节都不许变；
// 同时扫描 world/design 与 tools，凡出现只读开关而未登记（也不在 EXEMPT）的脚本，测试失败——新增只读入口必须登记，才会被覆盖。
// 内容变了算改写；内容没变但文件被重写（mtime 变）也算——只读入口不该碰文件。
// 运行进程带 no-network 预加载，任何联网尝试直接报错；入口的退出码不断言（内容校验可以失败），只断言没有任何文件被改。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {RO_FLAGS, READONLY_ENTRIES, EXEMPT} from '../tools/readonly-entries.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const WRITE_CALL = /writeFile|appendFile|writeFileSync|\brename\(|\bmkdir\(|copyFile|\brm\(|unlink|createWriteStream|writeJSON|writeText/;
const toolFiles = () => ['world/design', 'tools'].flatMap(d => fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.mjs')).map(f => `${d}/${f}`));

test('只读入口登记完整：脚本里出现的每个只读开关都已登记或写明豁免', () => {
  const missing = [];
  for (const file of toolFiles()) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (!/process\.argv/.test(text)) continue;
    for (const flag of RO_FLAGS) {
      if (!new RegExp(`['"]${flag}['"]`).test(text)) continue;
      if (EXEMPT[file] || READONLY_ENTRIES.some(([f, ...args]) => f === file && args.includes(flag))) continue;
      missing.push(`${file} ${flag}`);
    }
  }
  assert.deepEqual(missing, [], '新增的只读入口须登记到 tools/readonly-entries.mjs');
  for (const [file] of READONLY_ENTRIES) assert.ok(fs.existsSync(path.join(ROOT, file)), `登记的入口不存在 ${file}`);
  for (const [file, why] of Object.entries(EXEMPT)) {
    assert.ok(why.trim(), `豁免须写原因 ${file}`);
    assert.ok(!WRITE_CALL.test(fs.readFileSync(path.join(ROOT, file), 'utf8')), `豁免的入口文件里不得有写盘调用 ${file}`);
  }
});

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

test('只读入口在仓库副本上运行前后，所有文件逐字节不变', {timeout: 3600_000}, () => {
  const dest = fs.mkdtempSync(path.join(tmpRoot(), 'readonly-entries-'));
  try {
    const skip = new Set(['.git', 'node_modules', '.tmp', '测试报告']);
    fs.cpSync(ROOT, dest, {recursive: true, filter: src => !skip.has(path.basename(src)) && !path.resolve(src).startsWith(path.resolve(tmpRoot()))});
    // 依赖包只读借用：副本里放一个指向真实 node_modules 的链接（walk 与哈希都跳过它）
    const nm = path.dirname(path.dirname(createRequire(import.meta.url).resolve('ajv/package.json')));
    fs.symlinkSync(nm, path.join(dest, 'node_modules'), 'junction');
    let snap = walk(dest);
    const base = new Map([...snap.keys()].map(p => [p, hashOf(p)]));
    const env = {...process.env};
    for (const k of Object.keys(env)) if (/KEY|TOKEN|SECRET/i.test(k)) delete env[k];
    const preload = pathToFileURL(path.join(ROOT, 'tests/fixtures/no-network-preload.mjs')).href;
    const changed = [];
    for (const [file, ...args] of READONLY_ENTRIES) {
      const r = spawnSync(process.execPath, ['--import', preload, file, ...args], {cwd: dest, env, encoding: 'utf8', timeout: 180_000, maxBuffer: 1 << 26});
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
});
