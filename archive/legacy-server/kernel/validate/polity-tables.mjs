// 卷八《政治与人口》§2.8 加载期校验（组织、职位、政体三张表的跨行、跨表条件）与卷十八 E-KIN-ORG-TRAITS（rules.social.orgTraits 与 orgkind 族同键）。
// 统一加载器在维度校验通过后调一次（kernel/load/world.mjs，与 checkSenseTables 同一处），违者加载失败。
// 只读表行、词表族条目字段与规则表，不认任何组织、职位、政体或地点的具体 id，也不按种类代号分支：种类的差别只读条目字段（sovereign、hasTreasury、internal）。
// 码与条件逐条照卷八 §2.8 :430–:446：E-ORG-POLITY、E-ORG-PARENT-CYCLE（加载期部分）、E-ORG-TREASURY、E-ORG-CHARTER、E-OFFICE-DOMAIN-LEVEL、E-OFFICE-ORG、E-OFFICE-BENCH、E-OFFICE-KIND、E-TAX-ROW、E-TITLE-DUP（加载期部分）。
// 未落：运行期的 E-ORG-PARENT-CYCLE、E-OFFICE-ORG、E-OFFICE-KIND（建边写入口拒写）、E-TITLE-DUP 随各自写者（office.mjs、org.mjs、title.mjs 创设）；E-DOMAIN-RANKS、E-INF-ROW 等属别的子系统。
// E-OFFICE-DOMAIN-LEVEL 只在辖区地点行写了 regionLevel（政区）时核；站点没有层级（卷五 §4.14 层级条目只给政区），不核。

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const asList = (v) => (Array.isArray(v) ? v : []);

const inDomain = (v, domain) => isInt(v) && Array.isArray(domain) && (domain[0] === null || v >= domain[0]) && (domain[1] === null || v <= domain[1]);

/**
 * 职位行种类的两个代号（实任行、种类行），从表头取，不写字面量：`jurisdictionLevel` 的必填条件写着 `byEnum:<枚举维>=<实任行代号>`（卷八 §2.2 :160），
 * 枚举维所指族（封闭两项）里的另一项就是种类行。取不到返回 null。
 * @param {Record<string, any> | undefined} officeDims office 表头的 dimensions @param {Map<string, {entries: Record<string, any>}>} families
 * @returns {{actual: string, kind: string} | null}
 */
export function officeRowKinds(officeDims, families) {
  const req = isObj(officeDims) && isObj(officeDims.jurisdictionLevel) ? officeDims.jurisdictionLevel.required : undefined;
  const m = typeof req === 'string' ? /^byEnum:([^=]+)=(.+)$/.exec(req) : null;
  if (m === null) return null;
  const [, enumDim, actual] = m;
  if (!isObj(officeDims[enumDim]) || !families.has(officeDims[enumDim].vocab)) return null;
  const others = Object.keys(families.get(officeDims[enumDim].vocab).entries).filter((c) => c !== actual);
  return others.length === 1 ? { actual, kind: others.join('') } : null;
}

/**
 * @param {{vocab: {families: Map<string, {entries: Record<string, any>}>}, rules: Record<string, any>, tables: Map<string, {flat: {rows: Map<string, Record<string, any>>}}>}} view
 * @returns {{code: string, level: string, table: string, row: string, dim: string, path: string, got: unknown, want: string}[]}
 */
export function checkPolityTables(view) {
  const errors = [];
  const push = (code, table, row, dim, got, want) => errors.push({ code, level: 'L2', table, row, dim, path: `${table}${row ? '/' + row : ''}${dim ? '#' + dim : ''}`, got, want });
  const families = view.vocab && view.vocab.families instanceof Map ? view.vocab.families : new Map();
  const entriesOf = (name) => (families.has(name) && isObj(families.get(name).entries) ? families.get(name).entries : {});
  const rowsOf = (kind) => (view.tables instanceof Map && view.tables.has(kind) && view.tables.get(kind).flat ? view.tables.get(kind).flat.rows : new Map());
  const orgs = rowsOf('org');
  const offices = rowsOf('office');
  const polities = rowsOf('polity');
  const places = rowsOf('place');
  const orgkinds = entriesOf('orgkind');
  const motions = entriesOf('motion');
  const rules = isObj(view.rules) ? view.rules : {};
  const docDims = (kind) => (view.tables instanceof Map && view.tables.has(kind) && isObj(view.tables.get(kind).doc) ? view.tables.get(kind).doc.dimensions : undefined);
  const rk = officeRowKinds(docDims('office'), families);
  if (rk === null && docDims('office') !== undefined) push('E-DIM-STRUCT-FIELD', 'office', '', 'jurisdictionLevel', 'unparsed', 'required is byEnum:<enum dim>=<actual row kind> and the enum family has exactly two entries');
  const KIND_ROW = rk === null ? undefined : rk.kind;
  const ACTUAL_ROW = rk === null ? undefined : rk.actual;
  const charterDims = (() => { const c = docDims('org'); return isObj(c) && isObj(c.charterRules) && isObj(c.charterRules.fields) && isObj(c.charterRules.fields.motionRules) && isObj(c.charterRules.fields.motionRules.value) ? c.charterRules.fields.motionRules.value.fields : undefined; })();

  // 卷八 :378 `polity.gen.holdCause` 不得在 `polity.hold.forcibleCauses` 里（开局统治边按 R8-5.3 核持有资格，原因不能是强取原因）。
  if (isObj(rules.polity) && rules.polity.genHoldCause !== undefined && asList(rules.polity.holdForcibleCauses).includes(rules.polity.genHoldCause)) {
    push('E-DIM-DOMAIN-RANGE', 'polity', '', 'genHoldCause', rules.polity.genHoldCause, 'not a member of holdForcibleCauses');
  }

  // 卷十八 E-KIN-ORG-TRAITS（:239、:300）：orgkind 族每条条目在 rules.social.orgTraits 有同键的一行，domestic、descentGroup 两项行上必写且为布尔；social 表没登记时每条 orgkind 条目各报一次，不因表不在而放过。
  {
    const traits = isObj(rules.social) && isObj(rules.social.orgTraits) ? rules.social.orgTraits : {};
    for (const id of Object.keys(orgkinds).sort(cmp)) {
      const t = traits[id];
      if (!isObj(t)) { push('E-KIN-ORG-TRAITS', 'social', '', 'orgTraits', id, 'orgTraits has a row for every orgkind entry'); continue; }
      for (const f of ['domestic', 'descentGroup']) if (typeof t[f] !== 'boolean') push('E-KIN-ORG-TRAITS', 'social', id, f, t[f], 'boolean, written on the row (no default)');
    }
    for (const id of Object.keys(traits).sort(cmp)) if (!Object.hasOwn(orgkinds, id)) push('E-KIN-ORG-TRAITS', 'social', id, 'orgTraits', id, 'key of the orgkind family');
  }

  // 职位行被哪些组织列入。
  const listedBy = new Map();
  for (const [oid, o] of orgs) for (const x of asList(o.offices)) { if (!listedBy.has(x)) listedBy.set(x, []); listedBy.get(x).push(oid); }
  const rowKind = (id) => (offices.has(id) ? offices.get(id).officeRowKind : undefined);
  const isKindRow = (id) => rowKind(id) === KIND_ROW;

  // 组织行。
  for (const [id, o] of [...orgs].sort((a, b) => cmp(a[0], b[0]))) {
    const entry = isObj(orgkinds[o.orgKind]) ? orgkinds[o.orgKind] : {};
    if (entry.sovereign === true && (o.polity === null || o.polity === undefined)) push('E-ORG-POLITY', 'org', id, 'polity', o.polity, 'sovereign orgkind has a polity row');
    if (entry.hasTreasury === true && asList(o.treasury).length === 0) push('E-ORG-TREASURY', 'org', id, 'treasury', o.treasury, 'orgkind hasTreasury needs a non-empty treasury');
    if (entry.internal === true && (o.parent === null || o.parent === undefined)) push('E-DIM-REQUIRED-MISSING', 'org', id, 'parent', o.parent, 'internal orgkind has a parent');
    // parent 成环：沿 parent 走，回到已走过的行即环。
    const seen = new Set([id]);
    for (let cur = o.parent; typeof cur === 'string'; cur = orgs.has(cur) ? orgs.get(cur).parent : null) {
      if (seen.has(cur)) { push('E-ORG-PARENT-CYCLE', 'org', id, 'parent', cur, 'parent chain has no cycle'); break; }
      seen.add(cur);
    }
    if (typeof o.headOffice === 'string' && !asList(o.offices).includes(o.headOffice)) push('E-OFFICE-ORG', 'org', id, 'headOffice', o.headOffice, 'headOffice is listed in the same org offices');
    // 章程：议案种类已登记；通过条件、法定人数、开放日数在取值域内。
    const rulesOf = isObj(o.charterRules) && isObj(o.charterRules.motionRules) ? o.charterRules.motionRules : {};
    for (const m of Object.keys(rulesOf).sort(cmp)) {
      const r = rulesOf[m];
      if (!Object.hasOwn(motions, m)) push('E-ORG-CHARTER', 'org', id, 'charterRules', m, 'motion kind registered in the motion family');
      if (!isObj(r)) continue;
      // 取值域读表头 charterRules.motionRules 各字段的 domain（卷八 §2.1 :132：passDen ≥ 1、quorumBps 在 [0, 10000]、openDays ≥ 1），再加 passNum 不超过 passDen。
      const fieldsOk = Object.entries(isObj(charterDims) ? charterDims : {}).every(([f, d]) => inDomain(r[f], isObj(d) ? d.domain : undefined));
      if (!(fieldsOk && isInt(r.passNum) && isInt(r.passDen) && r.passNum <= r.passDen)) push('E-ORG-CHARTER', 'org', id, 'charterRules', m, 'every motion rule field inside its header domain and passNum <= passDen');
    }
    for (const x of asList(o.offices)) {
      if (isKindRow(x)) push('E-OFFICE-KIND', 'org', id, 'offices', x, 'offices never lists an office kind row');
    }
  }

  // 职位行。
  const titleHeld = new Map();
  for (const [id, f] of [...offices].sort((a, b) => cmp(a[0], b[0]))) {
    if (f.officeRowKind === KIND_ROW) {
      if (f.officeKind !== null && f.officeKind !== undefined) push('E-OFFICE-KIND', 'office', id, 'officeKind', f.officeKind, 'kind row has officeKind null');
      if (f.domain !== null && f.domain !== undefined) push('E-OFFICE-KIND', 'office', id, 'domain', f.domain, 'kind row has domain null');
      if (f.titular === true) push('E-OFFICE-KIND', 'office', id, 'titular', f.titular, 'kind row is not titular');
    } else if (f.officeRowKind === ACTUAL_ROW) {
      const hosts = listedBy.get(id) || [];
      if (hosts.length !== 1) push('E-OFFICE-ORG', 'office', id, 'officeRowKind', hosts.length, 'an actual office row is listed by exactly one org');
      if (typeof f.officeKind === 'string' && offices.has(f.officeKind) && !isKindRow(f.officeKind)) push('E-OFFICE-KIND', 'office', id, 'officeKind', f.officeKind, 'officeKind points to an office kind row');
      if (typeof f.domain === 'string' && places.has(f.domain)) {
        const lvl = places.get(f.domain).regionLevel;
        if (typeof lvl === 'string' && lvl !== f.jurisdictionLevel) push('E-OFFICE-DOMAIN-LEVEL', 'office', id, 'jurisdictionLevel', f.jurisdictionLevel, `equals the level of domain ${f.domain} (${lvl})`);
      }
      if (f.titular === true && f.revoked !== true && typeof f.domain === 'string') {
        if (!titleHeld.has(f.domain)) titleHeld.set(f.domain, []);
        titleHeld.get(f.domain).push(id);
      }
    }
    if (typeof f.appointedBy === 'string' && isKindRow(f.appointedBy)) push('E-OFFICE-KIND', 'office', id, 'appointedBy', f.appointedBy, 'appointedBy is not an office kind row');
    // 共治席位：bench 所指行自身的 bench 为 null（不成链）；同席各行的权能、位阶相同。
    if (typeof f.bench === 'string' && offices.has(f.bench)) {
      const head = offices.get(f.bench);
      if (head.bench !== null && head.bench !== undefined) push('E-OFFICE-BENCH', 'office', id, 'bench', f.bench, 'bench target has bench null (no chain)');
      const same = JSON.stringify([...asList(f.powers)].sort(cmp)) === JSON.stringify([...asList(head.powers)].sort(cmp)) && f.rank === head.rank;
      if (!same) push('E-OFFICE-BENCH', 'office', id, 'bench', f.bench, 'rows on one bench have the same powers and rank');
    }
  }
  for (const [place, ids] of [...titleHeld].sort((a, b) => cmp(a[0], b[0]))) if (ids.length > 1) push('E-TITLE-DUP', 'office', ids.sort(cmp)[0], 'domain', place, 'at most one unrevoked titular office per place');

  // 政体行：councilOffices 只指种类行（E-OFFICE-KIND）；taxRules.to 只指种类行（E-TAX-ROW）；同一 base 至多一项（E-TAX-DUP）。
  for (const [id, p] of [...polities].sort((a, b) => cmp(a[0], b[0]))) {
    for (const x of asList(p.councilOffices)) if (!isKindRow(x)) push('E-OFFICE-KIND', 'polity', id, 'councilOffices', x, 'councilOffices lists office kind rows');
    const bases = new Set();
    for (const t of asList(p.taxRules)) {
      if (!isObj(t)) continue;
      if (!isKindRow(t.to)) push('E-TAX-ROW', 'polity', id, 'taxRules', t.to, 'taxRules.to is an office kind row');
      if (bases.has(t.base)) push('E-TAX-DUP', 'polity', id, 'taxRules', t.base, 'one taxRules item per base');
      bases.add(t.base);
    }
  }
  // 层级条目 grantsOffices：只指种类行（E-OFFICE-KIND）。
  const tiers = entriesOf('settletier');
  for (const id of Object.keys(tiers).sort(cmp)) {
    for (const x of asList(isObj(tiers[id]) ? tiers[id].grantsOffices : [])) if (!isKindRow(x)) push('E-OFFICE-KIND', 'settletier', id, 'grantsOffices', x, 'grantsOffices lists office kind rows');
  }
  return errors;
}
