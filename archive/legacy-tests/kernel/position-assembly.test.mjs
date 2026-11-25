// 格子迁移 G12（对照表 #88，方案 :226、:337 的 6-19 补装配一行）：位置写者模块 position.mjs 只经装配的 systems.mjs 引入（本文件只 import systems.mjs，不直接 import position.mjs），
// 引入后日界钩子 rebaseBubble 已登记在推进钩子登记处、文件是 position.mjs——新模块不装配则其入口不可达。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerSystems } from '../../server-plugin/systems.mjs';
import { advanceHook, advanceHookNames } from '../../server-plugin/kernel/advance-registry.mjs';

test('#88 装配：systems.mjs 引入 position.mjs 后，rebaseBubble 钩子已登记、写者文件是 position.mjs；registerSystems 是装配文件调用的唯一入口', () => {
  assert.equal(typeof registerSystems, 'function');
  assert.ok(advanceHookNames().includes('rebaseBubble'));
  assert.equal(advanceHook('rebaseBubble').file, 'position.mjs');
});
