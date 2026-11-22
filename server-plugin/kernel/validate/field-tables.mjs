// 卷二十 §2.8 词表族 field 与 §2.9 规则表 fields、light、sound、env 的加载期跨字段校验（对照表 G12–G16 #45、#52 的白名单部分；格子迁移 G14 第一张）。
// 统一加载器在维度校验通过后调一次（kernel/load/world.mjs，与 checkSenseTables 同一处），违者加载失败。
// 只读词表族条目与规则表，不认任何场代号、通道代号或材料名：族与表登记了才核（只放内核常数表的校验器夹具目录不登记则整支跳过）；
// 每项的取值域、引用闭合、无环、白名单都按数据逐条核，没有按条目 id 的分支。
// 暂未核（所需数据维度未建）：combustionFed 多于一行时"材料行引用字段"指定（卷三乙材料行未登该字段，卷二十 :390；现保守为多于一行即拒）；spread.whenRX 的 RX 编译（cell 求值主体归泡内写者那张）；
// 修正项与效果 target 的"卷六价格命名空间永不列入"由白名单本身不列入保证（白名单是数据，登记即核）。

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 卷文定名：族名、条目字段、规则表与键、prop_law 封闭枚举（卷二十 §2.9 :404，代码内封闭）。
const S = Object.freeze({
  family: 'field', senseFamily: 'sense',
  entry: Object.freeze({ decay: 'decayPerStep', spread: 'spread', rate: 'ratePerStep', quench: 'quenchPerMm', byproducts: 'byproducts', heat: 'heatWPerScore', fed: 'combustionFed', advected: 'advectedByWind', channel: 'channel', tiers: 'tiers', minIntensity: 'minIntensity', modifiers: 'modifiers', effects: 'effects', target: 'target' }),
  nonNegative: Object.freeze(['quenchPerMm', 'heatWPerScore', 'lumenPerScore', 'opacityPerScore', 'soundDbAtRef']),
  rules: Object.freeze({ fields: 'fields', light: 'light', sound: 'sound', env: 'env' }),
  law: Object.freeze(['light', 'sound', 'field']),
  point: Object.freeze(['x', 'y']), // 曲线的一个点 [x, y]
});

/**
 * @param {{vocab: {families: Map<string, {entries: Record<string, object>}>}, rules: Record<string, any>}} view
 * @returns {{code: string, level: string, table: string, row: string, dim: string, path: string, got: unknown, want: string}[]}
 */
export function checkFieldTables(view) {
  const errors = [];
  const push = (code, table, row, dim, got, want) => errors.push({ code, level: 'L2', table, row, dim, path: `${table}${row ? '/' + row : ''}${dim ? '#' + dim : ''}`, got, want });
  const families = view.vocab && view.vocab.families instanceof Map ? view.vocab.families : new Map();
  const entriesOf = (name) => (families.has(name) && isObj(families.get(name).entries) ? families.get(name).entries : {});
  const rules = isObj(view.rules) ? view.rules : {};
  const table = (name) => (isObj(rules[name]) ? rules[name] : null);
  const range = (table0, row, dim, v, lo, hi, loOpen = false) => {
    const bad = !finite(v) || (lo !== null && (loOpen ? v <= lo : v < lo)) || (hi !== null && v > hi);
    if (bad) push('E-DIM-DOMAIN-RANGE', table0, row, dim, v, `${loOpen ? '(' : '['}${lo === null ? '-inf' : lo}, ${hi === null ? 'inf' : hi}]`);
  };
  // 曲线 [[x, y], …]：x 严格递增由卷二曲线校验守；这里核 y 随 x 不增、首尾点条件。
  const curvePoints = (t, row, dim, v) => {
    const ok = Array.isArray(v) && v.length > 0 && v.every((p) => Array.isArray(p) && p.length === S.point.length && finite(p[0]) && finite(p[1]));
    if (!ok) { push('E-DIM-STRUCT-FIELD', t, row, dim, v, 'curve of [x, y] points'); return null; }
    return v;
  };
  const nonIncreasing = (pts) => pts.every((p, i) => i === 0 || p[1] <= pts[i - 1][1]);

  const fields = entriesOf(S.family);
  const senses = entriesOf(S.senseFamily);
  const env = table(S.rules.env);
  const allowed = env !== null && Array.isArray(env.allowedTargets) ? new Set(env.allowedTargets.filter((x) => isObj(x)).map((x) => x.namespace)) : null;
  const targetAllowed = (target) => typeof target === 'string' && [...allowed].some((ns) => target === ns || target.startsWith(`${ns}.`));

  for (const id of Object.keys(fields).sort(cmp)) {
    const e = isObj(fields[id]) ? fields[id] : {};
    const E_ = S.entry;
    if (!Object.hasOwn(e, E_.decay)) push('E-DIM-REQUIRED-MISSING', '_vocab', id, E_.decay, 'missing', 'decayPerStep is required');
    else range('_vocab', id, E_.decay, e[E_.decay], 0, 1);
    if (!Object.hasOwn(e, E_.fed) || typeof e[E_.fed] !== 'boolean') push('E-DIM-REQUIRED-MISSING', '_vocab', id, E_.fed, e[E_.fed], 'combustionFed boolean is required');
    // onUnknown 为 error 的两项（卷二十 :392–:393）：缺了不当假，缺即拒。
    if (typeof e[E_.advected] !== 'boolean') push('E-DIM-REQUIRED-MISSING', '_vocab', id, E_.advected, e[E_.advected], 'advectedByWind boolean is required');
    if (!Array.isArray(e[E_.tiers])) push('E-DIM-REQUIRED-MISSING', '_vocab', id, E_.tiers, e[E_.tiers], 'tiers list is required (may be empty)');
    if (e[E_.fed] === true && Object.hasOwn(e, E_.heat) && e[E_.heat] !== null) push('E-DIM-STRUCT-FIELD', '_vocab', id, E_.heat, e[E_.heat], 'combustionFed rows must not fill heatWPerScore');
    if (isObj(e[E_.spread])) range('_vocab', id, `${E_.spread}.${E_.rate}`, e[E_.spread][E_.rate], 0, 1);
    for (const k of S.nonNegative) if (Object.hasOwn(e, k) && e[k] !== null) range('_vocab', id, k, e[k], 0, null);
    if (Object.hasOwn(e, E_.channel) && e[E_.channel] !== null && !Object.hasOwn(senses, e[E_.channel])) push('E-DIM-REF-MISSING', '_vocab', id, E_.channel, e[E_.channel], 'entry of the sense family or null');
    const by = isObj(e[E_.byproducts]) ? e[E_.byproducts] : {};
    for (const to of Object.keys(by).sort(cmp)) {
      if (!Object.hasOwn(fields, to)) push('E-DIM-REF-MISSING', '_vocab', id, E_.byproducts, to, 'entry of the field family');
      else range('_vocab', id, E_.byproducts, by[to], 0, 1);
    }
    const tiers = Array.isArray(e[E_.tiers]) ? e[E_.tiers] : [];
    tiers.forEach((t, i) => {
      if (!isObj(t) || !finite(t[E_.minIntensity])) { push('E-FIELD-TIER', '_vocab', id, E_.tiers, t, `tier ${i} needs a numeric minIntensity`); return; }
      if (i > 0 && isObj(tiers[i - 1]) && !(t[E_.minIntensity] > tiers[i - 1][E_.minIntensity])) push('E-FIELD-TIER', '_vocab', id, E_.tiers, t[E_.minIntensity], 'minIntensity strictly increasing');
      if (allowed !== null) {
        for (const list of [t[E_.modifiers], t[E_.effects]]) {
          if (Array.isArray(list)) for (const m of list) if (!isObj(m) || !targetAllowed(m[E_.target])) push('E-ENV-TARGET', '_vocab', id, E_.tiers, isObj(m) ? m[E_.target] : m, 'target in rules.env.allowedTargets');
        }
      }
    });
  }
  // combustionFed 为真多于一行时须由材料行的引用字段指定接收场（卷二十 :390）；该字段卷三乙未登记，无从指定，所以现在多于一行即拒（保守核）。
  const fedRows = Object.keys(fields).filter((id) => isObj(fields[id]) && fields[id][S.entry.fed] === true);
  if (fedRows.length > 1) push('E-DIM-REQUIRED-MISSING', '_vocab', fedRows[1], S.entry.fed, fedRows, 'at most one combustionFed row until the material reference field is registered');
  // byproducts 无环（卷二十 §2.8 表）：深度优先。
  const onPath = new Set();
  const finished = new Set();
  const visit = (id) => {
    if (finished.has(id)) return;
    if (onPath.has(id)) { push('E-DIM-STRUCT-FIELD', '_vocab', id, S.entry.byproducts, id, 'byproducts must be acyclic'); return; }
    onPath.add(id);
    const by = isObj(fields[id]) && isObj(fields[id][S.entry.byproducts]) ? fields[id][S.entry.byproducts] : {};
    for (const to of Object.keys(by).sort(cmp)) if (Object.hasOwn(fields, to)) visit(to);
    onPath.delete(id);
    finished.add(id);
  };
  for (const id of Object.keys(fields).sort(cmp)) visit(id);

  const f = table(S.rules.fields);
  if (f !== null) {
    if (Object.hasOwn(f, 'stepMinutes')) range(S.rules.fields, '', 'stepMinutes', f.stepMinutes, 1, null);
    if (Object.hasOwn(f, 'windBias')) range(S.rules.fields, '', 'windBias', f.windBias, 0, 1, true);
    if (Object.hasOwn(f, 'oneShotMaxCells')) range(S.rules.fields, '', 'oneShotMaxCells', f.oneShotMaxCells, 1, null);
    if (Object.hasOwn(f, 'oneShotReachCurve')) {
      const pts = curvePoints(S.rules.fields, '', 'oneShotReachCurve', f.oneShotReachCurve);
      if (pts !== null) {
        if (pts[pts.length - 1][1] !== 0) push('E-DIM-DOMAIN-RANGE', S.rules.fields, '', 'oneShotReachCurve', pts[pts.length - 1][1], 'last point y is 0');
        if (!nonIncreasing(pts)) push('E-DIM-DOMAIN-RANGE', S.rules.fields, '', 'oneShotReachCurve', pts, 'y non-increasing in x');
      }
    }
  }
  const l = table(S.rules.light);
  if (l !== null) {
    if (Object.hasOwn(l, 'zoneSpread')) range(S.rules.light, '', 'zoneSpread', l.zoneSpread, 0, null, true);
    if (Object.hasOwn(l, 'pointSourceCap')) range(S.rules.light, '', 'pointSourceCap', l.pointSourceCap, 1, null);
  }
  const s = table(S.rules.sound);
  if (s !== null) for (const k of ['refDistanceM', 'detourDbPerM']) if (Object.hasOwn(s, k)) range(S.rules.sound, '', k, s[k], 0, null, true);
  if (env !== null) {
    if (Object.hasOwn(env, 'canopyCurve')) {
      const pts = curvePoints(S.rules.env, '', 'canopyCurve', env.canopyCurve);
      if (pts !== null) {
        const first = [...pts].sort((a, b) => a[0] - b[0])[0];
        if (first[0] === 0 && first[1] !== 1) push('E-DIM-DOMAIN-RANGE', S.rules.env, '', 'canopyCurve', first, 'y is 1 at x = 0');
        if (first[0] !== 0) push('E-DIM-DOMAIN-RANGE', S.rules.env, '', 'canopyCurve', first, 'curve defined at x = 0');
        if (!nonIncreasing([...pts].sort((a, b) => a[0] - b[0]))) push('E-DIM-DOMAIN-RANGE', S.rules.env, '', 'canopyCurve', pts, 'y non-increasing in x');
      }
    }
    // channelLaw 键全覆盖 sense 族、值属封闭枚举（E-PROP-LAW）：sense 族登记了、且表里写了 channelLaw 才核（键登在 unbuilt 的表里没有值，不核；写了值即整张核，值为 null 也拒）。
    if (Object.keys(senses).length > 0 && Object.hasOwn(env, 'channelLaw')) {
      const law = isObj(env.channelLaw) ? env.channelLaw : null;
      if (law === null) push('E-PROP-LAW', S.rules.env, '', 'channelLaw', 'missing', 'map keyed by every sense code');
      else {
        for (const id of Object.keys(senses).sort(cmp)) if (!Object.hasOwn(law, id)) push('E-PROP-LAW', S.rules.env, '', 'channelLaw', id, 'channelLaw covers every sense code');
        for (const k of Object.keys(law).sort(cmp)) if (!S.law.includes(law[k])) push('E-PROP-LAW', S.rules.env, '', 'channelLaw', law[k], `one of ${S.law.join('/')}`);
      }
    }
  }
  return errors;
}
