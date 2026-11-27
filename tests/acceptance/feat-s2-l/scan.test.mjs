// S2-L（最小账本）黑盒验收，第 10 条中的规则层扫描：规则层代码不出现资源种类、来历条目或来历行的 id 字面量（红线：不准硬编码）。
// 出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2l。依据见 docs/卡档案/feat-s2-l/出题.md。
// id 全部取自 world 数据；注释不计，字符串字面量逐个比对。门禁全绿、L0 15/15、tsc 等由 CI 判定，不在本文件。
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

test('10. 扫描：规则层代码的字符串字面量不含资源种类、出身条目、来历行的 id', () => {
  const ids = new Map();
  for (const id of S.RESOURCE_IDS) ids.set(id, '资源种类');
  for (const id of Object.keys(S.ORIGIN_ENTRIES)) ids.set(id, '出身条目');
  for (const id of Object.keys(S.PERSON_ROWS)) ids.set(id, '来历行');

  const files = walk(join(S.ROOT, 'server-plugin', 'rules'));
  assert.ok(files.length > 0, '规则层应有代码可扫');
  const hits = [];
  for (const f of files) {
    const code = stripComments(readFileSync(f, 'utf8'));
    for (const m of code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
      if (ids.has(m[2])) hits.push(`${relative(S.ROOT, f).split(sep).join('/')}：${ids.get(m[2])} ${m[2]}`);
    }
  }
  assert.deepEqual(hits, [], '规则层不得写死资源或来历的 id（数据从 world 读）');
});
