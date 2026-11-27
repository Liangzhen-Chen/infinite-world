// S2-P 位置写者黑盒验收：规则层扫描（红线：不准硬编码；pos、facing 只由 position.mjs 写）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2p。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-p/出题.md。
// 字符串字面量逐个比对；注释不计。门禁全绿、L0 15/15、tsc 零错不在本文件，由 CI 判定。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as S from './support.mjs';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.mjs')) out.push(p);
  }
  return out;
}
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const literals = (code) => [...code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => m[2]);
const rel = (f) => relative(S.ROOT, f).split(sep).join('/');
const RULES = join(S.ROOT, 'server-plugin', 'rules');
const POSITION_WRITER = 'server-plugin/rules/travel/position.mjs';

test('8a. 扫描：规则层代码的字符串字面量不含地点、组件类的 id（地点与建筑 id 取自 world 数据）', () => {
  const ids = new Map();
  for (const id of Object.keys(S.PLACE_ROWS)) ids.set(id, '地点');
  for (const id of S.COMPONENT_IDS) ids.set(id, '组件类');
  const files = walk(RULES);
  assert.ok(files.length > 0, '规则层应有代码可扫');
  const hits = [];
  for (const f of files) {
    for (const lit of literals(stripComments(readFileSync(f, 'utf8')))) {
      if (ids.has(lit)) hits.push(`${rel(f)}：${ids.get(lit)} ${lit}`);
    }
  }
  assert.deepEqual(hits, [], '规则层不得写死地点、组件类的 id（数据从 world 读）');
});

test('8b. 扫描：pos、facing 只由 rules/travel/position.mjs 经 setEntityProp 写（卷十七:305 唯一写者）', () => {
  const files = walk(RULES).filter((f) => rel(f) !== POSITION_WRITER);
  const hits = [];
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/setEntityProp/g)) {
      const window = src.slice(m.index, m.index + 300);
      for (const lit of literals(window)) {
        if (lit === 'pos' || lit === 'facing') hits.push(`${rel(f)}：setEntityProp 写 ${lit}`);
      }
    }
  }
  assert.deepEqual(hits, [], 'pos、facing 只能由 position.mjs 写');
});
