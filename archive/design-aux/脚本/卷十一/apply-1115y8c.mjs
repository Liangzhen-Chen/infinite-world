// 乙-1/乙-4 补卡 1115y8c：照李白 11-15 17:28 第 1 条、chk-1115-y6 真问题①②改。确定性、不手改。
// 判据由 check-objects-six.mjs 用 object-rules.mjs 算出，写在 审查/脚本输出/乙8c-整类判据结果.json；本脚本只照结果改对象栏。
// 本脚本不出现任何具体迁移行编号。用法：
//   node apply-1115y8c.mjs          先写各受影响卷的改前快照，再改对象栏，写改写记录；
//   node apply-1115y8c.mjs --after  勘误行写好后，按各卷最新一条 1115y8c 勘误行写的"改后覆盖"路径覆盖改后快照。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TAG = '1115y8c';
const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const DIR = CFG.dir; const SNAP = `${DIR}/版本快照`;
const files = readdirSync(DIR).filter(f => new RegExp(CFG.volFile).test(f)).sort();

if (process.argv.includes('--after')) {
  for (const f of files) {
    const s = readFileSync(`${DIR}/${f}`, 'utf8');
    const line = s.split('\n').filter(l => l.includes(`勘误 ${TAG}`) && l.includes('改后覆盖')).pop();
    if (!line) continue;
    const seg = line.slice(line.indexOf('改后覆盖'));
    const outs = [...seg.split(/）/)[0].matchAll(/版本快照\/([^\s、，）]+\.md)/g)].map(m => m[1]);
    for (const o of outs) { writeFileSync(`${SNAP}/${o}`, s); console.log('改后快照', o); }
  }
  process.exit(0);
}

const preSnap = f => {
  const s = readFileSync(`${DIR}/${f}`, 'utf8');
  const prev = [...s.matchAll(/改前快照 版本快照\/(.+?)-勘误前-1115[a-z0-9]+\.md/g)].pop();
  if (!prev) throw new Error('读不到快照命名：' + f);
  const p = `${SNAP}/${prev[1]}-勘误前-${TAG}.md`;
  if (existsSync(p)) throw new Error('改前快照已存在：' + p);
  writeFileSync(p, s); console.log('改前快照', p.slice(SNAP.length + 1));
};
// --pre 卷X：只写该卷改前快照（不改对象栏的卷，例如重算计数的卷十一）
{ const i = process.argv.indexOf('--pre'); if (i > 0) { const v = process.argv[i + 1]; const f = files.find(x => x.startsWith(v + '-')); if (!f) throw new Error('找不到卷 ' + v); preSnap(f); process.exit(0); } }

const res = JSON.parse(readFileSync(`${OUT}/乙8c-整类判据结果.json`, 'utf8'));
const todo = [
  ...res.judge1.filter(x => x.want).map(x => ({ k: x.k, o: x.o, want: x.want, why: `判据一（接收卷）：${x.how}` })),
  ...res.judge2.filter(x => x.want).map(x => ({ k: x.k, o: x.o, want: x.want, why: `判据二（锚点进程）：代码锚点 ${x.files.join('、')} 全在服务端` })),
];
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const strip = s => s.replace(/`/g, '').trim();
const where = new Map(); const FL = new Map();
for (const f of files) {
  const L = readFileSync(`${DIR}/${f}`, 'utf8').split('\n'); FL.set(f, L);
  let head = null, obj = -1, code = false;
  L.forEach((l, i) => {
    if (/^```/.test(l)) { code = !code; head = null; return; }
    if (code) return;
    if (!/^\|/.test(l)) { head = null; return; }
    const c = cells(l);
    if (!head) { head = c; obj = c.map(strip).findIndex(x => /落点对象/.test(x)); return; }
    if (/^:?-{3}/.test(c[0] ?? '')) return;
    const k = strip(c[0] ?? '');
    if (new RegExp(CFG.migRow).test(k) && obj >= 0) where.set(k, { f, i, obj });
  });
}
const touched = new Set(); const log = [];
for (const t of todo) {
  const w = where.get(t.k); if (!w) throw new Error('找不到行 ' + t.k);
  const cs = FL.get(w.f)[w.i].split(/(?<!\\)\|/);
  if (strip(cs[w.obj + 1]) !== t.o) throw new Error(`对象栏与判据结果不符：${t.k}`);
  cs[w.obj + 1] = cs[w.obj + 1].includes('`') ? ` \`${t.want}\` ` : ` ${t.want} `;
  FL.get(w.f)[w.i] = cs.join('|'); touched.add(w.f);
  log.push(`${t.k}（${w.f.split('-')[0]}）：${t.o}→${t.want}；${t.why}`);
}
for (const f of touched) { preSnap(f); writeFileSync(`${DIR}/${f}`, FL.get(f).join('\n')); }
writeFileSync(`${OUT}/乙8c-改写记录.md`, [
  `# 乙-1/乙-4 补 ${TAG} 改写记录（脚本生成，勿手改）`, '',
  '依据：李白 11-15 17:28 第 1 条、chk-1115-y6 真问题①②；判据 审查/乙阶段-落点对象整类判据-1115y8c.md；判据结果 审查/脚本输出/乙8c-整类判据结果.json（check-objects-six.mjs 生成）；脚本 脚本/卷十一/apply-1115y8c.mjs。', '',
  `判据一（接收卷）不一致 ${res.judge1.length} 行；判据二（锚点进程）不一致 ${res.judge2.length} 行；共改 ${log.length} 行。`, '',
  ...log.map(x => '- ' + x), '',
].join('\n'));
console.log(log.join('\n'));
