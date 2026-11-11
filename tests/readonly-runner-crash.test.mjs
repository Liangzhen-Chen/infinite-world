// 只读入口 runner 的崩溃判定：缺文件崩溃必须判失败，正常的非 0 退出（数据不一致）不判。临时脚本只在临时目录生成，不登记到入口表。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {crashReason} from './fixtures/readonly-runner.mjs';

test('模拟缺文件崩溃的入口被判失败', () => {
  const dir = fs.mkdtempSync(path.join(tmpRoot(), 'runner-crash-'));
  try {
    const f = path.join(dir, 'missing-import.mjs');
    fs.writeFileSync(f, "import './no-such-file.mjs';\n");
    const r = spawnSync(process.execPath, [f], {cwd: dir, encoding: 'utf8'});
    assert.notEqual(r.status, 0);
    assert.ok(crashReason(r), `应判崩溃：${r.stderr}`);
    const g = path.join(dir, 'enoent.mjs');
    fs.writeFileSync(g, "import fs from 'node:fs'; fs.readFileSync('./nope.json');\n");
    assert.ok(crashReason(spawnSync(process.execPath, [g], {cwd: dir, encoding: 'utf8'})));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('崩溃判定：信号、超时、未捕获异常判失败；正常的非 0 退出不判（判定不依赖 Node 版本的崩溃尾行格式）', () => {
  assert.ok(crashReason({signal: 'SIGKILL', status: null, stdout: '', stderr: ''}));
  assert.ok(crashReason({error: {code: 'ETIMEDOUT'}, status: null, stdout: '', stderr: ''}));
  assert.ok(crashReason({status: 1, stdout: '', stderr: "Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'a'"}));
  assert.ok(crashReason({status: 1, stdout: '', stderr: 'throw e\n  ^\nTypeError: boom\n    at f (file:///a.mjs:1:7)\n'})); // 无 "Node.js v" 尾行也判崩溃
  assert.equal(crashReason({status: 1, stdout: '数据不一致：3 处\n', stderr: ''}), null);
  assert.equal(crashReason({status: 0, stdout: 'ok', stderr: ''}), null);
});

test('崩溃判定：退出 0 不扫文本；assert 失败与无堆栈 exit(1) 不判崩溃', () => {
  assert.equal(crashReason({status: 0, stdout: '报告列出 ENOENT 与 MODULE_NOT_FOUND', stderr: 'TypeError: x\n    at f (file:///a.mjs:1:7)'}), null);
  assert.equal(crashReason({status: 1, stdout: '', stderr: 'AssertionError [ERR_ASSERTION]: 数据不一致\n    at f (file:///a.mjs:1:7)\n'}), null);
  assert.equal(crashReason({status: 1, stdout: '', stderr: 'boom: 自己打印的失败\n'}), null);
});

test('崩溃判定：真实子进程——退出 0 带 ENOENT 字样、assert 抛错、exit(1) 无堆栈、缺模块', () => {
  const dir = fs.mkdtempSync(path.join(tmpRoot(), 'runner-crash-'));
  try {
    const run = (name, src) => { const f = path.join(dir, name); fs.writeFileSync(f, src); return spawnSync(process.execPath, [f], {cwd: dir, encoding: 'utf8'}); };
    assert.equal(crashReason(run('ok.mjs', "console.log('ENOENT 仅是报告里的字样');")), null);
    assert.equal(crashReason(run('assert.mjs', "import assert from 'node:assert/strict'; assert.equal(1, 2);")), null);
    assert.equal(crashReason(run('exit1.mjs', "console.error('失败'); process.exit(1);")), null);
    assert.ok(crashReason(run('missing.mjs', "import './none.mjs';")));
    assert.ok(crashReason(run('throws.mjs', 'null.x;')));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('崩溃判定：未处理 Promise 拒绝（有无堆栈）、先断言后异常判崩溃；exit(2) 自报错误无堆栈不判（入口主动报告的失败）', () => {
  assert.ok(crashReason({status: 1, stdout: '', stderr: "[UnhandledPromiseRejection: This error originated either by throwing inside of an async function without a catch block...] {\n  code: 'ERR_UNHANDLED_REJECTION'\n}\n"}));
  assert.ok(crashReason({status: 1, stdout: '', stderr: 'Unhandled rejection: boom\n'}));
  assert.equal(crashReason({status: 0, stdout: '', stderr: 'UnhandledPromiseRejection'}), null); // 退出 0 不扫
  assert.ok(crashReason({status: 1, stdout: '', stderr: 'AssertionError [ERR_ASSERTION]: x\n    at a (file:///a.mjs:1:7)\nTypeError: y\n    at b (file:///a.mjs:2:7)\n'}));
  assert.equal(crashReason({status: 1, stdout: '', stderr: 'AssertionError [ERR_ASSERTION]: x\n    at a (file:///a.mjs:1:7)\n{\n  actual: 1,\n  expected: 2\n}\n'}), null);
  assert.equal(crashReason({status: 2, stdout: '', stderr: '校验失败：3 处不一致\n'}), null);
});

test('崩溃判定：真实子进程——Promise.reject 非 Error、exit(2) 自报错误、先断言后抛 TypeError', () => {
  const dir = fs.mkdtempSync(path.join(tmpRoot(), 'runner-crash-'));
  try {
    const run = (name, src) => { const f = path.join(dir, name); fs.writeFileSync(f, src); return spawnSync(process.execPath, [f], {cwd: dir, encoding: 'utf8'}); };
    assert.ok(crashReason(run('reject.mjs', "Promise.reject('x');")));
    assert.equal(crashReason(run('exit2.mjs', "console.error('校验失败'); process.exit(2);")), null);
    assert.ok(crashReason(run('assert-then-throw.mjs', "console.error(new (await import('node:assert')).AssertionError({message:'a'}).stack); null.x;")));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
