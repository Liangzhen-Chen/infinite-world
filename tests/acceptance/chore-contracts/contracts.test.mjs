// 验收：卡 chore/contracts（L-12 契约表与校验器）。出题方：Claude Haiku 5.5，标识 haiku-api-test-ctr；未参与写码与审卡。
// 依据：docs/gemini/contracts-spec-1125.md:685–:700（导出接口）、:701–:719（V1–V14 与错误码表）、:720–:740（必测矩阵 14 条）、:103–:656（契约目标内容）；卷十二:779（摘录漂移回归）。
// 测什么：
//   1 真实仓库端到端正向（5 条契约、id 与规格一致、两档出处）；
//   2–14 按规格 §5.3 矩阵逐条负向（内存深拷贝上构造，不写仓库文件）；
//   负向只断言对应错误码出现且 ok === false；错误码字面量照 §5.2 表写。
// 不依赖仓库偶然数字：断言只看契约 id 集合、错误码与摘录内容，不写行数或计数基线。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CONTRACTS_REL = 'world/ontology/contracts.json';
const VOL12 = 'docs/统一底层设计/卷十二-验收与自动扫描.md';
const EXPECTED_IDS = [
  'ctr_map_nonnull_view',
  'ctr_post_commit_time',
  'ctr_provenance_tiers',
  'ctr_settlement_subzone',
  'ctr_volume_cells_seed_bind',
];

async function mod() {
  return import('../../../tools/accept/lib/contracts.mjs');
}
async function schema(doc) {
  const { validateContractsSchema } = await mod();
  return validateContractsSchema(doc);
}
async function refs(doc) {
  const { validateContractsRefs } = await mod();
  return validateContractsRefs(doc, { repoRoot: ROOT });
}
function base() {
  return JSON.parse(readFileSync(join(ROOT, CONTRACTS_REL), 'utf8'));
}
function byId(doc, id) {
  const c = doc.contracts.find((x) => x.id === id);
  assert.ok(c, `契约 ${id} 不存在`);
  return c;
}
function assertCode(res, code) {
  const got = res.errors.map((e) => e.code);
  assert.equal(res.ok, false, `期望 ok === false，实际 ${res.ok}`);
  assert.ok(got.includes(code), `期望错误码 ${code}，实际 [${got.join(', ')}]`);
}

// 矩阵 1：真实仓库端到端正向
test('矩阵1 真实仓库 loadAndValidateContracts 通过，5 条契约 id 与规格一致', async () => {
  const { loadAndValidateContracts } = await mod();
  const res = await loadAndValidateContracts({ repoRoot: ROOT });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.doc.contracts.map((c) => c.id).sort(), EXPECTED_IDS);
  assert.deepEqual(Object.keys(res.doc.provenanceTiers).sort(), ['design_spec', 'literature']);
});

// 矩阵 2：顶层版本与多余键
test('矩阵2 version 为 2 或顶层多余键 → E-CTR-ROOT-SHAPE', async () => {
  const d1 = base();
  d1.version = 2;
  assertCode(await schema(d1), 'E-CTR-ROOT-SHAPE');

  const d2 = base();
  d2.extra = 1;
  assertCode(await schema(d2), 'E-CTR-ROOT-SHAPE');
});

// 矩阵 3：出处档位覆盖缺口与重叠
test('矩阵3 cellGrades 缺 referenced 或两档重叠 designed → E-CTR-TIERS-COVERAGE', async () => {
  const gap = base();
  gap.provenanceTiers.literature.cellGrades = ['measured'];
  gap.provenanceTiers.design_spec.cellGrades = ['designed'];
  assertCode(await schema(gap), 'E-CTR-TIERS-COVERAGE');

  const overlap = base();
  overlap.provenanceTiers.literature.cellGrades = ['measured', 'referenced', 'designed'];
  overlap.provenanceTiers.design_spec.cellGrades = ['designed'];
  assertCode(await schema(overlap), 'E-CTR-TIERS-COVERAGE');
});

// 矩阵 4：重复 id
test('矩阵4 复制一条契约制造同 id → E-CTR-ID-DUP', async () => {
  const d = base();
  d.contracts.push(JSON.parse(JSON.stringify(d.contracts[0])));
  assertCode(await schema(d), 'E-CTR-ID-DUP');
});

// 矩阵 5：非法 id 格式
test('矩阵5 id 为 C1-bad 或不以 ctr_ 开头 → E-CTR-ID-INVALID', async () => {
  const d1 = base();
  d1.contracts[0].id = 'C1-bad';
  assertCode(await schema(d1), 'E-CTR-ID-INVALID');

  const d2 = base();
  d2.contracts[0].id = 'post_commit_time';
  assertCode(await schema(d2), 'E-CTR-ID-INVALID');
});

// 矩阵 6：owner 混入 consumers、consumers 重复、路径非法
test('矩阵6a consumers 含 owner → E-CTR-OWNER-IN-CONSUMERS', async () => {
  const d = base();
  const c = d.contracts[0];
  c.consumers = [...c.consumers, c.owner];
  assertCode(await schema(d), 'E-CTR-OWNER-IN-CONSUMERS');
});

test('矩阵6b consumers 含重复路径 → 拒收（错误码规格未逐条写明，只断言 ok === false）', async () => {
  const d = base();
  const c = d.contracts[0];
  c.consumers = [c.consumers[0], c.consumers[0]];
  const res = await schema(d);
  assert.equal(res.ok, false);
  assert.ok(res.errors.length > 0);
});

test('矩阵6c owner 或 consumers 路径不在卷文件目录下 → E-CTR-VOL-PATH', async () => {
  const d1 = base();
  d1.contracts[0].owner = 'docs/统一底层设计/卷一.txt';
  assertCode(await schema(d1), 'E-CTR-VOL-PATH');

  const d2 = base();
  const c = d2.contracts[0];
  c.consumers = [...c.consumers, 'docs/统一底层设计/子目录/卷x.md'];
  assertCode(await schema(d2), 'E-CTR-VOL-PATH');
});

// 矩阵 7：status 与 supersededBy 矛盾
test('矩阵7 status 与 supersededBy 矛盾 → E-CTR-STATUS-INVALID', async () => {
  const d1 = base();
  const a = byId(d1, 'ctr_post_commit_time');
  a.status = 'active';
  a.supersededBy = 'ctr_map_nonnull_view';
  assertCode(await schema(d1), 'E-CTR-STATUS-INVALID');

  const d2 = base();
  const b = byId(d2, 'ctr_post_commit_time');
  b.status = 'superseded';
  b.supersededBy = null;
  assertCode(await schema(d2), 'E-CTR-STATUS-INVALID');

  const d3 = base();
  const c = byId(d3, 'ctr_post_commit_time');
  c.status = 'superseded';
  c.supersededBy = 'ctr_no_such_contract';
  assertCode(await schema(d3), 'E-CTR-STATUS-INVALID');

  const d4 = base();
  const e = byId(d4, 'ctr_post_commit_time');
  e.status = 'superseded';
  e.supersededBy = e.id;
  assertCode(await schema(d4), 'E-CTR-STATUS-INVALID');
});

// 矩阵 8：statement.kind 非法、invariants 为空
test('矩阵8 statement.kind 为 custom_hack 或 invariants 为空 → E-CTR-STATEMENT-SHAPE', async () => {
  const d1 = base();
  byId(d1, 'ctr_post_commit_time').statement.kind = 'custom_hack';
  assertCode(await schema(d1), 'E-CTR-STATEMENT-SHAPE');

  const d2 = base();
  byId(d2, 'ctr_post_commit_time').statement.invariants = [];
  assertCode(await schema(d2), 'E-CTR-STATEMENT-SHAPE');
});

// 矩阵 9：卷文件不存在
test('矩阵9 sources 指向不存在的卷文件 → E-CTR-VOL-NOT-FOUND', async () => {
  const d = base();
  byId(d, 'ctr_post_commit_time').sources[0].file = 'docs/统一底层设计/卷九十九-不存在.md';
  assertCode(await refs(d), 'E-CTR-VOL-NOT-FOUND');
});

// 矩阵 10：行号越界（0 在 Schema 层，999999 在 Refs 层）
test('矩阵10a sources.line 为 0 → E-CTR-SOURCE-SHAPE（Schema 层）', async () => {
  const d = base();
  byId(d, 'ctr_post_commit_time').sources[0].line = 0;
  assertCode(await schema(d), 'E-CTR-SOURCE-SHAPE');
});

test('矩阵10b sources.line 为 999999 → E-CTR-SOURCE-LINE-RANGE（Refs 层）', async () => {
  const d = base();
  byId(d, 'ctr_post_commit_time').sources[0].line = 999999;
  assertCode(await refs(d), 'E-CTR-SOURCE-LINE-RANGE');
});

// 矩阵 11：摘录漂移回归（卷十二 779 改回 777）
test('矩阵11 卷十二摘录行号改回 777 → E-CTR-SOURCE-EXCERPT-MISMATCH（回归保护）', async () => {
  const d = base();
  const c = byId(d, 'ctr_provenance_tiers');
  const src = c.sources.find((s) => s.file === VOL12 && s.line === 779);
  assert.ok(src, '规格要求 ctr_provenance_tiers 含卷十二:779 摘录');
  const volLines = readFileSync(join(ROOT, VOL12), 'utf8').split(/\r?\n/);
  assert.ok(volLines[778].includes(src.excerpt), '前提：卷十二第 779 行含摘录');
  assert.ok(!volLines[776].includes(src.excerpt), '前提：卷十二第 777 行不含摘录（否则回归无意义）');
  src.line = 777;
  assertCode(await refs(d), 'E-CTR-SOURCE-EXCERPT-MISMATCH');
});

// 矩阵 12：无效 rulingId
test('矩阵12 rulingIds 含不存在的裁定 → E-CTR-RULING-INVALID', async () => {
  const d = base();
  byId(d, 'ctr_provenance_tiers').rulingIds = ['NOT-EXIST-999'];
  assertCode(await refs(d), 'E-CTR-RULING-INVALID');
});

// 矩阵 13：problemRefs 越界
test('矩阵13 problemRefs 行号超出 docs/问题.md 总行数 → E-CTR-PROBLEM-LINE-RANGE', async () => {
  const d = base();
  byId(d, 'ctr_provenance_tiers').statement.problemRefs = ['docs/问题.md:1-9999'];
  assertCode(await refs(d), 'E-CTR-PROBLEM-LINE-RANGE');
});

// 矩阵 14：读文件与坏 JSON 不得静默兜底
test('矩阵14a contractsPath 不存在 → ok === false 且 E-CTR-READ，不得返回空列表', async () => {
  const { loadAndValidateContracts } = await mod();
  const res = await loadAndValidateContracts({
    repoRoot: ROOT,
    contractsPath: 'world/ontology/不存在-contracts.json',
  });
  assertCode(res, 'E-CTR-READ');
  assert.equal(res.doc, null);
});

test('矩阵14b 非法 JSON → ok === false 且 E-CTR-JSON-PARSE，不得静默兜底', async () => {
  const { loadAndValidateContracts } = await mod();
  const dir = mkdtempSync(join(tmpdir(), 'ctr-bad-json-'));
  writeFileSync(join(dir, 'bad.json'), '{ "version": 1,');
  const res = await loadAndValidateContracts({ repoRoot: dir, contractsPath: 'bad.json' });
  assertCode(res, 'E-CTR-JSON-PARSE');
  assert.equal(res.doc, null);
});
