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

test('崩溃判定：信号、超时、未捕获异常判失败；正常的非 0 退出不判', () => {
  assert.ok(crashReason({signal: 'SIGKILL', status: null, stdout: '', stderr: ''}));
  assert.ok(crashReason({error: {code: 'ETIMEDOUT'}, status: null, stdout: '', stderr: ''}));
  assert.ok(crashReason({status: 1, stdout: '', stderr: 'Uncaught TypeError: x'}));
  assert.ok(crashReason({status: 1, stdout: '', stderr: "Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'a'"}));
  assert.ok(crashReason({status: 1, stdout: '', stderr: 'throw e\n  ^\nError: boom\n    at f (file:///a.mjs:1:7)\n\nNode.js v22.0.0\n'}));
  assert.equal(crashReason({status: 1, stdout: '数据不一致：3 处\n', stderr: ''}), null);
  assert.equal(crashReason({status: 0, stdout: 'ok', stderr: ''}), null);
});
