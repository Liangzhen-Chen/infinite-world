// S1-4 黑盒验收：卡文第 5 条（前端不写死）与显示名覆盖（draft §4 的一条核对）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s14。
// 依据与每条测什么，见 docs/卡档案/feat-s1-4/出题.md。
// 口径：用 acorn 解析 client/ 下每个 .mjs，只看字符串字面量与模板文本（不看注释）。
// id 全集取自 world/ontology/dimensions 下实体维度表的行键（下划线开头的词表、单位、分布等不计）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const CLIENT = join(REPO, 'client');
const CJK = /[　-〿㐀-鿿豈-﫿＀-￯]/;

function mjsFiles(dir) {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((p) => extname(p) === '.mjs')
    .map((p) => join(dir, p));
}

// 收集一个模块里全部字符串字面量与模板文本（不含注释）。
function stringsOf(src) {
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const out = [];
  (function walk(/** @type {unknown} */ x) {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    const n = /** @type {Record<string, unknown>} */ (x);
    if (n.type === 'Literal' && typeof n.value === 'string') out.push(n.value);
    if (n.type === 'TemplateElement') {
      const t = /** @type {{cooked?: string | null, raw?: string}} */ (n.value);
      out.push(t.cooked ?? t.raw ?? '');
    }
    for (const k of Object.keys(n)) {
      if (k === 'type' || k === 'loc' || k === 'range') continue;
      walk(n[k]);
    }
  })(ast);
  return out;
}

function clientStrings() {
  const all = [];
  for (const f of mjsFiles(CLIENT)) {
    for (const s of stringsOf(readFileSync(f, 'utf8'))) all.push({ file: f, s });
  }
  return all;
}

// 实体 id 全集：world/ontology/dimensions 下非下划线开头的维度表，取 rows 的 key。
function worldEntityIds() {
  const dir = join(REPO, 'world', 'ontology', 'dimensions');
  const ids = new Set();
  for (const p of readdirSync(dir)) {
    if (extname(p) !== '.json' || p.startsWith('_')) continue;
    const doc = JSON.parse(readFileSync(join(dir, p), 'utf8'));
    for (const key of Object.keys(doc.rows ?? {})) ids.add(key);
  }
  return ids;
}

test('5a. 前端不写自然语言：client/ 下各 .mjs 的字符串字面量与模板文本中，CJK 码点数为 0', () => {
  const files = mjsFiles(CLIENT);
  assert.ok(files.length > 0, 'client/ 下应有 .mjs 文件');
  const hits = clientStrings().filter(({ s }) => CJK.test(s));
  assert.deepEqual(hits.map(({ file, s }) => `${file}: ${s.slice(0, 40)}`), [], '字符串字面量里不得有 CJK');
});

test('5b. 前端不写死 id：client/ 下各 .mjs 的字符串字面量中，与 world 实体 id 全集相等的数为 0', () => {
  const ids = worldEntityIds();
  assert.ok(ids.size > 0, 'world 实体 id 全集应非空');
  const hits = clientStrings().filter(({ s }) => ids.has(s));
  assert.deepEqual(hits.map(({ file, s }) => `${file}: ${s}`), [], '字符串字面量里不得出现实体 id');
});

test('5c. 布局与按钮名只来自代号：client/layout.json 每块的块代号与行令牌在 world/i18n/labels.zh.json 里都有非空的显示名', () => {
  const layout = JSON.parse(readFileSync(join(CLIENT, 'layout.json'), 'utf8')).blocks;
  assert.ok(Array.isArray(layout) && layout.length > 0, 'layout.json 的 blocks 应为非空数组');
  const labels = JSON.parse(readFileSync(join(REPO, 'world', 'i18n', 'labels.zh.json'), 'utf8'));
  const missing = [];
  for (const b of layout) {
    for (const t of [b.block, ...(b.rows ?? []).map((r) => r.token)]) {
      if (typeof labels[t]?.label !== 'string' || labels[t].label.length === 0) missing.push(String(t));
    }
  }
  assert.deepEqual(missing, [], '每块的块代号与行令牌都应有显示名');
});
