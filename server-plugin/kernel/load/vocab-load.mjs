// 词表族与单位表（卷二 §1.9、§1.4、§1.1）：建代号索引、broader 上位链；核对族前缀与实体前缀不冲突（E-DIM-VOCAB-PREFIX）、
// 条目代号格式与前缀、broader 闭合无环、单位条目。只按表头与族登记通用处理，不认任何具体族的条目。

const CODE_RE = /^[a-z][a-z0-9_]{1,47}$/;

// 一个前缀与另一个前缀冲突：相等、或一个是另一个的开头（§1.9"任何词表族前缀不得等于实体前缀、不得是实体前缀的前缀、也不得以实体前缀开头"）。
const clash = (a, b) => a.startsWith(b) || b.startsWith(a);

export function loadVocab(vocabDoc, entityPrefixes, err) {
  const families = new Map();
  const index = new Map();
  const famObj = (vocabDoc && vocabDoc.families) || {};
  if (!vocabDoc || typeof famObj !== 'object' || Array.isArray(famObj)) err({ code: 'E-DIM-VOCAB-PREFIX', table: '_vocab', got: typeof famObj, want: 'families object' });
  for (const name of Object.keys(famObj).sort()) {
    const fam = famObj[name] || {};
    const prefix = fam.prefix;
    const at = { table: '_vocab', row: name };
    if (typeof prefix !== 'string' || !CODE_RE.test(prefix + 'x')) { err({ code: 'E-DIM-VOCAB-PREFIX', ...at, dim: 'prefix', got: prefix, want: 'registered family prefix' }); continue; }
    for (const ep of entityPrefixes) if (clash(prefix, ep)) err({ code: 'E-DIM-VOCAB-PREFIX', ...at, dim: 'prefix', got: prefix, want: `no overlap with entity prefix ${ep}` });
    for (const [other, o] of families) if (clash(prefix, o.prefix)) err({ code: 'E-DIM-VOCAB-PREFIX', ...at, dim: 'prefix', got: prefix, want: `no overlap with family ${other} prefix ${o.prefix}` });
    const entries = fam.entries && typeof fam.entries === 'object' ? fam.entries : {};
    families.set(name, { name, prefix, closed: fam.closed === true, entries });
    for (const id of Object.keys(entries).sort()) {
      if (!CODE_RE.test(id) || !id.startsWith(prefix)) { err({ code: 'E-DIM-ID-FORMAT', table: '_vocab', row: id, dim: name, got: id, want: `^[a-z][a-z0-9_]{1,47}$ with prefix ${prefix}` }); continue; }
      if (index.has(id)) { err({ code: 'E-DIM-ID-DUPLICATE', table: '_vocab', row: id, dim: name, got: index.get(id).family, want: 'one family per code' }); continue; }
      index.set(id, { family: name, prefix, entry: entries[id] || {} });
    }
  }
  // broader：同族条目，无环（§1.3 成员关系沿 broader 上位链展开）。
  for (const [id, rec] of [...index].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const up = rec.entry.broader;
    if (up === undefined) continue;
    const t = index.get(up);
    if (!t || t.family !== rec.family) err({ code: 'E-DIM-REF-MISSING', table: '_vocab', row: id, dim: 'broader', got: up, want: `entry of family ${rec.family}` });
  }
  const chainCache = new Map();
  function ancestors(id) {
    if (chainCache.has(id)) return chainCache.get(id);
    const out = [];
    const seen = new Set([id]);
    let cur = index.get(id);
    while (cur && cur.entry.broader !== undefined && index.has(cur.entry.broader)) {
      const up = cur.entry.broader;
      if (seen.has(up)) { err({ code: 'E-DIM-CYCLE', table: '_vocab', row: id, dim: 'broader', got: up, want: 'acyclic broader chain' }); break; }
      seen.add(up); out.push(up); cur = index.get(up);
    }
    chainCache.set(id, out);
    return out;
  }
  for (const id of [...index.keys()].sort()) ancestors(id);
  return { families, index, ancestors, depth: (id) => ancestors(id).length };
}

// `_units.json`：{"units": [{id, dimension, si, calibrate?}]}（§1.4 每条的字段；外层写法卷二未定，见 docs/问题.md）。
export function loadUnits(unitsDoc, err) {
  const units = new Map();
  const rows = unitsDoc && Array.isArray(unitsDoc.units) ? unitsDoc.units : null;
  if (!rows) { err({ code: 'E-DIM-UNIT-UNKNOWN', table: '_units', got: typeof unitsDoc, want: '{"units": [...]}' }); return units; }
  for (const u of rows) {
    const id = u && u.id;
    if (typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) { err({ code: 'E-DIM-ID-FORMAT', table: '_units', row: String(id), got: id, want: 'unit id' }); continue; }
    if (units.has(id)) { err({ code: 'E-DIM-ID-DUPLICATE', table: '_units', row: id, got: id, want: 'unique unit id' }); continue; }
    if (typeof u.dimension !== 'string' || u.si === undefined) err({ code: 'E-DIM-STRUCT-FIELD', table: '_units', row: id, got: Object.keys(u).sort().join(','), want: 'id, dimension, si, calibrate?' });
    units.set(id, u);
  }
  return units;
}
