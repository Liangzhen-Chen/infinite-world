// 卷五《地点地形与资源场》§4.2 感知通道的加载期跨字段校验（卷五 §4.2.1 sense 族三项、§4.2.3 规则 3、8、9、10；对照表 G12–G16 #27、#28、#36）。
// 统一加载器在维度校验通过后调一次（kernel/load/world.mjs，与 checkBodyTables 同一处），违者加载失败。
// 只读词表族条目与规则表，不认任何感官代号、通道名或环境维度名：sense 族的每个条目必须写明三项（perceivedAsleep、capability、rangeDim，rangeDim 无限制时显式写 null，字段不设缺省），
// perception.json 的 marginBase 键集须覆盖 sense 全族、candidateRadiusM 键集恰为 rangeDim 为空的通道（没有可及距离的通道才要候选半径）。
// 卷十三 rules.combat.deterrence.groupRadius（卷五 :599、卷十三 C13-10）的取值须是 rangeDim 非空的 sense 代号：该规则表登记了才核（卷十三未前移时没有该键）。
// 未落：rangeDim 所指环境维度（卷二十 env.*，如 env.sightM）是否存在——env 维度表卷二十未前移（归 G14／G16），本文件只核它是非空字串或 null。

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// 卷文定名：族名、条目字段、规则表与键。
const S = Object.freeze({
  family: 'sense',
  capFamily: 'capability',
  field: Object.freeze({ perceivedAsleep: 'perceivedAsleep', capability: 'capability', rangeDim: 'rangeDim' }),
  rules: Object.freeze({ perception: 'perception', marginBase: 'marginBase', candidateRadiusM: 'candidateRadiusM', combat: 'combat', deterrence: 'deterrence', groupRadius: 'groupRadius' }),
});

/**
 * @param {{vocab: {families: Map<string, {entries: Record<string, object>}>}, rules: Record<string, any>}} view
 * @returns {{code: string, level: string, table: string, row: string, dim: string, path: string, got: unknown, want: string}[]}
 */
export function checkSenseTables(view) {
  const errors = [];
  const push = (code, table, row, dim, got, want) => errors.push({ code, level: 'L2', table, row, dim, path: `${table}${row ? '/' + row : ''}${dim ? '#' + dim : ''}`, got, want });
  const families = view.vocab && view.vocab.families instanceof Map ? view.vocab.families : new Map();
  const entriesOf = (name) => (families.has(name) && isObj(families.get(name).entries) ? families.get(name).entries : {});
  const senses = entriesOf(S.family);
  const caps = entriesOf(S.capFamily);
  const ids = Object.keys(senses).sort(cmp);

  // sense 族条目：三项每条必写（rangeDim 空写 null），不设缺省。
  for (const id of ids) {
    const e = isObj(senses[id]) ? senses[id] : {};
    for (const f of Object.values(S.field)) if (!Object.hasOwn(e, f)) push('E-DIM-REQUIRED-MISSING', '_vocab', id, f, 'missing', `${S.family} entry field ${f} is required (rangeDim is null when unlimited)`);
    if (Object.hasOwn(e, S.field.perceivedAsleep) && typeof e[S.field.perceivedAsleep] !== 'boolean') push('E-DIM-STRUCT-FIELD', '_vocab', id, S.field.perceivedAsleep, e[S.field.perceivedAsleep], 'boolean');
    if (Object.hasOwn(e, S.field.capability)) {
      const c = e[S.field.capability];
      if (typeof c !== 'string' || !Object.hasOwn(caps, c)) push('E-DIM-REF-MISSING', '_vocab', id, S.field.capability, c, `entry of the ${S.capFamily} family`);
    }
    if (Object.hasOwn(e, S.field.rangeDim)) {
      const r = e[S.field.rangeDim];
      if (!(r === null || (typeof r === 'string' && r.length > 0))) push('E-DIM-STRUCT-FIELD', '_vocab', id, S.field.rangeDim, r, 'environment dimension key (non-empty string) or null');
    }
  }
  if (ids.length === 0) return errors;

  // perception 规则表（卷五 :583、:596）：登记了才核（只放内核常数表的校验器夹具目录不登记）；运行期读到缺表由 perceive 按未知处理，不静默给值。
  const rules = isObj(view.rules) ? view.rules : {};
  const table = isObj(rules[S.rules.perception]) ? rules[S.rules.perception] : null;
  const limited = ids.filter((id) => isObj(senses[id]) && senses[id][S.field.rangeDim] === null);
  if (table !== null) {
    const base = isObj(table[S.rules.marginBase]) ? table[S.rules.marginBase] : null;
    if (base === null) push('E-DIM-REQUIRED-MISSING', S.rules.perception, '', S.rules.marginBase, 'missing', 'marginBase map keyed by every sense code');
    else {
      for (const id of ids) {
        if (!Object.hasOwn(base, id)) push('E-DIM-REQUIRED-MISSING', S.rules.perception, '', S.rules.marginBase, id, 'marginBase covers every sense code');
        else if (!finite(base[id])) push('E-DIM-DOMAIN-RANGE', S.rules.perception, '', S.rules.marginBase, base[id], 'finite number');
      }
      for (const k of Object.keys(base).sort(cmp)) if (!Object.hasOwn(senses, k)) push('E-DIM-REF-MISSING', S.rules.perception, '', S.rules.marginBase, k, `key of the ${S.family} family`);
    }
    const radius = isObj(table[S.rules.candidateRadiusM]) ? table[S.rules.candidateRadiusM] : null;
    if (radius === null) push('E-DIM-REQUIRED-MISSING', S.rules.perception, '', S.rules.candidateRadiusM, 'missing', 'candidateRadiusM map keyed by every sense whose rangeDim is null');
    else {
      for (const id of limited) {
        if (!Object.hasOwn(radius, id)) push('E-DIM-REQUIRED-MISSING', S.rules.perception, '', S.rules.candidateRadiusM, id, 'candidateRadiusM covers every sense whose rangeDim is null');
        else if (!(finite(radius[id]) && radius[id] >= 0)) push('E-DIM-DOMAIN-RANGE', S.rules.perception, '', S.rules.candidateRadiusM, radius[id], 'non-negative number (metres)');
      }
      // rangeDim 没写的条目已按"必写"报过，不再连带报它的候选半径多余。
      const unsettled = (k) => isObj(senses[k]) && !Object.hasOwn(senses[k], S.field.rangeDim);
      for (const k of Object.keys(radius).sort(cmp)) if (!limited.includes(k) && !unsettled(k)) push('E-DIM-DOMAIN-RANGE', S.rules.perception, '', S.rules.candidateRadiusM, k, 'only senses whose rangeDim is null have a candidate radius');
    }
  }

  // 卷十三 groupRadius（卷五 :599）：取值是 rangeDim 非空的 sense 代号。
  const combat = isObj(rules[S.rules.combat]) ? rules[S.rules.combat] : null;
  const det = combat !== null && isObj(combat[S.rules.deterrence]) ? combat[S.rules.deterrence] : null;
  if (det !== null && Object.hasOwn(det, S.rules.groupRadius)) {
    const g = det[S.rules.groupRadius];
    const ok = typeof g === 'string' && Object.hasOwn(senses, g) && isObj(senses[g]) && senses[g][S.field.rangeDim] !== null;
    if (!ok) push('E-DIM-DOMAIN-RANGE', `${S.rules.combat}.${S.rules.deterrence}`, '', S.rules.groupRadius, g, `a ${S.family} code whose rangeDim is not null`);
  }
  return errors;
}
