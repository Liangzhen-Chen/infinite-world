// S2-0c1 黑盒验收，第 8 条：规则层扫描（红线：不准硬编码）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-0c1。
// 字符串字面量逐个比对；注释不计。门禁全绿、L0 白名单、tsc 零错不在本文件，由 CI 判定。
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

test('8a. 扫描：规则层代码的字符串字面量不含持有种类、物品、组件类、资源种类、出身条目、来历行、物种的 id（数据从 world 读）', () => {
  const ids = new Map();
  for (const id of Object.keys(S.HK)) ids.set(id, '持有种类');
  for (const id of Object.keys(S.ITEM_ROWS)) ids.set(id, '物品');
  for (const id of S.COMPONENT_IDS) ids.set(id, '组件类');
  for (const id of S.RESOURCE_IDS) ids.set(id, '资源种类');
  for (const id of Object.keys(S.ORIGIN_ENTRIES)) ids.set(id, '出身条目');
  for (const id of Object.keys(S.PERSON_ROWS)) ids.set(id, '来历行');
  for (const id of S.SPECIES_IDS) ids.set(id, '物种');
  const files = walk(RULES);
  assert.ok(files.length > 0, '规则层应有代码可扫');
  const hits = [];
  for (const f of files) {
    for (const lit of literals(stripComments(readFileSync(f, 'utf8')))) {
      if (ids.has(lit)) hits.push(`${rel(f)}：${ids.get(lit)} ${lit}`);
    }
  }
  assert.deepEqual(hits, [], '规则层不得写死上述 id（卷九:721 数据从 world 读；AGENTS.md 不准硬编码）');
});

test('8b. 扫描：账户键 accounts 只由规则层的账本模块（rules/economy/ledger.mjs）写与读，别处不直接碰它（卷六:365；本卡 §2.2）', () => {
  const files = walk(RULES).filter((f) => rel(f) !== 'server-plugin/rules/economy/ledger.mjs');
  const hits = [];
  for (const f of files) {
    for (const lit of literals(stripComments(readFileSync(f, 'utf8')))) {
      if (lit === 'accounts' || lit.startsWith('accounts.')) hits.push(`${rel(f)}：${lit}`);
    }
  }
  assert.deepEqual(hits, [], 'accounts 只能经 rules/economy/ledger.mjs 读写');
});
