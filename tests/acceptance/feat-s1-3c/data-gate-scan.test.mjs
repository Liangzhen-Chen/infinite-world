// S1-3c（开局化身建档派生）黑盒验收：卡文第 7、9、10 条。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s13c。
// 依据见 docs/卡档案/feat-s1-3c/出题.md（卷:行 为依据）。
// 第 7 条（S1-3d 改写为正向断言）：临时副本里改写来历模板行（删 species、指向不存在的物种行），候选仍与基线相同（门已删）。
// 第 9 条：扫描式——规则层代码不出现物种与文化的 id 字面量；adultMassKg 只出现在 instantiatePerson 所在文件。
// 第 10 条：kernel/files.json 仍为 15 个文件（门禁与闭包的其余部分由 CI 与 tsc 核，见出题.md 说明）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { express } from '../../support/express.mjs';
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

// S1-3d：origin.ready 数据门已删（种族与来历解耦，来历候选只看 origin.open）。原第 7 条的门，改为正向断言：
// 模板行无 species、或所指物种行不存在的来历，仍出现在候选里（放开后可建，建档见 feat-s1-3d/origin-open.test.mjs 第 4b、4c 条）。
test('7. 数据门已删：模板行无 species、或所指物种行不存在的来历，仍出现在开局候选里；候选集与基线相同', async () => {
  const baseRoot = testTempRoot('s13c-gate-base-');
  roots.push(baseRoot);
  const base = await init(express.Router(), { saveRoot: baseRoot });
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
  const world = await initCopy(express.Router(), { saveRoot: root });
  const offered = candidatesOf(world, 'origin');
  assert.equal(offered.includes(noSpecies), true, '模板行无 species 的来历应仍在候选里（门已删）');
  assert.equal(offered.includes(badSpecies), true, '所指物种行不存在的来历应仍在候选里（门已删）');
  assert.deepEqual([...offered].sort(), [...baseOffered].sort(), '候选集应与基线相同');
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
// 数据驱动写者（卷四:220；派卡 9b 结构式改法）：维度名由 rules.person.sampleFrom 的 target 决定，源码不出现 adultMassKg 字面量，
// 故 9b 改为三条同时断言：(a) 字面量写入语句只允许出现在 instantiatePerson 文件之外的零处；(b) 数据表里确有 target 为 adultMassKg 的行；
// (c) 读 sampleFrom 键并调 setEntityProp 的文件恰好是 instantiatePerson 所在文件，且它导出 instantiatePerson。
const WRITER_FILE = 'rules/body/person.mjs';
test('9b. 扫描：adultMassKg 的写者只有 instantiatePerson（结构式：字面量写入为零；sampleFrom 数据行存在；读 sampleFrom 且写实体属性的文件唯一）', () => {
  // (a)
  const literalWriters = ALL_SERVER_FILES
    .filter(([p]) => p.split('\\').join('/') !== WRITER_FILE)
    .filter(([, text]) => text.split('\n').some((line) => WRITE_LINE.test(line)))
    .map(([p]) => p.split('\\').join('/'));
  assert.deepEqual(literalWriters, [], `除 ${WRITER_FILE} 外不应有 adultMassKg 的写入语句，实为 ${JSON.stringify(literalWriters)}`);

  // (b) 按 registry 找 person 表（路径不写死）
  const reg = loadJson(join(WORLD, 'rules/registry.json')).rows.find((r) => r.code === 'person');
  assert.ok(reg, 'world/rules/registry.json 应登记 person 表');
  const sampleFrom = loadJson(join(WORLD, 'rules', reg.file)).rows.find((r) => r.key === 'sampleFrom');
  assert.ok(sampleFrom, 'person 表应有 sampleFrom 行');
  assert.ok(sampleFrom.value.some((row) => row.target === 'adultMassKg'), 'sampleFrom 应有 target 为 adultMassKg 的行');

  // (c)
  const readers = ALL_SERVER_FILES
    .filter(([, text]) => /['"`]sampleFrom['"`]/.test(text) && /setEntityProp\(/.test(text))
    .map(([p]) => p.split('\\').join('/'));
  assert.deepEqual(readers, [WRITER_FILE], `读 sampleFrom 且调 setEntityProp 的文件应恰为 ${WRITER_FILE}，实为 ${JSON.stringify(readers)}`);
  const src = readFileSync(join(SERVER, WRITER_FILE), 'utf8');
  assert.match(src, /export function instantiatePerson\b/, `${WRITER_FILE} 应导出 instantiatePerson`);
});

// ---------- 第 10 条 ----------

test('10. 门禁：kernel/files.json 仍为 15 个文件', () => {
  const list = loadJson(join(SERVER, 'kernel/files.json'));
  assert.equal(list.length, 15, `kernel/files.json 应为 15 个文件，实为 ${list.length}`);
});
