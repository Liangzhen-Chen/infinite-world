// 只读入口实跑用的禁网预加载（tests/fixtures/no-network-preload.mjs）自测：每种联网手段都必须被拦住；
// 并用静态检查证明这次登记的只读入口不走预加载拦不住的路径（子进程起 curl 等）。日常层，秒级。
// 已知限制（预加载拦不住）：子进程起外部程序联网（curl、git、ssh）；入口自己带 env 起子进程会丢掉 NODE_OPTIONS；worker 里拿未打补丁的原生绑定。
// 目标地址一律用本机 127.0.0.1:9 或 localhost：即使没拦住也只是本机连接失败，不会出网，断言会因消息不是 NETWORK DENIED 而失败。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {READONLY_ENTRIES} from '../tools/readonly-entries.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PRELOAD = pathToFileURL(path.join(ROOT, 'tests/fixtures/no-network-preload.mjs')).href;

function run(code) {
  const wrapped = `const done = m => { console.log('RESULT:' + m); process.exit(0); };
process.on('uncaughtException', e => done(e.message));
try { await (async () => { ${code} })(); done('NOT BLOCKED'); } catch (e) { done(e.message); }`;
  const r = spawnSync(process.execPath, ['--import', PRELOAD, '--input-type=module', '-e', wrapped], {encoding: 'utf8', timeout: 30_000});
  return (r.stdout.match(/RESULT:(.*)/)?.[1] ?? `无结果 ${r.stderr.slice(0, 200)}`).trim();
}

const CASES = {
  'fetch': `await fetch('http://127.0.0.1:9/')`,
  'http.get': `const http = await import('node:http'); http.default.get('http://127.0.0.1:9/')`,
  'http.request': `const http = await import('node:http'); http.default.request('http://127.0.0.1:9/').end()`,
  'https.get': `const https = await import('node:https'); https.default.get('https://127.0.0.1:9/')`,
  'https 具名导入 request（快照，走 Socket.connect 拦截）': `const {request} = await import('node:https'); const q = request('https://127.0.0.1:9/'); q.on('error', e => { throw e; }); q.end(); await new Promise(r => setTimeout(r, 2000));`,
  'net.connect': `const net = await import('node:net'); net.default.connect(9, '127.0.0.1')`,
  'net.createConnection': `const net = await import('node:net'); net.default.createConnection(9, '127.0.0.1')`,
  'net.Socket().connect': `const net = await import('node:net'); new net.default.Socket().connect(9, '127.0.0.1')`,
  'tls.connect': `const tls = await import('node:tls'); tls.default.connect(9, '127.0.0.1')`,
  'dgram.createSocket': `const dgram = await import('node:dgram'); dgram.default.createSocket('udp4')`,
  'dns.lookup': `const dns = await import('node:dns'); dns.default.lookup('localhost', () => {})`,
  'dns.resolve': `const dns = await import('node:dns'); dns.default.resolve('localhost', () => {})`,
  'dns.resolve4': `const dns = await import('node:dns'); dns.default.resolve4('localhost', () => {})`,
  'dns.promises.lookup': `const dns = await import('node:dns/promises'); await dns.lookup('localhost')`,
  'dns.promises.resolve': `const dns = await import('node:dns/promises'); await dns.resolve('localhost')`,
  'dns.Resolver.resolve': `const dns = await import('node:dns'); new dns.default.Resolver().resolve('localhost', () => {})`,
};

for (const [name, code] of Object.entries(CASES)) {
  test(`禁网预加载拦住 ${name}`, () => assert.equal(run(code), 'NETWORK DENIED'));
}

test('对照：不带预加载时同样的 net.connect 不是被预加载拦的（证明上面的断言有区分度）', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import net from 'node:net'; try { net.connect(9, '127.0.0.1').on('error', e => { console.log('RESULT:' + e.code); process.exit(0); }); } catch (e) { console.log('RESULT:' + e.message); process.exit(0); }`], {encoding: 'utf8', timeout: 30_000});
  assert.notEqual(r.stdout.match(/RESULT:(.*)/)?.[1]?.trim(), 'NETWORK DENIED');
});

// 静态证明：登记的只读入口（及 s0-metrics 依次启动的度量脚本）不起网络子进程。
const entryScripts = new Set(READONLY_ENTRIES.map(e => e[0]));
const s0Steps = fs.readFileSync(path.join(ROOT, 'tools/s0-metrics.mjs'), 'utf8').match(/tools\/[a-z0-9-]+\.mjs/g) ?? [];
const SCOPE = [...new Set([...entryScripts, ...s0Steps])];

test('登记入口（含 s0-metrics 的子脚本）里没有 curl、wget、ssh、scp，也没有带 env 的子进程', () => {
  assert.ok(SCOPE.length > 10);
  for (const f of SCOPE) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/\b(curl|wget|ssh|scp|sftp)\b/.test(src), `${f} 出现外部联网程序名`);
    assert.ok(!/\benv\s*:/.test(src), `${f} 有 env: 选项（子进程会丢掉 NODE_OPTIONS 里的预加载）`);
  }
});

test('登记入口里凡用 child_process 的，起的子进程命令只能是 process.execPath（node，继承预加载）', () => {
  for (const f of SCOPE) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!/child_process/.test(src)) continue;
    const calls = [...src.matchAll(/(?<![.\w])(spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\s*\(\s*([^,)]*)/g)];
    assert.ok(calls.length > 0, `${f} 引入 child_process 却没找到调用，检查写法`);
    for (const m of calls) assert.equal(m[2].trim(), 'process.execPath', `${f}: ${m[1]}( ${m[2]} …) 起的不是 node`);
  }
});
