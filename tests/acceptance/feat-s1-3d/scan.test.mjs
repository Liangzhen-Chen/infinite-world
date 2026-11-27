// S1-3d（开局选种族）黑盒验收：卡文第 7 条（扫描式）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s13d。
// 依据与每条测什么，见 docs/卡档案/feat-s1-3d/出题.md（卷:行 为依据）。
// 扫描式只读源码与数据文件；不运行引擎。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
const loadJson = (/** @type {string} */ p) => JSON.parse(readFileSync(p, 'utf8'));

const CATALOG = join(ROOT, 'server-plugin/rules/act/catalog.mjs');
const PERSON_ROWS = loadJson(join(WORLD, 'ontology/dimensions/person.json')).rows;
const VOCAB = loadJson(join(WORLD, 'ontology/dimensions/_vocab.json'));

test('7a. 扫描：规则层动作目录 catalog.mjs 不出现 comp_ 或 species_ 字面量（种族候选与可扮演组件类都从数据读）', () => {
  const text = readFileSync(CATALOG, 'utf8');
  assert.doesNotMatch(text, /comp_/, 'catalog.mjs 不应出现 comp_ 字面量');
  assert.doesNotMatch(text, /species_/, 'catalog.mjs 不应出现 species_ 字面量');
});

test('7b. 扫描：来历行无 species 字段（种族由开局菜单所选，不再挂在来历行上）', () => {
  const withSpecies = Object.keys(PERSON_ROWS).filter((id) => Object.hasOwn(PERSON_ROWS[id], 'species'));
  assert.deepEqual(withSpecies, [], `person 表来历行不应带 species 字段，实为 ${JSON.stringify(withSpecies)}`);
});

test('7c. 扫描：origin.ready 数据门已删（catalog.mjs 不再读该命名空间，tf_player_origin 的 whenRX 不再引用）', () => {
  const text = readFileSync(CATALOG, 'utf8');
  assert.doesNotMatch(text, /origin\.ready/, 'catalog.mjs 不应再读 origin.ready');
  const tf = VOCAB.families.target_filter?.entries?.tf_player_origin;
  assert.ok(tf, '目标过滤族应登记 tf_player_origin');
  assert.doesNotMatch(String(tf.whenRX), /origin\.ready/, 'tf_player_origin.whenRX 不应再引用 origin.ready');
});
