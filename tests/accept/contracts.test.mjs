// L-12 跨卷契约表校验的单测：覆盖 docs/gemini/contracts-spec-1125.md §5.3 的 14 条正负向矩阵。
// 所有负向用例都在真实文件的深拷贝或系统临时目录里改，不写仓库真实文件。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateContractsSchema,
  validateContractsRefs,
  loadAndValidateContracts,
} from '../../tools/accept/lib/contracts.mjs';
import { ROOT, testTempRoot, writeUnderTempRoot } from './temp-root.mjs';

const REAL = JSON.parse(readFileSync(join(ROOT, 'world/ontology/contracts.json'), 'utf8'));
const clone = () => structuredClone(REAL);
const contractById = (doc, id) => doc.contracts.find((contract) => contract.id === id);
const codes = (result) => result.errors.map((error) => error.code);

function assertSchemaHas(doc, code) {
  const result = validateContractsSchema(doc);
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes(code), `期望错误码 ${code}，实际 ${codes(result).join(', ')}`);
}

function assertRefsHas(doc, code) {
  const result = validateContractsRefs(doc, { repoRoot: ROOT });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes(code), `期望错误码 ${code}，实际 ${codes(result).join(', ')}`);
}

// 矩阵 1：真实仓库端到端正向。
test('真实仓库契约表：loadAndValidateContracts 通过，5 条活跃契约齐全', () => {
  const result = loadAndValidateContracts({ repoRoot: ROOT });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.doc.contracts));
  assert.ok(result.doc.contracts.length >= 5);
  const ids = new Set(result.doc.contracts.map((contract) => contract.id));
  for (const id of ['ctr_post_commit_time', 'ctr_volume_cells_seed_bind', 'ctr_map_nonnull_view', 'ctr_settlement_subzone', 'ctr_provenance_tiers']) {
    assert.ok(ids.has(id), `缺少契约 ${id}`);
    assert.equal(contractById(result.doc, id).status, 'active');
  }
});

test('真实仓库契约表：结构校验与引用校验分层各自通过', () => {
  const doc = clone();
  assert.deepEqual(validateContractsSchema(doc), { ok: true, errors: [] });
  assert.deepEqual(validateContractsRefs(doc, { repoRoot: ROOT }), { ok: true, errors: [] });
});

// 矩阵 2：顶层版本与多余键负向。
test('矩阵 2：version 非 1 或顶层多余键 → E-CTR-ROOT-SHAPE', () => {
  const wrongVersion = clone();
  wrongVersion.version = 2;
  assertSchemaHas(wrongVersion, 'E-CTR-ROOT-SHAPE');

  const extraKey = clone();
  extraKey.extra = 1;
  assertSchemaHas(extraKey, 'E-CTR-ROOT-SHAPE');

  assertSchemaHas([], 'E-CTR-ROOT-SHAPE');
});

// 矩阵 3：出处档位覆盖缺口与重叠负向。
test('矩阵 3：cellGrades 覆盖缺口或两档重叠 → E-CTR-TIERS-COVERAGE', () => {
  const missingGrade = clone();
  missingGrade.provenanceTiers.literature.cellGrades = ['measured'];
  assertSchemaHas(missingGrade, 'E-CTR-TIERS-COVERAGE');

  const overlap = clone();
  overlap.provenanceTiers.literature.cellGrades = ['measured', 'referenced', 'designed'];
  assertSchemaHas(overlap, 'E-CTR-TIERS-COVERAGE');
});

// 矩阵 4：重复 id 负向。
test('矩阵 4：重复契约 id → E-CTR-ID-DUP', () => {
  const doc = clone();
  doc.contracts.push(structuredClone(doc.contracts[0]));
  assertSchemaHas(doc, 'E-CTR-ID-DUP');
});

// 矩阵 5：非法 id 格式负向。
test('矩阵 5：id 不符合 ^ctr_[a-z][a-z0-9_]{1,43}$ → E-CTR-ID-INVALID', () => {
  const doc = clone();
  doc.contracts[0].id = 'C1-bad';
  assertSchemaHas(doc, 'E-CTR-ID-INVALID');
});

// 矩阵 6：owner 混入 consumers / consumers 重复负向。
test('矩阵 6：consumers 含 owner → E-CTR-OWNER-IN-CONSUMERS；consumers 重复 → E-CTR-VOL-PATH', () => {
  const ownerInConsumers = clone();
  ownerInConsumers.contracts[0].consumers.push(ownerInConsumers.contracts[0].owner);
  assertSchemaHas(ownerInConsumers, 'E-CTR-OWNER-IN-CONSUMERS');

  const duplicate = clone();
  duplicate.contracts[0].consumers.push(duplicate.contracts[0].consumers[0]);
  assertSchemaHas(duplicate, 'E-CTR-VOL-PATH');
});

// 矩阵 7：status 与 supersededBy 矛盾负向。
test('矩阵 7：active 带 supersededBy / superseded 带 null、指向自身或不存在 → E-CTR-STATUS-INVALID', () => {
  const activeWithTarget = clone();
  activeWithTarget.contracts[0].supersededBy = 'ctr_map_nonnull_view';
  assertSchemaHas(activeWithTarget, 'E-CTR-STATUS-INVALID');

  const supersededNull = clone();
  supersededNull.contracts[0].status = 'superseded';
  supersededNull.contracts[0].supersededBy = null;
  assertSchemaHas(supersededNull, 'E-CTR-STATUS-INVALID');

  const supersededSelf = clone();
  supersededSelf.contracts[0].status = 'superseded';
  supersededSelf.contracts[0].supersededBy = supersededSelf.contracts[0].id;
  assertSchemaHas(supersededSelf, 'E-CTR-STATUS-INVALID');

  const supersededMissing = clone();
  supersededMissing.contracts[0].status = 'superseded';
  supersededMissing.contracts[0].supersededBy = 'ctr_no_such_contract';
  assertSchemaHas(supersededMissing, 'E-CTR-STATUS-INVALID');
});

// 矩阵 8：非法 statement.kind 或空 invariants 负向。
test('矩阵 8：kind 不在封闭枚举或 invariants 为空 → E-CTR-STATEMENT-SHAPE', () => {
  const badKind = clone();
  badKind.contracts[0].statement.kind = 'custom_hack';
  assertSchemaHas(badKind, 'E-CTR-STATEMENT-SHAPE');

  const emptyInvariants = clone();
  emptyInvariants.contracts[0].statement.invariants = [];
  assertSchemaHas(emptyInvariants, 'E-CTR-STATEMENT-SHAPE');
});

// 矩阵 9：卷文件不存在负向。
test('矩阵 9：sources[].file 指向不存在的卷文件 → E-CTR-VOL-NOT-FOUND', () => {
  const doc = clone();
  doc.contracts[0].sources[0].file = 'docs/统一底层设计/卷九十九-不存在.md';
  assertRefsHas(doc, 'E-CTR-VOL-NOT-FOUND');
});

// 矩阵 10：行号越界负向（Schema 层与 Refs 层各一条）。
test('矩阵 10：line 为 0 → Schema E-CTR-SOURCE-SHAPE；line 超出总行数 → Refs E-CTR-SOURCE-LINE-RANGE', () => {
  const lineZero = clone();
  lineZero.contracts[0].sources[0].line = 0;
  assertSchemaHas(lineZero, 'E-CTR-SOURCE-SHAPE');

  const lineTooLarge = clone();
  lineTooLarge.contracts[0].sources[0].line = 999999;
  assertRefsHas(lineTooLarge, 'E-CTR-SOURCE-LINE-RANGE');
});

// 矩阵 11：摘录漂移负向（回归保护，卷十二旧行号 777）。
test('矩阵 11：卷十二行号改回 777 但保留原摘录 → E-CTR-SOURCE-EXCERPT-MISMATCH', () => {
  const doc = clone();
  const source = contractById(doc, 'ctr_provenance_tiers').sources.find((item) => item.file === 'docs/统一底层设计/卷十二-验收与自动扫描.md');
  assert.ok(source, '真实契约表应含卷十二出处');
  source.line = 777;
  assertRefsHas(doc, 'E-CTR-SOURCE-EXCERPT-MISMATCH');
});

// 矩阵 12：无效或非活跃 rulingId 负向。
test('矩阵 12：rulingIds 填入不存在的裁定 → E-CTR-RULING-INVALID', () => {
  const doc = clone();
  contractById(doc, 'ctr_provenance_tiers').rulingIds.push('NOT-EXIST-999');
  assertRefsHas(doc, 'E-CTR-RULING-INVALID');
});

// 矩阵 13：problemRefs 越界负向。
test('矩阵 13：problemRefs 越过 docs/问题.md 总行数 → E-CTR-PROBLEM-LINE-RANGE', () => {
  const doc = clone();
  contractById(doc, 'ctr_provenance_tiers').statement.problemRefs = ['docs/问题.md:1-9999'];
  assertRefsHas(doc, 'E-CTR-PROBLEM-LINE-RANGE');
});

// 矩阵 14：文件缺失 / 坏 JSON 拒绝静默兜底。
test('矩阵 14：contractsPath 不存在 → E-CTR-READ；非法 JSON → E-CTR-JSON-PARSE', () => {
  const missing = loadAndValidateContracts({ repoRoot: ROOT, contractsPath: 'world/ontology/no-such-contracts.json' });
  assert.equal(missing.ok, false);
  assert.equal(missing.doc, null);
  assert.ok(codes(missing).includes('E-CTR-READ'));

  const dir = testTempRoot('contracts-test-');
  try {
    const badPath = writeUnderTempRoot(dir, 'bad.json', '{ this is not json');
    const badJson = loadAndValidateContracts({ repoRoot: ROOT, contractsPath: badPath });
    assert.equal(badJson.ok, false);
    assert.equal(badJson.doc, null);
    assert.ok(codes(badJson).includes('E-CTR-JSON-PARSE'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('repoRoot 缺失 → E-CTR-READ，不静默放行', () => {
  const doc = clone();
  assert.equal(validateContractsRefs(doc, {}).ok, false);
  assert.ok(codes(validateContractsRefs(doc, {})).includes('E-CTR-READ'));
  assert.equal(loadAndValidateContracts({}).ok, false);
});
