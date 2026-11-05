#!/usr/bin/env node
// 卡 C 构建期校验：生产链（只报不拦，与 K8 守门同一风格）。
//   R1 regrow-not-natural  据点再生只许是自然物（任何配方的产物或副产物都不能由据点自行长回）
//   R2 tool-no-recipe      每种工具都要有配方（工具 = 配方里的 tools、带 tool 性状的物品、规则与生物数据里以 tool/tools 字段使用的物品）
//   R3 chain-not-natural   每条配方的投入（材料与工具）都要能经配方链追到自然来源
// 自然来源只认世界里会持续产出的规律：据点再生、生态掉落、采矿、渔获、农业、私田、畜牧（含按物种属性派生的畜产物）、家户觅食、林木。
// 查的是运行时世界（已审行 + 机制注释 + 作用在已审行上的规律，tools/load-world.mjs loadRuntimeWorld），规律读到什么就查什么。
// 用法：node tools/kc-production-check.mjs [--root <树>] [--json <输出文件>]；退出码恒为 0。
import fs from 'node:fs';
import path from 'node:path';
import {loadRuntimeWorld} from './load-world.mjs';

const argv = process.argv.slice(2);
const opt = k => argv.includes(k) ? argv[argv.indexOf(k) + 1] : null;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

export async function productionCheck(root = path.resolve(import.meta.dirname, '..')) {
  const world = await loadRuntimeWorld(path.join(root, 'world'));
  const items = world.items ?? [], recipes = world.recipes ?? [], locs = world.locations ?? [];
  const rules = world.rules ?? {}, domain = world.domainRules ?? {};
  const monsters = [...(world.monsters ?? []), ...(world.bosses ?? [])];
  const species = monsters.filter(s => s.husbandry);
  const byId = new Map(items.map(i => [i.id, i]));
  const made = new Set(recipes.flatMap(r => [r.output?.item, ...(r.byproducts ?? []).map(b => b.item)]).filter(Boolean));
  const findings = [];

  // 自然来源（每条带它自己需要的工具或投入；投入拿不到，这条来源就不成立）
  const natural = [];
  const add = (kind, outs, inputs = []) => {for (const o of [outs].flat()) {const id = typeof o === 'string' ? o : o?.item; if (byId.has(id)) natural.push({kind, item: id, inputs: inputs.filter(Boolean)});}};
  for (const l of locs) {
    const regrow = new Set((l.site?.changes ?? []).filter(c => c.kind === 'regrow').map(c => c.resource));
    for (const r of l.site?.resources ?? []) if (regrow.has(r.id)) {
      add(`site-regrow:${l.id}`, r.item, [r.gather?.tool]);
      if (made.has(r.item)) findings.push({rule: 'regrow-not-natural', id: `${l.id}:${r.id}`, detail: `据点 ${l.id} 的再生条目让制成品 ${r.item}（${byId.get(r.item)?.name ?? '?'}）自行长回`});
    }
  }
  for (const m of monsters) add(`drop:${m.id}`, m.drops ?? []);
  const mining = rules.extraction?.mining;
  if (mining) {for (const t of mining.terrain ?? []) add(`mining:${t.tag}`, t.minerals ?? [], [mining.tool]); for (const [loc, rows] of Object.entries(mining.locations ?? {})) add(`mining:${loc}`, rows, [mining.tool]);}
  const fishing = rules.extraction?.fishing;
  if (fishing?.product) add('fishing', fishing.product, [fishing.tool, fishing.bait?.item ?? fishing.bait]);
  if (rules.agriculture?.grainItem) add('agriculture', rules.agriculture.grainItem);
  for (const c of domain.privateField?.crops ?? []) add('private-field', c.product, [c.seed]);
  if (rules.householdSubsistence?.foodItem) add('forage', rules.householdSubsistence.foodItem);
  const forest = rules.forestWater?.forest;
  if (forest) add('forest', items.filter(i => i.id === 'item_wood').map(i => i.id), [forest.tool]);
  for (const s of species) {
    const h = s.husbandry; if (!isObj(h)) continue;
    const feed = [h.feed?.item ?? h.feed].flat().filter(v => typeof v === 'string');
    add(`husbandry:${s.id}`, Object.values(h.yields ?? {}).flat(), feed);
    const attr = from => from === 'laying' ? h.layingIntervalDays : from === 'carcass' ? h.bodyMassKg ?? s.bodyMassKg : h[from];
    const fits = when => Object.entries(when ?? {}).every(([k, want]) => {const have = k === 'tags' ? s.tags ?? [] : [h[k]].flat(); return [want].flat().some(w => have.includes(w));});
    add(`husbandry-derived:${s.id}`, items.filter(i => isObj(i.animalProduct) && ![undefined, null, 0, false].includes(attr(i.animalProduct.from)) && fits(i.animalProduct.when)).map(i => i.id), feed);
  }

  // 可追溯闭包：自然来源与配方交替推进；配方的工具若就是它的产物（照原本抄写），原本是样本，不算投入
  const ok = new Set(), via = new Map();
  const recipeInputs = r => [...new Set([...(r.materials ?? []).map(m => m.item), ...(r.tools ?? []).filter(t => t !== r.output?.item)])];
  for (let changed = true; changed;) {
    changed = false;
    for (const n of natural) if (!ok.has(n.item) && n.inputs.every(x => ok.has(x))) {ok.add(n.item); via.set(n.item, n.kind); changed = true;}
    for (const r of recipes) {
      const outs = [r.output?.item, ...(r.byproducts ?? []).map(b => b.item)].filter(Boolean);
      if (outs.every(o => ok.has(o)) || !recipeInputs(r).every(x => ok.has(x))) continue;
      for (const o of outs) if (!ok.has(o)) {ok.add(o); via.set(o, `recipe:${r.id}`); changed = true;}
    }
  }
  // R2：工具
  const tools = new Set(recipes.flatMap(r => (r.tools ?? []).filter(t => t !== r.output?.item)));
  for (const i of items) if ((i.tags ?? []).includes('tool')) tools.add(i.id);
  const walk = (n, k) => {if (Array.isArray(n)) n.forEach(x => walk(x, k)); else if (isObj(n)) for (const [kk, v] of Object.entries(n)) walk(v, kk); else if (typeof n === 'string' && /^tools?$/.test(k ?? '') && byId.has(n)) tools.add(n);};
  walk(rules); walk(monsters);
  for (const t of [...tools].sort()) if (!made.has(t) || !byId.has(t)) findings.push({rule: 'tool-no-recipe', id: t, detail: `工具 ${t}（${byId.get(t)?.name ?? '物品表里没有'}）没有任何配方能造出`});
  // R3：配方链
  for (const r of recipes) {
    const broken = recipeInputs(r).filter(x => !ok.has(x));
    if (broken.length) findings.push({rule: 'chain-not-natural', id: r.id, detail: `配方 ${r.id}（${r.name}）的投入追不到自然来源：${broken.join('、')}`, broken});
  }
  const count = findings.reduce((m, f) => (m[f.rule] = (m[f.rule] ?? 0) + 1, m), {});
  const roots = {}; for (const [k, v] of via) if (!v.startsWith('recipe:')) roots[v.split(':')[0]] = (roots[v.split(':')[0]] ?? 0) + 1;
  return {root, counts: {'regrow-not-natural': 0, 'tool-no-recipe': 0, 'chain-not-natural': 0, ...count}, tools: tools.size, recipes: recipes.length, traceable: ok.size, naturalRoots: roots, findings};
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(import.meta.filename)) {
  const rep = await productionCheck(path.resolve(opt('--root') ?? path.resolve(import.meta.dirname, '..')));
  const json = opt('--json');
  if (json) fs.writeFileSync(json, JSON.stringify(rep, null, 1));
  // 断链按断点汇总，便于看哪一样投入卡住最多配方
  const blockers = {};
  for (const f of rep.findings) for (const b of f.broken ?? []) blockers[b] = (blockers[b] ?? 0) + 1;
  console.log(`kc-production-check: 据点再生制成品 ${rep.counts['regrow-not-natural']}，无配方工具 ${rep.counts['tool-no-recipe']}（工具共 ${rep.tools}），追不到自然来源的配方 ${rep.counts['chain-not-natural']}/${rep.recipes}`);
  for (const f of rep.findings.filter(f => f.rule !== 'chain-not-natural')) console.log(`  ${f.rule}  ${f.detail}`);
  const top = Object.entries(blockers).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15);
  if (top.length) console.log('  断链最多的投入：' + top.map(([k, v]) => `${k}×${v}`).join(' '));
}
