// S2-T2 黑盒验收：规则层不写死代号、weatherAt 只由 env.mjs 引入、天气模块无顶层状态（卷二十:439 唯一环境入口；卷二十:462；门禁 pp_envat_import；禁顶层状态 WeakMap）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-t2。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t2/出题.md。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as S from './support.mjs';

const RULES = join(S.ROOT, 'server-plugin', 'rules');
const SERVER = join(S.ROOT, 'server-plugin');
const WEATHER = join(RULES, 'time_env', 'weather.mjs');
const ENV = join(RULES, 'time_env', 'env.mjs');
const code = (f) => S.stripComments(readFileSync(f, 'utf8'));

test('8a. 规则层字符串字面量不含天气、季节、地点行代号前缀（wx_、sea_、loc_、cpr_）：代号取自 world 词表，不写死', () => {
  const bad = /^(wx_|sea_|loc_|cpr_)/;
  const hits = [];
  for (const f of S.walk(RULES)) {
    for (const lit of S.literalsOf(code(f))) if (bad.test(lit)) hits.push(`${S.relPath(f)}: '${lit}'`);
  }
  assert.deepEqual(hits, [], '规则层不得写死代号字面量');
});

test('8b. weatherAt 只由 env.mjs 引入（门禁 pp_envat_import；卷二十:439 envAt 是唯一环境读入口），且 env.mjs 确实引入它（前提）', () => {
  const importsWeatherAt = (src) => /import\s*\{[^}]*\bweatherAt\b[^}]*\}\s*from/.test(src);
  const users = S.walk(SERVER)
    .filter((f) => f !== WEATHER && importsWeatherAt(code(f)))
    .map((f) => S.relPath(f));
  assert.ok(importsWeatherAt(code(ENV)), '前提：env.mjs 应引入 weatherAt');
  assert.deepEqual(users, [S.relPath(ENV)], 'weatherAt 只能由 env.mjs 引入');
});

test('8c. rules/time_env/weather.mjs 无顶层状态：不得有顶层 Map、WeakMap、Set 或 let 变量（禁顶层状态 WeakMap；不缓存）', () => {
  const src = code(WEATHER);
  const top = /^(let|const|var)\s+\w+\s*=\s*new\s+(Map|WeakMap|Set)\b/m;
  const mutableTop = /^let\s+\w+/m;
  assert.equal(top.test(src), false, '顶层不得有 Map、WeakMap、Set 实例');
  assert.equal(mutableTop.test(src), false, '顶层不得有可变 let 变量');
});
