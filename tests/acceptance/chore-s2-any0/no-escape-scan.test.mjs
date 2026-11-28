// 卷二:910 第 4a 条（V-2.b）词法扫描（chore/s2-any0 出题，黑盒）：不挪不绕。只扫 JSDoc 里的类型表达式与代码、注释里的指令文字，不扫正文英文词 any。
// (a) server-plugin/ 全部 .mjs：不许 as any、as unknown as、@ts- 指令。
// (b) server-plugin/rules/（V-2.b 判定范围，登记 groups: rules）：JSDoc 类型表达式里不许 any 与 *。
// (c) server-plugin/rules/：不许 x is T 谓词、asserts 类型、/** @type */ (…) 强转（mount.mjs 不得新增这三样）。
// (d) rules 之外：JSDoc any 与 * 的个数不得多于固定提交 6ac51cc39 时的个数（不把 any 挪去别处；钉固定提交，不随 HEAD 漂移）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from '../../accept/temp-root.mjs';

const PIN = '6ac51cc39';
const SERVER = join(ROOT, 'server-plugin');
const relOf = (/** @type {string} */ p) => relative(ROOT, p).split(sep).join('/');
const readText = (/** @type {string} */ p) => readFileSync(p, 'utf8');

/** @param {string} dir @returns {string[]} */
function listMjs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return listMjs(p);
    return e.name.endsWith('.mjs') ? [p] : [];
  });
}

/** 固定提交上某文件的正文；该文件当时不存在则为 null。 @param {string} rel */
function pinnedText(rel) {
  try {
    return execFileSync('git', ['show', `${PIN}:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  } catch {
    return null;
  }
}

/** 每个 JSDoc 块花括号内（类型表达式内）的 any 与通配 * 个数；块外的正文与行首星号不计。 @param {string} src */
function anyTypeHits(src) {
  let n = 0;
  for (const block of src.match(/\/\*\*[\s\S]*?\*\//g) || []) {
    const depth = new Array(block.length).fill(0);
    let d = 0;
    for (let i = 0; i < block.length; i++) {
      if (block[i] === '{') d++;
      else if (block[i] === '}') d = Math.max(0, d - 1);
      depth[i] = d;
    }
    // 通配 *：只认在类型标点之后、之前的位置（{*}、Array<*>、| *、, *），行首星号（ * @param）不算。
    for (const m of block.matchAll(/\bany\b|(?<=[{<,|([:]\s*)\*(?=\s*[}>,|)\]])/g)) {
      if (depth[m.index] > 0) n++;
    }
  }
  return n;
}

/** @type {ReadonlyArray<readonly [string, RegExp]>} */
const ESCAPE_CODE = [
  ['as any', /\bas\s+any\b/],
  ['as unknown as', /\bas\s+unknown\s+as\b/],
  ['@ts- 指令', /@ts-(ignore|expect-error|nocheck|check)\b/],
];

const files = listMjs(SERVER);
const rulesFiles = files.filter((p) => relOf(p).startsWith('server-plugin/rules/'));
const otherFiles = files.filter((p) => !relOf(p).startsWith('server-plugin/rules/'));

test('(a) server-plugin 全部 .mjs 不出现 as any、as unknown as、@ts- 指令', () => {
  const bad = [];
  for (const p of files) {
    const src = readText(p);
    for (const [name, re] of ESCAPE_CODE) if (re.test(src)) bad.push(`${relOf(p)}：${name}`);
  }
  assert.deepEqual(bad, []);
});

test('(b) server-plugin/rules/ 的 JSDoc 类型表达式里不许 any 与通配 *（V-2.b 零容忍，mount.mjs 须清零）', () => {
  const bad = rulesFiles.map((p) => ({ file: relOf(p), n: anyTypeHits(readText(p)) })).filter((r) => r.n > 0);
  assert.deepEqual(bad, []);
});

test('(c) server-plugin/rules/ 不许 x is T 谓词、asserts 类型、/** @type */ (…) 强转（mount.mjs 不得新增）', () => {
  const bad = [];
  for (const p of rulesFiles) {
    const src = readText(p);
    const blocks = src.match(/\/\*\*[\s\S]*?\*\//g) || [];
    if (blocks.some((b) => /\{[^}]*[\w$\])>]\s+is\s+[^}]*\}/.test(b) || /\{\s*asserts\b[^}]*\}/.test(b))) bad.push(`${relOf(p)}：x is T 谓词或 asserts`);
    if (/\/\*\*\s*@type\s*\{[^}]*\}\s*\*\/\s*\(/.test(src)) bad.push(`${relOf(p)}：/** @type */ 强转`);
  }
  assert.deepEqual(bad, []);
});

test('(d) rules 之外：JSDoc any 与 * 个数不得多于固定提交 6ac51cc39（不把 any 挪去别处）', () => {
  const bad = [];
  for (const p of otherFiles) {
    const cur = anyTypeHits(readText(p));
    if (cur === 0) continue;
    const old = pinnedText(relOf(p));
    const pinned = old === null ? 0 : anyTypeHits(old);
    if (cur > pinned) bad.push(`${relOf(p)}：固定提交 ${pinned} → 现在 ${cur}`);
  }
  assert.deepEqual(bad, []);
});
