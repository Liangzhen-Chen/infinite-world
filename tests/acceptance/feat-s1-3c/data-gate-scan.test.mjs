// S1-3c（开局化身建档派生）黑盒验收：卡文第 7、9、10 条。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s13c。
// 依据见 docs/卡档案/feat-s1-3c/出题.md（卷:行 为依据）。
// 第 7 条：临时副本里改写来历模板行（删 species、指向不存在的物种行），候选应恰为基线候选去掉这两行。
// 第 9 条：扫描式——规则层代码不出现物种与文化的 id 字面量；adultMassKg 只出现在 instantiatePerson 所在文件。
// 第 10 条：kernel/files.json 仍为 15 个文件（门禁与闭包的其余部分由 CI 与 tsc 核，见出题.md 说明）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { init } from '../../../server-plugin/index.mjs';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
const SERVER = join(ROOT, 'server-plugin');
const loadJson = (/** @type {string} */ p) => JSON.parse(readFileSync(p, 'utf8'));

const PERSON_ROWS = loadJson(join(WORLD, 'ontology/dimensions/person.json')).rows;
const SPECIES_IDS = Object.keys(loadJson(join(WORLD, 'ontology/dimensions/species.json')).rows);
const CULTURE_IDS = loadJson(join(WORLD, 'lore/cultures.json')).map((c) => c.id);

const roots = [];
after(() => {
  for (const r of roots.splice(0)) removeTempRoot(r);
});

// 复制 server-plugin 与 world 到临时根（同 S1-3a 第 8 条口径），之后可在副本里改写数据。
function copyTree(/** @type {string} */ root, /** @type {string} */ rel) {
  for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
    const sub = join(rel, e.name);
    if (e.isDirectory()) copyTree(root, sub);
    else writeUnderTempRoot(root, sub, readFileSync(join(ROOT, sub)));
  }
}

const candidatesOf = (world, /** @type {string} */ slot) => {
  const a = world.menu(null).affordances.find((x) => (x.act ?? x.id) === 'act_choose_origin');
  assert.ok(a, '开局菜单投影应含 act_choose_origin');
  assert.ok(Array.isArray(a.slots?.[slot]), `槽位 ${slot} 应给出候选数组`);
  return a.slots[slot];
};

// 递归列出目录下全部 .mjs（仓库相对路径）。
function mjsUnder(/** @type {string} */ dir, /** @type {string} */ rel = '') {
  const out = [];
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const sub = join(rel, e.name);
    if (e.isDirectory()) out.push(...mjsUnder(dir, sub));
    else if (e.name.endsWith('.mjs')) out.push(sub.split('\\').join('/'));
  }
  return out;
}

// ---------- 第 7 条 ----------

test('7. 数据门：模板行无 species、或所指物种行不存在的来历，不出现在开局候选里；其余候选不变', async () => {
  const baseRoot = testTempRoot('s13c-gate-base-');
  roots.push(baseRoot);
  const base = await init({ saveRoot: baseRoot });
  const baseOffered = candidatesOf(base, 'origin');
  assert.ok(baseOffered.length >= 3, '基线候选应至少三条，才能改写其中两条验证');
  const [noSpecies, badSpecies] = [baseOffered[0], baseOffered[1]];

  const root = testTempRoot('s13c-gate-patched-');
  roots.push(root);
  copyTree(root, 'server-plugin');
  copyTree(root, 'world');
  const rel = 'world/ontology/dimensions/person.json';
  const doc = loadJson(join(root, rel));
  delete doc.rows[noSpecies].species;
  doc.rows[badSpecies].species = 'species_no_such_row_probe';
  writeUnderTempRoot(root, rel, JSON.stringify(doc, null, 2));

  const { init: initCopy } = await import(pathToFileURL(join(root, 'server-plugin/index.mjs')).href);
  const world = await initCopy({ saveRoot: root });
  const offered = candidatesOf(world, 'origin');
  assert.equal(offered.includes(noSpecies), false, '模板行无 species 的来历不应出现在候选');
  assert.equal(offered.includes(badSpecies), false, '所指物种行不存在的来历不应出现在候选');
  assert.deepEqual([...offered].sort(), baseOffered.filter((id) => id !== noSpecies && id !== badSpecies).sort(), '其余候选应不变');
});

// ---------- 第 9 条（扫描式） ----------

const RULE_FILES = mjsUnder(SERVER, 'rules').map((p) => join(SERVER, p));
const ALL_SERVER_FILES = mjsUnder(SERVER).map((p) => [p, readFileSync(join(SERVER, p), 'utf8')]);

test('9a. 扫描：规则层代码不出现物种 id、文化 id 的字面量（id 从 world/ 读，不写死）', () => {
  const ids = [...SPECIES_IDS, ...CULTURE_IDS];
  const generic = /['"`](species|culture)_[a-z0-9_]+['"`]/;
  const hits = [];
  for (const file of RULE_FILES) {
    const text = readFileSync(file, 'utf8');
    for (const id of ids) {
      for (const q of ["'", '"', '`']) if (text.includes(`${q}${id}${q}`)) hits.push(`${file}: ${id}`);
    }
    const m = generic.exec(text);
    if (m) hits.push(`${file}: ${m[0]}`);
  }
  assert.deepEqual(hits, [], `规则层不应出现物种或文化 id 字面量：${hits.join('; ')}`);
});

// 写入形状：setEntityProp(...) 的同一行带 adultMassKg 字面量，或对 props.adultMassKg 赋值（非比较）。读者（如 rules/body/body.mjs 的 dim 读）不命中。
const WRITE_LINE = /setEntityProp\([^)\n]*adultMassKg|props\.adultMassKg\s*=[^=]|props\[\s*['"]adultMassKg['"]\s*\]\s*=[^=]/;
test('9b. 扫描：adultMassKg 的写者只有 instantiatePerson（写入语句只出现在 rules/body/person.mjs）', () => {
  const writers = ALL_SERVER_FILES
    .filter(([, text]) => text.split('\n').some((line) => WRITE_LINE.test(line)))
    .map(([p]) => p.split('\\').join('/'));
  assert.deepEqual(writers, ['rules/body/person.mjs'], `adultMassKg 的写入语句只应在 rules/body/person.mjs，实为 ${JSON.stringify(writers)}`);
  const src = readFileSync(join(SERVER, 'rules/body/person.mjs'), 'utf8');
  assert.match(src, /export function instantiatePerson\b/, 'rules/body/person.mjs 应导出 instantiatePerson');
});

// ---------- 第 10 条 ----------

test('10. 门禁：kernel/files.json 仍为 15 个文件', () => {
  const list = loadJson(join(SERVER, 'kernel/files.json'));
  assert.equal(list.length, 15, `kernel/files.json 应为 15 个文件，实为 ${list.length}`);
});
