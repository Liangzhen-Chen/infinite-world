// 真实世界上格收尾：试玩地区以外建筑行的设施类型 intendedType（作者数据，world/geo/building-classes.json）。
// 只读 world/ 数据；不抄当前计数：期望由旧数据字段（purpose）与设施类型表现算。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFixedConstants } from '../../server-plugin/kernel/det-math.mjs';
import { convertGeo, newId } from '../../tools/convert-geo-g5b.mjs';

installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });
const WORLD = join(dirname(fileURLToPath(import.meta.url)), '../../world');
const readJson = (p) => JSON.parse(readFileSync(join(WORLD, p), 'utf8'));
const typeTable = readJson('ontology/dimensions/facility_type.json').rows;
const classRows = readJson('geo/building-classes.json').rows;
const startRows = readJson('geo/start-buildings.json').rows;
const locations = readJson('geo/locations.json');
const locLines = readFileSync(join(WORLD, 'geo/locations.json'), 'utf8').split(/\r?\n/);
const out = convertGeo(join(WORLD, 'geo'));
const buildings = Object.entries(out.rows).filter(([, r]) => (r.classes ?? []).includes('comp_facility'));

test('每栋写了 intendedType 的建筑行，类型都是设施类型表的行（转换后的行与作者清单都核）', () => {
  assert.ok(buildings.length > 0);
  for (const [id, r] of buildings) if (r.intendedType !== undefined) assert.ok(Object.hasOwn(typeTable, r.intendedType), `${id}: ${r.intendedType}`);
  for (const r of [...classRows, ...startRows]) if (r.intendedType !== undefined) assert.ok(Object.hasOwn(typeTable, r.intendedType), `${r.id}: ${r.intendedType}`);
});

// 第 n 行（从 1 起）属于哪条旧记录：往上找最近的顶层 "id" 行（4 空格缩进）。
const ownerOf = (n) => {
  for (let i = n - 1; i >= 0; i -= 1) { const m = /^    "id": "([^"]+)"/.exec(locLines[i] ?? ''); if (m) return m[1]; }
  return null;
};

test('作者清单里写了类型的行都是真建筑行、来源标作者、依据所引的每个行号都落在它自己的旧记录里', () => {
  const ids = new Set(buildings.map(([id]) => id));
  for (const r of classRows.filter((x) => x.intendedType !== undefined)) {
    assert.ok(ids.has(newId(r.id)), `${r.id} is a building row`);
    assert.equal(r.source, '作者');
    const m = /依据：world\/geo\/locations\.json:([\d、]+)$/.exec(r.intendedBasis);
    assert.ok(m, `${r.id} intendedBasis ends with a 依据 citation`);
    const cited = m[1].split('、').map(Number);
    for (const n of cited) assert.equal(ownerOf(n), r.id, `${r.id}: cited line ${n} lies inside its own record`);
  }
});

test('旧数据用途为私宅的建筑行一律是住宅类（同一规则，不按 id 取）', () => {
  const houses = locations.filter((l) => /^bld_/.test(l.id) && l.purpose === '私宅').map((l) => l.id);
  assert.ok(houses.length > 0);
  const typeOf = new Map(buildings.map(([id, r]) => [id, r.intendedType]));
  for (const id of houses) assert.equal(typeOf.get(newId(id)), 'fac_house', id);
});
