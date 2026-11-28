// 统治归属与聚落组织的纯数据读取（只读 world/ 数据，不调任何实现）。
// 供 feat-s2-tp1 本卡支撑与旧卡验收题共用：旧卡不从别卡的验收目录导入，卡与卡互不引用（主会话裁定）。
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
// 维度文件按路径与 mtime 缓存（只读；不缓存 loadJson，夹具要改它返回的对象）。
const DIM_CACHE = new Map();
function readDimCached(p) {
  const st = fs.statSync(p);
  const key = `${st.mtimeMs}:${st.size}`;
  const hit = DIM_CACHE.get(p);
  if (hit && hit.key === key) return hit.value;
  const value = loadJson(p);
  DIM_CACHE.set(p, { key, value });
  return value;
}
const dim = (root, name) => readDimCached(join(root, 'world/ontology/dimensions', name));
export const placesOf = (root) => dim(root, 'place.json').rows;
export const orgsOf = (root) => dim(root, 'org.json').rows;
export const vocabOf = (root) => dim(root, '_vocab.json').families;

// 聚落组织：orgKind 在词表里 settlement 为真。
export function settlementOrgIds(root) {
  const orgs = orgsOf(root);
  const kinds = vocabOf(root).orgkind.entries;
  return Object.keys(orgs).filter((k) => kinds[orgs[k].orgKind]?.settlement === true).sort();
}

// 坊与村的「归属」：自身是某聚落的 seat 即归该组织；否则沿 originSite（无则 parent）往上找（卷八 R8-18.9 ③）。
export function ownerOfPlace(root, placeId) {
  const places = placesOf(root);
  const orgs = orgsOf(root);
  const seatToOrg = new Map(settlementOrgIds(root).map((k) => [orgs[k].seat, k]));
  let x = placeId;
  for (let i = 0; x && i < 100; i += 1) {
    if (seatToOrg.has(x)) return seatToOrg.get(x);
    x = places[x]?.originSite ?? places[x]?.parent ?? null;
  }
  return null;
}

// 组织开局公库 genesisFunds：映射 {资源: 金额}（现行形状）或数组 [{resource, amount}]，两种都认；读出为 [{resource, amount}]。
export function genesisEntriesOf(org) {
  const g = org?.genesisFunds;
  if (Array.isArray(g)) return g.map((x) => ({ resource: x.resource, amount: Number(x.amount) }));
  if (g && typeof g === "object") return Object.entries(g).map(([resource, amount]) => ({ resource, amount: Number(amount) }));
  return [];
}

// 给组织的开局公库加 D（夹具用，只改副本里的数据），两种形状都认。
export function bumpGenesisFunds(org, D) {
  const g = org.genesisFunds;
  if (Array.isArray(g)) { g[0].amount = Number(g[0].amount) + D; return; }
  const k = Object.keys(g)[0];
  g[k] = Number(g[k]) + D;
}
