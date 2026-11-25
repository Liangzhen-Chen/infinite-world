// L-12 跨卷契约表 world/ontology/contracts.json 的离线校验（规格 docs/gemini/contracts-spec-1125.md §5）。
// 分两层：结构校验 V1–V10 纯内存；仓库引用校验 V11–V14 读 docs/（离线门禁组，不占 server-plugin/kernel 白名单）。
// 所有规则只读写文档自身字段与仓库文件，不按契约 id、卷名或场景特判。
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const CODES = Object.freeze({
  READ: 'E-CTR-READ',
  JSON_PARSE: 'E-CTR-JSON-PARSE',
  ROOT_SHAPE: 'E-CTR-ROOT-SHAPE',
  TIERS_SHAPE: 'E-CTR-TIERS-SHAPE',
  TIERS_COVERAGE: 'E-CTR-TIERS-COVERAGE',
  LIST_EMPTY: 'E-CTR-LIST-EMPTY',
  ITEM_SHAPE: 'E-CTR-ITEM-SHAPE',
  ID_INVALID: 'E-CTR-ID-INVALID',
  ID_DUP: 'E-CTR-ID-DUP',
  STATUS_INVALID: 'E-CTR-STATUS-INVALID',
  VOL_PATH: 'E-CTR-VOL-PATH',
  OWNER_IN_CONSUMERS: 'E-CTR-OWNER-IN-CONSUMERS',
  STATEMENT_SHAPE: 'E-CTR-STATEMENT-SHAPE',
  SOURCE_SHAPE: 'E-CTR-SOURCE-SHAPE',
  VOL_NOT_FOUND: 'E-CTR-VOL-NOT-FOUND',
  SOURCE_LINE_RANGE: 'E-CTR-SOURCE-LINE-RANGE',
  SOURCE_EXCERPT_MISMATCH: 'E-CTR-SOURCE-EXCERPT-MISMATCH',
  RULING_INVALID: 'E-CTR-RULING-INVALID',
  PROBLEM_LINE_RANGE: 'E-CTR-PROBLEM-LINE-RANGE',
});

const TOP_KEYS = Object.freeze(['version', 'source', 'provenanceTiers', 'contracts']);
const TIER_NAMES = Object.freeze(['literature', 'design_spec']);
const TIER_FIELDS = Object.freeze([
  'label', 'description', 'cellGrades', 'requiredFields', 'optionalFields',
  'anchorRules', 'defaultDomains', 'placeholderPolicy',
]);
const CONTRACT_KEYS = Object.freeze([
  'id', 'title', 'owner', 'consumers', 'status', 'supersededBy', 'rulingIds', 'statement', 'sources',
]);
const STATEMENT_KEYS = Object.freeze(['kind', 'summary', 'invariants', 'problemRefs']);
const INVARIANT_KEYS = Object.freeze(['id', 'target', 'assertion', 'params']);
const SOURCE_KEYS = Object.freeze(['file', 'line', 'excerpt', 'role']);

const CONTRACT_STATUSES = Object.freeze(['active', 'superseded']);
const STATEMENT_KINDS = Object.freeze([
  'protocol_split', 'phase_binding', 'read_view', 'spatial_subzone', 'provenance_grading',
]);
const SOURCE_ROLES = Object.freeze(['conflict', 'basis', 'resolution_target']);
const CELL_GRADES = Object.freeze(['measured', 'referenced', 'designed']);
const PLACEHOLDER_POLICIES = Object.freeze(['require_external_citation', 'reject_placeholder_only']);

const CONTRACT_ID_RE = /^ctr_[a-z][a-z0-9_]{1,43}$/;
const INVARIANT_ID_RE = /^[a-z][a-z0-9_]{1,47}$/;
const VOLUME_PATH_RE = /^docs\/统一底层设计\/[^/\\]+\.md$/;
const PROBLEM_REF_RE = /^docs\/问题\.md:(\d+)(?:-(\d+))?$/;
const LINE_SPLIT_RE = /\r?\n/;

const RULINGS_PATH = 'docs/审查/现行有效裁定.json';
const PROBLEM_PATH = 'docs/问题.md';
const DEFAULT_CONTRACTS_PATH = 'world/ontology/contracts.json';

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};
/** @param {unknown} value @returns {value is string} */
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isFiniteInteger = (value) => typeof value === 'number' && Number.isInteger(value);

const fail = (errors, code, path, message) => { errors.push({ code, path, message }); };

function checkKeys(errors, value, allowed, code, path) {
  if (!isPlainObject(value)) {
    fail(errors, code, path, '必须是普通对象');
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(errors, code, `${path}.${key}`, `不允许的键 "${key}"（封闭键集）`);
  }
  for (const key of allowed) {
    if (!(key in value)) fail(errors, code, `${path}.${key}`, `缺少必填键 "${key}"`);
  }
  return true;
}

// 数组元素：非空字符串、去重。allowEmpty 控制空数组是否合法。
function checkStringArray(errors, value, code, path, { allowEmpty, label, dedupe = true }) {
  if (!Array.isArray(value)) {
    fail(errors, code, path, `${label} 必须是数组`);
    return false;
  }
  if (!allowEmpty && value.length === 0) fail(errors, code, path, `${label} 不得为空数组`);
  const seen = new Set();
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!isNonEmptyString(item)) {
      fail(errors, code, `${path}[${i}]`, `${label} 的每项必须是非空字符串`);
      continue;
    }
    if (dedupe && seen.has(item)) fail(errors, code, `${path}[${i}]`, `${label} 不得含重复项`);
    seen.add(item);
  }
  return true;
}

function checkEnumArray(errors, value, code, path, allowed, { allowEmpty, label }) {
  if (!Array.isArray(value)) {
    fail(errors, code, path, `${label} 必须是数组`);
    return false;
  }
  if (!allowEmpty && value.length === 0) fail(errors, code, path, `${label} 不得为空数组`);
  const seen = new Set();
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!allowed.includes(item)) {
      fail(errors, code, `${path}[${i}]`, `${label} 取值必须是 ${allowed.join(' / ')} 之一`);
      continue;
    }
    if (seen.has(item)) fail(errors, code, `${path}[${i}]`, `${label} 不得含重复项`);
    seen.add(item);
  }
  return true;
}

function validParamScalar(value) {
  if (value === undefined) return false;
  if (value === null) return true;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return true;
  return type === 'number' && Number.isFinite(value);
}

// params 值：原始类型、原始类型数组或单层普通对象（其值只允许原始类型或原始类型数组），不得含 undefined。
function isValidParams(params, errors, path) {
  if (!isPlainObject(params)) return false;
  const isScalarArray = (value) => Array.isArray(value) && value.every(validParamScalar);
  for (const [key, value] of Object.entries(params)) {
    if (validParamScalar(value) || isScalarArray(value)) continue;
    if (isPlainObject(value) && Object.values(value).every((inner) => validParamScalar(inner) || isScalarArray(inner))) continue;
    fail(errors, CODES.STATEMENT_SHAPE, `${path}.${key}`, 'params 的值只允许原始类型、原始类型数组或单层普通对象，且不得含 undefined');
  }
  return true;
}

function validateProvenanceTiers(tiers, errors) {
  if (!checkKeys(errors, tiers, TIER_NAMES, CODES.TIERS_SHAPE, 'provenanceTiers')) return;
  for (const name of TIER_NAMES) {
    const tierPath = `provenanceTiers.${name}`;
    const tier = tiers[name];
    if (!isPlainObject(tier)) {
      fail(errors, CODES.TIERS_SHAPE, tierPath, '档位必须是普通对象');
      continue;
    }
    if (!checkKeys(errors, tier, TIER_FIELDS, CODES.TIERS_SHAPE, tierPath)) continue;
    if (!isNonEmptyString(tier.label)) fail(errors, CODES.TIERS_SHAPE, `${tierPath}.label`, 'label 必须是非空字符串');
    if (!isNonEmptyString(tier.description)) fail(errors, CODES.TIERS_SHAPE, `${tierPath}.description`, 'description 必须是非空字符串');
    checkEnumArray(errors, tier.cellGrades, CODES.TIERS_SHAPE, `${tierPath}.cellGrades`, CELL_GRADES, { allowEmpty: false, label: 'cellGrades' });
    checkStringArray(errors, tier.requiredFields, CODES.TIERS_SHAPE, `${tierPath}.requiredFields`, { allowEmpty: false, label: 'requiredFields' });
    checkStringArray(errors, tier.optionalFields, CODES.TIERS_SHAPE, `${tierPath}.optionalFields`, { allowEmpty: true, label: 'optionalFields' });
    checkStringArray(errors, tier.anchorRules, CODES.TIERS_SHAPE, `${tierPath}.anchorRules`, { allowEmpty: false, label: 'anchorRules', dedupe: false });
    checkStringArray(errors, tier.defaultDomains, CODES.TIERS_SHAPE, `${tierPath}.defaultDomains`, { allowEmpty: false, label: 'defaultDomains' });
    if (!PLACEHOLDER_POLICIES.includes(tier.placeholderPolicy)) {
      fail(errors, CODES.TIERS_SHAPE, `${tierPath}.placeholderPolicy`, `placeholderPolicy 取值必须是 ${PLACEHOLDER_POLICIES.join(' / ')} 之一`);
    }
  }
  // V4：两档 cellGrades 两两不相交，并集恰好覆盖全部三项（只在两档都给出数组时判断，缺形状已由 V3 报）。
  const arrays = TIER_NAMES.map((name) => tiers[name]?.cellGrades).filter(Array.isArray);
  if (arrays.length === TIER_NAMES.length) {
    const sets = arrays.map((grades) => new Set(grades.filter((grade) => CELL_GRADES.includes(grade))));
    const overlap = [...sets[0]].filter((grade) => sets[1].has(grade));
    if (overlap.length > 0) fail(errors, CODES.TIERS_COVERAGE, 'provenanceTiers.cellGrades', `两档 cellGrades 不得相交（重叠：${overlap.join(', ')}）`);
    const union = new Set([...sets[0], ...sets[1]]);
    for (const grade of CELL_GRADES) {
      if (!union.has(grade)) fail(errors, CODES.TIERS_COVERAGE, 'provenanceTiers.cellGrades', `两档 cellGrades 并集未覆盖 "${grade}"`);
    }
  }
}

function validateStatement(statement, contractPath, errors) {
  if (!checkKeys(errors, statement, STATEMENT_KEYS, CODES.STATEMENT_SHAPE, `${contractPath}.statement`)) return;
  if (!STATEMENT_KINDS.includes(statement.kind)) {
    fail(errors, CODES.STATEMENT_SHAPE, `${contractPath}.statement.kind`, `kind 取值必须是 ${STATEMENT_KINDS.join(' / ')} 之一`);
  }
  if (!isNonEmptyString(statement.summary) || statement.summary.trim().length < 10 || statement.summary.trim().length > 300) {
    fail(errors, CODES.STATEMENT_SHAPE, `${contractPath}.statement.summary`, 'summary 去首尾空白后长度必须在 10..300');
  }

  const invariants = statement.invariants;
  if (!Array.isArray(invariants) || invariants.length === 0) {
    fail(errors, CODES.STATEMENT_SHAPE, `${contractPath}.statement.invariants`, 'invariants 必须是非空数组');
  } else {
    const ids = new Set();
    for (let i = 0; i < invariants.length; i += 1) {
      const invPath = `${contractPath}.statement.invariants[${i}]`;
      const inv = invariants[i];
      if (!checkKeys(errors, inv, INVARIANT_KEYS, CODES.STATEMENT_SHAPE, invPath)) continue;
      if (typeof inv.id !== 'string' || !INVARIANT_ID_RE.test(inv.id)) {
        fail(errors, CODES.STATEMENT_SHAPE, `${invPath}.id`, 'id 必须匹配 ^[a-z][a-z0-9_]{1,47}$');
      } else {
        if (ids.has(inv.id)) fail(errors, CODES.STATEMENT_SHAPE, `${invPath}.id`, 'id 在同一契约内必须唯一');
        ids.add(inv.id);
      }
      if (!isNonEmptyString(inv.target)) fail(errors, CODES.STATEMENT_SHAPE, `${invPath}.target`, 'target 必须是非空字符串');
      if (!isNonEmptyString(inv.assertion)) fail(errors, CODES.STATEMENT_SHAPE, `${invPath}.assertion`, 'assertion 必须是非空字符串');
      isValidParams(inv.params, errors, `${invPath}.params`);
    }
  }

  const problemRefs = statement.problemRefs;
  if (!Array.isArray(problemRefs)) {
    fail(errors, CODES.STATEMENT_SHAPE, `${contractPath}.statement.problemRefs`, 'problemRefs 必须是数组');
  } else {
    const seen = new Set();
    for (let i = 0; i < problemRefs.length; i += 1) {
      const refPath = `${contractPath}.statement.problemRefs[${i}]`;
      const ref = problemRefs[i];
      if (typeof ref !== 'string' || !PROBLEM_REF_RE.test(ref)) {
        fail(errors, CODES.STATEMENT_SHAPE, refPath, 'problemRefs 每项必须匹配 ^docs/问题\\.md:(\\d+)(?:-(\\d+))?$');
        continue;
      }
      if (seen.has(ref)) fail(errors, CODES.STATEMENT_SHAPE, refPath, 'problemRefs 不得含重复项');
      seen.add(ref);
      const [, startText, endText = startText] = PROBLEM_REF_RE.exec(ref);
      const start = Number(startText);
      const end = Number(endText);
      if (!(start >= 1) || !(start <= end)) {
        fail(errors, CODES.STATEMENT_SHAPE, refPath, `problemRefs 行号须满足 1 <= start <= end（${ref}）`);
      }
    }
  }
}

function validateSources(sources, contractPath, errors) {
  if (!Array.isArray(sources) || sources.length === 0) {
    fail(errors, CODES.SOURCE_SHAPE, `${contractPath}.sources`, 'sources 必须是非空数组');
    return;
  }
  const seen = new Set();
  for (let i = 0; i < sources.length; i += 1) {
    const srcPath = `${contractPath}.sources[${i}]`;
    const src = sources[i];
    if (!checkKeys(errors, src, SOURCE_KEYS, CODES.SOURCE_SHAPE, srcPath)) continue;
    if (typeof src.file !== 'string' || !VOLUME_PATH_RE.test(src.file)) {
      fail(errors, CODES.SOURCE_SHAPE, `${srcPath}.file`, 'file 必须匹配 ^docs/统一底层设计/[^/\\\\]+\\.md$');
    }
    if (!isFiniteInteger(src.line) || src.line < 1) {
      fail(errors, CODES.SOURCE_SHAPE, `${srcPath}.line`, 'line 必须是 1 起的正整数');
    }
    if (typeof src.excerpt !== 'string' || src.excerpt.trim().length < 4 || src.excerpt.trim().length > 80) {
      fail(errors, CODES.SOURCE_SHAPE, `${srcPath}.excerpt`, 'excerpt 必须是非空字符串，长度 4..80');
    }
    if (!SOURCE_ROLES.includes(src.role)) {
      fail(errors, CODES.SOURCE_SHAPE, `${srcPath}.role`, `role 取值必须是 ${SOURCE_ROLES.join(' / ')} 之一`);
    }
    if (typeof src.file === 'string' && isFiniteInteger(src.line)) {
      const key = `${src.file}\u0000${src.line}`;
      if (seen.has(key)) fail(errors, CODES.SOURCE_SHAPE, srcPath, '同一契约内 sources 的 (file, line) 不得重复');
      seen.add(key);
    }
  }
}

function validateContract(contract, index, errors) {
  const contractPath = `contracts[${index}]`;
  if (!isPlainObject(contract)) {
    fail(errors, CODES.ITEM_SHAPE, contractPath, '契约必须是普通对象');
    return null;
  }
  if (!checkKeys(errors, contract, CONTRACT_KEYS, CODES.ITEM_SHAPE, contractPath)) return null;

  if (typeof contract.id !== 'string' || !CONTRACT_ID_RE.test(contract.id)) {
    fail(errors, CODES.ID_INVALID, `${contractPath}.id`, 'id 必须匹配 ^ctr_[a-z][a-z0-9_]{1,43}$');
  }
  if (typeof contract.title !== 'string' || contract.title.trim().length < 4 || contract.title.trim().length > 80) {
    fail(errors, CODES.ITEM_SHAPE, `${contractPath}.title`, 'title 去首尾空白后长度必须在 4..80');
  }
  if (typeof contract.owner !== 'string' || !VOLUME_PATH_RE.test(contract.owner)) {
    fail(errors, CODES.VOL_PATH, `${contractPath}.owner`, 'owner 必须匹配 ^docs/统一底层设计/[^/\\\\]+\\.md$');
  }
  if (!Array.isArray(contract.consumers) || contract.consumers.length === 0) {
    fail(errors, CODES.VOL_PATH, `${contractPath}.consumers`, 'consumers 必须是非空数组');
  } else {
    const seen = new Set();
    for (let i = 0; i < contract.consumers.length; i += 1) {
      const item = contract.consumers[i];
      const itemPath = `${contractPath}.consumers[${i}]`;
      if (typeof item !== 'string' || !VOLUME_PATH_RE.test(item)) {
        fail(errors, CODES.VOL_PATH, itemPath, 'consumers 每项必须匹配 ^docs/统一底层设计/[^/\\\\]+\\.md$');
        continue;
      }
      if (seen.has(item)) fail(errors, CODES.VOL_PATH, itemPath, 'consumers 不得含重复项');
      seen.add(item);
      if (item === contract.owner) fail(errors, CODES.OWNER_IN_CONSUMERS, itemPath, 'consumers 不得包含 owner 自身');
    }
  }
  if (!CONTRACT_STATUSES.includes(contract.status)) {
    fail(errors, CODES.STATUS_INVALID, `${contractPath}.status`, `status 取值必须是 ${CONTRACT_STATUSES.join(' / ')} 之一`);
  } else if (contract.status === 'active') {
    if (contract.supersededBy !== null) fail(errors, CODES.STATUS_INVALID, `${contractPath}.supersededBy`, 'status 为 active 时 supersededBy 必须为 null');
  } else {
    if (typeof contract.supersededBy !== 'string' || !isNonEmptyString(contract.supersededBy)) {
      fail(errors, CODES.STATUS_INVALID, `${contractPath}.supersededBy`, 'status 为 superseded 时 supersededBy 必须是非空字符串');
    } else if (contract.supersededBy === contract.id) {
      fail(errors, CODES.STATUS_INVALID, `${contractPath}.supersededBy`, 'supersededBy 不得指向自身');
    }
  }
  checkStringArray(errors, contract.rulingIds, CODES.VOL_PATH, `${contractPath}.rulingIds`, { allowEmpty: true, label: 'rulingIds' });

  if (isPlainObject(contract.statement)) validateStatement(contract.statement, contractPath, errors);
  else fail(errors, CODES.STATEMENT_SHAPE, `${contractPath}.statement`, 'statement 必须是普通对象（键集 {kind, summary, invariants, problemRefs}）');

  validateSources(contract.sources, contractPath, errors);
  return contract;
}

export function validateContractsSchema(doc) {
  const errors = [];
  if (!isPlainObject(doc)) {
    fail(errors, CODES.ROOT_SHAPE, '$', '顶层必须是普通对象');
    return { ok: false, errors };
  }
  checkKeys(errors, doc, TOP_KEYS, CODES.ROOT_SHAPE, '$');
  if (doc.version !== 1) fail(errors, CODES.ROOT_SHAPE, '$.version', 'version 必须等于 1');
  if (!isNonEmptyString(doc.source)) fail(errors, CODES.ROOT_SHAPE, '$.source', 'source 必须是非空去首尾空白字符串');

  if (isPlainObject(doc.provenanceTiers)) validateProvenanceTiers(doc.provenanceTiers, errors);
  else fail(errors, CODES.TIERS_SHAPE, 'provenanceTiers', 'provenanceTiers 必须是普通对象');

  if (!Array.isArray(doc.contracts) || doc.contracts.length === 0) {
    fail(errors, CODES.LIST_EMPTY, 'contracts', 'contracts 必须是非空数组');
    return { ok: errors.length === 0, errors };
  }

  const idCounts = new Map();
  const contracts = [];
  for (let i = 0; i < doc.contracts.length; i += 1) {
    const contract = validateContract(doc.contracts[i], i, errors);
    if (!contract) continue;
    contracts.push(contract);
    if (typeof contract.id === 'string') idCounts.set(contract.id, (idCounts.get(contract.id) || 0) + 1);
  }
  for (let i = 0; i < doc.contracts.length; i += 1) {
    const contract = doc.contracts[i];
    if (!isPlainObject(contract) || typeof contract.id !== 'string') continue;
    if ((idCounts.get(contract.id) || 0) > 1) fail(errors, CODES.ID_DUP, `contracts[${i}].id`, `id "${contract.id}" 在 contracts[] 中重复`);
  }
  // V8：superseded 必须指向本表另一条 status=active 的契约 id。
  const activeIds = new Set(contracts.filter((c) => c.status === 'active').map((c) => c.id));
  for (let i = 0; i < doc.contracts.length; i += 1) {
    const contract = doc.contracts[i];
    if (!isPlainObject(contract) || contract.status !== 'superseded') continue;
    if (typeof contract.supersededBy !== 'string' || contract.supersededBy === contract.id) continue;
    if (!activeIds.has(contract.supersededBy)) {
      fail(errors, CODES.STATUS_INVALID, `contracts[${i}].supersededBy`, `supersededBy "${contract.supersededBy}" 必须指向本表另一条 status=active 的契约 id`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function makeFileReader(repoRoot) {
  const cache = new Map();
  return (relativePath) => {
    if (cache.has(relativePath)) return cache.get(relativePath);
    let result = null;
    try {
      const absolute = isAbsolute(relativePath) ? relativePath : join(repoRoot, relativePath);
      result = readFileSync(absolute, 'utf8').split(LINE_SPLIT_RE);
    } catch {
      result = null;
    }
    cache.set(relativePath, result);
    return result;
  };
}

/** @param {Record<string, any>} doc @param {{repoRoot?: string}} [options] */
export function validateContractsRefs(doc, { repoRoot } = {}) {
  const errors = [];
  if (!isNonEmptyString(repoRoot)) {
    fail(errors, CODES.READ, 'repoRoot', 'repoRoot 必须是非空字符串');
    return { ok: false, errors };
  }
  const readLines = makeFileReader(repoRoot);
  const contracts = isPlainObject(doc) && Array.isArray(doc.contracts) ? doc.contracts : [];

  for (let i = 0; i < contracts.length; i += 1) {
    const contract = contracts[i];
    if (!isPlainObject(contract)) continue;
    const contractPath = `contracts[${i}]`;

    // V11：owner、consumers、sources[].file 必须在仓库里真实存在。
    const volumeRefs = [];
    if (typeof contract.owner === 'string') volumeRefs.push({ path: `${contractPath}.owner`, file: contract.owner });
    if (Array.isArray(contract.consumers)) {
      contract.consumers.forEach((file, j) => {
        if (typeof file === 'string') volumeRefs.push({ path: `${contractPath}.consumers[${j}]`, file });
      });
    }
    if (Array.isArray(contract.sources)) {
      contract.sources.forEach((src, j) => {
        if (isPlainObject(src) && typeof src.file === 'string') volumeRefs.push({ path: `${contractPath}.sources[${j}].file`, file: src.file, source: src, index: j });
      });
    }
    for (const ref of volumeRefs) {
      if (readLines(ref.file) === null) fail(errors, CODES.VOL_NOT_FOUND, ref.path, `卷文件不存在：${ref.file}`);
    }

    // V12：sources[].line 在行数范围内，且 excerpt 逐字出现在该行。
    if (Array.isArray(contract.sources)) {
      contract.sources.forEach((src, j) => {
        if (!isPlainObject(src) || typeof src.file !== 'string') return;
        const lines = readLines(src.file);
        if (lines === null) return;
        const srcPath = `${contractPath}.sources[${j}]`;
        if (!isFiniteInteger(src.line)) return;
        if (src.line < 1 || src.line > lines.length) {
          fail(errors, CODES.SOURCE_LINE_RANGE, `${srcPath}.line`, `行号 ${src.line} 越界（${src.file} 共 ${lines.length} 行）`);
          return;
        }
        if (typeof src.excerpt === 'string' && !lines[src.line - 1].includes(src.excerpt)) {
          fail(errors, CODES.SOURCE_EXCERPT_MISMATCH, `${srcPath}.excerpt`, `摘录未逐字出现在 ${src.file}:${src.line}`);
        }
      });
    }
  }

  // V13：rulingIds 必须在 docs/审查/现行有效裁定.json#rulings 中且 status === "active"。
  const rulingLines = readLines(RULINGS_PATH);
  let rulings = null;
  if (rulingLines === null) {
    fail(errors, CODES.RULING_INVALID, RULINGS_PATH, '裁定文件缺失或不可读');
  } else {
    try {
      const parsed = JSON.parse(rulingLines.join('\n'));
      rulings = isPlainObject(parsed) && Array.isArray(parsed.rulings) ? parsed.rulings : null;
    } catch {
      rulings = null;
    }
    if (rulings === null) fail(errors, CODES.RULING_INVALID, RULINGS_PATH, '裁定文件不是含 rulings 数组的合法 JSON');
  }
  if (rulings !== null) {
    const statusById = new Map();
    for (const ruling of rulings) {
      if (isPlainObject(ruling) && typeof ruling.id === 'string') statusById.set(ruling.id, ruling.status);
    }
    for (let i = 0; i < contracts.length; i += 1) {
      const contract = contracts[i];
      if (!isPlainObject(contract) || !Array.isArray(contract.rulingIds)) continue;
      contract.rulingIds.forEach((id, j) => {
        if (typeof id !== 'string') return;
        if (statusById.get(id) !== 'active') {
          fail(errors, CODES.RULING_INVALID, `contracts[${i}].rulingIds[${j}]`, `裁定 "${id}" 不存在或不是 active`);
        }
      });
    }
  }

  // V14：problemRefs 的 end 不得越过 docs/问题.md 总行数。
  const problemRefs = [];
  for (let i = 0; i < contracts.length; i += 1) {
    const statement = isPlainObject(contracts[i]) ? contracts[i].statement : undefined;
    if (!isPlainObject(statement) || !Array.isArray(statement.problemRefs)) continue;
    statement.problemRefs.forEach((ref, j) => {
      if (typeof ref === 'string' && PROBLEM_REF_RE.test(ref)) problemRefs.push({ path: `contracts[${i}].statement.problemRefs[${j}]`, ref });
    });
  }
  if (problemRefs.length > 0) {
    const problemLines = readLines(PROBLEM_PATH);
    if (problemLines === null) {
      fail(errors, CODES.PROBLEM_LINE_RANGE, PROBLEM_PATH, 'docs/问题.md 缺失或不可读');
    } else {
      for (const { path, ref } of problemRefs) {
        const [, startText, endText = startText] = PROBLEM_REF_RE.exec(ref);
        const end = Number(endText);
        if (end > problemLines.length) fail(errors, CODES.PROBLEM_LINE_RANGE, path, `行号 ${end} 越界（docs/问题.md 共 ${problemLines.length} 行）`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** @param {{repoRoot?: string, contractsPath?: string}} [options] */
export function loadAndValidateContracts({ repoRoot, contractsPath = DEFAULT_CONTRACTS_PATH } = {}) {
  if (!isNonEmptyString(repoRoot)) {
    return { ok: false, doc: null, errors: [{ code: CODES.READ, path: 'repoRoot', message: 'repoRoot 必须是非空字符串' }] };
  }
  if (typeof contractsPath !== 'string' || !contractsPath.trim()) {
    return { ok: false, doc: null, errors: [{ code: CODES.READ, path: 'contractsPath', message: 'contractsPath 必须是非空字符串' }] };
  }
  const absolutePath = isAbsolute(contractsPath) ? contractsPath : join(repoRoot, contractsPath);
  let text;
  try {
    text = readFileSync(absolutePath, 'utf8');
  } catch {
    return { ok: false, doc: null, errors: [{ code: CODES.READ, path: contractsPath, message: `契约文件不可读：${contractsPath}` }] };
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, doc: null, errors: [{ code: CODES.JSON_PARSE, path: contractsPath, message: `契约文件不是合法 JSON：${contractsPath}` }] };
  }
  const schema = validateContractsSchema(doc);
  if (!schema.ok) return { ok: false, doc: null, errors: schema.errors };
  const refs = validateContractsRefs(doc, { repoRoot });
  if (!refs.ok) return { ok: false, doc: null, errors: refs.errors };
  return { ok: true, doc, errors: [] };
}
