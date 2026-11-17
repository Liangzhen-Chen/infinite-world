// 继承展平（卷二 §1.3"继承：唯一一套，加载期展平"）：extends、abstract 与 `<维>+ / - / ~ / *` 四种写法；
// 全部表由同一加载器展平一次。只读表头的维度定义，不认任何具体表。
// 失败码：E-DIM-EXTENDS-TARGET、E-DIM-EXTEND-CONFLICT、-NOPARENT、-ON-OVERRIDE、E-DIM-CYCLE。

import { fixedUnits, fixedAdd, fixedMultiply, truncateTo, fixedToNumber, FixedError } from '../det-math.mjs';
// 行键的文法解析（`<维>+` 等）按卷二 §2.8 :842 只许在 kernel/validate/*，本文件只调用。
import { ROW_FIELDS, splitKey } from '../validate/types.mjs';

const sortUnique = (xs) => [...new Set(xs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// table：已解析的表文件；groupsOf(classId) → 该类别行所在的 precedence 组键集合；maxDepth：链深上限。
// 返回 {classes: Map<id, 有效行>, rows: Map<id, 有效行>, abstract: Set<id>}；有效行只含维度键，另带 `own`（该行自己的行字段）。
export function flattenTable(table, groupsOf, maxDepth, err) {
  const kind = table.kind;
  const dims = table.dimensions || {};
  const classes = isObj(table.classes) ? table.classes : {};
  const rows = isObj(table.rows) ? table.rows : {};
  const generated = isObj(table.generated) ? table.generated : {};
  const abstract = new Set(Object.keys(classes).filter((id) => classes[id] && classes[id].abstract === true));
  const done = new Map();
  const at = (section, id, dim) => ({ table: kind, row: id, dim: dim || '', path: `#/${section}/${id}${dim ? '/' + dim : ''}` });

  // 偏离行（generated 节）只写整值，禁止继承写法。
  for (const id of Object.keys(generated).sort()) {
    const row = generated[id] || {};
    for (const key of Object.keys(row).sort()) {
      if (key === 'extends' || key === 'abstract' || splitKey(key).op) err({ code: 'E-DIM-EXTEND-ON-OVERRIDE', level: 'L1', ...at('generated', id, key), got: key, want: 'whole values only' });
    }
  }

  function targetOk(section, id, target) {
    if (section === 'classes') {
      if (!Object.hasOwn(classes, target)) return 'a class row of this table';
      if (abstract.has(target)) return null;
      const mine = groupsOf(id);
      const theirs = groupsOf(target);
      return [...mine].every((g) => theirs.has(g)) ? null : 'an abstract class row or one in every precedence group of the child';
    }
    if (Object.hasOwn(rows, target) || abstract.has(target)) return null;
    return 'an entity row or abstract class row of this table';
  }

  function resolve(section, id, stack) {
    const memoKey = `${section}/${id}`;
    if (done.has(memoKey)) return done.get(memoKey);
    const src = (section === 'classes' ? classes : rows)[id] || {};
    let parent = {};
    if (src.extends !== undefined) {
      const target = src.extends;
      const why = typeof target === 'string' ? targetOk(section, id, target) : 'a row id';
      const tSection = Object.hasOwn(classes, target) ? 'classes' : 'rows';
      if (why) err({ code: 'E-DIM-EXTENDS-TARGET', level: 'L2', ...at(section, id, 'extends'), got: target, want: why });
      else if (stack.includes(`${tSection}/${target}`)) err({ code: 'E-DIM-CYCLE', level: 'L2', ...at(section, id, 'extends'), got: [...stack, `${tSection}/${target}`].join(' -> '), want: 'acyclic extends' });
      else if (!(stack.length <= maxDepth)) err({ code: 'E-DIM-CYCLE', level: 'L2', ...at(section, id, 'extends'), got: stack.length, want: `extends depth <= ${maxDepth}` });
      else parent = resolve(tSection, target, [...stack, `${tSection}/${target}`]).dims;
    }
    const out = { ...parent };
    const forms = new Map();
    for (const key of Object.keys(src).sort()) {
      if (ROW_FIELDS.includes(key)) continue;
      const { dim, op } = splitKey(key);
      if (!Object.hasOwn(dims, dim)) continue; // 不认识的字段由结构检查报（E-DIM-STRUCT-FIELD）
      if (forms.has(dim)) { err({ code: 'E-DIM-EXTEND-CONFLICT', level: 'L1', ...at(section, id, dim), got: `${forms.get(dim)} and ${key}`, want: 'one form per dimension per row' }); continue; }
      forms.set(dim, key);
      const v = src[key];
      if (!op) { out[dim] = v; continue; }
      const def = dims[dim] || {};
      const base = parent[dim];
      const t = def.type;
      try {
        if (op === '+') {
          if (t === 'set') out[dim] = sortUnique([...(Array.isArray(base) ? base : []), ...(Array.isArray(v) ? v : [])]);
          else if (t === 'list') out[dim] = [...(Array.isArray(base) ? base : []), ...(Array.isArray(v) ? v : [])];
          else if (t === 'map') out[dim] = { ...(isObj(base) ? base : {}), ...(isObj(v) ? v : {}) };
          else throw new TypeError('extend needs set/map/list');
        } else if (op === '-') {
          const drop = new Set(Array.isArray(v) ? v : []);
          if (t === 'set' || t === 'list') out[dim] = (Array.isArray(base) ? base : []).filter((x) => !drop.has(x));
          else if (t === 'map') out[dim] = Object.fromEntries(Object.entries(isObj(base) ? base : {}).filter(([k]) => !drop.has(k)));
          else throw new TypeError('delete needs set/map/list');
        } else {
          if (t !== 'number' && t !== 'integer') throw new TypeError(`${op} needs number/integer`);
          if (typeof base !== 'number') { err({ code: 'E-DIM-EXTEND-NOPARENT', level: 'L1', ...at(section, id, dim), got: base === undefined ? 'no parent value' : base, want: 'parent number value' }); delete out[dim]; continue; }
          const r = op === '~' ? fixedAdd(fixedUnits(base), fixedUnits(v)) : fixedMultiply(fixedUnits(base), fixedUnits(v));
          out[dim] = fixedToNumber(truncateTo(r, Number.isInteger(def.precision) ? def.precision : 0));
        }
      } catch (e) {
        if (!(e instanceof TypeError) && !(e instanceof FixedError)) throw e;
        err({ code: 'E-DIM-EXTEND-CONFLICT', level: 'L1', ...at(section, id, dim), got: `${key} on ${t}`, want: e.message });
        delete out[dim];
      }
    }
    const res = { dims: out };
    done.set(memoKey, res);
    return res;
  }

  const flatClasses = new Map();
  for (const id of Object.keys(classes).sort()) flatClasses.set(id, resolve('classes', id, [`classes/${id}`]).dims);
  const flatRows = new Map();
  for (const id of Object.keys(rows).sort()) flatRows.set(id, resolve('rows', id, [`rows/${id}`]).dims);
  for (const id of Object.keys(generated).sort()) {
    const row = generated[id] || {};
    flatRows.set(id, Object.fromEntries(Object.keys(row).filter((k) => Object.hasOwn(dims, k)).map((k) => [k, row[k]])));
  }
  return { classes: flatClasses, rows: flatRows, abstract };
}
