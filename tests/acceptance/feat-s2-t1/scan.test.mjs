// S2-T1 黑盒验收：规则层扫描（卷二十 T-3、T-4、T-8；门禁 pp_year_minutes、pp_envat_import）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2t1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t1/出题.md。注释不计；门禁与 tsc 本身由 CI 判定，不在本文件。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as S from './support.mjs';

const SERVER = join(S.ROOT, 'server-plugin');
const RULES = join(SERVER, 'rules');
const TIME_ENV = join(RULES, 'time_env');
/** @param {string} f */
const inTimeEnv = (f) => S.relPath(f).startsWith('server-plugin/rules/time_env/');
/** @param {string} f */
const sourceOf = (f) => S.stripComments(readFileSync(f, 'utf8'));

test('7a. 年历算术只在 rules/time_env/：该目录外的代码不出现 yearMinutes、yearDays（pp_year_minutes，T-3）', () => {
  const hits = [];
  for (const f of S.walk(SERVER)) {
    if (inTimeEnv(f)) continue;
    const src = sourceOf(f);
    for (const id of ['yearMinutes', 'yearDays']) {
      if (src.includes(id)) hits.push(`${S.relPath(f)}：含 ${id}`);
    }
  }
  assert.deepEqual(hits, [], '年历算术只能在 rules/time_env/ 内');
});

test('7b. 天气、季节模型只由 env.mjs import：除 env.mjs 与模型文件自身外，没有文件 import time_env 下的 season.mjs 或 weather.mjs', () => {
  const hits = [];
  const MODELS = new Set(['season.mjs', 'weather.mjs']);
  for (const f of S.walk(SERVER)) {
    const base = S.relPath(f).split('/').pop();
    if (base === 'env.mjs' || (inTimeEnv(f) && MODELS.has(base))) continue;
    const src = sourceOf(f);
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (MODELS.has(spec.split('/').pop())) hits.push(`${S.relPath(f)} import ${spec}`);
    }
  }
  assert.deepEqual(hits, [], '季节与天气模型只能由 env.mjs 引入（pp_envat_import）');
});

test('7c. 规则层代码的字符串字面量不含历法、季节、节气、天气的代号（T-4、T-8；代号取自 world 词表）', () => {
  const ids = new Map();
  const fams = S.loadJson(join(S.ROOT, 'world/ontology/dimensions/_vocab.json')).families;
  for (const fam of ['season', 'calendar', 'weather', 'solar_term']) {
    for (const id of Object.keys(fams[fam]?.entries ?? {})) ids.set(id, fam);
  }
  assert.ok(ids.size > 0, '词表应有代号可比');
  const hits = [];
  for (const f of S.walk(RULES)) {
    for (const lit of S.literalsOf(sourceOf(f))) {
      if (ids.has(lit)) hits.push(`${S.relPath(f)}：${ids.get(lit)} ${lit}`);
    }
  }
  assert.deepEqual(hits, [], '规则层不得写死历法、季节、节气、天气的代号');
});

test('7d. 没有 calendar:active 这类全局历法键（卷二十:588 全档案没有当前历法）', () => {
  const hits = [];
  for (const f of S.walk(SERVER)) {
    if (sourceOf(f).includes('calendar:active')) hits.push(S.relPath(f));
  }
  assert.deepEqual(hits, [], '不得出现 calendar:active');
});

test('7e. 时间环境模块的文件存在于 rules/time_env/（L0 红线：历法模块不放 kernel）', () => {
  assert.equal(existsSync(TIME_ENV), true, 'rules/time_env/ 应存在');
  const legacy = join(SERVER, 'kernel', 'calendar.mjs');
  assert.equal(existsSync(legacy), false, 'kernel/calendar.mjs 不得新建（kernel 已满 15/15）');
});
