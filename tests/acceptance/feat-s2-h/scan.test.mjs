// S2-H（最小持有）黑盒验收，第 9 条：规则层扫描（红线：不准硬编码）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2h。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-h/出题.md。
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

test('9a. 扫描：规则层代码的字符串字面量不含持有种类、物品、组件类、资源种类、出身条目、来历行的 id', () => {
  const ids = new Map();
  for (const id of Object.keys(S.HK)) ids.set(id, '持有种类');
  for (const id of Object.keys(S.ITEM_ROWS)) ids.set(id, '物品');
  for (const id of S.COMPONENT_IDS) ids.set(id, '组件类');
  for (const id of S.RESOURCE_IDS) ids.set(id, '资源种类');
  for (const id of Object.keys(S.ORIGIN_ENTRIES)) ids.set(id, '出身条目');
  for (const id of Object.keys(S.PERSON_ROWS)) ids.set(id, '来历行');

  const files = walk(join(S.ROOT, 'server-plugin', 'rules'));
  assert.ok(files.length > 0, '规则层应有代码可扫');
  const hits = [];
  for (const f of files) {
    for (const lit of literals(stripComments(readFileSync(f, 'utf8')))) {
      if (ids.has(lit)) hits.push(`${rel(f)}：${ids.get(lit)} ${lit}`);
    }
  }
  assert.deepEqual(hits, [], '规则层不得写死持有种类、物品、组件类、资源或来历的 id（数据从 world 读）');
});

test('9b. 扫描：持有状态的键 holdings 只出现在规则层的持有模块（rules/social/）里，别处不直接写它', () => {
  const files = walk(join(S.ROOT, 'server-plugin', 'rules')).filter((f) => !rel(f).startsWith('server-plugin/rules/social/'));
  const hits = [];
  for (const f of files) {
    for (const lit of literals(stripComments(readFileSync(f, 'utf8')))) {
      if (lit === 'holdings' || lit.startsWith('holdings.')) hits.push(`${rel(f)}：${lit}`);
    }
  }
  assert.deepEqual(hits, [], 'holdings 只能经 rules/social/holdings.mjs 读写（卷二:721；本卡 §3）');
});
