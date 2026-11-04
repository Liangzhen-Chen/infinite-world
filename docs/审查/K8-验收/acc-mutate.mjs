// usage: node acc-mutate.mjs <repo root>   (copies to F:/dnd-tmp/k8-acc/mut)
import fs from 'node:fs';
import path from 'node:path';
import { runGuard } from './acc-run.mjs';
const src = path.resolve(process.argv[2] || 'F:/dnd-wt/GUARD');
const mut = 'F:/dnd-tmp/k8-acc/mut';
const skip = new Set(['node_modules', '.git', 'SillyTavern', 'backups', 'dist', 'logs']);
fs.rmSync(mut, { recursive: true, force: true });
fs.cpSync(src, mut, { recursive: true, filter: p => !skip.has(path.basename(p)) });
const rd = f => JSON.parse(fs.readFileSync(path.join(mut, f), 'utf8'));
const wr = (f, o) => fs.writeFileSync(path.join(mut, f), JSON.stringify(o, null, 2));
const P = { g1: 'item_zq7_probe', g1f: 'zq7MarketCycle', g2: 'zq7.orphanKnob', g3: 'open:zq7_probe' };
const hit = (rep, check, key) => (rep.findings || []).filter(f => f.check === check && JSON.stringify(f).includes(key));
const run = tag => {
  const out = `F:/dnd-tmp/k8-acc/mut-${tag}.json`;
  fs.rmSync(out, { force: true });
  const r = runGuard(mut, out);
  if (!fs.existsSync(out)) { console.log('guard 未产出报告', (r.stderr || '').slice(0, 300)); process.exit(3); }
  return JSON.parse(fs.readFileSync(out, 'utf8'));
};
const base = run('base');
const items = rd('world/meta/items.json');
items.push({ id: P.g1, name: 'Zq7探针', basePrice: 1, weight: 1, aliases: [], quality: '木', durability: 10, scope: null,
  [P.g1f]: '每逢朔日由山民固定补货，全镇都能买到', description: '验收用探针物品' });
wr('world/meta/items.json', items);
const cr = rd('world/rules/tables/balance/crafting.json');
cr.params.push({ id: P.g2, value: 7, basis: 'derived', playDecision: false, note: '验收用无消费者参数' });
wr('world/rules/tables/balance/crafting.json', cr);
const op = rd('world/actions/open.json');
op.actions.push({ id: P.g3, label: 'zq7探针', verb: 'zq7', group: '交谈', source: 'catalog', narration: 'dialogue', synonyms: ['zq7'],
  visibility: { catalog: 'here', witness: 'present' }, participants: { actor: 'player' }, preconditions: [],
  cost: { time: 'engine' }, check: null, call: { tool: 'world_remember', fixed: { key: 'zq7:probe' } }, slots: [] });
wr('world/actions/open.json', op);
const bad = run('injected');
let fail = 0;
const keys = [['G1', P.g1], ['G2', P.g2], ['G3', P.g3]];
for (const [c, k] of keys) {
  const inBase = hit(base, c, k).length, n = hit(bad, c, k).filter(f => !f.exempt).length;
  const ok = !inBase && n > 0; if (!ok) fail++;
  console.log(`${c} 注入缺陷(${k}) 基线${inBase} 注入后${n} ${ok ? 'PASS' : 'FAIL'}`);
}
wr('world/meta/items.json', items.filter(i => i.id !== P.g1));
cr.params = cr.params.filter(p => p.id !== P.g2); wr('world/rules/tables/balance/crafting.json', cr);
op.actions = op.actions.filter(a => a.id !== P.g3); wr('world/actions/open.json', op);
const clean = run('clean');
for (const [c, k] of keys) {
  const n = hit(clean, c, k).length; if (n) fail++;
  console.log(`${c} 删除后残留 ${n} ${n ? 'FAIL' : 'PASS'}`);
}
const same = clean.findings.length === base.findings.length;
if (!same) fail++;
console.log(`删除后 findings ${clean.findings.length} vs 基线 ${base.findings.length} ${same ? 'PASS' : 'FAIL'}`);
process.exit(fail ? 1 : 0);
