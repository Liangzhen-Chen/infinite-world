// 采样温度分档（亮圳 11-22 19:46）：读档表、null 不注入、缺档/坏值报错。期望值在测试内造好的配置里手写。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { samplingBody } from '../../tools/dispatch/sampling-body.mjs';
import { ROOT } from './temp-root.mjs';

const CFG = { purposes: { a: { temperature: 0.0 }, b: { temperature: 0.7 }, c: { temperature: null } } };

test('数值档生成 temperature JSON', () => {
  assert.equal(samplingBody(CFG, 'a'), '{"temperature":0}');
  assert.equal(samplingBody(CFG, 'b'), '{"temperature":0.7}');
});

test('null 档不注入（空串）', () => {
  assert.equal(samplingBody(CFG, 'c'), '');
});

test('用途不存在：报错，不回落', () => {
  assert.throws(() => samplingBody(CFG, 'zzz'), /用途不存在: zzz/);
  assert.throws(() => samplingBody(CFG, ''), /用途不存在/);
  assert.throws(() => samplingBody(CFG, 'toString'), /用途不存在/);
});

test('坏值与缺表：报错', () => {
  assert.throws(() => samplingBody({ purposes: { x: { temperature: '0' } } }, 'x'), /须为非负数或 null/);
  assert.throws(() => samplingBody({ purposes: { x: {} } }, 'x'), /须为非负数或 null/);
  assert.throws(() => samplingBody({}, 'x'), /缺 purposes/);
});

test('仓库档表可读，且每档带出处', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'tools/dispatch/sampling.json'), 'utf8'));
  for (const [name, entry] of Object.entries(cfg.purposes)) {
    assert.ok(entry.source, `${name} 缺出处`);
    assert.doesNotThrow(() => samplingBody(cfg, name));
  }
});
